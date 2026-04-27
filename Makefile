# drive-ai — local development
# Coexists with other sister repos; ports (see README):
#   3500  Vite dev UI (strict)
#   3520  API sidecar
#   35432 Postgres (docker)
#   39000/39001 MinIO (docker)
# ----------------------------------------------------------------------

-include .env
export

PNPM         ?= pnpm
COMPOSE      ?= docker compose -f infra/docker/docker-compose.dev.yml
DATABASE_URL ?= postgres://driveai:driveai@127.0.0.1:35432/driveai
# Vite: apps/web (3500, strict). Override with WEB_PORT= / API_PORT= / PORT=.
WEB_PORT  ?= 3500
API_PORT  ?= 3520
# Presigned in-memory upload URLs in dev (must match API port)
DRIVEAI_PUBLIC_API_URL ?= http://127.0.0.1:$(API_PORT)
PORT         ?= $(API_PORT)

.PHONY: help install stack-up stack-down dev db-push dev-app kill-ports wait-pg dev-wait

help:
	@echo "drive-ai (same idea as mail-ai / collaboration-ai: one terminal, full stack)"
	@echo "  make install    pnpm install"
	@echo "  make stack-up   docker compose: Postgres + MinIO"
	@echo "  make stack-down stop compose stack"
	@echo "  make db-push    apply Drizzle schema (needs Postgres)"
	@echo "  make dev        stack-up, db-push, kill-ports, then API :$(PORT) + web :$(WEB_PORT) (concurrently)"
	@echo "  make dev-app    only pnpm run dev (DB up + schema already applied)"
	@echo "  make dev-wait   poll API + web until healthy (use after \`dev-app\` in a second terminal)"
	@echo "  make kill-ports free :$(WEB_PORT) and :$(PORT) (retries; also pkill stray vite/turbo in this repo)"
	@echo "  make wait-pg   wait until Postgres is reachable (optional)"

install:
	$(PNPM) install

stack-up:
	$(COMPOSE) up -d --remove-orphans
	@echo "Postgres: $(DATABASE_URL)"
	@$(MAKE) wait-pg

# Block until the host can connect to mapped Postgres (avoids dev server + UI racing a slow/stopped container).
wait-pg:
	@i=0; while [ $$i -lt 60 ]; do \
		nc -z 127.0.0.1 35432 2>/dev/null && exit 0; \
		i=$$((i+1)); echo "Waiting for Postgres on 127.0.0.1:35432 ($$i/60)…"; sleep 1; \
	done; \
	echo "Postgres is not accepting connections on 127.0.0.1:35432. Is Docker Desktop running? Try: $(COMPOSE) ps"; \
	exit 1

stack-down:
	$(COMPOSE) down

db-push:
	@DATABASE_URL=$(DATABASE_URL) $(PNPM) run db:push

# Full local stack: mirrors collaboration-ai (kill-ports, then concurrently → one interleaved log stream).
dev: stack-up db-push kill-ports
	@echo ""
	@echo "  → API   http://127.0.0.1:$(PORT)   (GET /api/health)"
	@echo "  → Web   http://localhost:$(WEB_PORT)/drive"
	@echo ""
	@DATABASE_URL=$(DATABASE_URL) DRIVEAI_PUBLIC_API_URL=$(DRIVEAI_PUBLIC_API_URL) PORT=$(PORT) \
		$(PNPM) run dev

# When Docker is already running and schema is current.
dev-app: kill-ports
	@DATABASE_URL=$(DATABASE_URL) DRIVEAI_PUBLIC_API_URL=$(DRIVEAI_PUBLIC_API_URL) PORT=$(PORT) \
		$(PNPM) run dev

# Optional health gate (e.g. after starting dev-app manually). Fails with exit 1 if not ready in 60s.
dev-wait:
	@deadline=$$(($$(date +%s) + 60)); \
	api=0; web=0; \
	while [ "$$(date +%s)" -lt "$$deadline" ]; do \
	  if [ "$$api" = 0 ] && curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:$(PORT)/api/health" 2>/dev/null; then \
	    api=1; echo "  ✓ api  :$(PORT)/api/health"; \
	  fi; \
	  if [ "$$web" = 0 ] && curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:$(WEB_PORT)/" 2>/dev/null; then \
	    web=1; echo "  ✓ web  :$(WEB_PORT)/"; \
	  fi; \
	  if [ "$$api" = 1 ] && [ "$$web" = 1 ]; then echo ""; exit 0; fi; \
	  sleep 0.5; \
	done; \
	echo "dev-wait: timeout (api=$$api web=$$web)" >&2; \
	exit 1

# Frees our ports; matches mail-ai / collaboration-ai so re-running `make dev` is reliable
# (tsx/vite can leave the port held after the parent process dies).
kill-ports:
	@PORTS="$(WEB_PORT) $(PORT)"; \
	WS_TAG="$(CURDIR)"; \
	for _ in 1 2 3 4 5 6; do \
	  for p in $$PORTS; do \
	    pids=$$(lsof -ti :$$p 2>/dev/null); \
	    [ -n "$$pids" ] && kill -9 $$pids 2>/dev/null || true; \
	  done; \
	  pkill -9 -f "vite.*$$WS_TAG"          2>/dev/null || true; \
	  pkill -9 -f "tsx.*$$WS_TAG"          2>/dev/null || true; \
	  pkill -9 -f "turbo run dev"         2>/dev/null || true; \
	  pkill -9 -f "concurrently.*$$WS_TAG" 2>/dev/null || true; \
	  busy=""; \
	  for p in $$PORTS; do \
	    lsof -ti :$$p >/dev/null 2>&1 && busy="$$busy $$p"; \
	  done; \
	  [ -z "$$busy" ] && exit 0; \
	  sleep 0.5; \
	done; \
	echo "kill-ports: still in use after retries:$$busy" >&2; \
	exit 1
