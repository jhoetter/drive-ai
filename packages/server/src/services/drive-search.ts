import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  gte,
  lte,
  ilike,
  sql,
  type SQL,
} from "drizzle-orm";
import { searchDocuments, items, type Db } from "@driveai/db";
import { capabilitiesFromRole } from "@driveai/core";
import { ensureIdentity, resolveEffectiveRoleOnItem } from "./identity.js";
import { getBreadcrumbChain } from "./view-queries.js";

export type DriveSearchQuery = {
  q?: string;
  type?: string;
  owner?: string;
  driveId?: string;
  folderId?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  label?: string;
  trash?: string;
  limit?: string;
  offset?: string;
};

export type DriveSearchResultRow = {
  itemId: string;
  name: string;
  mime: string | null;
  ownerId: string;
  type: string;
  updatedAt: Date;
  driveId: string;
  parentId: string | null;
  rank: number;
  match: "name" | "content" | "metadata";
  snippet: string | null;
  /** Human-readable path from drive root, excluding the item's own name. */
  locationPath: string;
};

/** Collect folder id + all descendant item ids (breadth-first). */
export async function collectDescendantItemIds(db: Db, rootFolderId: string): Promise<string[]> {
  const out = new Set<string>([rootFolderId]);
  let frontier: string[] = [rootFolderId];
  for (let depth = 0; depth < 64 && frontier.length > 0; depth++) {
    const children = await db
      .select({ id: items.id })
      .from(items)
      .where(inArray(items.parentId, frontier));
    const next: string[] = [];
    for (const c of children) {
      if (!out.has(c.id)) {
        out.add(c.id);
        next.push(c.id);
      }
    }
    frontier = next;
  }
  return [...out];
}

/**
 * Google-Drive style search: FTS + metadata filters, then permission-filtered.
 */
export async function runDriveSearch(
  db: Db,
  userId: string,
  tenantId: string,
  query: DriveSearchQuery,
): Promise<{ results: DriveSearchResultRow[]; nextOffset: number | null }> {
  await ensureIdentity(db, tenantId, userId, "dev@local", "Dev");

  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const offset = Math.max(0, Number(query.offset) || 0);
  const overFetch = Math.min(200, limit * 5 + offset);

  const qRaw = (query.q ?? "").trim();
  const hasTextQuery = qRaw.length > 0;
  const hasOtherFilter = Boolean(
    query.type ||
      query.owner ||
      query.driveId ||
      query.folderId ||
      query.modifiedAfter ||
      query.modifiedBefore ||
      query.label,
  );
  if (!hasTextQuery && !hasOtherFilter) {
    return { results: [], nextOffset: null };
  }

  const ownerResolved =
    query.owner === "me" || query.owner === "self" ? userId : query.owner?.trim();

  const trash = query.trash === "true" || query.trash === "1";
  const trashedFilter = trash ? isNotNull(items.trashedAt) : isNull(items.trashedAt);

  const cond: SQL[] = [eq(searchDocuments.tenantId, tenantId), trashedFilter];

  if (query.driveId) {
    cond.push(eq(items.driveId, query.driveId));
  }

  if (query.folderId) {
    const ids = await collectDescendantItemIds(db, query.folderId);
    if (ids.length === 0) {
      return { results: [], nextOffset: null };
    }
    cond.push(inArray(searchDocuments.itemId, ids));
  }

  if (ownerResolved) {
    cond.push(eq(searchDocuments.ownerId, ownerResolved));
  }

  if (query.type) {
    const safe = query.type.replace(/[%_\\]/g, "");
    cond.push(ilike(searchDocuments.mime, `%${safe}%`));
  }

  if (query.modifiedAfter) {
    const d = new Date(query.modifiedAfter);
    if (!Number.isNaN(d.getTime())) cond.push(gte(items.updatedAt, d));
  }
  if (query.modifiedBefore) {
    const d = new Date(query.modifiedBefore);
    if (!Number.isNaN(d.getTime())) cond.push(lte(items.updatedAt, d));
  }

  if (query.label) {
    const eqPos = query.label.indexOf("=");
    if (eqPos > 0) {
      const k = query.label.slice(0, eqPos).trim();
      const v = query.label.slice(eqPos + 1).trim();
      cond.push(
        sql`exists (
          select 1 from item_labels il
          inner join label_defs ld on il.label_id = ld.id
          where il.item_id = ${searchDocuments.itemId}
            and ld.tenant_id = ${tenantId}
            and ld.key = ${k}
            and ld.value = ${v}
        )`,
      );
    }
  }

  const tsvExpr = sql`
    coalesce(
      ${searchDocuments.searchTsv},
      to_tsvector('english', coalesce(${searchDocuments.name}, '') || ' ' || coalesce(${searchDocuments.textBody}, ''))
    )
  `;
  const tsQuery = sql`plainto_tsquery('english', ${qRaw})`;

  const textMatch = hasTextQuery ? sql`${tsvExpr} @@ ${tsQuery}` : sql`true`;

  const rankSql = hasTextQuery
    ? sql<number>`ts_rank(${tsvExpr}, ${tsQuery})`
    : sql<number>`0`;

  const snippetSql = hasTextQuery
    ? sql<string | null>`nullif(trim(both from ts_headline(
        'english',
        coalesce(${searchDocuments.textBody}, ''),
        ${tsQuery},
        'StartSel=, StopSel=, MaxWords=20, MinWords=5'
      )), '')`
    : sql<string | null>`null`;

  const rows = await db
    .select({
      itemId: searchDocuments.itemId,
      name: searchDocuments.name,
      mime: searchDocuments.mime,
      ownerId: searchDocuments.ownerId,
      type: items.type,
      updatedAt: items.updatedAt,
      driveId: items.driveId,
      parentId: items.parentId,
      _rank: rankSql,
      _snippet: snippetSql,
    })
    .from(searchDocuments)
    .innerJoin(items, eq(items.id, searchDocuments.itemId))
    .where(and(...cond, textMatch)!)
    .orderBy(hasTextQuery ? desc(rankSql) : desc(items.updatedAt))
    .limit(overFetch)
    .offset(offset);

  const out: DriveSearchResultRow[] = [];
  for (const r of rows) {
    const res = await resolveEffectiveRoleOnItem(db, userId, r.itemId);
    if (!res) continue;
    if (!capabilitiesFromRole(res.role, { isOwner: res.driveOwnerId === userId }).canView) {
      continue;
    }
    const chain = await getBreadcrumbChain(db, r.itemId);
    const locationPath =
      chain.length > 1
        ? chain
            .slice(0, -1)
            .map((c) => c.name)
            .join(" › ")
        : "";
    const snippet = r._snippet;
    const hasSnippet = Boolean(snippet && String(snippet).length > 0);
    const nameHit = hasTextQuery && r.name.toLowerCase().includes(qRaw.toLowerCase());
    out.push({
      itemId: r.itemId,
      name: r.name,
      mime: r.mime,
      ownerId: r.ownerId,
      type: r.type,
      updatedAt: r.updatedAt,
      driveId: r.driveId,
      parentId: r.parentId,
      rank: Number(r._rank) || 0,
      match: hasSnippet ? "content" : nameHit ? "name" : "metadata",
      snippet: snippet ?? null,
      locationPath,
    });
    if (out.length >= limit) break;
  }

  const nextOffset = rows.length < overFetch ? null : offset + overFetch;

  return { results: out, nextOffset };
}
