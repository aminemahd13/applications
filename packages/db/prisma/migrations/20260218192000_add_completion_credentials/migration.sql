CREATE TABLE IF NOT EXISTS "completion_credentials" (
  "application_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "certificate_id" UUID NOT NULL,
  "credential_id" UUID NOT NULL,
  "credential_signature" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "completion_credentials_pkey" PRIMARY KEY ("application_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'completion_credentials_application_id_fkey'
  ) THEN
    ALTER TABLE "completion_credentials"
      ADD CONSTRAINT "completion_credentials_application_id_fkey"
      FOREIGN KEY ("application_id")
      REFERENCES "applications"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'completion_credentials_event_id_fkey'
  ) THEN
    ALTER TABLE "completion_credentials"
      ADD CONSTRAINT "completion_credentials_event_id_fkey"
      FOREIGN KEY ("event_id")
      REFERENCES "events"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "completion_credentials_certificate_id_key"
ON "completion_credentials" ("certificate_id");

CREATE UNIQUE INDEX IF NOT EXISTS "completion_credentials_credential_id_key"
ON "completion_credentials" ("credential_id");

CREATE INDEX IF NOT EXISTS "cc_event_issued_idx"
ON "completion_credentials" ("event_id", "issued_at");
