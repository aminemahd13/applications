ALTER TABLE "workflow_steps"
  ADD COLUMN IF NOT EXISTS "allow_next_steps_while_revising" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "revision_deadline_at" TIMESTAMPTZ(6);

UPDATE "workflow_steps"
SET
  "allow_next_steps_while_revising" = COALESCE("allow_next_steps_while_revising", true);

ALTER TABLE "workflow_steps"
  ALTER COLUMN "allow_next_steps_while_revising" SET DEFAULT true,
  ALTER COLUMN "allow_next_steps_while_revising" SET NOT NULL;

ALTER TABLE "application_step_states"
  ADD COLUMN IF NOT EXISTS "revision_deadline_at" TIMESTAMPTZ(6);
