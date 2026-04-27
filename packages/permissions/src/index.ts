import type { DriveRole } from "@driveai/core";
import { maxRole, DriveRoleOrder } from "@driveai/core";

export function effectiveRole(
  ownRole: DriveRole | null,
  inherited: DriveRole | null,
): DriveRole {
  if (!ownRole) return inherited ?? "reader";
  if (!inherited) return ownRole;
  return maxRole(ownRole, inherited);
}

export { DriveRole, DriveRoleOrder, maxRole };
