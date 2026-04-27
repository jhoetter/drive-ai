import { newPrefixed } from "@driveai/core";
import { activityEvents, changeLog, type Db } from "@driveai/db";

export async function appendActivity(
  db: Db,
  tenantId: string,
  actorId: string,
  itemId: string | null,
  action: string,
  payload: Record<string, unknown>,
) {
  await db.insert(activityEvents).values({
    id: newPrefixed("act"),
    tenantId,
    actorId,
    itemId: itemId ?? null,
    action,
    payload,
  });
}

export async function appendChange(
  db: Db,
  tenantId: string,
  op: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  await db.insert(changeLog).values({ tenantId, op, entityId, payload });
}
