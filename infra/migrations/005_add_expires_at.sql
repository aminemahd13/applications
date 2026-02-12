-- migrate:up
ALTER TABLE file_objects ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- migrate:down
ALTER TABLE file_objects DROP COLUMN IF EXISTS expires_at;
