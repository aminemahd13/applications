-- Review queue / stats indexes
CREATE INDEX IF NOT EXISTS "ass_step_status_revision_idx"
ON "application_step_states" ("step_id", "status", "revision_cycle_count");

CREATE INDEX IF NOT EXISTS "ass_latest_submission_idx"
ON "application_step_states" ("latest_submission_version_id");

CREATE INDEX IF NOT EXISTS "nir_step_status_idx"
ON "needs_info_requests" ("step_id", "status");

CREATE INDEX IF NOT EXISTS "nir_application_status_idx"
ON "needs_info_requests" ("application_id", "status");

-- Permission and event list hot-path indexes
CREATE INDEX IF NOT EXISTS "era_user_event_idx"
ON "event_role_assignments" ("user_id", "event_id");

CREATE INDEX IF NOT EXISTS "events_status_created_idx"
ON "events" ("status", "created_at" DESC);

-- Staff messaging and email worker indexes
CREATE INDEX IF NOT EXISTS "mr_message_created_idx"
ON "message_recipients" ("message_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "mr_email_status_last_attempt_idx"
ON "message_recipients" ("delivery_email_status", "email_last_attempt_at");
