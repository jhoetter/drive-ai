import { and, eq, inArray } from "drizzle-orm";
import { userItemState, type Db } from "@driveai/db";

/** Per-user starred flag for batch of items; missing rows => false. */
export async function starredFlagsForItems(
  db: Db,
  userId: string,
  itemIds: string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const uniq = [...new Set(itemIds)];
  for (const id of uniq) out.set(id, false);
  if (uniq.length === 0) return out;
  const rows = await db
    .select({ itemId: userItemState.itemId, starred: userItemState.starred })
    .from(userItemState)
    .where(and(eq(userItemState.userId, userId), inArray(userItemState.itemId, uniq))!);
  for (const r of rows) out.set(r.itemId, r.starred);
  return out;
}
