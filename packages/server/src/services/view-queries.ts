import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  activityEvents,
  drives,
  items,
  permissionGrants,
  userItemState,
  type Db,
} from "@driveai/db";
import { resolveEffectiveRoleOnItem } from "./identity.js";
import { toDriveItemPayload, type DriveItemPayload } from "../mappers/item.js";
import { latestBlobKeysForItems } from "./blob-keys.js";
import { starredFlagsForItems } from "./star-state.js";
import { countsVisibleChildrenByParentIds } from "./child-counts.js";

async function mapItemsWithBlobKeys(
  db: Db,
  userId: string,
  rows: (typeof items.$inferSelect)[],
  listTypeFilter = "",
): Promise<{ item: DriveItemPayload }[]> {
  const ids = rows.map((r) => r.id);
  const flags = await starredFlagsForItems(db, userId, ids);
  const fileIds = rows.filter((r) => r.type === "file").map((r) => r.id);
  const keys = await latestBlobKeysForItems(db, fileIds);
  const folderIds = rows.filter((r) => r.type === "folder").map((r) => r.id);
  const folderCounts =
    folderIds.length > 0
      ? await countsVisibleChildrenByParentIds(db, folderIds, listTypeFilter)
      : new Map<string, number>();
  return rows.map((row) => ({
    item: toDriveItemPayload(row, keys.get(row.id), {
      starred: flags.get(row.id) ?? false,
      folderItemCount: row.type === "folder" ? (folderCounts.get(row.id) ?? 0) : undefined,
    }),
  }));
}

/**
 * Breadcrumb from item up to root (inclusive of item, exclusive of null parent above root folder).
 */
export async function getBreadcrumbChain(
  db: Db,
  itemId: string,
): Promise<{ id: string; name: string; type: string }[]> {
  const out: { id: string; name: string; type: string }[] = [];
  let cur: string | null = itemId;
  for (let i = 0; i < 64 && cur; i++) {
    const [row] = await db.select().from(items).where(eq(items.id, cur));
    if (!row) break;
    out.unshift({ id: row.id, name: row.name, type: row.type });
    cur = row.parentId;
  }
  return out;
}

export async function listStarred(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ item: DriveItemPayload }[]> {
  const joined = await db
    .select()
    .from(userItemState)
    .innerJoin(items, eq(items.id, userItemState.itemId))
    .innerJoin(drives, eq(drives.id, items.driveId))
    .where(
      and(
        eq(drives.tenantId, tenantId),
        eq(userItemState.userId, userId),
        eq(userItemState.starred, true),
        isNull(items.trashedAt),
      )!,
    )
    .orderBy(desc(userItemState.lastViewedAt), desc(items.updatedAt));
  return mapItemsWithBlobKeys(
    db,
    userId,
    joined.map((x) => x.items),
  );
}

export async function listSharedWithMe(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ item: DriveItemPayload }[]> {
  const joined = await db
    .select()
    .from(permissionGrants)
    .innerJoin(items, eq(items.id, permissionGrants.itemId))
    .innerJoin(drives, eq(drives.id, items.driveId))
    .where(
      and(
        eq(drives.tenantId, tenantId),
        eq(permissionGrants.granteeId, userId),
        eq(permissionGrants.granteeType, "user"),
        isNull(items.trashedAt),
      )!,
    )
    .orderBy(desc(items.updatedAt));
  const seen = new Map<string, (typeof items.$inferSelect)>();
  for (const j of joined) {
    if (!seen.has(j.items.id)) seen.set(j.items.id, j.items);
  }
  return mapItemsWithBlobKeys(db, userId, [...seen.values()]);
}

export async function listRecent(
  db: Db,
  tenantId: string,
  userId: string,
  limit: number,
): Promise<{ item: DriveItemPayload }[]> {
  const evs = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.tenantId, tenantId),
        eq(activityEvents.actorId, userId),
        isNotNull(activityEvents.itemId),
      )!,
    )
    .orderBy(desc(activityEvents.ts))
    .limit(500);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const e of evs) {
    if (!e.itemId || seen.has(e.itemId)) continue;
    seen.add(e.itemId);
    ids.push(e.itemId);
    if (ids.length >= limit) break;
  }
  if (ids.length === 0) return [];
  const rows = await db.select().from(items).where(inArray(items.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is typeof items.$inferSelect => row != null && row.trashedAt == null);
  return mapItemsWithBlobKeys(db, userId, ordered);
}

export async function listTrash(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ item: DriveItemPayload }[]> {
  const rows = await db
    .select()
    .from(items)
    .innerJoin(drives, eq(drives.id, items.driveId))
    .where(and(eq(drives.tenantId, tenantId), isNotNull(items.trashedAt))!)
    .orderBy(desc(items.trashedAt));
  const allowed: (typeof items.$inferSelect)[] = [];
  for (const r0 of rows) {
    const row = r0.items;
    const r = await resolveEffectiveRoleOnItem(db, userId, row.id);
    if (r) allowed.push(row);
  }
  return mapItemsWithBlobKeys(db, userId, allowed);
}

export async function listSharedDrives(
  db: Db,
  tenantId: string,
): Promise<(typeof drives.$inferSelect)[]> {
  return db
    .select()
    .from(drives)
    .where(and(eq(drives.tenantId, tenantId), eq(drives.kind, "shared"))!)
    .orderBy(drives.name);
}
