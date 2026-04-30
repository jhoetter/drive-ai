#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRET="${HOF_SUBAPP_JWT_SECRET:-dev-only-not-for-prod-9c2f}"
PORT="${DRIVEAI_SMOKE_PORT:-18520}"
PROJECT="driveai-smoke-$RANDOM"
COMPOSE_FILE="$(mktemp -t driveai-smoke-compose.XXXXXX.yml)"
COOKIE_JAR="$(mktemp -t driveai-smoke-cookies.XXXXXX)"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color driveai || true
  fi
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$COMPOSE_FILE" "$COOKIE_JAR"
  exit "$status"
}
trap cleanup EXIT

cat >"$COMPOSE_FILE" <<EOF
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hofos
      POSTGRES_PASSWORD: hofos
      POSTGRES_DB: driveai
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hofos -d driveai"]
      interval: 2s
      timeout: 2s
      retries: 20

  driveai:
    build:
      context: "$ROOT_DIR"
      dockerfile: Dockerfile.subapp
    ports:
      - "$PORT:3520"
    environment:
      DATABASE_URL: postgresql://hofos:hofos@postgres:5432/driveai
      HOF_SUBAPP_JWT_SECRET: "$SECRET"
      HOF_SUBAPP_NAME: driveai
      HOF_ENV: dev
      NODE_ENV: production
      PORT: 3520
    depends_on:
      postgres:
        condition: service_healthy
EOF

mint_jwt() {
  node - "$SECRET" <<'JS'
const crypto = require("node:crypto");
const secret = process.argv[2];
function b64url(value) {
  const input = typeof value === "string" ? Buffer.from(value) : value;
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64url(JSON.stringify({
  aud: "driveai",
  sub: "smoke-user",
  tid: "smoke-tenant",
  email: "smoke@example.test",
  displayName: "Smoke User",
  exp: Math.floor(Date.now() / 1000) + 120,
}));
const sig = b64url(crypto.createHmac("sha256", Buffer.from(secret)).update(`${header}.${payload}`).digest());
console.log(`${header}.${payload}.${sig}`);
JS
}

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --build

echo "Waiting for DriveAI on :$PORT..."
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://localhost:$PORT/api/health" >/dev/null

TOKEN="$(mint_jwt)"
curl -fsS -D - -o /dev/null -c "$COOKIE_JAR" \
  "http://localhost:$PORT/?__hof_jwt=$TOKEN" | grep -qi "set-cookie: hof_subapp_session="

curl -fsS -b "$COOKIE_JAR" "http://localhost:$PORT/" | grep -qi "<html"
curl -fsS -b "$COOKIE_JAR" "http://localhost:$PORT/api/drives" | grep -q '"drives"'

echo "DriveAI smoke passed: /api/health, /, SSO handoff, /api/drives"
