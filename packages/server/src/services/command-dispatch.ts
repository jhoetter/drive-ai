import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  accessRequests,
  comments,
  fileBlobs,
  items,
  labelDefs,
  itemLabels,
  permissionGrants,
  searchDocuments,
  shareLinks,
  userItemState,
  type Db,
} from "@driveai/db";
import { createHash, randomBytes } from "node:crypto";
import { newPrefixed, DriveAiError, ExitCode, capabilitiesFromRole, type DriveRole } from "@driveai/core";
import { ensureIdentity, resolveEffectiveRoleOnItem } from "./identity.js";
import { appendActivity, appendChange } from "./activity-svc.js";
import { ActivityAction } from "@driveai/activity";
import type { AppDeps } from "../deps.js";
import { extractAndIndexFile, reindexExtractableInTenant } from "./search-extract.js";

export async function handleCommand(
  db: Db,
  deps: AppDeps,
  actor: { userId: string; tenantId: string; source: "human" | "agent" | "system" },
  name: string,
  payload: Record<string, unknown>,
) {
  const userId = actor.userId;
  const tenantId = actor.tenantId;
  await ensureIdentity(db, tenantId, userId, "dev@local", "Dev");
  if (name === "folder:create") {
    const parentId = String(payload["parentId"] ?? "");
    const title = String(payload["name"] ?? "folder");
    const r = await resolveEffectiveRoleOnItem(db, userId, parentId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canEdit) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const [p] = await db.select().from(items).where(eq(items.id, parentId));
    if (!p) throw new DriveAiError("parent missing", "invalid", ExitCode.UserError);
    const dupe = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.parentId, parentId),
          eq(items.name, title),
          isNull(items.trashedAt),
        )!,
      );
    if (dupe[0]) throw new DriveAiError("name exists", "conflict", ExitCode.Conflict);
    const newFolderId = newPrefixed("fld");
    await db.insert(items).values({
      id: newFolderId,
      driveId: p.driveId,
      parentId,
      type: "folder",
      name: title,
      createdBy: userId,
    });
    await inheritPermissions(db, parentId, newFolderId, userId);
    await recordSearch(db, tenantId, newFolderId, title, null, userId);
    await appendActivity(db, tenantId, userId, newFolderId, ActivityAction.created, { name: title });
    await appendChange(db, tenantId, "item.create", newFolderId, { type: "folder" });
    deps.events.broadcast(tenantId, { type: "item.created", payload: { id: newFolderId } });
    return { id: newFolderId };
  }
  if (name === "folder:ensurePath") {
    const parentId = String(payload["parentId"] ?? "");
    const raw = payload["segments"];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new DriveAiError("segments required", "invalid", ExitCode.UserError);
    }
    const segments: string[] = [];
    for (const s of raw) {
      const t = String(s).trim();
      if (!t || t === "." || t === "..") {
        throw new DriveAiError("invalid path segment", "invalid", ExitCode.UserError);
      }
      if (t.includes("/") || t.includes("\\")) {
        throw new DriveAiError("invalid path segment", "invalid", ExitCode.UserError);
      }
      segments.push(t);
    }
    let currentParent = parentId;
    for (const title of segments) {
      const r = await resolveEffectiveRoleOnItem(db, userId, currentParent);
      if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
      if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canEdit) {
        throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
      }
      const [p] = await db.select().from(items).where(eq(items.id, currentParent));
      if (!p) throw new DriveAiError("parent missing", "invalid", ExitCode.UserError);
      const existing = await db
        .select()
        .from(items)
        .where(
          and(
            eq(items.parentId, currentParent),
            eq(items.name, title),
            isNull(items.trashedAt),
          )!,
        );
      const hit = existing[0];
      if (hit) {
        if (hit.type !== "folder") {
          throw new DriveAiError("path blocked by a file", "conflict", ExitCode.Conflict);
        }
        currentParent = hit.id;
        continue;
      }
      const newFolderId = newPrefixed("fld");
      await db.insert(items).values({
        id: newFolderId,
        driveId: p.driveId,
        parentId: currentParent,
        type: "folder",
        name: title,
        createdBy: userId,
      });
      await inheritPermissions(db, currentParent, newFolderId, userId);
      await recordSearch(db, tenantId, newFolderId, title, null, userId);
      await appendActivity(db, tenantId, userId, newFolderId, ActivityAction.created, { name: title });
      await appendChange(db, tenantId, "item.create", newFolderId, { type: "folder" });
      deps.events.broadcast(tenantId, { type: "item.created", payload: { id: newFolderId } });
      currentParent = newFolderId;
    }
    return { folderId: currentParent };
  }
  if (name === "file:trash" || name === "folder:trash") {
    const fileId = String(payload["id"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canTrash) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    await db
      .update(items)
      .set({ trashedAt: new Date(), trashedBy: userId, updatedAt: new Date() })
      .where(eq(items.id, fileId));
    await appendActivity(db, tenantId, userId, fileId, ActivityAction.trashed, {});
    return { trashed: fileId };
  }
  if (name === "file:restore" || name === "folder:restore") {
    const fileId = String(payload["id"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    await db
      .update(items)
      .set({ trashedAt: null, trashedBy: null, updatedAt: new Date() })
      .where(eq(items.id, fileId));
    await appendActivity(db, tenantId, userId, fileId, ActivityAction.restored, {});
    return { restored: fileId };
  }
  if (name === "permission:grant") {
    const fileId = String(payload["fileId"] ?? payload["itemId"] ?? "");
    const grantee = String(payload["userId"] ?? "");
    const role = String(payload["role"] ?? "reader") as DriveRole;
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canShare) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    await db.insert(permissionGrants).values({
      id: newPrefixed("prm"),
      itemId: fileId,
      granteeType: "user",
      granteeId: grantee,
      role,
      createdBy: userId,
    });
    return { id: fileId, grantee, role };
  }
  if (name === "comment:create") {
    const fileId = String(payload["fileId"] ?? "");
    const text = String(payload["text"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canComment) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const cid = newPrefixed("cmt");
    await db.insert(comments).values({
      id: cid,
      fileId,
      parentId: null,
      authorId: userId,
      body: text,
    });
    return { id: cid };
  }
  if (name === "label:set" || name === "file:set-label") {
    const fileId = String(payload["fileId"] ?? payload["id"] ?? "");
    const key = String(payload["key"] ?? "status");
    const value = String(payload["value"] ?? "default");
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canEdit) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const lid = newPrefixed("lbl");
    await db.insert(labelDefs).values({ id: lid, tenantId, key, value, color: null });
    await db.insert(itemLabels).values({ itemId: fileId, labelId: lid });
    return { labelId: lid };
  }
  if (name === "permission:create-link" || name === "share link create") {
    const fileId = String(payload["fileId"] ?? payload["itemId"] ?? "");
    const role = String(payload["role"] ?? "reader") as "reader" | "commenter" | "writer";
    const discoverable = Boolean(payload["discoverable"]);
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canShare) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const id = newPrefixed("lnk");
    await db.insert(shareLinks).values({
      id,
      itemId: fileId,
      tokenHash,
      role,
      discoverable,
      createdBy: userId,
    });
    return { linkId: id, secretToken: raw };
  }
  if (name === "access-request:create") {
    const fileId = String(payload["fileId"] ?? payload["itemId"] ?? "");
    const message = String(payload["message"] ?? "");
    const [it] = await db.select().from(items).where(eq(items.id, fileId));
    if (!it) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (r && r.role !== "reader") {
      throw new DriveAiError("already have access", "invalid", ExitCode.UserError);
    }
    const id = newPrefixed("areq");
    await db.insert(accessRequests).values({
      id,
      itemId: fileId,
      requesterId: userId,
      message,
    });
    return { requestId: id, status: "pending" as const };
  }
  if (name === "access-request:approve") {
    const requestId = String(payload["requestId"] ?? "");
    const role = String(payload["role"] ?? "reader") as DriveRole;
    const [row] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId));
    if (!row || row.status !== "pending") {
      throw new DriveAiError("invalid request", "invalid", ExitCode.UserError);
    }
    const fileId = row.itemId;
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canShare) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    await db
      .update(accessRequests)
      .set({
        status: "approved",
        grantedRole: role as "reader" | "commenter" | "writer",
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(accessRequests.id, requestId));
    await db.insert(permissionGrants).values({
      id: newPrefixed("prm"),
      itemId: fileId,
      granteeType: "user",
      granteeId: row.requesterId,
      role,
      createdBy: userId,
    });
    return { requestId, approved: true, role };
  }
  if (name === "item:rename" || name === "file:rename" || name === "folder:rename") {
    const id = String(payload["id"] ?? "");
    const newName = String(payload["name"] ?? "").trim();
    if (!newName) throw new DriveAiError("name required", "invalid", ExitCode.UserError);
    const r = await resolveEffectiveRoleOnItem(db, userId, id);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canEdit) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const [it] = await db.select().from(items).where(eq(items.id, id));
    if (!it) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
    const sameParent =
      it.parentId == null
        ? isNull(items.parentId)
        : eq(items.parentId, it.parentId);
    const dupe = await db
      .select()
      .from(items)
      .where(and(sameParent, eq(items.name, newName), isNull(items.trashedAt))!);
    if (dupe[0] && dupe[0].id !== id) {
      throw new DriveAiError("name exists", "conflict", ExitCode.Conflict);
    }
    await db
      .update(items)
      .set({ name: newName, updatedAt: new Date() })
      .where(eq(items.id, id));
    await recordSearch(db, tenantId, id, newName, it.mime, it.createdBy);
    await appendActivity(db, tenantId, userId, id, ActivityAction.renamed, { name: newName });
    return { id, name: newName };
  }
  if (name === "item:move" || name === "file:move" || name === "folder:move") {
    const id = String(payload["id"] ?? "");
    const newParentId = String(payload["parentId"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, id);
    const r2 = await resolveEffectiveRoleOnItem(db, userId, newParentId);
    if (!r || !r2) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canMove) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    if (!capabilitiesFromRole(r2.role, { isOwner: r2.driveOwnerId === userId }).canEdit) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const [it] = await db.select().from(items).where(eq(items.id, id));
    const [parent] = await db.select().from(items).where(eq(items.id, newParentId));
    if (!it || !parent) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
    if (it.driveId !== parent.driveId) {
      throw new DriveAiError("cross-drive move not supported", "invalid", ExitCode.UserError);
    }
    if (it.type === "folder") {
      let c: string | null = newParentId;
      for (let d = 0; d < 64 && c; d++) {
        if (c === id) throw new DriveAiError("cannot move into self", "invalid", ExitCode.UserError);
        const [x] = await db.select().from(items).where(eq(items.id, c));
        c = x?.parentId ?? null;
      }
    }
    const dupe = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.parentId, newParentId),
          eq(items.name, it.name),
          isNull(items.trashedAt),
        )!,
      );
    if (dupe[0] && dupe[0].id !== id) {
      throw new DriveAiError("name exists", "conflict", ExitCode.Conflict);
    }
    await db
      .update(items)
      .set({ parentId: newParentId, updatedAt: new Date() })
      .where(eq(items.id, id));
    await appendActivity(db, tenantId, userId, id, ActivityAction.moved, { parentId: newParentId });
    return { id, parentId: newParentId };
  }
  if (name === "file:copy" || name === "item:copy") {
    const id = String(payload["id"] ?? "");
    const parentId = String(payload["parentId"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, id);
    const rp = await resolveEffectiveRoleOnItem(db, userId, parentId);
    if (!r || !rp) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(rp.role, { isOwner: rp.driveOwnerId === userId }).canEdit) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const [src] = await db.select().from(items).where(eq(items.id, id));
    if (!src || src.type !== "file") {
      throw new DriveAiError("only files", "invalid", ExitCode.UserError);
    }
    const [p] = await db.select().from(items).where(eq(items.id, parentId));
    if (!p) throw new DriveAiError("parent missing", "invalid", ExitCode.UserError);
    if (src.driveId !== p.driveId) {
      throw new DriveAiError("cross-drive copy not supported", "invalid", ExitCode.UserError);
    }
    const [blob] = await db
      .select()
      .from(fileBlobs)
      .where(eq(fileBlobs.itemId, id))
      .orderBy(desc(fileBlobs.version))
      .limit(1);
    if (!blob) throw new DriveAiError("no blob", "invalid", ExitCode.UserError);
    const ext = src.name.includes(".") ? (src.name.split(".").pop() ?? "") : "";
    const base = ext ? src.name.slice(0, -(ext.length + 1)) : src.name;
    let finalName = `Copy of ${src.name}`;
    for (let n = 1; n < 30; n++) {
      const tryName = n === 1 ? finalName : `Copy of ${base} (${n})${ext ? `.${ext}` : ""}`;
      const clash = await db
        .select()
        .from(items)
        .where(
          and(
            eq(items.parentId, parentId),
            eq(items.name, tryName),
            isNull(items.trashedAt),
          )!,
        );
      if (!clash[0]) {
        finalName = tryName;
        break;
      }
      finalName = `Copy of ${base} (${n + 1})${ext ? `.${ext}` : ""}`;
    }
    const newId = newPrefixed("fil");
    await db.insert(items).values({
      id: newId,
      driveId: p.driveId,
      parentId,
      type: "file",
      name: finalName,
      mime: src.mime,
      size: src.size,
      extension: ext || null,
      createdBy: userId,
    });
    await db.insert(fileBlobs).values({
      id: newPrefixed("blb"),
      itemId: newId,
      s3Key: blob.s3Key,
      sha256: blob.sha256,
      size: blob.size,
      contentType: blob.contentType,
      version: 1,
    });
    await recordSearch(db, tenantId, newId, finalName, src.mime, userId);
    await appendActivity(db, tenantId, userId, newId, ActivityAction.copied, { from: id });
    return { id: newId, name: finalName };
  }
  if (name === "item:set-starred" || name === "file:set-starred") {
    const id = String(payload["id"] ?? "");
    const starred = Boolean(payload["starred"] ?? true);
    const r = await resolveEffectiveRoleOnItem(db, userId, id);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canView) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    await db
      .insert(userItemState)
      .values({ userId, itemId: id, starred })
      .onConflictDoUpdate({
        target: [userItemState.userId, userItemState.itemId],
        set: { starred },
      });
    return { id, starred };
  }
  if (name === "file:delete-permanently" || name === "item:delete-permanently") {
    const id = String(payload["id"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, id);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canDelete) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const [it] = await db.select().from(items).where(eq(items.id, id));
    if (!it?.trashedAt) {
      throw new DriveAiError("item must be in trash", "invalid", ExitCode.UserError);
    }
    await db.delete(items).where(eq(items.id, id));
    await appendActivity(db, tenantId, userId, id, ActivityAction.deleted, {});
    return { deleted: id };
  }
  if (name === "trash:empty") {
    const { listTrash } = await import("./view-queries.js");
    const tr = await listTrash(db, tenantId, userId);
    for (const { item: row } of tr) {
      await db.delete(items).where(eq(items.id, row.id));
    }
    return { deleted: tr.length };
  }
  if (name === "comment:reply") {
    const fileId = String(payload["fileId"] ?? "");
    const parentCommentId = String(payload["parentId"] ?? "");
    const text = String(payload["text"] ?? "");
    const r = await resolveEffectiveRoleOnItem(db, userId, fileId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canComment) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    const cid = newPrefixed("cmt");
    await db.insert(comments).values({
      id: cid,
      fileId,
      parentId: parentCommentId,
      authorId: userId,
      body: text,
    });
    return { id: cid, parentId: parentCommentId };
  }
  if (name === "permission:revoke") {
    const grantId = String(payload["grantId"] ?? "");
    const [g] = await db.select().from(permissionGrants).where(eq(permissionGrants.id, grantId));
    if (!g) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
    const r = await resolveEffectiveRoleOnItem(db, userId, g.itemId);
    if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === userId }).canShare) {
      throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
    }
    await db.delete(permissionGrants).where(eq(permissionGrants.id, grantId));
    return { revoked: grantId };
  }
  if (name === "search:reindex-item") {
    const id = String(payload["id"] ?? "");
    if (!id) throw new DriveAiError("id required", "invalid", ExitCode.UserError);
    await extractAndIndexFile(db, deps, id);
    return { reindexed: id };
  }
  if (name === "search:reindex-tenant") {
    const cap = Math.min(2000, Math.max(1, Number(payload["cap"] ?? 200)));
    return reindexExtractableInTenant(db, deps, tenantId, cap);
  }
  throw new DriveAiError(`unknown command ${name}`, "unknown_command", ExitCode.UserError);
}

export async function inheritPermissions(
  db: Db,
  parentId: string,
  childId: string,
  createdBy: string,
) {
  const grants = await db
    .select()
    .from(permissionGrants)
    .where(and(eq(permissionGrants.itemId, parentId), eq(permissionGrants.inherit, true))!);
  for (const g of grants) {
    await db.insert(permissionGrants).values({
      id: newPrefixed("prm"),
      itemId: childId,
      granteeType: g.granteeType,
      granteeId: g.granteeId,
      role: g.role,
      inherit: true,
      createdBy,
    });
  }
}

export async function recordSearch(
  db: Db,
  tenantId: string,
  itemId: string,
  name: string,
  mime: string | null,
  ownerId: string,
  textBody: string = "",
) {
  const tsv = sql`to_tsvector('english', coalesce(${name}, '') || ' ' || coalesce(${textBody}, ''))`;
  try {
    await db
      .insert(searchDocuments)
      .values({ itemId, tenantId, name, mime, textBody, ownerId, searchTsv: tsv });
  } catch {
    await db
      .update(searchDocuments)
      .set({
        name,
        mime,
        ownerId,
        searchTsv: sql`to_tsvector('english', coalesce(${name}, '') || ' ' || coalesce(${searchDocuments.textBody}, ''))`,
      })
      .where(eq(searchDocuments.itemId, itemId));
  }
}
