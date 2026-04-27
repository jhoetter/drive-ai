/** Activity / audit action labels (string tokens for the append-only log). */
export const ActivityAction = {
  created: "created",
  uploaded: "uploaded",
  renamed: "renamed",
  moved: "moved",
  copied: "copied",
  shared: "shared",
  permissionChanged: "permission_changed",
  commented: "commented",
  edited: "edited",
  restored: "restored",
  trashed: "trashed",
  deleted: "permanently_deleted",
} as const;
