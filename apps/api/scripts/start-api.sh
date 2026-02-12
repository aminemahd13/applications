#!/bin/sh
set -eu

SCHEMA_PATH="packages/db/prisma/schema.prisma"
MAX_ATTEMPTS="${PRISMA_MIGRATE_MAX_ATTEMPTS:-30}"
RETRY_DELAY_SECONDS="${PRISMA_MIGRATE_RETRY_DELAY_SECONDS:-5}"

log() {
  echo "[prisma-bootstrap] $*"
}

attempt=0
while true; do
  migrate_log="/tmp/prisma-migrate.log"
  if ./node_modules/.bin/prisma migrate deploy --schema "$SCHEMA_PATH" >"$migrate_log" 2>&1; then
    cat "$migrate_log"
    break
  fi

  cat "$migrate_log"
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    log "Prisma migrate failed after $MAX_ATTEMPTS attempts."
    exit 1
  fi

  log "Prisma migrate failed, retrying in ${RETRY_DELAY_SECONDS}s ($attempt/$MAX_ATTEMPTS)."
  sleep "$RETRY_DELAY_SECONDS"
done

exec node apps/api/dist/main
