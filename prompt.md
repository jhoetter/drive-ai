# Build an AI-Native Drive Product

## Mission

You are a senior software architect and engineer. You will autonomously analyze, specify, and then build `drive-ai`: a browser-accessible, CLI-first, AI-native file collaboration product that gets very close to the practical product surface of Google Drive while remaining a clean-room implementation.

`drive-ai` is a standalone sister product for hofOS. It must work by itself during development, but it is designed from day one to be mounted later inside hofOS in the same native-UI sister-product pattern as `mail-ai` and `collaboration-ai`.

This is not a thin S3 browser. It is the product layer on top of durable object storage:

- files and folders
- personal and shared drives
- shortcuts
- recent/starred/favorites
- rich metadata
- search
- sharing and permissions
- comments and activity
- previews and Office-AI editing where feasible
- agent-readable APIs
- command-line workflows first
- web UI second

The existing hofOS `Dateien` / Assets implementation is the starting context, not something to rip out. hofOS owns storage/security/editor primitives. `drive-ai` owns the richer Google-Drive-like application layer.

Do not start coding immediately. Work in this exact sequence:

1. Study hofOS sister-product integration and current Assets behavior.
2. Study Google Drive public API/product behavior and open-source file collaboration systems.
3. Write clean-room analysis notes.
4. Write complete specifications.
5. Only then build phase by phase.

Ask no clarifying questions. Begin with analysis.

---

## Non-Negotiable hofOS Integration Boundary

Read these hofOS docs before writing any implementation:

- `hof-os/docs/sister-products.md`
- `hof-os/docs/sister-app-integration.md`
- `hof-os/docs/sister-product-playbook.md`
- `hof-os/docs/officeai-integration.md`
- `hof-os/infra/sister-ui-contract.json`

The target integration shape is Approach C:

```text
Browser
  -> hofOS data-app shell
  -> native hof-components module
  -> same-origin /api/drive/*
  -> hofOS proxy verifies hof_token
  -> proxy mints short-lived sidecar JWT
  -> drive-ai sidecar backend
```

Rules:

- The browser only knows `hof_token`.
- The sidecar never receives `hof_token`; it receives a short-lived JWT signed with `HOF_SUBAPP_JWT_SECRET`.
- Browser traffic must be same-origin under `/api/drive/*`.
- WebSocket traffic must go through the hofOS proxy, with `hof_token` accepted only at the host boundary and stripped before forwarding.
- Host URLs are product state. Refresh must restore the visible Drive state.
- The hofOS shell owns the outer sidebar and page header.
- The shipped hofOS UI will later live in `packages/hof-components/modules/driveai/`.
- The sibling repo UI is a standalone dev harness and hofOS-mode source export, not the final hofOS source of truth.
- `drive-ai` must eventually provide:
  - `pnpm run hofos:check`
  - `pnpm run hofos:harness`
  - `pnpm run export:hofos-ui`
- The hofOS import path must preserve bridge files and only import runtime UI.

Planned hofOS routes:

```text
/drive
/drive/my-drive
/drive/shared-with-me
/drive/shared-drives
/drive/recent
/drive/starred
/drive/trash
/drive/f/<folderId>
/drive/file/<fileId>
/drive/search?q=...
```

Use URL query params for optional pane state:

```text
/drive/f/<folderId>?preview=<fileId>
/drive/file/<fileId>?comment=<commentId>
/drive/search?q=angebot&type=pdf&owner=me
```

---

## What Stays In hofOS

Do not extract or duplicate these hofOS platform primitives:

- tenant S3 prefix validation and write/read policy
- the base `/assets` file browser
- `/edit-asset?key=...&from=...`
- asset versions and restore semantics
- the `workspace_object` index
- presigned upload/download/overwrite functions
- Office-AI editor mounting through the data-app Vite graph
- auth, sidecar JWT minting, and proxy trust boundary
- low-level host capabilities such as:
  - `openAsset`
  - attachment preview
  - creating assets from bytes
  - classifying Office-compatible file types

`drive-ai` may maintain its own product metadata and permissions, but it must not become the owner of hofOS' S3 security boundary.

When running standalone, `drive-ai` may provide mock or local equivalents of these capabilities so the product can be developed independently. When running inside hofOS, it must use typed host capabilities instead.

---

## What Belongs In drive-ai

`drive-ai` owns the application layer:

- Drive item model: file, folder, shortcut, external reference, generated artifact.
- Spaces: My Drive, Shared with me, Shared drives, Recent, Starred, Trash.
- Folder navigation, breadcrumbs, move/copy/rename/delete/restore.
- Product-level sharing, ACLs, links, access requests, and capabilities.
- Metadata: MIME, size, checksum, extension, labels, custom properties, extracted metadata.
- User-specific state: starred, viewed time, hidden, pinned, sort preferences.
- Search: full text, metadata filters, owner, type, modified date, labels, natural-language search.
- Preview: images, PDFs, Office documents, text, code, markdown, audio/video metadata where feasible.
- Office-AI integration through host/editor capability, not a second editor runtime.
- Comments, replies, mentions, review threads, approval requests.
- Activity stream: upload, edit, rename, move, share, comment, restore, delete.
- Agent API and CLI for every core operation.
- MCP server so AI tools can use `drive-ai` as a tool.
- Cmd+K command model and slash-command hooks.
- i18n from the first UI phase, at least English and German.

---

## Clean-Room Constraint

You may study public repositories, specifications, API docs, UX patterns, and architecture docs to extract concepts. You must then implement from a specification you write yourself.

Allowed:

- Study public behavior and APIs.
- Study public architecture at the conceptual level.
- Use MIT, Apache 2.0, BSD, ISC, or similarly permissive runtime dependencies.
- Use standards and public API documentation as behavioral references.
- Use S3-compatible object stores via permissive SDKs.

Not allowed:

- Copy code from Google, Nextcloud, ownCloud, Seafile, Pydio, Filestash, or any other reference implementation.
- Lightly rename identifiers or port implementation details from reference code.
- Use AGPL/GPL code as a runtime dependency unless explicitly approved later.
- Import a reference product as a package.
- Reuse Google Drive branding, icons, proprietary visual assets, or exact text.

License posture:

- Google Drive API docs: study behavior only.
- Nextcloud server: AGPL, study only.
- ownCloud: verify per component, study only by default.
- Seafile Community: GPL-family, study only by default.
- Pydio Cells: AGPL-family, study only by default.
- Filestash: verify current license, study only by default.
- Rclone: MIT, acceptable as a conceptual reference and possible CLI/storage reference if justified.

Every analysis note must separate "observed behavior" from "our design decision".

---

## Reference Products And Specifications

Study these before speccing:

### Canonical Behavior

- Google Drive public product behavior.
- Google Drive API v3:
  - `files`
  - `permissions`
  - `drives`
  - `changes`
  - `comments`
  - `replies`
  - `revisions`
  - `accessproposals`
  - `labels`
- Google Picker and Drive file-open flows, conceptually only.

Important Drive concepts to model independently:

- files are metadata resources with opaque IDs
- folders are metadata resources
- shortcuts are metadata-only items pointing at a target
- My Drive and Shared drives are different ownership domains
- Shared with me is a view, not a folder
- capabilities are computed per current user and drive UI should render from capabilities
- permissions may be user, group, domain, or anyone-with-link
- roles include owner/organizer/fileOrganizer/writer/commenter/reader equivalents
- revisions track content history
- changes feed enables sync and incremental indexing
- comments and replies are file-scoped collaboration objects
- labels and custom metadata are first-class search/filter inputs

### Open-Source File Collaboration References

Study, but do not copy:

- Nextcloud Files: WebDAV, file browser, sharing, comments, versions, office integration.
- ownCloud: enterprise file sync/share architecture and WebDAV conventions.
- Seafile: library-based storage, efficient sync, custom file properties.
- Pydio Cells: enterprise ACL and workspace concepts.
- Filestash: multi-backend file manager and S3/browser UX patterns.
- Rclone: storage backend abstraction and CLI ergonomics.
- MinIO/S3 docs: object storage behavior, versioning, presigned URLs, multipart upload.
- TUS resumable upload protocol: resumable upload behavior, if a permissive implementation is chosen.

### hofOS References

Study these local files and docs:

- `hof-os/docs/sister-products.md`
- `hof-os/docs/sister-app-integration.md`
- `hof-os/docs/sister-product-playbook.md`
- `hof-os/docs/officeai-integration.md`
- `hof-os/docs/office-ai.md`
- `hof-os/infra/sister-ui-contract.json`
- `hof-os/packages/hof-components/data-app/ui/lib/sister-product-host-capabilities.tsx`
- `hof-os/packages/hof-components/data-app/domain/shared/s3_prefixes.py`
- `hof-os/packages/hof-components/data-app/functions/workspace_assets.py`
- `hof-os/packages/hof-components/data-app/functions/workspace_object_index.py`
- `hof-os/packages/hof-components/data-app/functions/asset_versions.py`
- `hof-os/packages/hof-components/data-app/functions/unstructured_ingest.py`
- `hof-os/packages/hof-components/data-app/ui/pages/edit-asset.tsx`
- `hof-os/packages/hof-components/data-app/ui/components/SisterAppAttachmentLightbox.tsx`
- `hof-os/packages/hof-components/data-app/ui/components/EditAssetEditorMount.tsx`
- `hof-os/packages/hof-components/data-app/ui/components/CreateNewAssetMenu.tsx`
- `hof-os/packages/hof-components/data-app/ui/components/AssetVersionsDrawer.tsx`

---

## Product Quality Bar

### Drive-Like Fidelity

The product must feel close to Google Drive in daily use:

- fast folder browsing
- grid and list views
- breadcrumbs
- selection and bulk actions
- drag and drop uploads
- folder drag and drop
- rename, move, copy, duplicate, download, delete, restore
- quick preview
- right-side details/activity panel
- share dialog with roles
- "Shared with me"
- "Recent"
- "Starred"
- "Trash"
- shortcuts
- comments
- file version history
- search chips and filters
- keyboard shortcuts
- Cmd+K command palette
- slash commands in supported text inputs

Do not implement cosmetic mimicry. Implement the underlying behavior with the local design system.

### Headless First

Every operation must exist in the typed command/API layer before UI uses it.

The CLI is not a wrapper around UI behavior. The UI is a client of the same command/API layer.

### Agent First

AI agents must be able to:

- list drives, folders, and files
- search by content and metadata
- read comments/activity
- upload generated files
- create folders
- move/copy/rename items
- request access
- propose sharing changes
- create summaries
- attach files to cross-product workflows
- open or edit Office-compatible files through Office-AI where feasible

Agent writes must be attributable, auditable, scoped, and rate-limited.

### Office-AI Runtime Constraint

In hofOS mode, supported file previews and edits must use the shared Office-AI editor mount:

```text
drive-ai file row or preview
  -> host capability
  -> same-origin file bytes or object key
  -> EditAssetEditorMount
  -> @officeai/react-editors
```

Do not ship a second `@officeai/react-editors` runtime inside the sister product. Do not iframe the editor. Do not duplicate Yjs or PDF.js runtimes in hofOS mode.

Standalone mode may use a mock editor host or a local harness, but the product must be architected so the hofOS host capability replaces it cleanly.

### Design System

Use the feasible hofOS design-system approach:

- clean, neutral, Notion-like surfaces
- token-based colors only
- no hardcoded hex values in runtime UI
- light/dark mode through CSS variables
- compact but readable tables and lists
- accessible focus states
- keyboard-first interactions
- responsive layout without duplicating hofOS global chrome

The Drive UI must look native inside hofOS, not like an embedded foreign app.

### i18n From Day One

All user-facing strings must go through i18n.

Initial locales:

- `en`
- `de`

German labels should be natural for hofOS users:

- Drive: `Dateien` or `Drive` depending on final product naming
- My Drive: `Meine Dateien`
- Shared with me: `Mit mir geteilt`
- Shared drives: `Geteilte Ablagen`
- Recent: `Zuletzt`
- Starred: `Markiert`
- Trash: `Papierkorb`
- Share: `Teilen`
- Version history: `Versionsverlauf`

Do not hardcode English strings in components.

---

## Architecture Principles

1. Metadata is not object storage. S3 stores bytes; `drive-ai` stores product metadata, relationships, permissions, comments, activity, and search state.
2. The command bus is the only mutation path. Human UI, CLI, agents, and background jobs all call commands.
3. Changes are durable and replayable enough for sync, audit, and activity. Use an append-only activity/change log even if the whole product is not fully event-sourced.
4. Capabilities drive UI state. Compute per-user booleans such as `canView`, `canComment`, `canEdit`, `canShare`, `canMove`, `canTrash`, `canReadRevisions`.
5. Host capabilities are explicit. Standalone mode uses mocks/adapters; hofOS mode uses the data-app boundary.
6. Clean dependency graph. Core/domain packages must not import React or browser APIs.
7. CLI before UI. Every phase must validate through CLI/API tests before browser implementation.
8. Same-origin in hofOS. No browser direct-to-sidecar auth. No standalone API paths leaking into the hofOS module.
9. URLs are state. Folder, file, preview, search, and panel state must survive refresh.
10. Fail loudly. Permission denials, stale sync cursors, upload conflicts, and unsupported previews return structured errors.

---

## Proposed Monorepo Structure

Create this repo structure only when implementation begins:

```text
/
  packages/
    core/                 # shared types, ids, zod schemas, command contracts
    storage/              # S3 adapter, local dev object store, upload sessions
    metadata/             # drives, items, folders, shortcuts, labels, revisions
    permissions/          # ACLs, roles, inheritance, capabilities
    activity/             # append-only change/activity log
    search/               # indexing, metadata filters, extracted text hooks
    comments/             # comments, replies, mentions, resolve/reopen
    agent/                # headless SDK, MCP server, agent command helpers
    cli/                  # drive-ai CLI
    server/               # HTTP/WebSocket server composition
    web/                  # standalone dev harness
    ui/                   # reusable runtime UI for export
    hofos-harness/         # hofOS-mode harness and export tooling
  spec/
    shared/
    phase-0-hofos-boundary/
    phase-1-metadata-storage/
    phase-2-permissions-sharing/
    phase-3-sync-activity-search/
    phase-4-cli-agent-mcp/
    phase-5-web-ui/
    phase-6-hofos-integration/
  fixtures/
    drives/
    objects/
    permissions/
    search/
  tests/
    integration/
    cli/
    permissions/
    hofos-contract/
  infra/
    docker/
  docs/
    build-log/
```

Use TypeScript for product core, CLI, server, and UI unless a later spec justifies otherwise. Favor Postgres for metadata and S3-compatible object storage for bytes. Redis is acceptable for ephemeral locks, queues, and realtime fan-out if justified. Do not add dependencies until their licenses and role are documented.

---

## Phase Structure

Repeat for every phase:

### Step A: Analyze

Write analysis notes in `spec/<phase>/analysis.md`.

Answer:

1. What is the canonical behavior in Google Drive?
2. What do open-source products do similarly or differently?
3. What does hofOS already provide?
4. What belongs in `drive-ai` versus hofOS?
5. What must be CLI/API-first?
6. What must be host-capability-based for later hofOS integration?
7. What are the hard edge cases?
8. What can be deferred without harming the product model?

### Step B: Spec

Write complete specs before code:

- `feature-scope.md`
- `architecture.md`
- `data-model.md`
- `commands.md`
- `api.md`
- `database-schema.md`
- `permissions.md` where relevant
- `sync-and-activity.md` where relevant
- `edge-cases.md`
- `acceptance-criteria.md`

A spec is done only when another engineer could implement from it without guessing.

### Step C: Build

Build in this order:

1. Storage/protocol/database
2. Pure domain logic
3. Command bus
4. HTTP/WebSocket API
5. CLI and agent SDK
6. Web UI
7. hofOS harness/export only in the integration phase

### Step D: Validate

Before moving phases:

- integration tests pass
- CLI tests pass
- permission/capability tests pass
- upload/download tests pass against S3-compatible storage
- no AGPL/GPL runtime dependency has been introduced
- spec and build log are updated
- hofOS contract tests pass once the hofOS phase begins

---

## Phase 0: hofOS Boundary And Clean-Room Analysis

In scope:

- Analyze hofOS sister product docs.
- Analyze current `Dateien` / Assets implementation.
- Decide the explicit boundary between hofOS storage primitives and `drive-ai` product layer.
- Define host capabilities needed by `drive-ai`:
  - open existing asset by object key
  - create asset from bytes
  - preview supported attachment
  - edit Office-compatible asset
  - request presigned upload/download through host in hofOS mode
  - map sidecar file IDs to hofOS object keys where applicable
- Define standalone mock capabilities.
- Define the later `driveai` entry in `sister-ui-contract.json` conceptually.

Out of scope:

- Any implementation.
- Changing hofOS.
- Moving S3 ownership out of hofOS.

Acceptance:

- `spec/phase-0-hofos-boundary/analysis.md`
- `spec/phase-0-hofos-boundary/boundary.md`
- `spec/phase-0-hofos-boundary/host-capabilities.md`
- `spec/phase-0-hofos-boundary/hofos-integration-plan.md`

---

## Phase 1: Metadata, Items, Folders, And Object Storage

In scope:

- Drive item IDs are opaque and stable.
- Items:
  - file
  - folder
  - shortcut
  - external reference
  - generated artifact
- Spaces:
  - My Drive
  - Shared drives
  - Shared with me
  - Recent
  - Starred
  - Trash
- Folders are metadata nodes, not S3 prefixes.
- Files map to object blobs stored in S3-compatible storage.
- S3 keys are implementation details, never the primary product ID.
- Support multipart/resumable upload design, even if v1 implements a simpler upload.
- Track checksums, size, content type, extension, original filename, created/modified times.
- Track user-specific state: starred, viewed time, pinned, hidden.
- Basic versions/revisions model, aligned with S3 object versions where host mode provides them.
- Collision behavior for same-name uploads in a folder.

Out of scope:

- Desktop sync client.
- Offline mode.
- Full-text extraction for every binary format.

CLI minimum:

```bash
drive-ai auth whoami
drive-ai drive list
drive-ai file list --folder root
drive-ai folder create --parent root --name "Angebote"
drive-ai upload ./demo.pdf --parent root
drive-ai download <file-id> --output ./demo.pdf
drive-ai file rename <file-id> "Q2 Angebot.pdf"
drive-ai file move <file-id> --parent <folder-id>
drive-ai file trash <file-id>
drive-ai file restore <file-id>
```

---

## Phase 2: Permissions, Sharing, Access Requests, And Capabilities

In scope:

- Role model inspired by Drive, independently specified:
  - owner
  - organizer
  - fileOrganizer
  - writer
  - commenter
  - reader
- Permission grantees:
  - user
  - group
  - domain
  - anyone-with-link
  - agent
- Shared drive membership and item-level permissions.
- Inheritance from folder/shared drive to children.
- Ability to disable inherited permissions where policy allows.
- Expiring permissions.
- Link sharing with discoverability flag.
- Access requests and approval/deny flow.
- Computed per-user capabilities.
- UI and CLI must render from capabilities, not raw role assumptions.

Out of scope:

- Public internet anonymous editing.
- External federation.
- Complex enterprise DLP rules, except as future extension points.

CLI minimum:

```bash
drive-ai permission list <file-id>
drive-ai permission grant <file-id> --user anna@example.com --role reader
drive-ai permission revoke <file-id> <permission-id>
drive-ai share link create <file-id> --role reader
drive-ai access-request create <file-id> --message "Need this for review"
drive-ai access-request approve <request-id> --role commenter
```

---

## Phase 3: Sync, Activity, Search, Comments, And Labels

In scope:

- Append-only change log for item and permission mutations.
- Activity stream:
  - created
  - uploaded
  - renamed
  - moved
  - copied
  - shared
  - permission changed
  - commented
  - edited
  - restored
  - trashed
  - permanently deleted
- Incremental changes API with cursor.
- WebSocket event stream for live UI.
- Search:
  - name
  - MIME/type
  - owner
  - modified date
  - shared state
  - labels
  - custom properties
  - extracted text where available
- Comments and replies:
  - file-scoped
  - anchored comments where preview supports it
  - mentions
  - resolve/reopen
- Labels and custom metadata.

Out of scope:

- Google-compatible API protocol.
- Full OCR for scans unless a later spec adds it.
- Cross-tenant search.

CLI minimum:

```bash
drive-ai changes list --since <cursor>
drive-ai activity list <file-id>
drive-ai search "angebot" --type pdf --modified-after 2026-01-01
drive-ai comment create <file-id> --text "Bitte pruefen"
drive-ai comment reply <comment-id> --text "Erledigt"
drive-ai label set <file-id> --label status=review
```

---

## Phase 4: CLI, Agent SDK, MCP, And Slash Commands

This phase may begin earlier for CLI scaffolding, but the complete agent surface depends on earlier domain specs.

In scope:

- `drive-ai` CLI is the primary product control surface.
- JSON output by default.
- Human-friendly table/markdown output as opt-in.
- Structured stderr errors.
- Exit codes:
  - 0 success
  - 1 user error
  - 2 auth error
  - 3 network error
  - 4 conflict
  - 5 permission denied
  - 6 rate limited
- Headless TypeScript SDK.
- MCP server over stdio and HTTP.
- Agent tokens with scoped capabilities.
- Staged/proposed mutations for sensitive actions:
  - share externally
  - delete permanently
  - bulk permission changes
  - agent-generated file publication
- Slash-command command catalog for later UI use:
  - `/upload`
  - `/new doc`
  - `/new sheet`
  - `/new slides`
  - `/share`
  - `/move`
  - `/summarize`
  - `/find`
  - `/attach`
  - `/request access`

MCP tools minimum:

- `list_files`
- `get_file`
- `search_files`
- `upload_file`
- `download_file`
- `create_folder`
- `move_file`
- `share_file`
- `list_comments`
- `create_comment`
- `list_activity`
- `propose_share_change`
- `open_in_office_ai` where host capability exists

---

## Phase 5: Web UI

In scope:

- Standalone dev harness first.
- Design-system-compatible UI.
- List and grid views.
- Folder tree and breadcrumbs.
- Quick preview panel.
- Right-side details/activity/comments panel.
- Drag and drop upload.
- Multi-select and bulk action toolbar.
- Share dialog.
- Access request dialog.
- Version history drawer.
- Search page with filters.
- Recent, Starred, Shared with me, Trash.
- Cmd+K command palette.
- Keyboard shortcuts.
- Slash commands in relevant inputs.
- i18n English and German.
- Empty states that distinguish:
  - not configured
  - configured but empty
  - no permission
  - search has no results
- Office-compatible files open through the editor capability.

Out of scope:

- Native desktop sync client.
- Native mobile apps.
- Pixel-perfect Google Drive clone.
- Custom themes beyond host design tokens.

Cmd+K minimum:

- go to My Drive
- go to Shared with me
- go to Recent
- go to Starred
- go to Trash
- search files
- upload file
- create folder
- create document/spreadsheet/presentation where Office-AI capability exists
- open selected file
- share selected file
- copy link
- move selected file
- show shortcuts

---

## Phase 6: hofOS Integration

In scope:

- Add `drive-ai` to the sister-product contract conceptually first, then implement.
- Product proxy prefix: `/api/drive`.
- Sidecar env:
  - `DRIVEAI_API_URL`
  - `DRIVEAI_JWT_SECRET` or equivalent verifier for `HOF_SUBAPP_JWT_SECRET`
  - `S3_KEY_PREFIX` if the sidecar writes product-owned objects
- Native module shape:

```text
packages/hof-components/modules/driveai/
  module.json
  README.md
  ui/
    pages/
      drive.tsx
    lib/
      driveApi.ts
      driveWs.ts
      drivePersistentGroup.tsx
      driveHostCapabilities.ts
    original/
    vendor/
```

- Persistent group:

```text
id: drive
paths: ["/drive"]
```

- Host routes:

```text
/drive
/drive/my-drive
/drive/shared-with-me
/drive/shared-drives
/drive/recent
/drive/starred
/drive/trash
/drive/f/:folderId
/drive/file/:fileId
/drive/search
```

- Runtime singleton policy must include:
  - React
  - React DOM
  - React Router
  - TanStack Query
  - Zustand
  - Yjs
  - y-websocket
  - `@officeai/react-editors`
  - PDF.js
  - Lexical or ProseMirror if used
- Validate same-origin API paths.
- Validate URL refresh.
- Validate back/forward.
- Validate Cmd+K entries.
- Validate Office-AI open/edit through host capability.
- Validate German and English strings inside hofOS shell.

Out of scope:

- Removing `/assets`.
- Moving S3 tenant policy from hofOS into `drive-ai`.
- Replacing `/edit-asset`.
- Importing a second Office-AI editor bundle.

---

## Initial Command Catalog

Every mutation goes through the command bus:

```text
drive:create-shared-drive
drive:update-shared-drive
drive:archive-shared-drive

folder:create
folder:rename
folder:move
folder:trash
folder:restore

file:init-upload
file:complete-upload
file:create-from-bytes
file:rename
file:move
file:copy
file:trash
file:restore
file:delete-permanently
file:create-shortcut
file:set-starred
file:set-label
file:remove-label
file:update-custom-properties

revision:list
revision:restore
revision:download

permission:grant
permission:update
permission:revoke
permission:create-link
permission:disable-link
permission:set-inheritance

access-request:create
access-request:approve
access-request:deny

comment:create
comment:reply
comment:update
comment:delete
comment:resolve
comment:reopen

agent:propose-command
agent:approve-proposal
agent:reject-proposal
```

Each command must define:

- actor
- source: `human`, `agent`, or `system`
- idempotency key
- required capability
- produced activity events
- sync behavior
- audit payload

---

## Initial API Shape

Do not copy Google Drive's API. Build a first-party API that captures equivalent concepts.

```text
POST   /api/commands
GET    /api/me
GET    /api/drives
GET    /api/items/:id
GET    /api/items/:id/children
GET    /api/items/:id/activity
GET    /api/items/:id/comments
GET    /api/items/:id/permissions
GET    /api/items/:id/revisions
GET    /api/search
GET    /api/changes?since=:cursor
POST   /api/uploads
PATCH  /api/uploads/:id
POST   /api/mcp
WS     /api/events
```

In hofOS mode these are reached through:

```text
/api/drive/api/...
/api/drive/ws/events
```

---

## Fixture Corpus

Before building each phase, create fixtures:

- 3 tenants
- 20 users
- 5 agents
- 2 shared drives
- 5,000 folders
- 50,000 files
- nested folder depth edge cases
- duplicate filenames
- shortcuts across spaces
- shared-with-me files not in My Drive
- permission inheritance overrides
- expiring permissions
- access request pending/approved/denied
- comments with replies and mentions
- revisions for Office files
- image/PDF/Office/text/code files
- German and English filenames
- very long filenames
- reserved path characters
- large object metadata without loading bytes

Fixtures must be synthetic or generated. Do not use private customer data.

---

## Validation Checklist

Before calling the product usable:

- CLI can perform all core workflows with JSON output.
- Web UI uses only API/command capabilities already tested headlessly.
- Same user in two browser sessions sees coherent changes.
- Permissions are enforced server-side and reflected as capabilities.
- Search respects permissions.
- Sharing cannot leak tenant data.
- Agent token cannot exceed its scopes.
- Office files open through host capability in hofOS mode.
- Standalone harness works without hofOS by using mock capabilities.
- hofOS mode uses `/api/drive/*`, never standalone root API paths.
- Refresh restores folder/file/search state.
- Back/forward navigation works.
- Cmd+K only lists valid host actions.
- All user strings are translated in `en` and `de`.
- No AGPL/GPL runtime dependency is present.
- Build log documents every non-trivial deviation from spec.

---

## Final Reminder

`drive-ai` is a sister product, not a storage-core extraction.

Build the Drive-like product layer cleanly in its own repo. Keep hofOS as the owner of the shared S3 tenant policy, base Assets page, Office-AI editor mount, proxy auth boundary, and low-level host capabilities. The result should stand alone during development and later fit into hofOS with the same confidence as `mail-ai` and `collaboration-ai`.
