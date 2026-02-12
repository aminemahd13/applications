-- migrate:up
ALTER TABLE audit_logs ADD COLUMN request_id text;
ALTER TABLE audit_logs ADD COLUMN ip_address text;
ALTER TABLE audit_logs ADD COLUMN user_agent text;
ALTER TABLE audit_logs ADD COLUMN redaction_applied boolean not null default false;

ALTER TABLE audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;

-- migrate:down
ALTER TABLE audit_logs DROP COLUMN request_id;
ALTER TABLE audit_logs DROP COLUMN ip_address;
ALTER TABLE audit_logs DROP COLUMN user_agent;
ALTER TABLE audit_logs DROP COLUMN redaction_applied;

ALTER TABLE audit_logs ALTER COLUMN actor_user_id SET NOT NULL;
