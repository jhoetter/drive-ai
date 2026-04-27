import type { DriveRole } from "./roles.js";
import { DriveRoleOrder } from "./roles.js";

export interface ItemCapabilities {
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canShare: boolean;
  canMove: boolean;
  canTrash: boolean;
  canReadRevisions: boolean;
  canDelete: boolean;
}

const roleToCaps = (r: DriveRole, isOwner: boolean): ItemCapabilities => {
  const n = DriveRoleOrder[r] ?? 0;
  return {
    canView: n >= 1,
    canComment: n >= 2,
    canEdit: n >= 3,
    canShare: n >= 3 || isOwner,
    canMove: n >= 3 || isOwner,
    canTrash: n >= 3 || isOwner,
    canReadRevisions: n >= 1,
    canDelete: n >= 3 || isOwner,
  };
};

export function capabilitiesFromRole(role: DriveRole, opts: { isOwner: boolean }): ItemCapabilities {
  return roleToCaps(role, opts.isOwner);
}
