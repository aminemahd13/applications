#!/bin/sh
set -eu

SCHEMA_PATH="packages/db/prisma/schema.prisma"
BASELINE_MIGRATION="20260205173053_add_expires_at_to_files"
FOLLOWUP_INDEX_MIGRATION="20260211221500_add_followup_scale_indexes"
LEGACY_SCHEMA_BACKFILL_MIGRATION="20260212191000_backfill_legacy_event_columns"
LEGACY_SCHEMA_BACKFILL_SQL="packages/db/prisma/migrations/${LEGACY_SCHEMA_BACKFILL_MIGRATION}/migration.sql"
MAX_ATTEMPTS="${PRISMA_MIGRATE_MAX_ATTEMPTS:-30}"
RETRY_DELAY_SECONDS="${PRISMA_MIGRATE_RETRY_DELAY_SECONDS:-5}"

log() {
  echo "[prisma-bootstrap] $*"
}

baseline_objects_already_exist() {
  # If these core tables already exist, replaying the big baseline migration
  # will fail with "already exists" style errors and must be resolved.
  cat <<'SQL' | ./node_modules/.bin/prisma db execute --schema "$SCHEMA_PATH" --stdin >/tmp/prisma-legacy-check.log 2>&1
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.events') IS NULL
     OR to_regclass('public.applications') IS NULL
     OR to_regclass('public.workflow_steps') IS NULL
     OR to_regclass('public.file_objects') IS NULL THEN
    RAISE EXCEPTION 'core app tables missing';
  END IF;
END $$;
SQL
}

resolve_failed_baseline_migration() {
  if baseline_objects_already_exist; then
    log "Detected pre-existing baseline tables; resolving $BASELINE_MIGRATION as applied."
    if ./node_modules/.bin/prisma migrate resolve \
      --applied "$BASELINE_MIGRATION" \
      --schema "$SCHEMA_PATH" >/tmp/prisma-resolve.log 2>&1; then
      cat /tmp/prisma-resolve.log
      return 0
    fi

    cat /tmp/prisma-resolve.log
    log "Failed to mark $BASELINE_MIGRATION as applied."
    return 1
  fi

  cat /tmp/prisma-legacy-check.log
  log "Baseline tables are not fully present; attempting to mark failed migration as rolled back."
  if ./node_modules/.bin/prisma migrate resolve \
    --rolled-back "$BASELINE_MIGRATION" \
    --schema "$SCHEMA_PATH" >/tmp/prisma-resolve.log 2>&1; then
    cat /tmp/prisma-resolve.log
    return 0
  fi

  cat /tmp/prisma-resolve.log
  log "Could not resolve failed migration state for $BASELINE_MIGRATION."
  return 1
}

ensure_followup_index_prerequisites() {
  # Some environments have schema additions from historical SQL flow, but missing
  # columns in Prisma migration history. Backfill them so index migration can run.
  cat <<'SQL' | ./node_modules/.bin/prisma db execute --schema "$SCHEMA_PATH" --stdin >/tmp/prisma-followup-prereq.log 2>&1
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    ALTER TABLE "messages"
      ADD COLUMN IF NOT EXISTS "body_text" TEXT,
      ADD COLUMN IF NOT EXISTS "recipient_filter_json" JSONB,
      ADD COLUMN IF NOT EXISTS "resolved_recipient_count" INTEGER,
      ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ(6),
      ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'SENT';
  END IF;

  IF to_regclass('public.message_recipients') IS NOT NULL THEN
    ALTER TABLE "message_recipients"
      ADD COLUMN IF NOT EXISTS "delivery_inbox_status" TEXT DEFAULT 'DELIVERED',
      ADD COLUMN IF NOT EXISTS "email_attempts" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "email_last_attempt_at" TIMESTAMPTZ(6),
      ADD COLUMN IF NOT EXISTS "email_failure_reason" TEXT;
  END IF;
END $$;
SQL
}

resolve_failed_followup_index_migration() {
  log "Repairing prerequisites for $FOLLOWUP_INDEX_MIGRATION."
  if ensure_followup_index_prerequisites; then
    cat /tmp/prisma-followup-prereq.log
  else
    cat /tmp/prisma-followup-prereq.log
    log "Failed to repair prerequisites for $FOLLOWUP_INDEX_MIGRATION."
    return 1
  fi

  log "Marking failed migration $FOLLOWUP_INDEX_MIGRATION as rolled back so deploy can retry."
  if ./node_modules/.bin/prisma migrate resolve \
    --rolled-back "$FOLLOWUP_INDEX_MIGRATION" \
    --schema "$SCHEMA_PATH" >/tmp/prisma-resolve.log 2>&1; then
    cat /tmp/prisma-resolve.log
    return 0
  fi

  cat /tmp/prisma-resolve.log
  log "Could not mark $FOLLOWUP_INDEX_MIGRATION as rolled back."
  return 1
}

ensure_legacy_schema_backfill_prerequisites() {
  # Reconcile drift between legacy SQL migrations and Prisma migration history.
  # This is idempotent and safe to run on every boot.
  if [ ! -f "$LEGACY_SCHEMA_BACKFILL_SQL" ]; then
    log "Legacy schema backfill script not found at $LEGACY_SCHEMA_BACKFILL_SQL; skipping."
    return 0
  fi

  ./node_modules/.bin/prisma db execute \
    --schema "$SCHEMA_PATH" \
    --file "$LEGACY_SCHEMA_BACKFILL_SQL" >/tmp/prisma-legacy-backfill.log 2>&1
}

resolve_failed_legacy_schema_backfill_migration() {
  log "Repairing prerequisites for $LEGACY_SCHEMA_BACKFILL_MIGRATION."
  if ensure_legacy_schema_backfill_prerequisites; then
    if [ -f /tmp/prisma-legacy-backfill.log ]; then
      cat /tmp/prisma-legacy-backfill.log
    fi
  else
    if [ -f /tmp/prisma-legacy-backfill.log ]; then
      cat /tmp/prisma-legacy-backfill.log
    fi
    log "Failed to run compatibility script for $LEGACY_SCHEMA_BACKFILL_MIGRATION."
    return 1
  fi

  log "Marking failed migration $LEGACY_SCHEMA_BACKFILL_MIGRATION as rolled back so deploy can retry."
  if ./node_modules/.bin/prisma migrate resolve \
    --rolled-back "$LEGACY_SCHEMA_BACKFILL_MIGRATION" \
    --schema "$SCHEMA_PATH" >/tmp/prisma-resolve.log 2>&1; then
    cat /tmp/prisma-resolve.log
    return 0
  fi

  cat /tmp/prisma-resolve.log
  log "Could not mark $LEGACY_SCHEMA_BACKFILL_MIGRATION as rolled back."
  return 1
}

extract_failed_migration_from_log() {
  log_file="$1"
  sed -n "s/.*The \`\([A-Za-z0-9_]\+\)\` migration.*/\1/p" "$log_file" | tail -n 1
}

resolve_known_failed_migration() {
  failed_migration="$1"
  case "$failed_migration" in
    "$BASELINE_MIGRATION")
      resolve_failed_baseline_migration
      ;;
    "$FOLLOWUP_INDEX_MIGRATION")
      resolve_failed_followup_index_migration
      ;;
    "$LEGACY_SCHEMA_BACKFILL_MIGRATION")
      resolve_failed_legacy_schema_backfill_migration
      ;;
    *)
      log "No auto-resolution rule for failed migration: $failed_migration"
      return 1
      ;;
  esac
}

# Pre-check once so databases with pre-existing baseline tables are fixed early.
resolve_failed_baseline_migration || true
# Pre-check legacy/prisma schema drift; harmless no-op if already reconciled.
ensure_legacy_schema_backfill_prerequisites || true
# Pre-check messaging prerequisites; harmless no-op if tables do not exist yet.
ensure_followup_index_prerequisites || true

attempt=0
while true; do
  migrate_log="/tmp/prisma-migrate.log"
  if ./node_modules/.bin/prisma migrate deploy --schema "$SCHEMA_PATH" >"$migrate_log" 2>&1; then
    cat "$migrate_log"
    break
  fi

  cat "$migrate_log"

  failed_migration="$(extract_failed_migration_from_log "$migrate_log" || true)"
  if [ -n "$failed_migration" ]; then
    resolve_known_failed_migration "$failed_migration" || true
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
