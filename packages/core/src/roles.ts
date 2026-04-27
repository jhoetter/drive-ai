/** Drive-style roles (independent spec; not Google API). */
export const DriveRole = {
  owner: "owner",
  organizer: "organizer",
  fileOrganizer: "fileOrganizer",
  writer: "writer",
  commenter: "commenter",
  reader: "reader",
} as const;

export type DriveRole = (typeof DriveRole)[keyof typeof DriveRole];

export const DriveRoleOrder: Record<DriveRole, number> = {
  owner: 6,
  organizer: 5,
  fileOrganizer: 4,
  writer: 3,
  commenter: 2,
  reader: 1,
};

export function maxRole(a: DriveRole, b: DriveRole): DriveRole {
  return DriveRoleOrder[a] >= DriveRoleOrder[b] ? a : b;
}
