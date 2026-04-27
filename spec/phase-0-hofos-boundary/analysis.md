# Phase 0 — Analysis: hofOS boundary and Drive-like product

This document separates **observed behavior** (public products, hofOS code) from **our design decisions** for `drive-ai`.

## 1) Canonical Google Drive–like behavior (observed)

- **Opaque IDs**: Files, folders, and shortcuts are identified by server-issued stable IDs, not by storage paths. Paths are a UI/navigation view.
- **Spaces**: "My Drive" is a per-user home; "Shared with me" is a **view** over items not owned by the user; "Shared drives" (team drives) are separate containers with their own membership.
- **Shortcuts**: Items that point to another item by ID; metadata-only.
- **Capabilities are computed**: The UI should enable actions (share, move, download) from **per-user** capability flags, not from copying role names blindly.
- **Revisions / versions**: File content history is tracked; binary bytes live in object storage; metadata references revision records.
- **Permissions**: Grants can target users, groups, link scopes, and domains; roles map to reader/commenter/writer/organizer/owner family concepts.

## 2) Open-source products (conceptual, study-only)

- **Nextcloud / ownCloud / Seafile** (per prompt: AGPL/GPL — study only): WebDAV, sharing, and workspace concepts are widely shared; we do **not** copy code or import their server stacks.
- **Rclone** (MIT): acceptable reference for S3 abstractions and CLI patterns only.

**Design decision**: Implement a **first-party** REST and command model; do not mirror Google Drive's HTTP paths or error codes.

## 3) What hofOS already provides (from docs and `sister-app-integration.md`)

- **Approach C**: Native `hof-components` modules; browser uses only `hof_token`; **data-app proxy** verifies token and mints a **short-lived JWT** for sidecars; sidecars use `HOF_SUBAPP_JWT_SECRET`.
- **Staged Vite path**: UI under `data-app/ui/<module>/` must resolve as a **single graph** to avoid duplicate React/Zustand singletons.
- **Sister product host capabilities** (`sister-product-hostCapabilities.tsx`):
  - `openAsset(objectKey, { from })` → routes to `/edit-asset`
  - `createAssetFromBytes` → real implementation in hofOS shell, not in default stub
  - `openOfficeEditor` / attachment handling for Office-class MIME types
- **Office-AI**: Single `@officeai/react-editors` instance in the data-app; sister products must not ship a second editor bundle.

**Design decision**: In hofOS mode, `drive-ai` opens Office-compatible content **only** through these host capabilities and the same editor mount as `/edit-asset`, never via a private iframe or duplicate Office runtime.

## 4) What belongs in `drive-ai` vs hofOS

| Concern | drive-ai | hofOS |
|--------|----------|--------|
| Drive item model (file/folder/shortcut/artifact), spaces, trash, recent, starred | Yes | No |
| Product database (items, permissions, activity, search index pointers) | Yes | No |
| ACLs, sharing links, access requests, computed capabilities | Yes | No (Drive product layer) |
| Tenant S3 prefix policy, `workspace_object` index, presign policy, base `/assets` browser | No | Yes |
| Proxy auth, JWT mint, `/api/drive` registration | No (config only in hofOS) | Yes |
| Office-AI package install and `EditAssetEditorMount` | No | Yes |
| “Open this drive file in editor” *invocation* from UI | Coordinates via host | Provides mount + routes |

## 5) What must be CLI/API-first

All mutations, queries, and agent operations must be reachable through the **command bus** and **HTTP/CLI** before the web UI depends on ad hoc fetches. The UI is a client of the same API as the CLI and MCP.

## 6) What must be host-capability–based (hofOS integration)

- Resolving a **file’s bytes** in production when they are stored as hofOS **assets** (object keys) for Office or preview: use `openAsset` / `openOfficeEditor` / presigned download URLs supplied by the host.
- **Standalone dev**: provide **mock** implementations (e.g. local MinIO + synthetic keys, or in-memory) so `drive-ai` runs without the full hofOS stack.

## 7) Hard edge cases

- **ID mapping**: `drive-ai` `fileId` is primary in the app layer; when bytes live in the host asset system, maintain an explicit **mapping** from drive file revision/blob → object key, without exposing raw keys in the public API.
- **Double `/api` prefix**: Browser calls same-origin `.../api/drive/...` which forwards to the sidecar; the **exact** join of paths must be specced to avoid `api/api` bugs.
- **WebSocket auth**: Browsers send `hof_token` as **query** on upgrade at the host; host strips and forwards with minted JWT (pattern from sister docs).

## 8) Deferrable without breaking the product model

- Full OCR, desktop sync, mobile apps, and Google-compatible third-party API.

---

*Analysis complete for Phase 0. Implementation details live in the phase-specific `architecture.md` and `api.md` files.*
