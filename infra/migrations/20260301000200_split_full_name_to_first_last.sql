-- migrate:up
ALTER TABLE applicant_profiles ADD COLUMN first_name TEXT;
ALTER TABLE applicant_profiles ADD COLUMN last_name TEXT;

UPDATE applicant_profiles SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = CASE
    WHEN POSITION(' ' IN full_name) > 0
    THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
    ELSE NULL
  END
WHERE full_name IS NOT NULL AND full_name != '';

-- migrate:down
ALTER TABLE applicant_profiles DROP COLUMN first_name;
ALTER TABLE applicant_profiles DROP COLUMN last_name;
