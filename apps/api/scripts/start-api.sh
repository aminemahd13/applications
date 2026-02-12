#!/bin/sh
set -eu

SCHEMA_PATH="packages/db/prisma/schema.prisma"
BASELINE_MIGRATION="20260205173053_add_expires_at_to_files"
MAX_ATTEMPTS="${PRISMA_MIGRATE_MAX_ATTEMPTS:-30}"
RETRY_DELAY_SECONDS="${PRISMA_MIGRATE_RETRY_DELAY_SECONDS:-5}"

log() {
  echo "[prisma-bootstrap] $*"
}

legacy_schema_detected() {
  # Legacy DBs were initialized via infra/dbmate SQL and include schema_migrations.
  cat <<'SQL' | ./node_modules/.bin/prisma db execute --schema "$SCHEMA_PATH" --stdin >/tmp/prisma-legacy-check.log 2>&1
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'schema_migrations table missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations) THEN
    RAISE EXCEPTION 'schema_migrations has no legacy rows';
  END IF;

  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.events') IS NULL
     OR to_regclass('public.file_objects') IS NULL THEN
    RAISE EXCEPTION 'core app tables missing';
  END IF;
END $$;
SQL
}

baseline_legacy_migration_if_needed() {
  if legacy_schema_detected; then
    log "Detected legacy SQL schema. Resolving Prisma baseline migration $BASELINE_MIGRATION as applied."
    ./node_modules/.bin/prisma migrate resolve \
      --applied "$BASELINE_MIGRATION" \
      --schema "$SCHEMA_PATH" >/tmp/prisma-resolve.log 2>&1 || true
    cat /tmp/prisma-resolve.log
  fi
  return 0
}

# Pre-check once so legacy databases are usually fixed before first deploy attempt.
baseline_legacy_migration_if_needed

attempt=0
while true; do
  migrate_log="/tmp/prisma-migrate.log"
  if ./node_modules/.bin/prisma migrate deploy --schema "$SCHEMA_PATH" >"$migrate_log" 2>&1; then
    cat "$migrate_log"
    break
  fi

  cat "$migrate_log"

  if grep -q "$BASELINE_MIGRATION" "$migrate_log"; then
    baseline_legacy_migration_if_needed
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    log "Prisma migrate failed after $MAX_ATTEMPTS attempts."
    exit 1
  fi

  log "Prisma migrate failed, retrying in ${RETRY_DELAY_SECONDS}s ($attempt/$MAX_ATTEMPTS)."
  sleep "$RETRY_DELAY_SECONDS"
done

exec node apps/api/dist/main
