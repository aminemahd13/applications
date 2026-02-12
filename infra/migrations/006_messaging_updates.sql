-- Phase 9: Messaging Schema Updates
-- migrate:up

-- Add new columns to messages table
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS body_text TEXT,
    ADD COLUMN IF NOT EXISTS recipient_filter_json JSONB,
    ADD COLUMN IF NOT EXISTS resolved_recipient_count INT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'SENT';

-- Add new columns to message_recipients table
ALTER TABLE message_recipients
    ADD COLUMN IF NOT EXISTS delivery_inbox_status TEXT DEFAULT 'DELIVERED',
    ADD COLUMN IF NOT EXISTS email_attempts INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS email_last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_failure_reason TEXT;

-- Normalize delivery_email_status default if exists
UPDATE message_recipients
SET delivery_email_status = 'NOT_REQUESTED'
WHERE delivery_email_status = 'queued' OR delivery_email_status IS NULL;

-- Add index for inbox queries
CREATE INDEX IF NOT EXISTS mr_recipient_created_idx
    ON message_recipients(recipient_user_id, created_at DESC);

-- Add index for messages by event
CREATE INDEX IF NOT EXISTS msg_event_created_idx
    ON messages(event_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS msg_event_created_idx;
DROP INDEX IF EXISTS mr_recipient_created_idx;

ALTER TABLE message_recipients
    DROP COLUMN IF EXISTS email_failure_reason,
    DROP COLUMN IF EXISTS email_last_attempt_at,
    DROP COLUMN IF EXISTS email_attempts,
    DROP COLUMN IF EXISTS delivery_inbox_status;

ALTER TABLE messages
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS resolved_at,
    DROP COLUMN IF EXISTS resolved_recipient_count,
    DROP COLUMN IF EXISTS recipient_filter_json,
    DROP COLUMN IF EXISTS body_text;
