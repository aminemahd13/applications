-- migrate:up
-- Add file_object_id to field_verifications for per-file granularity

ALTER TABLE field_verifications 
ADD COLUMN file_object_id UUID REFERENCES file_objects(id) ON DELETE CASCADE;

-- Drop old unique constraint (per field)
ALTER TABLE field_verifications 
DROP CONSTRAINT field_verifications_submission_version_id_field_id_key;

-- Add new unique constraint (per field + file)
-- Note: file_object_id is nullable for non-file fields, so we need a partial index or just allow multiple nulls?
-- Postgres allows multiple NULLs in unique constraint unless we use NULLS NOT DISTINCT (PG 15+).
-- If file_object_id is NULL, it means the verification applies to the field itself (non-file field).
-- Since we want only ONE verification per field if it's non-file, we effectively want:
-- UNIQUE(submission_version_id, field_id, file_object_id) treating NULL as distinct?
-- Actually, for non-file fields, we want UNIQUE(submission_version_id, field_id) where file_object_id IS NULL.
-- For file fields, we want UNIQUE(submission_version_id, field_id, file_object_id).
-- The simplest is just UNIQUE(submission_version_id, field_id, file_object_id).
-- If file_object_id is NULL, we can insert multiple? No, standard SQL allows multiple NULLs.
-- But for our logic, we probably treat NULL as "the field itself".
-- Let's stick to standard unique index including file_object_id.
CREATE UNIQUE INDEX field_verifications_uq ON field_verifications(submission_version_id, field_id, file_object_id);

-- migrate:down
DROP INDEX field_verifications_uq;
ALTER TABLE field_verifications DROP COLUMN file_object_id;
ALTER TABLE field_verifications ADD UNIQUE (submission_version_id, field_id);
