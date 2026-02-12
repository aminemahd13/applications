-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('STAGED', 'COMMITTED');

-- CreateTable
CREATE TABLE "admin_change_patches" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "ops" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL_ONLY',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "admin_change_patches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "education_level" TEXT,
    "institution" TEXT,
    "city" TEXT,
    "country" TEXT,
    "links" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applicant_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "application_step_states" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "current_draft_id" UUID,
    "latest_submission_version_id" UUID,
    "revision_cycle_count" INTEGER NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_step_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "decision_status" TEXT NOT NULL DEFAULT 'NONE',
    "decision_published_at" TIMESTAMPTZ(6),
    "decision_draft" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "internal_notes" TEXT,
    "assigned_reviewer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "application_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_submission_version_id" UUID,
    "qr_token_hash" TEXT,
    "qr_issued_at" TIMESTAMPTZ(6),
    "checked_in_at" TIMESTAMPTZ(6),
    "checked_in_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'NONE',

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "redaction_applied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_records" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "application_id" UUID,
    "staff_user_id" UUID NOT NULL,
    "scanned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "fail_reason" TEXT,
    "raw_token_fingerprint" TEXT,
    "client_device_id" TEXT,

    CONSTRAINT "checkin_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_role_assignments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "series_key" TEXT,
    "edition_label" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "venue_name" TEXT,
    "venue_address" TEXT,
    "venue_map_url" TEXT,
    "format" TEXT NOT NULL,
    "application_open_at" TIMESTAMPTZ(6),
    "application_close_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "decision_config" JSONB NOT NULL DEFAULT '{}',
    "checkin_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_verifications" (
    "id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "field_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason_code" TEXT,
    "notes_internal" TEXT,
    "notes_applicant" TEXT,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'STAGED',
    "sensitivity" TEXT NOT NULL DEFAULT 'normal',
    "virus_scan_status" TEXT NOT NULL DEFAULT 'pending',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "schema" JSONB NOT NULL,
    "ui" JSONB NOT NULL,
    "published_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "draft_schema" JSONB NOT NULL DEFAULT '{}',
    "draft_ui" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "delivery_email_status" TEXT NOT NULL DEFAULT 'queued',
    "delivery_email_error" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_rich" JSONB NOT NULL DEFAULT '{}',
    "action_buttons" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "needs_info_requests" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "submission_version_id" UUID,
    "target_field_ids" TEXT[],
    "message" TEXT NOT NULL,
    "deadline_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "needs_info_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_settings" (
    "id" INTEGER NOT NULL,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "security" JSONB NOT NULL DEFAULT '{}',
    "email" JSONB NOT NULL DEFAULT '{}',
    "storage" JSONB NOT NULL DEFAULT '{}',
    "retention" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_records" (
    "id" UUID NOT NULL,
    "submission_version_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "checklist_result" JSONB NOT NULL DEFAULT '{}',
    "message_to_applicant" TEXT,
    "notes_internal" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" VARCHAR NOT NULL,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "step_drafts" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "answers_draft" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_submission_versions" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "answers_snapshot" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by" UUID NOT NULL,

    CONSTRAINT "step_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_global_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions_rich" JSONB NOT NULL DEFAULT '{}',
    "unlock_policy" TEXT NOT NULL,
    "unlock_at" TIMESTAMPTZ(6),
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "reviewer_roles_allowed" JSONB NOT NULL DEFAULT '["reviewer", "organizer"]',
    "reject_behavior" TEXT NOT NULL DEFAULT 'reject_resubmit_allowed',
    "strict_gating" BOOLEAN NOT NULL DEFAULT true,
    "deadline_at" TIMESTAMPTZ(6),
    "late_policy" TEXT NOT NULL DEFAULT 'allow',
    "max_revision_cycles" INTEGER,
    "form_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_step_states_application_id_step_id_key" ON "application_step_states"("application_id", "step_id");

-- CreateIndex
CREATE INDEX "app_event_decision_idx" ON "applications"("event_id", "decision_status");

-- CreateIndex
CREATE INDEX "app_event_updated_idx" ON "applications"("event_id", "updated_at");

-- CreateIndex
CREATE INDEX "app_tags_gin" ON "applications" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "applications_event_id_applicant_user_id_key" ON "applications"("event_id", "applicant_user_id");

-- CreateIndex
CREATE INDEX "audit_event_time_idx" ON "audit_logs"("event_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "era_event_idx" ON "event_role_assignments"("event_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "event_role_assignments_event_id_user_id_role_key" ON "event_role_assignments"("event_id", "user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_open_close_idx" ON "events"("application_open_at", "application_close_at");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "field_verifications_submission_version_id_field_id_key" ON "field_verifications"("submission_version_id", "field_id");

-- CreateIndex
CREATE INDEX "fo_event_created_idx" ON "file_objects"("event_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_form_id_version_number_key" ON "form_versions"("form_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipients_message_id_recipient_user_id_key" ON "message_recipients"("message_id", "recipient_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "step_submission_versions_application_id_step_id_version_num_key" ON "step_submission_versions"("application_id", "step_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "ws_event_idx" ON "workflow_steps"("event_id", "step_index");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_event_id_step_index_key" ON "workflow_steps"("event_id", "step_index");

-- AddForeignKey
ALTER TABLE "admin_change_patches" ADD CONSTRAINT "admin_change_patches_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_change_patches" ADD CONSTRAINT "admin_change_patches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_change_patches" ADD CONSTRAINT "admin_change_patches_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_change_patches" ADD CONSTRAINT "admin_change_patches_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "application_step_states" ADD CONSTRAINT "application_step_states_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "application_step_states" ADD CONSTRAINT "application_step_states_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_confirmation_submission_version_id_fkey" FOREIGN KEY ("confirmation_submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_role_assignments" ADD CONSTRAINT "event_role_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "event_role_assignments" ADD CONSTRAINT "event_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "field_verifications" ADD CONSTRAINT "field_verifications_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "field_verifications" ADD CONSTRAINT "field_verifications_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "needs_info_requests" ADD CONSTRAINT "needs_info_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "needs_info_requests" ADD CONSTRAINT "needs_info_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "needs_info_requests" ADD CONSTRAINT "needs_info_requests_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "needs_info_requests" ADD CONSTRAINT "needs_info_requests_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "step_submission_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_drafts" ADD CONSTRAINT "step_drafts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_drafts" ADD CONSTRAINT "step_drafts_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_drafts" ADD CONSTRAINT "step_drafts_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_submission_versions" ADD CONSTRAINT "step_submission_versions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_submission_versions" ADD CONSTRAINT "step_submission_versions_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_submission_versions" ADD CONSTRAINT "step_submission_versions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "step_submission_versions" ADD CONSTRAINT "step_submission_versions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
