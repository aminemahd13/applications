-- Ensure messaging columns exist before follow-up index migration.
-- This keeps the migration chain valid on fresh databases.

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
