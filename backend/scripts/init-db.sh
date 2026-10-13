#!/usr/bin/env bash
# init-db.sh — apply db/migrations/*.sql in lexical order, idempotently.
# Spec: docs/SPEC-schema.md · Plan: docs/plans/plan.md (Task 3)
#
# Primary path: psql inside the Compose container (this host has no psql).
# Fallback: if `docker` is unavailable but host psql exists, use
#   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>
set -euo pipefail

cd "$(dirname "$0")/.."

PGUSER="${POSTGRES_USER:-postgres}"
PGDB="${POSTGRES_DB:-docupulse}"
COMPOSE_SERVICE="${COMPOSE_SERVICE:-db}"

if docker compose ps --status running "$COMPOSE_SERVICE" 2>/dev/null | grep -q "$COMPOSE_SERVICE"; then
  PSQL=(docker compose exec -T "$COMPOSE_SERVICE" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1)
elif command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  echo "warn: compose service '$COMPOSE_SERVICE' not running; falling back to host psql" >&2
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1)
else
  echo "error: no database available — start it with 'npm run db:up'" >&2
  exit 1
fi

shopt -s nullglob
migrations=(db/migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  echo "error: no migrations found in db/migrations/" >&2
  exit 1
fi

for f in "${migrations[@]}"; do
  echo "applying $f"
  "${PSQL[@]}" < "$f"
done

echo "db:init OK (${#migrations[@]} migrations)"
