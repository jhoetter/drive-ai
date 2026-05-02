import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { fileBlobs, items, type Db } from "@driveai/db";

const completedBlobSql = sql`exists (
  select 1 from ${fileBlobs}
  where ${fileBlobs.itemId} = ${items.id}
    and ${fileBlobs.sha256} <> 'pending'
)`;

/**
 * Counts direct children per folder using the same visibility rules as GET .../children
 * (`type` query: all | file | folder).
 */
export async function countsVisibleChildrenByParentIds(
  db: Db,
  parentFolderIds: string[],
  typeFilter: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (parentFolderIds.length === 0) return out;
  const type = typeFilter;
  const filter = and(
    inArray(items.parentId, parentFolderIds),
    isNull(items.trashedAt),
    type === "file" || type === "folder" ? eq(items.type, type as "file" | "folder") : undefined,
    type === "file" ? completedBlobSql : undefined,
    type === "folder" ? undefined : sql`(${items.type} <> 'file' or ${completedBlobSql})`,
  )!;
  const rows = await db
    .select({
      parentId: items.parentId,
      cnt: sql<number>`cast(count(*) as int)`,
    })
    .from(items)
    .where(filter)
    .groupBy(items.parentId);
  for (const r of rows) {
    if (r.parentId) out.set(r.parentId, r.cnt);
  }
  return out;
}
