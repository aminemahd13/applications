-- Ensure workflow_steps.hidden exists for APIs that filter hidden steps.
-- Idempotent so it is safe on databases that already received legacy SQL.
ALTER TABLE "workflow_steps"
  ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN DEFAULT false;

UPDATE "workflow_steps"
SET "hidden" = false
WHERE "hidden" IS NULL;

ALTER TABLE "workflow_steps"
  ALTER COLUMN "hidden" SET DEFAULT false,
  ALTER COLUMN "hidden" SET NOT NULL;
