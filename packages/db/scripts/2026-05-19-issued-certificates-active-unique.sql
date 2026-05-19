-- 2026-05-19: harden issued_certificates against the (application_id, certificate_type_key)
-- duplicate-active race. Run once against the production database BEFORE deploying
-- the corresponding code change in apps/api/src/certificates/certificates.service.ts.
--
-- Step 1 deletes any existing duplicate active rows, keeping only the newest per
-- (application_id, certificate_type_key) pair. certificate_render_jobs has
-- ON DELETE CASCADE on issued_certificate_id (see packages/db/prisma/schema.prisma:643),
-- so child render jobs are removed automatically by this DELETE.
--
-- Step 2 creates a partial unique index limited to active (non-revoked) rows.
-- Revoked rows are unconstrained so a certificate can be revoked and re-issued
-- without conflicting with the older revoked row.
--
-- Reversible with: DROP INDEX IF EXISTS issued_cert_app_type_active_uq;
-- (The DELETE in step 1 is not reversible — discussed and authorized: the
-- certificates currently on the platform are test data.)

BEGIN;

DELETE FROM issued_certificates
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY application_id, certificate_type_key
             ORDER BY issued_at DESC, created_at DESC, id DESC
           ) AS rn
    FROM issued_certificates
    WHERE revoked_at IS NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS issued_cert_app_type_active_uq
  ON issued_certificates (application_id, certificate_type_key)
  WHERE revoked_at IS NULL;

COMMIT;
