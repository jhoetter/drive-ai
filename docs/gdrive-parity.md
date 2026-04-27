# Behavior vs Google Drive (product notes)

This document summarizes what drive-ai approximates from common Google Drive UX and what is out of scope for this codebase.

## Uploads

- **Single and multi-file upload** to the current folder, with **visible errors** (no silent failures) and **cleanup** if blob storage (`PUT`) fails after the server created a placeholder file (`/api/uploads/abandon`).
- **Folder upload** (Chromium/WebKit): **Upload folder** uses `webkitdirectory` and `folder:ensurePath` so **relative paths** create nested folders, similar to Drive’s “folder upload” behavior. Dragging a whole folder from the OS may still be browser-dependent; prefer **Upload folder** for reliable tree uploads.
- **Search indexing**: A **name-level** `search_documents` row is created at `initUpload`, so name search can find new files before extraction finishes; **content** search updates after `completeUpload` and async extraction, like Drive’s slower body indexing.

## Search

- **Query + filters** via URL parameters (`/api/search`, `docs/search-spec.md`), chips for type/owner/trash, optional **`folderId` scoping** (folder + descendants), and a **“Search this folder”** control from the header when you are inside a folder.
- **Result rows** include a **location line** (breadcrumb without the file name) for context.
- **Live-ish search**: the header field **debounces** updates to the search route + query; Enter still works for an immediate run.

## Not in scope (vs full Google Drive)

- Natural-language or operator-parsing in the search box (e.g. `type:pdf owner:me` as free text). Use chips and query parameters instead.
- OCR for images, offline sync, or Google’s native client protocols.
- Enterprise features (shared drives policies, DLP, Vault, etc.).

See also [search-spec.md](./search-spec.md) for API details and v1 out-of-scope items. For embedding in hof-os (or any host), see [theming.md](./theming.md).
