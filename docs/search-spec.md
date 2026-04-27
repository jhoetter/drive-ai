# Search API and indexing (drive-ai)

## Goals

- **Security**: Every hit is an item the caller may **view** (effective role via [`resolveEffectiveRoleOnItem`](../packages/server/src/services/identity.ts)).
- **Defaults**: Trashed items are **excluded** unless `trash=true`.
- **Content**: Beyond file names, `text_body` in `search_documents` holds extracted text when available; ranking uses PostgreSQL `tsvector` and `ts_rank`.

## HTTP: `GET /api/search`

### Query parameters

| Param | Description |
|-------|-------------|
| `q` | Search text. Optional if any other filter is set (see below). |
| `type` | Substring match on stored MIME (e.g. `pdf`, `image`). |
| `owner` | User id of indexed owner, or `me` for the current user. |
| `driveId` | Restrict to items in this drive. |
| `folderId` | Restrict to this folder **and all descendants** (recursive). |
| `modifiedAfter` | ISO-8601 timestamp; `items.updatedAt` &gt; this. |
| `modifiedBefore` | ISO-8601 timestamp; `items.updatedAt` &lt; this. |
| `label` | `key=value` matching `label_defs` + `item_labels` for that item. |
| `trash` | `true` = only trashed items; default = only non-trashed. |
| `limit` | Page size (default 50, max 100). |
| `offset` | For pagination. |

### Behavior

1. **Tenant** is always the caller’s tenant.
2. **Base filters** join `search_documents` with `items` and apply `trash` + `driveId` / `folderId` / `modified*` / `label` as implemented in [`drive-search`](../packages/server/src/services/drive-search.ts).
3. **Text query**: If `q` is non-empty, match using **FTS** (`@@ plainto_tsquery('english', q)`) on `search_tsv` (or fallback composable `to_tsvector` for rows not yet backfilled). If `q` is empty and other filters exist, return items matching **metadata only**, ordered by `items.updatedAt` descending.
4. **ACL**: After SQL returns a candidate set (over-fetch), each candidate is checked with `resolveEffectiveRoleOnItem` + `capabilitiesFromRole(…).canView`. Results are truncated to `limit` after filtering.

### Response JSON

```json
{
  "results": [
    {
      "itemId": "…",
      "name": "…",
      "mime": "…",
      "ownerId": "…",
      "type": "file|folder|…",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "driveId": "…",
      "parentId": "…|null",
      "rank": 0.12,
      "match": "name|content",
      "snippet": "… | null",
      "locationPath": "parent › names › without item (UI context)"
    }
  ],
  "nextOffset": 50
}
```

- `nextOffset` is present when more candidates may exist (client passes `offset`).
- `locationPath` is a breadcrumb string (root → parent), excluding the hit’s own name.

## Indexing

- **Row**: `search_documents` is upserted from `recordSearch` (folder create, rename, copy, upload). **File uploads** also call `recordSearch` at **`initUpload`** (name + MIME) so name search works before `completeUpload`; `completeUpload` refreshes the row after checksum and may trigger extraction.
- **Column** `search_tsv`: `tsvector` built from `name` + `text_body` (English config).
- **Extraction**: After upload, **plain text** and **PDF** (allowlisted MIME) are extracted asynchronously; body text is stored and `search_tsv` refreshed. See [`search-extract`](../packages/server/src/services/search-extract.ts).
- **Reindex**: Command `search:reindex-item` (payload `{ itemId }`) re-runs extraction for one file; use when content changed offline.

## Observability (dev)

- Extraction errors are logged; failed items keep **filename-only** search.
- GIN index on `search_tsv` recommended in production (created by `drizzle-kit push` with schema).

## Out of scope (v1)

- Cross-tenant search.
- OCR for images.
- Natural-language query parsing (use structured params + `q` as plain terms).
