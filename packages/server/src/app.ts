import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  activityEvents,
  changeLog,
  comments,
  fileBlobs,
  items,
  permissionGrants,
  type Db,
  drives,
} from "@driveai/db";
import {
  getBreadcrumbChain,
  listRecent,
  listSharedDrives,
  listSharedWithMe,
  listStarred,
  listTrash,
} from "./services/view-queries.js";
import { DriveAiError, ExitCode, capabilitiesFromRole } from "@driveai/core";
import type { AppDeps } from "./deps.js";
import { ensureIdentity, resolveEffectiveRoleOnItem } from "./services/identity.js";
import { toHttpStatus } from "./routes/handler-helpers.js";
import { handleCommand } from "./services/command-dispatch.js";
import { buildMcpResponse } from "./mcp/mcp-server.js";
import { initUpload, completeUpload, abandonUpload } from "./services/upload.js";
import { runDriveSearch } from "./services/drive-search.js";
import { registerSsoMiddleware } from "./middleware/sso.js";
import { registerStaticWeb } from "./static-web.js";

function mapItem(row: typeof items.$inferSelect, s3Key?: string | null) {
  return {
    id: row.id,
    driveId: row.driveId,
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    mime: row.mime,
    size: row.size,
    trashedAt: row.trashedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    s3Key: s3Key ?? null,
  };
}

async function latestBlobKeys(db: Db, itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      itemId: fileBlobs.itemId,
      s3Key: fileBlobs.s3Key,
      version: fileBlobs.version,
    })
    .from(fileBlobs)
    .where(and(inArray(fileBlobs.itemId, itemIds), ne(fileBlobs.sha256, "pending"))!)
    .orderBy(desc(fileBlobs.version));
  const keys = new Map<string, string>();
  for (const row of rows) {
    if (!keys.has(row.itemId)) keys.set(row.itemId, row.s3Key);
  }
  return keys;
}

function ident(
  req: FastifyRequest,
): { userId: string; tenantId: string; email?: string; displayName?: string } {
  return (req as unknown as {
    identity: { userId: string; tenantId: string; email?: string; displayName?: string };
  }).identity;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true, bodyLimit: 250 * 1024 * 1024 });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  registerSsoMiddleware(app);

  app.addHook("preHandler", async (req) => {
    if (req.url === "/api/health" || req.url === "/api/ws-ping") {
      return;
    }
    const i = await deps.identity({ headers: req.headers as Record<string, unknown> });
    (req as unknown as { identity: typeof i }).identity = i;
  });

  const db: Db = deps.db;

  app.get("/api/me", async (req) => {
    const i = ident(req);
    return {
      userId: i.userId,
      tenantId: i.tenantId,
      email: i.email ?? null,
      displayName: i.displayName ?? i.email ?? i.userId,
    };
  });

  app.get("/api/drives", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const all = await db.select().from(drives).where(eq(drives.tenantId, i.tenantId));
    return { drives: all };
  });

  app.get("/api/recent", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const itemsOut = await listRecent(db, i.tenantId, i.userId, 60);
    return { items: itemsOut };
  });

  app.get("/api/starred", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const itemsOut = await listStarred(db, i.tenantId, i.userId);
    return { items: itemsOut };
  });

  app.get("/api/trash-items", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const itemsOut = await listTrash(db, i.tenantId, i.userId);
    return { items: itemsOut };
  });

  app.get("/api/shared-with-me", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const itemsOut = await listSharedWithMe(db, i.tenantId, i.userId);
    return { items: itemsOut };
  });

  app.get("/api/shared-drives", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const list = await listSharedDrives(db, i.tenantId);
    return { drives: list };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/breadcrumb", async (req) => {
    const i = ident(req);
    await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
    const r = await resolveEffectiveRoleOnItem(db, i.userId, req.params.id);
    if (!r) {
      return { segments: [] as { id: string; name: string; type: string }[] };
    }
    const segments = await getBreadcrumbChain(db, req.params.id);
    return { segments };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/download", async (req, reply) => {
    const i = ident(req);
    const r = await resolveEffectiveRoleOnItem(db, i.userId, req.params.id);
    if (!r) return reply.status(403).send({ error: { code: "forbidden" } });
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === i.userId }).canView) {
      return reply.status(403).send({ error: { code: "forbidden" } });
    }
    const [it] = await db.select().from(items).where(eq(items.id, req.params.id));
    if (!it || it.type !== "file") return reply.status(400).send({ error: { code: "not_a_file" } });
    const [fb] = await db
      .select()
      .from(fileBlobs)
      .where(and(eq(fileBlobs.itemId, req.params.id), ne(fileBlobs.sha256, "pending"))!)
      .orderBy(desc(fileBlobs.version))
      .limit(1);
    if (!fb) return reply.status(404).send({ error: { code: "no_blob" } });
    const url = await deps.blob.presignGet(fb.s3Key);
    return { url, name: it.name, contentType: fb.contentType };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id", async (req, reply) => {
    const i = ident(req);
    const res = await resolveEffectiveRoleOnItem(db, i.userId, req.params.id);
    if (!res) {
      return reply.status(404).send({ error: { code: "not_found" } });
    }
    const [row] = await db.select().from(items).where(eq(items.id, req.params.id));
    if (!row) return reply.status(404).send({ error: { code: "not_found" } });
    const keys = await latestBlobKeys(db, row.type === "file" ? [row.id] : []);
    return {
      item: mapItem(row, keys.get(row.id)),
      capabilities: capabilitiesFromRole(res.role, { isOwner: res.driveOwnerId === i.userId }),
    };
  });

  app.get<{
    Params: { id: string };
    Querystring: { page?: string; limit?: string; type?: string };
  }>("/api/items/:id/children", async (req) => {
    const i = ident(req);
    const parentId = req.params.id;
    const r = await resolveEffectiveRoleOnItem(db, i.userId, parentId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === i.userId }).canView) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "25"), 10) || 25),
    );
    const offset = (page - 1) * limit;
    const type = String(req.query.type ?? "");
    const completedFileExists = sql`exists (
      select 1 from ${fileBlobs}
      where ${fileBlobs.itemId} = ${items.id}
        and ${fileBlobs.sha256} <> 'pending'
    )`;
    const filter = and(
      eq(items.parentId, parentId),
      isNull(items.trashedAt),
      type === "file" || type === "folder" ? eq(items.type, type) : undefined,
      type === "file" ? completedFileExists : undefined,
      type === "folder" ? undefined : sql`(${items.type} <> 'file' or ${completedFileExists})`,
    )!;
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(items)
      .where(filter);
    const rows = await db
      .select()
      .from(items)
      .where(filter)
      .orderBy(sql`case when ${items.type} = 'folder' then 0 else 1 end`, items.name)
      .limit(limit)
      .offset(offset);
    const keys = await latestBlobKeys(
      db,
      rows.filter((it) => it.type === "file").map((it) => it.id),
    );
    return {
      items: rows.map((it) => ({ item: mapItem(it, keys.get(it.id)) })),
      page,
      limit,
      total: Number(total),
      hasMore: offset + rows.length < Number(total),
    };
  });

  app.post("/api/commands", async (req, reply) => {
    const i = ident(req);
    const b = (req.body as { name: string; payload: Record<string, unknown> }) ?? {
      name: "",
      payload: {},
    };
    try {
      const out = await handleCommand(
        db,
        deps,
        { ...i, source: "human" },
        b.name,
        b.payload,
      );
      return { ok: true, result: out };
    } catch (e) {
      const status = toHttpStatus(e);
      if (e instanceof DriveAiError) {
        return reply.status(status).send({ ok: false, error: e.message, code: e.code });
      }
      throw e;
    }
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/activity", async (req) => {
    const i = ident(req);
    const rows = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.tenantId, i.tenantId),
          eq(activityEvents.itemId, req.params.id),
        )!,
      )
      .orderBy(desc(activityEvents.ts))
      .limit(200);
    return { events: rows };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/permissions", async (req) => {
    const rows = await db
      .select()
      .from(permissionGrants)
      .where(eq(permissionGrants.itemId, req.params.id));
    return { permissions: rows };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/comments", async (req) => {
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.fileId, req.params.id));
    return { comments: rows };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/revisions", async (req) => {
    const rows = await db
      .select()
      .from(fileBlobs)
      .where(eq(fileBlobs.itemId, req.params.id));
    return { revisions: rows };
  });

  app.get<{
    Querystring: {
      q?: string;
      since?: string;
      type?: string;
      owner?: string;
      driveId?: string;
      folderId?: string;
      modifiedAfter?: string;
      modifiedBefore?: string;
      label?: string;
      trash?: string;
      limit?: string;
      offset?: string;
    };
  }>("/api/search", async (req) => {
    const i = ident(req);
    return runDriveSearch(db, i.userId, i.tenantId, req.query);
  });

  app.get<{
    Querystring: { since?: string };
  }>("/api/changes", async (req) => {
    const i = ident(req);
    const since = req.query.since ? Number(req.query.since) : 0;
    const rows = await db
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.tenantId, i.tenantId),
          since > 0 ? gt(changeLog.cursor, since) : sql`true`,
        )!,
      )
      .orderBy(changeLog.cursor)
      .limit(500);
    const next = rows[rows.length - 1]?.cursor;
    return { changes: rows, nextCursor: next != null ? String(next) : null };
  });

  app.post("/api/mcp", async (req) => {
    const i = ident(req);
    return buildMcpResponse(db, deps, i, req.body);
  });

  app.post("/api/uploads", (req) => initUpload(db, deps, req));
  app.post("/api/uploads/complete", (req) => completeUpload(db, deps, req));
  app.post("/api/uploads/abandon", (req) => abandonUpload(db, deps, req));

  app.put<{
    Querystring: { key: string };
  }>("/api/blobs/put", async (req) => {
    const key = req.query.key;
    if (!key) return { error: "missing key" };
    const body = req.body;
    const buf = Buffer.isBuffer(body)
      ? body
      : Buffer.from(typeof body === "string" ? body : "");
    const ct = (req.headers["content-type"] as string) || "application/octet-stream";
    await deps.blob.putObject(key, buf, ct);
    return { ok: true, bytes: buf.length };
  });

  app.get<{
    Querystring: { key: string };
  }>("/api/blobs/get", async (req, reply) => {
    const key = req.query.key;
    if (!key) return reply.status(400).send("missing key");
    const b = await deps.blob.getObjectBytes(key);
    return reply.send(b);
  });

  app.get("/api/health", async () => ({ ok: true, product: "drive-ai" }));

  app.get("/api/ws-ping", async () => ({ ok: true }));

  app.get(
    "/api/events",
    { websocket: true },
    (connection, request) => {
      const i = ident(request);
      const sock = (connection as { socket: { send: (d: string) => void; on: (e: string, fn: () => void) => void; readyState: number } })
        .socket;
      deps.events.add(sock, i.tenantId, i.userId);
    },
  );

  await registerStaticWeb(app);

  return app;
}
