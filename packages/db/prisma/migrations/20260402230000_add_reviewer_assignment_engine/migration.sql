CREATE TABLE "review_queue_items" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "step_id" UUID NOT NULL,
  "submission_version_id" UUID NOT NULL,
  "assigned_reviewer_id" UUID,
  "queue_mode" TEXT NOT NULL DEFAULT 'shared',
  "assignment_expires_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "completed_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_assignment_previews" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "request_payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "snapshot_payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "scope_fingerprint" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "applied_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_assignment_previews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_assignment_runs" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "preview_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "result_payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_assignment_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rqi_submission_version_uq"
ON "review_queue_items" ("submission_version_id");

CREATE INDEX "rqi_event_completed_idx"
ON "review_queue_items" ("event_id", "completed_at");

CREATE INDEX "rqi_event_assigned_completed_idx"
ON "review_queue_items" ("event_id", "assigned_reviewer_id", "completed_at");

CREATE INDEX "rqi_event_expiry_completed_idx"
ON "review_queue_items" ("event_id", "assignment_expires_at", "completed_at");

CREATE INDEX "rqi_application_step_idx"
ON "review_queue_items" ("application_id", "step_id");

CREATE INDEX "rap_event_expires_idx"
ON "review_assignment_previews" ("event_id", "expires_at");

CREATE INDEX "rap_event_creator_created_idx"
ON "review_assignment_previews" ("event_id", "created_by", "created_at" DESC);

CREATE UNIQUE INDEX "rar_event_idempotency_uq"
ON "review_assignment_runs" ("event_id", "idempotency_key");

CREATE INDEX "rar_event_created_idx"
ON "review_assignment_runs" ("event_id", "created_at" DESC);

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_application_id_fkey"
FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_step_id_fkey"
FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_submission_version_id_fkey"
FOREIGN KEY ("submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_assigned_reviewer_id_fkey"
FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "review_queue_items"
ADD CONSTRAINT "review_queue_items_completed_by_fkey"
FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "review_assignment_previews"
ADD CONSTRAINT "review_assignment_previews_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_assignment_previews"
ADD CONSTRAINT "review_assignment_previews_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "review_assignment_runs"
ADD CONSTRAINT "review_assignment_runs_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_assignment_runs"
ADD CONSTRAINT "review_assignment_runs_preview_id_fkey"
FOREIGN KEY ("preview_id") REFERENCES "review_assignment_previews"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "review_assignment_runs"
ADD CONSTRAINT "review_assignment_runs_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
