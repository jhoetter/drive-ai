import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { changeLog, items, comments, activityEvents, agentProposals, type Db } from "@driveai/db";
import { newPrefixed } from "@driveai/core";
import type { AppDeps } from "../deps.js";
import { ensureIdentity } from "../services/identity.js";
import { handleCommand } from "../services/command-dispatch.js";
import { runDriveSearch } from "../services/drive-search.js";

type McpArgs = { name?: string; tool?: string; method?: string; arguments?: Record<string, unknown> };

export async function buildMcpResponse(
  db: Db,
  deps: AppDeps,
  identity: { userId: string; tenantId: string },
  body: unknown,
) {
  const b = (body as McpArgs) ?? {};
  const tool = String(b.tool ?? b.method ?? b.name ?? "list_files");
  const args = (b as { params?: { arguments: Record<string, unknown> } }).params?.arguments ?? b.arguments ?? {};

  await ensureIdentity(db, identity.tenantId, identity.userId, "dev@local", "agent");

  if (tool === "list_files") {
    const parentId = String(args["parentId"] ?? "");
    if (!parentId) return { error: { message: "parentId required" } };
    const rows = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.parentId, parentId),
          isNull(items.trashedAt),
        )!,
      );
    return { result: { files: rows } };
  }
  if (tool === "get_file") {
    const fileId = String(args["fileId"] ?? args["id"] ?? "");
    const [row] = await db.select().from(items).where(eq(items.id, fileId));
    return { result: { file: row ?? null } };
  }
  if (tool === "search_files") {
    const q = String(args["q"] ?? "");
    const { results } = await runDriveSearch(db, identity.userId, identity.tenantId, {
      q,
      limit: "20",
    });
    return { result: { hits: results } };
  }
  if (tool === "create_folder") {
    return handleCommand(
      db,
      deps,
      { ...identity, source: "agent" },
      "folder:create",
      { parentId: args["parentId"], name: args["name"] ?? "Folder" } as Record<string, unknown>,
    );
  }
  if (tool === "share_file") {
    return handleCommand(
      db,
      deps,
      { ...identity, source: "agent" },
      "permission:grant",
      {
        fileId: args["fileId"],
        userId: args["userId"],
        role: args["role"] ?? "reader",
      } as Record<string, unknown>,
    );
  }
  if (tool === "list_comments") {
    const fileId = String(args["fileId"] ?? "");
    const c = await db
      .select()
      .from(comments)
      .where(eq(comments.fileId, fileId));
    return { result: { comments: c } };
  }
  if (tool === "create_comment") {
    return handleCommand(
      db,
      deps,
      { ...identity, source: "agent" },
      "comment:create",
      { fileId: args["fileId"], text: args["text"] ?? "" } as Record<string, unknown>,
    );
  }
  if (tool === "list_activity") {
    const fileId = String(args["fileId"] ?? "");
    const e = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.tenantId, identity.tenantId),
          eq(activityEvents.itemId, fileId),
        )!,
      )
      .orderBy(desc(activityEvents.ts))
      .limit(100);
    return { result: { events: e } };
  }
  if (tool === "propose_share_change" || tool === "propose_share") {
    const id = newPrefixed("prp");
    await db.insert(agentProposals).values({
      id,
      tenantId: identity.tenantId,
      kind: "share",
      status: "pending",
      payload: args,
      createdBy: identity.userId,
    });
    return { result: { proposalId: id, status: "pending" } };
  }
  if (tool === "open_in_office_ai") {
    return { result: { action: "requires_host_capability" } };
  }
  if (tool === "list_changes" || tool === "changes") {
    const since = Number(args["since"] ?? 0);
    const rows = await db
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.tenantId, identity.tenantId),
          since > 0 ? gt(changeLog.cursor, since) : sql`true`,
        )!,
      )
      .orderBy(changeLog.cursor)
      .limit(200);
    return { result: { changes: rows } };
  }
  if (tool === "upload_file" || tool === "download_file") {
    return { result: { message: "Use /api/uploads and blob endpoints" } };
  }
  if (tool === "move_file") {
    return { result: { message: "file:move command planned" } };
  }
  return { error: { code: "unknown_tool", message: tool } };
}
