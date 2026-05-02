import type { QueryClient } from "@tanstack/react-query";
import type { SearchResponse } from "@driveai/search";

type ItemEnvelope = { item: { id: string; starred?: boolean } };

function mapItemsEnvelope(old: unknown, itemId: string, starred: boolean): unknown {
  if (!old || typeof old !== "object") return old;
  const o = old as { items?: ItemEnvelope[] };
  if (!Array.isArray(o.items)) return old;
  let changed = false;
  const items = o.items.map((row) => {
    if (row.item?.id !== itemId) return row;
    changed = true;
    return { ...row, item: { ...row.item, starred } };
  });
  return changed ? { ...o, items } : old;
}

function patchStarredList(old: unknown, itemId: string, starred: boolean): unknown {
  if (!starred && old && typeof old === "object" && Array.isArray((old as { items?: unknown }).items)) {
    const o = old as { items: ItemEnvelope[] };
    return {
      ...o,
      items: o.items.filter((row) => row.item?.id !== itemId),
    };
  }
  return mapItemsEnvelope(old, itemId, starred);
}

function patchSearchResults(old: unknown, itemId: string, starred: boolean): unknown {
  if (!old || typeof old !== "object") return old;
  const o = old as SearchResponse;
  if (!Array.isArray(o.results)) return old;
  let changed = false;
  const results = o.results.map((h) => {
    if (h.itemId !== itemId) return h;
    changed = true;
    return { ...h, starred };
  });
  return changed ? { ...o, results } : old;
}

function patchItemDetail(old: unknown, itemId: string, starred: boolean): unknown {
  if (!old || typeof old !== "object") return old;
  const o = old as ItemEnvelope;
  if (o.item?.id !== itemId) return old;
  return { ...o, item: { ...o.item, starred } };
}

/** Update cached list/detail rows so starring feels instant; reconcile with invalidate/refetch afterward. */
export function applyDriveStarLocally(qc: QueryClient, itemId: string, starred: boolean): void {
  const childPrefix = (prefix: string) => ({
    predicate: (q: { queryKey: unknown }) =>
      Array.isArray(q.queryKey) && q.queryKey[0] === prefix,
  });

  qc.setQueriesData(childPrefix("children"), (old) => mapItemsEnvelope(old, itemId, starred));
  qc.setQueriesData(childPrefix("recent"), (old) => mapItemsEnvelope(old, itemId, starred));
  qc.setQueriesData(childPrefix("sharedWithMe"), (old) => mapItemsEnvelope(old, itemId, starred));
  qc.setQueriesData(childPrefix("trash"), (old) => mapItemsEnvelope(old, itemId, starred));

  qc.setQueriesData(childPrefix("starred"), (old) => patchStarredList(old, itemId, starred));

  qc.setQueriesData(childPrefix("search"), (old) => patchSearchResults(old, itemId, starred));

  qc.setQueriesData(
    {
      predicate: (q: { queryKey: unknown }) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "item" && q.queryKey[1] === itemId,
    },
    (old) => patchItemDetail(old, itemId, starred),
  );
}
