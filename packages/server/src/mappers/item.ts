import { items } from "@driveai/db";

export type DriveItemPayload = {
  id: string;
  driveId: string;
  parentId: string | null;
  type: string;
  name: string;
  mime: string | null;
  size: number | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  s3Key: string | null;
  starred: boolean;
  /** Populated for folders when the server attaches direct-child counts */
  folderItemCount?: number;
};

export function toDriveItemPayload(
  row: typeof items.$inferSelect,
  s3Key?: string | null,
  options?: { starred?: boolean; folderItemCount?: number },
): DriveItemPayload {
  const starred = options?.starred ?? false;
  const base: DriveItemPayload = {
    id: row.id,
    driveId: row.driveId,
    parentId: row.parentId,
    type: row.type,
    name: row.name,
    mime: row.mime,
    size: row.size,
    trashedAt: row.trashedAt ? row.trashedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    s3Key: s3Key ?? null,
    starred,
  };
  if (row.type === "folder" && typeof options?.folderItemCount === "number") {
    base.folderItemCount = options.folderItemCount;
  }
  return base;
}
