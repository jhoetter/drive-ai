# File system semantics (drive-ai)

Single source of truth for item tree behavior, shared drives, and trash. Aligns with [`prompt.md`](../prompt.md) and the database schema in [`packages/db/src/schema.ts`](../packages/db/src/schema.ts).

## Model

- **Drives** (`drives`): `personal` (one per user) or `shared` (team drive). Each has a `rootFolderId` pointing at a folder `item`.
- **Items** (`items`): `file`, `folder`, `shortcut`, `external`, or `generated`. Tree by `parentId` (null only for drive root folder).
- **Paths** are **derived** by walking `parentId` to the root; there is no stored POSIX path. Breadcrumbs are computed server-side.
- **Blobs** live in `file_blobs` (S3 or dev store), keyed by `itemId` and `version`.
- **Permissions** on `permission_grants` with `inherit` and role ordering resolved in [`resolveEffectiveRoleOnItem`](../packages/server/src/services/identity.ts).

## Invariants

1. **Name uniqueness**: Within a parent, among non-trashed items, `(parentId, name)` is unique (enforced by commands on create/rename).
2. **Move/copy**: `command-dispatch` restricts cross-drive rules as implemented; same drive only unless extended later.
3. **Trash**: `trashedAt` set = item is in trash; child listing APIs typically exclude trashed. **Default search** excludes trashed items; use `?trash=true` to search only trashed (see [search-spec](./search-spec.md)).
4. **Shortcuts** (`type = shortcut`, `shortcutTargetId`): Resolving the target and cycle avoidance are handled in commands; UI should open the target.
5. **Owner field on items**: `createdBy` is the creating user; search index `ownerId` in `search_documents` is updated with renames/record rules in `recordSearch`.

## Non-goals

- Google Drive API protocol compatibility.
- In-browser PPTX/DOCX/XLSX **rendering**; those files open via **hofOS + office-ai** (see `prompt.md`).

## Shared drives

- **List** shared drives: `GET /api/shared-drives` (drives with `kind = shared` in tenant).
- **Open** a shared drive: navigate to its `rootFolderId` with `/drive/f/:id`.
- **Move** between personal and shared drive is subject to the same command policies as in `command-dispatch`.

## References

- Commands: [`packages/server/src/services/command-dispatch.ts`](../packages/server/src/services/command-dispatch.ts)
- Views: [`packages/server/src/services/view-queries.ts`](../packages/server/src/services/view-queries.ts)
