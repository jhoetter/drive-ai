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
): Promise<{ item: ReturnType<typeof mapItem> }[]> {
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
  return joined.map((x) => ({ item: mapItem(x.items) }));
}

export async function listSharedWithMe(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ item: ReturnType<typeof mapItem> }[]> {
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
  return [...seen.values()].map((row) => ({ item: mapItem(row) }));
}

export async function listRecent(
  db: Db,
  tenantId: string,
  userId: string,
  limit: number,
): Promise<{ item: ReturnType<typeof mapItem> }[]> {
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
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is typeof items.$inferSelect => row != null && row.trashedAt == null)
    .map((row) => ({ item: mapItem(row) }));
}

export async function listTrash(
  db: Db,
  tenantId: string,
  userId: string,
): Promise<{ item: ReturnType<typeof mapItem> }[]> {
  const rows = await db
    .select()
    .from(items)
    .innerJoin(drives, eq(drives.id, items.driveId))
    .where(and(eq(drives.tenantId, tenantId), isNotNull(items.trashedAt))!)
    .orderBy(desc(items.trashedAt));
  const out: { item: ReturnType<typeof mapItem> }[] = [];
  for (const r0 of rows) {
    const row = r0.items;
    const r = await resolveEffectiveRoleOnItem(db, userId, row.id);
    if (r) out.push({ item: mapItem(row) });
  }
  return out;
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
