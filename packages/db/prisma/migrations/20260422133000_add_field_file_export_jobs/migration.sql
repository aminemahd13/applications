CREATE TABLE "field_file_export_jobs" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL,
  "step_id" UUID NOT NULL,
  "field_id" TEXT NOT NULL,
  "requester_user_id" UUID NOT NULL,
  "application_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "permission_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "error_message" TEXT,
  "output_storage_key" TEXT,
  "output_filename" TEXT,
  "output_size_bytes" BIGINT,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "field_file_export_jobs_event_fk"
    FOREIGN KEY ("event_id")
    REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "field_file_export_jobs_step_fk"
    FOREIGN KEY ("step_id")
    REFERENCES "workflow_steps"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "field_file_export_jobs_requester_fk"
    FOREIGN KEY ("requester_user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "ffej_status_retry_idx"
  ON "field_file_export_jobs"("status", "next_retry_at");

CREATE INDEX "ffej_event_requester_created_idx"
  ON "field_file_export_jobs"("event_id", "requester_user_id", "created_at" DESC);

CREATE INDEX "ffej_event_created_idx"
  ON "field_file_export_jobs"("event_id", "created_at" DESC);
