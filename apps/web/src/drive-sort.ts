import type { DriveItem } from "./api.js";
import type { DriveListSortDir, DriveListSortKey } from "@driveai/ui";

function folderFirstRank(it: DriveItem): number {
  return it.type === "folder" ? 0 : 1;
}

function compareLocale(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Client-side ordering for the active list page (aligned with Explorer / Drive: folders group first). */
export function sortDriveItems(
  rows: DriveItem[],
  key: DriveListSortKey,
  dir: DriveListSortDir,
): DriveItem[] {
  const out = [...rows];
  const sign = dir === "asc" ? 1 : -1;
  out.sort((x, y) => {
    const fr = folderFirstRank(x) - folderFirstRank(y);
    // Keep folders before files regardless of asc/desc; `sign` only applies to the active column.
    if (fr !== 0) return fr;

    switch (key) {
      case "name":
        return sign * compareLocale(x.name, y.name);
      case "modified": {
        const tx = x.updatedAt ? Date.parse(x.updatedAt) : 0;
        const ty = y.updatedAt ? Date.parse(y.updatedAt) : 0;
        return sign * (tx - ty);
      }
      case "size": {
        const sx = x.type === "folder" ? 0 : (x.size ?? 0);
        const sy = y.type === "folder" ? 0 : (y.size ?? 0);
        const n = sx - sy;
        if (n !== 0) return sign * n;
        return sign * compareLocale(x.name, y.name);
      }
      default:
        return 0;
    }
  });
  return out;
}
