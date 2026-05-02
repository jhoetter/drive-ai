import type { SearchHit } from "@driveai/search";
import type { DriveItem } from "./api.js";
import { formatDriveBytes, formatDriveModified } from "./drive-format.js";
import type { DriveListDisplayRow } from "@driveai/ui";

export function driveItemToDisplayRow(
  item: DriveItem,
  locale: string,
  labels: {
    dash: string;
    kindFolder: string;
    kindFile: string;
    kindOther: string;
  },
): DriveListDisplayRow {
  const kind =
    item.type === "folder"
      ? labels.kindFolder
      : item.type === "file"
        ? labels.kindFile
        : labels.kindOther;

  const sizeLabel =
    item.type === "folder"
      ? labels.dash
      : formatDriveBytes(item.size ?? null, locale, labels.dash);

  const modifiedLabel = formatDriveModified(item.updatedAt ?? undefined, locale, labels.dash);

  return {
    id: item.id,
    name: item.name,
    type: item.type,
    mime: item.mime,
    snippet: item.snippet ?? undefined,
    locationPath: item.locationPath ?? undefined,
    sizeLabel,
    modifiedLabel,
    kindLabel: kind,
  };
}

export function searchHitToDriveItem(hit: SearchHit): DriveItem {
  return {
    id: hit.itemId,
    name: hit.name,
    type: hit.type,
    mime: hit.mime,
    size: null,
    updatedAt: hit.updatedAt,
    snippet: hit.snippet,
    locationPath: hit.locationPath ?? null,
  };
}
