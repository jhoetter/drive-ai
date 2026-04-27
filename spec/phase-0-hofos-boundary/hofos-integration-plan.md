# hofOS integration plan (Approach C) for drive-ai

## Target flow

```
Browser (hof_token)
  → hofOS data-app shell
  → native module packages/hof-components/modules/driveai/
  → fetch /api/drive/...  (and WS /api/drive/ws/...)
  → subapp proxy verifies hof_token, mints short-lived JWT
  → DRIVEAI_API_URL (e.g. http://localhost:3520) drive-ai sidecar
```

- Sidecar **never** receives `hof_token`.
- WebSocket: token as query on host; stripped at proxy; upstream uses sidecar JWT (same pattern as mail/chat; see `sister-app-integration.md`).

## Contract file

Add a `driveai` entry to [hof-os/infra/sister-ui-contract.json](file:///Users/jhoetter/repos/hof-os/infra/sister-ui-contract.json) (Phase 6), modeled on `mailai` / `collabai` / `pagesai`:

- `module`: `driveai`
- `proxyPrefix`: `/api/drive`
- `hostRoutes` (from product prompt):
  - `/drive`, `/drive/my-drive`, `/drive/shared-with-me`, `/drive/shared-drives`, `/drive/recent`, `/drive/starred`, `/drive/trash`, `/drive/f/:folderId`, `/drive/file/:fileId`, `/drive/search`
- `persistentGroup`: `{ "id": "drive", "paths": ["/drive"] }`
- `export.targetModule`: `packages/hof-components/modules/driveai`
- `export.destinations`: map `drive-ai` `packages/ui` and `apps/web` (or `packages/web`) into `ui/vendor/...` and `ui/original/...` per script.

## Native module layout (in hof-os)

```text
packages/hof-components/modules/driveai/
  module.json
  README.md
  ui/
    pages/drive.tsx
    lib/driveApi.ts
    lib/driveWs.ts
    lib/driveHostCapabilities.ts
    lib/drivePersistentGroup.tsx
    original/   (staged)
    vendor/
```

- `driveApi`: base URL = same-origin, path prefix `api/drive` (strip double `api` when sidecar already mounts at `/api` — **implementation detail** resolved in `packages/server` and mirrored in `driveApi` tests).
- `driveWs`: `new WebSocket` with `hof_token` query only at host; path `/api/drive/ws/events` (or as registered in hofOS `subapp_router`).

## Environment (hofOS / compose)

- `DRIVEAI_API_URL` — upstream for proxy (e.g. `http://driveai:3520` in Docker, `http://localhost:3520` in local dev with port chosen to avoid 3010/8010/3500).
- `HOF_SUBAPP_JWT_SECRET` — shared with drive-ai for JWT verification.

## Sibling repo scripts (must match mail-ai pattern)

- `pnpm run hofos:check` — validate `hofos-ui.config.json` against contract `products.driveai`.
- `pnpm run hofos:harness` — `HOFOS_MODE=1` build of web + smoke.
- `pnpm run export:hofos-ui` — write `release-out/hofos-ui/...` for `import:sister-ui`.

## Proxy code changes (hof-os Phase 6)

- Register `api/drive` and `ws/drive` (or unified pattern) in `subapp_router.py` alongside mail/chat, forwarding to `DRIVEAI_API_URL` with minted JWT.

## Validation checklist (integration)

- [ ] `hofos:check` passes.
- [ ] Page refresh preserves `/drive/...` URL state.
- [ ] No duplicate Office-AI package in Vite graph.
- [ ] German and English via i18n in module.

---

*This plan is implemented in work package WP6 after the `drive-ai` sidecar and UI packages exist.*
