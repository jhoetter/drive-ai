import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { createDb } from "@driveai/db";
import { createS3BlobStore, createMemoryBlobStore } from "@driveai/storage";
import { buildHofJwtIdentity } from "./auth/hof-jwt.js";
import { buildApp } from "./app.js";
import { EventHub } from "./realtime/hub.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Monorepo root `.env` — loaded so `pnpm run dev` (without `make`) matches `make dev` env. */
const rootEnvPath = join(__dirname, "../../../.env");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnvPath)) {
  loadDotenv({ path: rootEnvPath });
}

const defaultDatabaseUrl = "postgres://driveai:driveai@127.0.0.1:35432/driveai";
const rawDatabaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production" && (typeof rawDatabaseUrl !== "string" || !rawDatabaseUrl.trim())) {
  console.error("drive-ai: DATABASE_URL is required in production");
  process.exit(1);
}
/** Empty string is not nullish, so we must not use `??` alone here. */
const databaseUrl =
  typeof rawDatabaseUrl === "string" && rawDatabaseUrl.trim().length > 0
    ? rawDatabaseUrl.trim()
    : defaultDatabaseUrl;

const port = Number(process.env.PORT ?? "3520");
const { sql: pg, db } = createDb(databaseUrl);

const userId = (process.env.DRIVEAI_DEV_USER_ID ?? "u_dev").trim();
const tenantId = (process.env.DRIVEAI_DEV_TENANT_ID ?? "t_dev").trim();

const identity = buildHofJwtIdentity({
  expectedAudience: "driveai",
  fallback: {
    userId,
    tenantId,
    email: "dev@drive-ai.local",
    displayName: "Dev User",
  },
});

const useS3 = Boolean(
  process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY,
);
const blob = useS3
  ? createS3BlobStore({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION ?? "us-east-1",
      accessKey: process.env.S3_ACCESS_KEY!,
      secretKey: process.env.S3_SECRET_KEY!,
      bucket: process.env.S3_BUCKET!,
      forcePathStyle: true,
    })
  : createMemoryBlobStore();

const events = new EventHub();

try {
  await pg`select 1 as ping`;
} catch (err) {
  const hint = [
    "drive-ai: cannot reach PostgreSQL.",
    "  URL (redacted userinfo): " + redactPostgresForLog(databaseUrl),
    "  Local dev: ensure Docker is up, then from repo root run:",
    "    docker compose -f infra/docker/docker-compose.dev.yml up -d",
    "  or: make stack-up",
    "  (Postgres is published on host port 35432; see .env.example / Makefile.)",
  ].join("\n");
  console.error(hint);
  console.error(err);
  process.exit(1);
}

console.log("drive-ai: database ok (" + redactPostgresForLog(databaseUrl) + ")");

const app = await buildApp({ db, closeDb: () => pg.end({ timeout: 5 }), identity, blob, events });

app.listen({ port, host: "0.0.0.0" });
console.log(`drive-ai sidecar at http://127.0.0.1:${port} (dev identity ${userId}/${tenantId})`);

function redactPostgresForLog(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return "(invalid DATABASE_URL)";
  }
}
