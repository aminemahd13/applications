-- Role assignment temporary access + invite metadata
ALTER TABLE "event_role_assignments"
  ADD COLUMN IF NOT EXISTS "access_start_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "access_end_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_status" TEXT DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "invite_failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "invite_last_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_last_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_last_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_resend_count" INTEGER DEFAULT 0;

UPDATE "event_role_assignments"
SET "invite_status" = 'NONE'
WHERE "invite_status" IS NULL;

CREATE INDEX IF NOT EXISTS "era_event_access_window_idx"
ON "event_role_assignments" ("event_id", "access_start_at", "access_end_at");

-- Saved review queue filters/views
CREATE TABLE IF NOT EXISTS "review_queue_saved_views" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_queue_saved_views_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_queue_saved_views_event_id_fkey'
  ) THEN
    ALTER TABLE "review_queue_saved_views"
      ADD CONSTRAINT "review_queue_saved_views_event_id_fkey"
      FOREIGN KEY ("event_id")
      REFERENCES "events"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_queue_saved_views_user_id_fkey'
  ) THEN
    ALTER TABLE "review_queue_saved_views"
      ADD CONSTRAINT "review_queue_saved_views_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "rqsv_event_user_name_uq"
ON "review_queue_saved_views" ("event_id", "user_id", "name");

CREATE INDEX IF NOT EXISTS "rqsv_event_user_created_idx"
ON "review_queue_saved_views" ("event_id", "user_id", "created_at" DESC);

-- Reusable decision templates
CREATE TABLE IF NOT EXISTS "decision_templates" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "subject_template" TEXT NOT NULL,
  "body_template" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decision_templates_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_templates_event_id_fkey'
  ) THEN
    ALTER TABLE "decision_templates"
      ADD CONSTRAINT "decision_templates_event_id_fkey"
      FOREIGN KEY ("event_id")
      REFERENCES "events"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_templates_created_by_fkey'
  ) THEN
    ALTER TABLE "decision_templates"
      ADD CONSTRAINT "decision_templates_created_by_fkey"
      FOREIGN KEY ("created_by")
      REFERENCES "users"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decision_templates_updated_by_fkey'
  ) THEN
    ALTER TABLE "decision_templates"
      ADD CONSTRAINT "decision_templates_updated_by_fkey"
      FOREIGN KEY ("updated_by")
      REFERENCES "users"("id")
      ON DELETE NO ACTION
      ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "dt_event_name_uq"
ON "decision_templates" ("event_id", "name");

CREATE INDEX IF NOT EXISTS "dt_event_status_idx"
ON "decision_templates" ("event_id", "status", "is_active");

CREATE INDEX IF NOT EXISTS "dt_event_created_idx"
ON "decision_templates" ("event_id", "created_at" DESC);
