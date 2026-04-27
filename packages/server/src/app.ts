import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
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

function mapItem(row: typeof items.$inferSelect) {
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
  };
}

function ident(
  req: FastifyRequest,
): { userId: string; tenantId: string; email?: string; displayName?: string } {
  return (req as unknown as {
    identity: { userId: string; tenantId: string; email?: string; displayName?: string };
  }).identity;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);

  app.addHook("preHandler", async (req) => {
    const i = await deps.identity({ headers: req.headers as Record<string, unknown> });
    (req as unknown as { identity: typeof i }).identity = i;
  });

  const db: Db = deps.db;

  app.get("/api/me", async (req) => {
    const i = ident(req);
    return { userId: i.userId, tenantId: i.tenantId, email: i.email ?? null };
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
      .where(eq(fileBlobs.itemId, req.params.id))
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
    return {
      item: mapItem(row),
      capabilities: capabilitiesFromRole(res.role, { isOwner: res.driveOwnerId === i.userId }),
    };
  });

  app.get<{
    Params: { id: string };
  }>("/api/items/:id/children", async (req) => {
    const i = ident(req);
    const parentId = req.params.id;
    const r = await resolveEffectiveRoleOnItem(db, i.userId, parentId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === i.userId }).canView) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const rows = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.parentId, parentId),
          isNull(items.trashedAt),
        )!,
      );
    return { items: rows.map((it) => ({ item: mapItem(it) })) };
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
    const chunks: Buffer[] = [];
    for await (const chunk of req.raw) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);
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

  return app;
}
