-- migrate:up
ALTER TABLE applicant_profiles
  ADD COLUMN date_of_birth DATE;

-- migrate:down
ALTER TABLE applicant_profiles
  DROP COLUMN date_of_birth;
