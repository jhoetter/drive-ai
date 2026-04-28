# drive-ai

AI-native, Drive-like file collaboration layer and **hofOS** sister product (Approach C). This repo is **standalone** for development: Postgres + (optional) MinIO, Node sidecar, Vite dev harness on **port 3500**, API on **3520** by default (avoids `mail-ai` 3010 / `collaboration-ai` 8010).

## Quick start

**One command** (requires Docker, Node 20+, pnpm):

```sh
cp .env.example .env   # optional
make install
make dev
```

`make dev` brings up Postgres + MinIO, waits until Postgres is reachable on **:35432**, runs `drizzle-kit push`, frees **:3500** and **:3520** (`kill-ports`, same pattern as **mail-ai** / **collaboration-ai**), then runs **api** and **web** in one terminal via **`concurrently`** (blue / magenta prefixes — one interleaved log stream). See [Makefile](Makefile). Open **<http://localhost:3500/drive>** after the banner prints. To use Turbo instead of concurrently: `pnpm run dev:turbo`. Optional: `make dev-wait` polls `/api/health` and the Vite root until both respond (e.g. second terminal after `make dev-app`).

**If the UI is blank or API logs `ECONNREFUSED 127.0.0.1:35432`:** the API could talk to Postgres at first, then **Docker/Postgres stopped** (Desktop paused, machine sleep, container exit). Check `docker ps` and that `docker-postgres-1` is **Up**; if not, `make stack-up` (or `make dev` again) and leave Docker running. A working UI still needs a healthy database on `35432`.

**Smoke tests** (with the same stack running, e.g. `make dev` in another terminal): `PLAYWRIGHT_BASE_URL=http://localhost:3500 pnpm run test:smoke`. Some embedded tools only resolve `http://localhost:3500` (not `127.0.0.1`) for the Vite app.

**Manual steps** (equivalent to `make dev`):

1. `docker compose -f infra/docker/docker-compose.dev.yml up -d` — Postgres on **35432**, MinIO on **39000/39001**
2. `pnpm install`
3. `DATABASE_URL=postgres://driveai:driveai@127.0.0.1:35432/driveai pnpm run db:push`
4. `PORT=3520 DRIVEAI_PUBLIC_API_URL=http://127.0.0.1:3520 pnpm run dev` (server + web via Turbo)

Environment:

- `DRIVEAI_PUBLIC_API_URL=http://127.0.0.1:3520` — presigned PUT URLs for in-memory dev blob store
- `HOF_SUBAPP_JWT_SECRET` — when set, the API **requires** `Authorization: Bearer` on every call. **Leave unset** for the standalone Vite app (`make dev`); otherwise you get **401** and a blank/error UI until you add a dev token or use hofOS’s proxy
- S3: set `S3_*` to use real object storage instead of the in-memory store

## hofOS

- Contract: [hofos-ui.config.json](./hofos-ui.config.json) vs `../hof-os/infra/sister-ui-contract.json` (`products.driveai`).
- Scripts: `pnpm run hofos:check`, `pnpm run hofos:harness`, `pnpm run export:hofos-ui`.
- Browser calls **same-origin** `/api/drive/*`; the data-app proxy mints a short-lived JWT. Never send `hof_token` to the sidecar.
- Native module: `hof-os` → `packages/hof-components/modules/driveai/`.

## Specs

See `spec/phase-0-hofos-boundary/` and follow-on phase docs in `docs/`.

## License

MIT (runtime dependencies: see `docs/dependency-licenses.md`).

## Consumed Via Tarball URL

The hofOS host consumes the built UI package from GitHub Releases rather than copying source trampolines into customer cells. Each release attaches `driveai-ui-<version>.tgz`, installable with:

```json
"@driveai/hofos-ui": "https://github.com/jhoetter/drive-ai/releases/download/v0.1.0/driveai-ui-0.1.0.tgz"
```

For local iteration, run `pnpm run build:dist` or point hofOS' local-dev override at `packages/hofos-ui`.

