ALTER TABLE "file_objects"
  ADD COLUMN IF NOT EXISTS "media_optimization_status" TEXT NOT NULL DEFAULT 'DONE',
  ADD COLUMN IF NOT EXISTS "media_optimization_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "media_optimized_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "media_optimization_last_error" TEXT;

UPDATE "file_objects"
SET
  "media_optimization_status" = 'PENDING',
  "media_optimization_attempts" = 0,
  "media_optimized_at" = NULL,
  "media_optimization_last_error" = NULL
WHERE
  "status" = 'COMMITTED'
  AND "storage_key" LIKE 'events/%/microsite/%'
  AND "mime_type" LIKE 'image/%';

CREATE INDEX IF NOT EXISTS "fo_media_optimization_status_idx"
  ON "file_objects" ("media_optimization_status", "media_optimization_attempts", "created_at");

