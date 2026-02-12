-- migrate:up
ALTER TABLE file_objects ADD COLUMN status TEXT NOT NULL DEFAULT 'STAGED';

-- migrate:down
ALTER TABLE file_objects DROP COLUMN status;
