-- Conditional per-step deadlines: ordered rules ({ condition, deadlineAt }) that
-- personalize a step's effective deadline by applicant profile / earlier answer.
-- Idempotent + NOT NULL with a '[]' default so existing steps keep base behavior.
ALTER TABLE "workflow_steps"
  ADD COLUMN IF NOT EXISTS "deadline_rules" JSONB DEFAULT '[]'::jsonb;

UPDATE "workflow_steps"
SET "deadline_rules" = '[]'::jsonb
WHERE "deadline_rules" IS NULL;

ALTER TABLE "workflow_steps"
  ALTER COLUMN "deadline_rules" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "deadline_rules" SET NOT NULL;
