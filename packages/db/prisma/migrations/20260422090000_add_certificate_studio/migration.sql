CREATE TABLE "certificate_templates" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type_key" TEXT NOT NULL,
  "type_label" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMPTZ(6),
  "active_version_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_by" UUID NOT NULL,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "certificate_templates_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "certificate_templates_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "certificate_templates_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "cert_tpl_event_name_uq" ON "certificate_templates"("event_id", "name");
CREATE INDEX "cert_tpl_event_type_active_idx" ON "certificate_templates"("event_id", "type_key", "is_active");
CREATE INDEX "cert_tpl_event_default_idx" ON "certificate_templates"("event_id", "is_default");
CREATE INDEX "cert_tpl_event_archived_idx" ON "certificate_templates"("event_id", "archived_at");
CREATE INDEX "cert_tpl_active_version_idx" ON "certificate_templates"("active_version_id");
CREATE UNIQUE INDEX "cert_tpl_one_default_per_type_uq" ON "certificate_templates"("event_id", "type_key")
  WHERE "is_default" = true AND "archived_at" IS NULL;

CREATE TABLE "certificate_template_versions" (
  "id" UUID PRIMARY KEY,
  "template_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "layout_json" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "certificate_template_versions_template_fk" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "certificate_template_versions_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "cert_tpl_ver_template_version_uq" ON "certificate_template_versions"("template_id", "version_number");
CREATE INDEX "cert_tpl_ver_template_created_idx" ON "certificate_template_versions"("template_id", "created_at" DESC);
ALTER TABLE "certificate_templates"
  ADD CONSTRAINT "certificate_templates_active_version_fk"
  FOREIGN KEY ("active_version_id")
  REFERENCES "certificate_template_versions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "issued_certificates" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "template_id" UUID,
  "template_version_id" UUID,
  "certificate_type_key" TEXT NOT NULL,
  "certificate_type_label" TEXT NOT NULL,
  "certificate_id" UUID NOT NULL,
  "credential_id" UUID NOT NULL,
  "credential_signature" TEXT NOT NULL,
  "qr_token" TEXT NOT NULL,
  "qr_key_id" TEXT NOT NULL,
  "issuer_name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "template_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "payload_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "pdf_storage_key" TEXT,
  "pdf_generated_at" TIMESTAMPTZ(6),
  "render_status" TEXT NOT NULL DEFAULT 'PENDING',
  "render_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "issued_certificates_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "issued_certificates_application_fk" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "issued_certificates_template_fk" FOREIGN KEY ("template_id") REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "issued_certificates_template_version_fk" FOREIGN KEY ("template_version_id") REFERENCES "certificate_template_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "issued_certificates_certificate_id_key" ON "issued_certificates"("certificate_id");
CREATE UNIQUE INDEX "issued_certificates_credential_id_key" ON "issued_certificates"("credential_id");
CREATE INDEX "issued_cert_event_issued_idx" ON "issued_certificates"("event_id", "issued_at" DESC);
CREATE INDEX "issued_cert_app_type_idx" ON "issued_certificates"("application_id", "certificate_type_key");
CREATE INDEX "issued_cert_event_render_idx" ON "issued_certificates"("event_id", "render_status");
CREATE INDEX "issued_cert_event_status_idx" ON "issued_certificates"("event_id", "status");
CREATE UNIQUE INDEX "issued_cert_active_per_application_type_uq" ON "issued_certificates"("application_id", "certificate_type_key")
  WHERE "revoked_at" IS NULL;

CREATE TABLE "certificate_render_jobs" (
  "id" UUID PRIMARY KEY,
  "event_id" UUID NOT NULL,
  "issued_certificate_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" TEXT,
  "error_message" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "certificate_render_jobs_event_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "certificate_render_jobs_issued_fk" FOREIGN KEY ("issued_certificate_id") REFERENCES "issued_certificates"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "cert_render_jobs_status_retry_idx" ON "certificate_render_jobs"("status", "next_retry_at");
CREATE INDEX "cert_render_jobs_event_created_idx" ON "certificate_render_jobs"("event_id", "created_at" DESC);
CREATE INDEX "cert_render_jobs_issued_idx" ON "certificate_render_jobs"("issued_certificate_id");
CREATE UNIQUE INDEX "cert_render_jobs_pending_per_issued_uq" ON "certificate_render_jobs"("issued_certificate_id")
  WHERE "status" IN ('PENDING', 'PROCESSING');
