-- Ensure applicant profile fields expected by Prisma schema exist on all environments.
-- This migration is idempotent so it can run safely on databases that already
-- received equivalent legacy dbmate migrations.

ALTER TABLE "applicant_profiles"
  ADD COLUMN IF NOT EXISTS "first_name" TEXT,
  ADD COLUMN IF NOT EXISTS "last_name" TEXT,
  ADD COLUMN IF NOT EXISTS "date_of_birth" DATE;

UPDATE "applicant_profiles"
SET
  "first_name" = CASE
    WHEN "first_name" IS NULL OR btrim("first_name") = '' THEN split_part("full_name", ' ', 1)
    ELSE "first_name"
  END,
  "last_name" = CASE
    WHEN "last_name" IS NULL OR btrim("last_name") = '' THEN
      CASE
        WHEN position(' ' IN "full_name") > 0
          THEN substr("full_name", position(' ' IN "full_name") + 1)
        ELSE NULL
      END
    ELSE "last_name"
  END
WHERE "full_name" IS NOT NULL
  AND btrim("full_name") <> '';
