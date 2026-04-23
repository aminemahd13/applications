ALTER TABLE "issued_certificates"
  ADD COLUMN "released_at" TIMESTAMPTZ(6),
  ADD COLUMN "released_by" UUID;

UPDATE "issued_certificates"
SET "released_at" = "issued_at"
WHERE "released_at" IS NULL;

CREATE INDEX "issued_cert_event_released_idx"
  ON "issued_certificates"("event_id", "released_at");

CREATE TABLE "certificate_pdf_export_jobs" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL,
  "requester_user_id" UUID NOT NULL,
  "issued_certificate_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 120,
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
  CONSTRAINT "cert_pdf_export_jobs_event_fk"
    FOREIGN KEY ("event_id")
    REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "cert_pdf_export_jobs_requester_fk"
    FOREIGN KEY ("requester_user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "cert_pdf_export_jobs_status_retry_idx"
  ON "certificate_pdf_export_jobs"("status", "next_retry_at");

CREATE INDEX "cert_pdf_export_jobs_event_requester_created_idx"
  ON "certificate_pdf_export_jobs"("event_id", "requester_user_id", "created_at" DESC);
