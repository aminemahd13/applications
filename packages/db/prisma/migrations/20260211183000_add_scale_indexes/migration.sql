-- Add missing lookup indexes for high-frequency user/event queries
CREATE INDEX IF NOT EXISTS "app_applicant_idx"
ON "applications" ("applicant_user_id");

CREATE INDEX IF NOT EXISTS "era_user_idx"
ON "event_role_assignments" ("user_id");
