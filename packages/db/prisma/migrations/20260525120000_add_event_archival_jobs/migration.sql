CREATE TABLE "event_archival_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "microsite_policy" TEXT NOT NULL,
  "purge_policy" TEXT NOT NULL,
  "files_total" INTEGER NOT NULL DEFAULT 0,
  "files_deleted" INTEGER NOT NULL DEFAULT 0,
  "submissions_total" INTEGER NOT NULL DEFAULT 0,
  "submissions_purged" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  CONSTRAINT "event_archival_jobs_event_fk"
    FOREIGN KEY ("event_id")
    REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "event_archival_jobs_requester_fk"
    FOREIGN KEY ("requested_by_user_id")
    REFERENCES "users"("id")
    ON UPDATE NO ACTION
);

CREATE INDEX "event_archival_jobs_status_idx"
  ON "event_archival_jobs"("status", "requested_at");

CREATE INDEX "event_archival_jobs_event_idx"
  ON "event_archival_jobs"("event_id", "requested_at" DESC);
