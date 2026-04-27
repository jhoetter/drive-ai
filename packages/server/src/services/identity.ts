import { eq } from "drizzle-orm";
import { users, drives, tenants, items, permissionGrants, type Db } from "@driveai/db";
import { newPrefixed } from "@driveai/core";
import { type DriveRole } from "@driveai/permissions";
import { maxRole } from "@driveai/core";

/**
 * Ensure tenant + user + personal drive (with root folder) exist for this identity.
 */
export async function ensureIdentity(
  db: Db,
  tenantId: string,
  userId: string,
  email: string,
  displayName: string,
) {
  await db
    .insert(tenants)
    .values({ id: tenantId, name: "Default" })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values({ id: userId, tenantId, email, displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, displayName },
    });
  const existing = await db
    .select()
    .from(drives)
    .where(eq(drives.ownerUserId, userId))
    .limit(1);
  if (existing[0]) return { drive: existing[0] };
  const driveId = newPrefixed("drv");
  const rootId = newPrefixed("fld");
  await db.insert(drives).values({
    id: driveId,
    tenantId,
    kind: "personal",
    name: "My Drive",
    ownerUserId: userId,
  });
  await db.insert(items).values({
    id: rootId,
    driveId,
    parentId: null,
    type: "folder",
    name: "root",
    createdBy: userId,
  });
  await db
    .update(drives)
    .set({ rootFolderId: rootId })
    .where(eq(drives.id, driveId));
  await db.insert(permissionGrants).values({
    id: newPrefixed("prm"),
    itemId: rootId,
    granteeType: "user",
    granteeId: userId,
    role: "owner",
    inherit: true,
    createdBy: userId,
  });
  const [d] = await db.select().from(drives).where(eq(drives.id, driveId));
  return { drive: d! };
}

export async function getItemPath(db: Db, itemId: string): Promise<string[]> {
  const out: string[] = [];
  let current: string | null = itemId;
  for (let i = 0; i < 100 && current; i++) {
    out.push(current);
    const [row] = await db
      .select()
      .from(items)
      .where(eq(items.id, current))
      .limit(1);
    if (!row) break;
    current = row.parentId;
  }
  return out;
}

export async function resolveEffectiveRoleOnItem(
  db: Db,
  userId: string,
  itemId: string,
): Promise<{ role: DriveRole; driveOwnerId: string | null } | null> {
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it) return null;
  const [dr] = await db.select().from(drives).where(eq(drives.id, it.driveId));
  if (!dr) return null;
  if (dr.ownerUserId === userId && dr.kind === "personal") {
    return { role: "owner", driveOwnerId: dr.ownerUserId };
  }
  if (dr.ownerUserId === userId) {
    return { role: "owner", driveOwnerId: dr.ownerUserId };
  }
  const path = await getItemPath(db, itemId);
  let best: DriveRole | null = null;
  for (const pid of path) {
    const grants = await db
      .select()
      .from(permissionGrants)
      .where(eq(permissionGrants.itemId, pid));
    for (const g of grants) {
      if (g.granteeType === "user" && g.granteeId === userId) {
        if (g.expiresAt && g.expiresAt < new Date()) continue;
        const r = g.role as DriveRole;
        best = best ? maxRole(r, best) : r;
      }
    }
  }
  if (!best) return null;
  return { role: best, driveOwnerId: dr.ownerUserId };
}
