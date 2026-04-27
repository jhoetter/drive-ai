import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { fileBlobs, items, type Db } from "@driveai/db";
import { newPrefixed, DriveAiError, ExitCode, capabilitiesFromRole } from "@driveai/core";
import type { FastifyRequest } from "fastify";
import type { AppDeps } from "../deps.js";
import { ensureIdentity, resolveEffectiveRoleOnItem } from "./identity.js";
import { recordSearch } from "./command-dispatch.js";
import { maybeEnqueueSearchExtraction } from "./search-extract.js";
import { ActivityAction } from "@driveai/activity";
import { appendActivity } from "./activity-svc.js";

type I = { userId: string; tenantId: string };

function body<T extends object>(req: FastifyRequest): T {
  return (req.body as T) ?? ({} as T);
}

function ident(req: FastifyRequest): I {
  return (req as unknown as { identity: I }).identity;
}

export async function initUpload(
  db: Db,
  deps: { blob: { presignPut: (k: string, ct: string) => Promise<string> } },
  req: FastifyRequest,
) {
  const b = body<{
    parentId: string;
    name: string;
    contentType: string;
    size: number;
  }>(req);
  const i = ident(req);
  const { parentId, name, contentType, size } = b;
  await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
  const r = await resolveEffectiveRoleOnItem(db, i.userId, parentId);
  if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
  if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === i.userId }).canEdit) {
    throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
  }
  const [p] = await db.select().from(items).where(eq(items.id, parentId));
  if (!p) throw new DriveAiError("parent missing", "invalid", ExitCode.UserError);
  const fileId = newPrefixed("fil");
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  const s3Key = `tenants/${i.tenantId}/files/${fileId}/${name}`;
  await db.insert(items).values({
    id: fileId,
    driveId: p.driveId,
    parentId,
    type: "file",
    name,
    mime: contentType,
    size,
    extension: ext,
    createdBy: i.userId,
  });
  const presign = await deps.blob.presignPut(s3Key, contentType);
  await db.insert(fileBlobs).values({
    id: newPrefixed("blb"),
    itemId: fileId,
    s3Key,
    sha256: "pending",
    size: 0,
    contentType,
  });
  await recordSearch(db, i.tenantId, fileId, name, contentType, i.userId, "");
  return { fileId, uploadUrl: presign, s3Key };
}

export async function completeUpload(db: Db, deps: AppDeps, req: FastifyRequest) {
  const b = body<{
    fileId: string;
    sha256: string;
    size: number;
    contentType: string;
  }>(req);
  const i = ident(req);
  await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
  const [f] = await db.select().from(fileBlobs).where(eq(fileBlobs.itemId, b.fileId));
  if (!f) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
  const buf = await deps.blob.getObjectBytes(f.s3Key);
  const h = createHash("sha256").update(buf).digest("hex");
  if (h !== b.sha256) {
    throw new DriveAiError("checksum mismatch", "checksum", ExitCode.Conflict);
  }
  await db
    .update(fileBlobs)
    .set({ sha256: b.sha256, size: b.size, contentType: b.contentType })
    .where(eq(fileBlobs.id, f.id));
  await db
    .update(items)
    .set({ size: b.size, updatedAt: new Date() })
    .where(eq(items.id, b.fileId));
  const it = await db.select().from(items).where(eq(items.id, b.fileId));
  const name = it[0]?.name ?? f.s3Key.split("/").pop() ?? "file";
  await recordSearch(db, i.tenantId, b.fileId, name, b.contentType, i.userId);
  maybeEnqueueSearchExtraction(db, deps, b.fileId);
  await appendActivity(db, i.tenantId, i.userId, b.fileId, ActivityAction.uploaded, { sha256: b.sha256 });
  return { complete: true };
}

/** Remove a file item created for upload when the blob PUT never completed (pending sha). */
export async function abandonUpload(db: Db, deps: AppDeps, req: FastifyRequest) {
  const b = body<{ fileId: string }>(req);
  const i = ident(req);
  await ensureIdentity(db, i.tenantId, i.userId, "dev@local", "Dev");
  const fileId = b.fileId;
  if (!fileId) throw new DriveAiError("fileId required", "invalid", ExitCode.UserError);
  const r = await resolveEffectiveRoleOnItem(db, i.userId, fileId);
  if (!r) throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
  if (!capabilitiesFromRole(r.role, { isOwner: r.driveOwnerId === i.userId }).canEdit) {
    throw new DriveAiError("forbidden", "forbidden", ExitCode.PermissionDenied);
  }
  const [f] = await db.select().from(fileBlobs).where(eq(fileBlobs.itemId, fileId));
  if (!f) throw new DriveAiError("not found", "not_found", ExitCode.UserError);
  if (f.sha256 !== "pending") {
    throw new DriveAiError("upload already completed", "invalid", ExitCode.UserError);
  }
  if (typeof deps.blob.deleteObject === "function") {
    await deps.blob.deleteObject(f.s3Key);
  }
  await db.delete(items).where(eq(items.id, fileId));
  return { abandoned: true };
}
