# drive-ai vs hofOS — explicit ownership boundary

## Principles

1. **Bytes vs metadata**: S3 (or compatible) stores object bytes; `drive-ai` stores **metadata**, relationships, permissions, and references to object storage keys. In integrated mode, **host-owned** object keys may still be canonical for tenant policy; `drive-ai` stores stable **drive-identity** and linkage.
2. **Security of tenant I/O**: hofOS remains the **authority** for what object prefixes exist, presign policy, and workspace indexing. `drive-ai` does not re-implement the whole `workspace_object` or S3 policy layer.
3. **Auth to sidecar**: Only the hofOS proxy may turn `hof_token` into a sidecar JWT. The `drive-ai` process trusts **verified** JWTs from the proxy, not end-user browser cookies, in hofOS deployments.

## Matrix

| Layer | Owner | Notes |
|-------|--------|--------|
| HTTP routes in browser: `/drive/*` | hofOS shell + `driveai` module | Shell owns outer chrome. |
| API prefix `/api/drive/*` | hofOS proxy → drive-ai | Same-origin. |
| Drive item graph, search DB | drive-ai | Postgres in sidecar. |
| Presigned upload to tenant bucket (policy) | hofOS when integrated | Exposed to drive-ai via **host capability** or proxy helper; standalone uses MinIO + relaxed policy. |
| Starred, recent, my drive labels | drive-ai | Per-user and per-item state. |
| `EditAsset` / Office-AI | hofOS | drive-ai calls host. |
| `/assets` file list | hofOS | Unchanged; not replaced. |

## Non-goals for drive-ai

- Owning the tenant **S3 path validator** (see hofOS `s3_prefixes.py`).
- Replacing the base **Dateien/Assets** page.
- Duplicating Yjs, PDF.js, or `@officeai/react-editors` in the **hofOS** Vite graph.

## Standalone dev

| Piece | Standalone | hofOS |
|-------|-------------|--------|
| API server | `drive-ai` Fastify (or similar) on dedicated port (e.g. 3520) | Behind proxy; internal URL from env. |
| Auth | Dev API key or simple dev user in DB | JWT from proxy. |
| Object store | MinIO / local S3 | Host-mediated or product-owned prefix per spec. |
| Open file in Office | Mock modal / download | `openOfficeEditor` / `openAsset`. |
