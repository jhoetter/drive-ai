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
};

export function toDriveItemPayload(
  row: typeof items.$inferSelect,
  s3Key?: string | null,
  options?: { starred?: boolean },
): DriveItemPayload {
  const starred = options?.starred ?? false;
  return {
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
}
