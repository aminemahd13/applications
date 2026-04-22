ALTER TABLE "certificate_templates"
  ADD COLUMN "layout_schema_version" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "draft_layout_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draft_updated_at" TIMESTAMPTZ(6);

-- Breaking redesign policy: remove all existing legacy templates globally.
-- Issued certificates remain because template/template_version foreign keys are ON DELETE SET NULL.
DELETE FROM "certificate_templates";
