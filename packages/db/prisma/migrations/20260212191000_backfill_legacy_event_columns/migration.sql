-- Backfill schema drift between legacy SQL migrations (infra/migrations)
-- and Prisma migrations, using idempotent DDL so existing environments
-- with partially-applied legacy SQL can converge safely.

-- ============================================================================
-- EVENTS + WORKFLOW DRIFT
-- ============================================================================
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "is_system_site" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "capacity" INTEGER,
  ADD COLUMN IF NOT EXISTS "requires_email_verification" BOOLEAN DEFAULT false;

UPDATE "events"
SET "is_system_site" = false
WHERE "is_system_site" IS NULL;

UPDATE "events"
SET "requires_email_verification" = false
WHERE "requires_email_verification" IS NULL;

ALTER TABLE "events"
  ALTER COLUMN "is_system_site" SET DEFAULT false,
  ALTER COLUMN "is_system_site" SET NOT NULL,
  ALTER COLUMN "requires_email_verification" SET DEFAULT false,
  ALTER COLUMN "requires_email_verification" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "events_is_system_site_idx"
ON "events" ("is_system_site");

ALTER TABLE "workflow_steps"
  ADD COLUMN IF NOT EXISTS "sensitivity_level" TEXT DEFAULT 'NORMAL';

UPDATE "workflow_steps"
SET "sensitivity_level" = 'NORMAL'
WHERE "sensitivity_level" IS NULL;

ALTER TABLE "workflow_steps"
  ALTER COLUMN "sensitivity_level" SET DEFAULT 'NORMAL',
  ALTER COLUMN "sensitivity_level" SET NOT NULL;

-- ============================================================================
-- MESSAGING DRIFT
-- ============================================================================
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "body_text" TEXT,
  ADD COLUMN IF NOT EXISTS "recipient_filter_json" JSONB,
  ADD COLUMN IF NOT EXISTS "resolved_recipient_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'SENT';

ALTER TABLE "message_recipients"
  ADD COLUMN IF NOT EXISTS "delivery_inbox_status" TEXT DEFAULT 'DELIVERED',
  ADD COLUMN IF NOT EXISTS "email_attempts" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "email_last_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "email_failure_reason" TEXT;

CREATE INDEX IF NOT EXISTS "mr_recipient_created_idx"
ON "message_recipients" ("recipient_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "msg_event_created_idx"
ON "messages" ("event_id", "created_at" DESC);

-- ============================================================================
-- FIELD VERIFICATION DRIFT
-- ============================================================================
ALTER TABLE "field_verifications"
  ADD COLUMN IF NOT EXISTS "file_object_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'field_verifications_file_object_id_fkey'
  ) THEN
    ALTER TABLE "field_verifications"
      ADD CONSTRAINT "field_verifications_file_object_id_fkey"
      FOREIGN KEY ("file_object_id")
      REFERENCES "file_objects"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'field_verifications_submission_version_id_field_id_key'
  ) THEN
    ALTER TABLE "field_verifications"
      DROP CONSTRAINT "field_verifications_submission_version_id_field_id_key";
  END IF;
END
$$;

DROP INDEX IF EXISTS "field_verifications_submission_version_id_field_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "field_verifications_uq"
ON "field_verifications" ("submission_version_id", "field_id", "file_object_id");

-- ============================================================================
-- MICROSITES DRIFT
-- ============================================================================
CREATE TABLE IF NOT EXISTS "microsites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "published_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "microsites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "microsite_pages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "microsite_id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "blocks" JSONB NOT NULL DEFAULT '[]',
  "seo" JSONB NOT NULL DEFAULT '{}',
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "microsite_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "microsite_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "microsite_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "settings" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "microsite_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "microsite_page_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "microsite_id" UUID NOT NULL,
  "microsite_version_id" UUID NOT NULL,
  "page_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "blocks" JSONB NOT NULL,
  "seo" JSONB NOT NULL,
  "visibility" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "microsite_page_versions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsites_event_id_fkey'
  ) THEN
    ALTER TABLE "microsites"
      ADD CONSTRAINT "microsites_event_id_fkey"
      FOREIGN KEY ("event_id")
      REFERENCES "events"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_pages_microsite_id_fkey'
  ) THEN
    ALTER TABLE "microsite_pages"
      ADD CONSTRAINT "microsite_pages_microsite_id_fkey"
      FOREIGN KEY ("microsite_id")
      REFERENCES "microsites"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_versions_microsite_id_fkey'
  ) THEN
    ALTER TABLE "microsite_versions"
      ADD CONSTRAINT "microsite_versions_microsite_id_fkey"
      FOREIGN KEY ("microsite_id")
      REFERENCES "microsites"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_versions_created_by_fkey'
  ) THEN
    ALTER TABLE "microsite_versions"
      ADD CONSTRAINT "microsite_versions_created_by_fkey"
      FOREIGN KEY ("created_by")
      REFERENCES "users"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_page_versions_microsite_id_fkey'
  ) THEN
    ALTER TABLE "microsite_page_versions"
      ADD CONSTRAINT "microsite_page_versions_microsite_id_fkey"
      FOREIGN KEY ("microsite_id")
      REFERENCES "microsites"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_page_versions_microsite_version_id_fkey'
  ) THEN
    ALTER TABLE "microsite_page_versions"
      ADD CONSTRAINT "microsite_page_versions_microsite_version_id_fkey"
      FOREIGN KEY ("microsite_version_id")
      REFERENCES "microsite_versions"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_page_versions_page_id_fkey'
  ) THEN
    ALTER TABLE "microsite_page_versions"
      ADD CONSTRAINT "microsite_page_versions_page_id_fkey"
      FOREIGN KEY ("page_id")
      REFERENCES "microsite_pages"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'microsite_page_versions_created_by_fkey'
  ) THEN
    ALTER TABLE "microsite_page_versions"
      ADD CONSTRAINT "microsite_page_versions_created_by_fkey"
      FOREIGN KEY ("created_by")
      REFERENCES "users"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "microsites_event_id_key"
ON "microsites" ("event_id");

CREATE UNIQUE INDEX IF NOT EXISTS "microsite_pages_microsite_id_slug_key"
ON "microsite_pages" ("microsite_id", "slug");

CREATE INDEX IF NOT EXISTS "mp_slug_idx"
ON "microsite_pages" ("microsite_id", "slug");

CREATE INDEX IF NOT EXISTS "mp_pos_idx"
ON "microsite_pages" ("microsite_id", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "microsite_versions_microsite_id_version_key"
ON "microsite_versions" ("microsite_id", "version");

CREATE UNIQUE INDEX IF NOT EXISTS "microsite_page_versions_page_id_version_key"
ON "microsite_page_versions" ("page_id", "version");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mpv_microsite_version_slug_uq'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mpv_version_slug_idx'
  ) THEN
    ALTER TABLE "microsite_page_versions"
      RENAME CONSTRAINT "mpv_microsite_version_slug_uq" TO "mpv_version_slug_idx";
  END IF;
END
$$;

DROP INDEX IF EXISTS "mpv_microsite_version_slug_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "mpv_version_slug_idx"
ON "microsite_page_versions" ("microsite_version_id", "slug");

DO $$
BEGIN
  IF to_regclass('"mpv_version_pos_idx"') IS NULL
     AND to_regclass('"mpv_microsite_version_pos_idx"') IS NOT NULL THEN
    ALTER INDEX "mpv_microsite_version_pos_idx" RENAME TO "mpv_version_pos_idx";
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "mpv_microsite_version_idx"
ON "microsite_page_versions" ("microsite_id", "version");

CREATE INDEX IF NOT EXISTS "mpv_parent_version_idx"
ON "microsite_page_versions" ("microsite_version_id");

CREATE INDEX IF NOT EXISTS "mpv_version_pos_idx"
ON "microsite_page_versions" ("microsite_version_id", "position");
