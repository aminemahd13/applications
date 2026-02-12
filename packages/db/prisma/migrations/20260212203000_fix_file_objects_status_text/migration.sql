-- Ensure file_objects.status is TEXT across legacy enum-based databases.
DO $$
DECLARE
  status_data_type TEXT;
BEGIN
  SELECT c.data_type
  INTO status_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'file_objects'
    AND c.column_name = 'status';

  IF status_data_type = 'USER-DEFINED' THEN
    ALTER TABLE "file_objects"
      ALTER COLUMN "status" TYPE TEXT USING "status"::text;
  END IF;
END
$$;

ALTER TABLE "file_objects"
  ALTER COLUMN "status" SET DEFAULT 'STAGED',
  ALTER COLUMN "status" SET NOT NULL;
