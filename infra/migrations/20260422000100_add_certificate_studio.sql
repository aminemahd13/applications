-- migrate:up
CREATE TABLE IF NOT EXISTS certificate_templates (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  name TEXT NOT NULL,
  type_key TEXT NOT NULL,
  type_label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  active_version_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  updated_by UUID REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cert_tpl_event_name_uq
  ON certificate_templates(event_id, name);
CREATE INDEX IF NOT EXISTS cert_tpl_event_type_active_idx
  ON certificate_templates(event_id, type_key, is_active);
CREATE INDEX IF NOT EXISTS cert_tpl_event_default_idx
  ON certificate_templates(event_id, is_default);
CREATE INDEX IF NOT EXISTS cert_tpl_event_archived_idx
  ON certificate_templates(event_id, archived_at);
CREATE INDEX IF NOT EXISTS cert_tpl_active_version_idx
  ON certificate_templates(active_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS cert_tpl_one_default_per_type_uq
  ON certificate_templates(event_id, type_key)
  WHERE is_default = true AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS certificate_template_versions (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  version_number INTEGER NOT NULL,
  layout_json JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cert_tpl_ver_template_version_uq
  ON certificate_template_versions(template_id, version_number);
CREATE INDEX IF NOT EXISTS cert_tpl_ver_template_created_idx
  ON certificate_template_versions(template_id, created_at DESC);

ALTER TABLE certificate_templates
  ADD CONSTRAINT certificate_templates_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES certificate_template_versions(id)
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS issued_certificates (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  template_id UUID REFERENCES certificate_templates(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  template_version_id UUID REFERENCES certificate_template_versions(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  certificate_type_key TEXT NOT NULL,
  certificate_type_label TEXT NOT NULL,
  certificate_id UUID NOT NULL,
  credential_id UUID NOT NULL,
  credential_signature TEXT NOT NULL,
  qr_token TEXT NOT NULL,
  qr_key_id TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ISSUED',
  issued_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_storage_key TEXT,
  pdf_generated_at TIMESTAMPTZ,
  render_status TEXT NOT NULL DEFAULT 'PENDING',
  render_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS issued_certificates_certificate_id_key
  ON issued_certificates(certificate_id);
CREATE UNIQUE INDEX IF NOT EXISTS issued_certificates_credential_id_key
  ON issued_certificates(credential_id);
CREATE INDEX IF NOT EXISTS issued_cert_event_issued_idx
  ON issued_certificates(event_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS issued_cert_app_type_idx
  ON issued_certificates(application_id, certificate_type_key);
CREATE INDEX IF NOT EXISTS issued_cert_event_render_idx
  ON issued_certificates(event_id, render_status);
CREATE INDEX IF NOT EXISTS issued_cert_event_status_idx
  ON issued_certificates(event_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS issued_cert_active_per_application_type_uq
  ON issued_certificates(application_id, certificate_type_key)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS certificate_render_jobs (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  issued_certificate_id UUID NOT NULL REFERENCES issued_certificates(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cert_render_jobs_status_retry_idx
  ON certificate_render_jobs(status, next_retry_at);
CREATE INDEX IF NOT EXISTS cert_render_jobs_event_created_idx
  ON certificate_render_jobs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cert_render_jobs_issued_idx
  ON certificate_render_jobs(issued_certificate_id);
CREATE UNIQUE INDEX IF NOT EXISTS cert_render_jobs_pending_per_issued_uq
  ON certificate_render_jobs(issued_certificate_id)
  WHERE status IN ('PENDING', 'PROCESSING');

-- migrate:down
DROP INDEX IF EXISTS cert_render_jobs_pending_per_issued_uq;
DROP INDEX IF EXISTS cert_render_jobs_issued_idx;
DROP INDEX IF EXISTS cert_render_jobs_event_created_idx;
DROP INDEX IF EXISTS cert_render_jobs_status_retry_idx;
DROP TABLE IF EXISTS certificate_render_jobs;

DROP INDEX IF EXISTS issued_cert_active_per_application_type_uq;
DROP INDEX IF EXISTS issued_cert_event_status_idx;
DROP INDEX IF EXISTS issued_cert_event_render_idx;
DROP INDEX IF EXISTS issued_cert_app_type_idx;
DROP INDEX IF EXISTS issued_cert_event_issued_idx;
DROP INDEX IF EXISTS issued_certificates_credential_id_key;
DROP INDEX IF EXISTS issued_certificates_certificate_id_key;
DROP TABLE IF EXISTS issued_certificates;

DROP INDEX IF EXISTS cert_tpl_ver_template_created_idx;
DROP INDEX IF EXISTS cert_tpl_ver_template_version_uq;
DROP TABLE IF EXISTS certificate_template_versions;

DROP INDEX IF EXISTS cert_tpl_one_default_per_type_uq;
DROP INDEX IF EXISTS cert_tpl_event_archived_idx;
DROP INDEX IF EXISTS cert_tpl_event_default_idx;
DROP INDEX IF EXISTS cert_tpl_event_type_active_idx;
DROP INDEX IF EXISTS cert_tpl_active_version_idx;
DROP INDEX IF EXISTS cert_tpl_event_name_uq;
DROP TABLE IF EXISTS certificate_templates;
