ALTER TABLE "message_recipients"
  ADD COLUMN IF NOT EXISTS "email_next_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "email_rate_limited_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "mr_email_status_next_attempt_idx"
ON "message_recipients" ("delivery_email_status", "email_next_attempt_at");
