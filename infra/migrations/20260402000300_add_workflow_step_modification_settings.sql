-- migrate:up
ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS allow_applicant_modification BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS modification_scope TEXT DEFAULT 'SUBMITTED_ONLY';

UPDATE workflow_steps
SET
  allow_applicant_modification = COALESCE(allow_applicant_modification, false),
  modification_scope = COALESCE(modification_scope, 'SUBMITTED_ONLY');

ALTER TABLE workflow_steps
  ALTER COLUMN allow_applicant_modification SET DEFAULT false,
  ALTER COLUMN allow_applicant_modification SET NOT NULL,
  ALTER COLUMN modification_scope SET DEFAULT 'SUBMITTED_ONLY',
  ALTER COLUMN modification_scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'workflow_steps_modification_scope_check'
      AND t.relname = 'workflow_steps'
  ) THEN
    ALTER TABLE workflow_steps
      ADD CONSTRAINT workflow_steps_modification_scope_check
      CHECK (modification_scope IN ('SUBMITTED_ONLY', 'SUBMITTED_OR_APPROVED'));
  END IF;
END $$;

-- migrate:down
ALTER TABLE workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_modification_scope_check;

ALTER TABLE workflow_steps
  DROP COLUMN IF EXISTS modification_scope,
  DROP COLUMN IF EXISTS allow_applicant_modification;
