-- migrate:up

-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- USERS
create table users (
  id uuid primary key, -- Generated app-side
  email citext not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_users_updated_at
before update on users
for each row execute procedure set_updated_at();

create table applicant_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  full_name text,
  phone text,
  education_level text,
  institution text,
  city text,
  country text,
  links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_applicant_profiles_updated_at
before update on applicant_profiles
for each row execute procedure set_updated_at();

-- ORG SETTINGS (single row)
create table org_settings (
  id int primary key check (id = 1),
  branding jsonb not null default '{}'::jsonb,
  security jsonb not null default '{}'::jsonb,
  email jsonb not null default '{}'::jsonb,
  storage jsonb not null default '{}'::jsonb,
  retention jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_org_settings_updated_at
before update on org_settings
for each row execute procedure set_updated_at();

-- EVENTS
create table events (
  id uuid primary key,
  series_key text,
  edition_label text,
  title text not null,
  slug text not null unique,
  timezone text not null,
  start_at timestamptz,
  end_at timestamptz,
  venue_name text,
  venue_address text,
  venue_map_url text,
  format text not null, -- online/in_person/hybrid
  application_open_at timestamptz,
  application_close_at timestamptz,
  status text not null default 'draft', -- draft/published/archived
  decision_config jsonb not null default '{}'::jsonb,
  checkin_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_status_idx on events(status);
create index events_open_close_idx on events(application_open_at, application_close_at);

create trigger set_events_updated_at
before update on events
for each row execute procedure set_updated_at();

-- EVENT ROLES
create table event_role_assignments (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null, -- organizer/reviewer/checkin_staff/content_editor
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(event_id, user_id, role)
);
create index era_event_idx on event_role_assignments(event_id, role);

-- FORMS + VERSIONS
create table forms (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  draft_schema jsonb not null default '{}'::jsonb,
  draft_ui jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_forms_updated_at
before update on forms
for each row execute procedure set_updated_at();

create table form_versions (
  id uuid primary key,
  form_id uuid not null references forms(id) on delete cascade,
  version_number int not null,
  schema jsonb not null,
  ui jsonb not null,
  published_by uuid not null references users(id),
  published_at timestamptz not null default now(),
  unique(form_id, version_number)
);

-- WORKFLOW STEPS
create table workflow_steps (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  step_index int not null,
  category text not null,
  title text not null,
  instructions_rich jsonb not null default '{}'::jsonb,
  unlock_policy text not null,
  unlock_at timestamptz,
  review_required boolean not null default false,
  reviewer_roles_allowed jsonb not null default '["reviewer","organizer"]'::jsonb,
  reject_behavior text not null default 'reject_resubmit_allowed',
  strict_gating boolean not null default true,
  deadline_at timestamptz,
  late_policy text not null default 'allow',
  max_revision_cycles int,
  form_version_id uuid references form_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, step_index)
);
create index ws_event_idx on workflow_steps(event_id, step_index);

create trigger set_workflow_steps_updated_at
before update on workflow_steps
for each row execute procedure set_updated_at();

-- APPLICATIONS
create table applications (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  applicant_user_id uuid not null references users(id) on delete cascade,
  decision_status text not null default 'NONE',
  decision_published_at timestamptz,
  decision_draft jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  internal_notes text,
  assigned_reviewer_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, applicant_user_id)
);
create index app_event_decision_idx on applications(event_id, decision_status);
create index app_event_updated_idx on applications(event_id, updated_at);
create index app_tags_gin on applications using gin(tags);

create trigger set_applications_updated_at
before update on applications
for each row execute procedure set_updated_at();

-- STEP STATES
create table application_step_states (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  status text not null default 'LOCKED',
  current_draft_id uuid,
  latest_submission_version_id uuid,
  revision_cycle_count int not null default 0,
  unlocked_at timestamptz,
  last_activity_at timestamptz not null default now(),
  unique(application_id, step_id)
);

-- DRAFTS
create table step_drafts (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  form_version_id uuid not null references form_versions(id),
  answers_draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger set_step_drafts_updated_at
before update on step_drafts
for each row execute procedure set_updated_at();

-- SUBMISSION VERSIONS
create table step_submission_versions (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  form_version_id uuid not null references form_versions(id),
  version_number int not null,
  answers_snapshot jsonb not null,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references users(id),
  unique(application_id, step_id, version_number)
);

-- FILE OBJECTS
create table file_objects (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text,
  sensitivity text not null default 'normal',
  virus_scan_status text not null default 'pending',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index fo_event_created_idx on file_objects(event_id, created_at);

-- FIELD VERIFICATIONS (per submission version + fieldId)
create table field_verifications (
  id uuid primary key,
  submission_version_id uuid not null references step_submission_versions(id) on delete cascade,
  field_id text not null,
  status text not null default 'PENDING',
  reason_code text,
  notes_internal text,
  notes_applicant text,
  set_by uuid not null references users(id),
  set_at timestamptz not null default now(),
  unique(submission_version_id, field_id)
);

-- REVIEW RECORDS
create table review_records (
  id uuid primary key,
  submission_version_id uuid not null references step_submission_versions(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  outcome text not null,
  checklist_result jsonb not null default '{}'::jsonb,
  message_to_applicant text,
  notes_internal text,
  created_at timestamptz not null default now()
);

-- NEEDS-INFO
create table needs_info_requests (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  submission_version_id uuid references step_submission_versions(id),
  target_field_ids text[] not null,
  message text not null,
  deadline_at timestamptz,
  status text not null default 'OPEN',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- PATCHES
create table admin_change_patches (
  id uuid primary key,
  application_id uuid not null references applications(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  submission_version_id uuid not null references step_submission_versions(id) on delete cascade,
  ops jsonb not null,
  reason text not null,
  visibility text not null default 'INTERNAL_ONLY',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

-- MESSAGES
create table messages (
  id uuid primary key,
  event_id uuid references events(id) on delete cascade,
  type text not null,
  title text not null,
  body_rich jsonb not null default '{}'::jsonb,
  action_buttons jsonb not null default '[]'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table message_recipients (
  id uuid primary key,
  message_id uuid not null references messages(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  delivery_email_status text not null default 'queued',
  delivery_email_error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(message_id, recipient_user_id)
);

-- ATTENDANCE + CHECK-IN
create table attendance_records (
  application_id uuid primary key references applications(id) on delete cascade,
  confirmed_at timestamptz,
  confirmation_submission_version_id uuid references step_submission_versions(id),
  qr_token_hash text,
  qr_issued_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references users(id),
  status text not null default 'NONE'
);

create table checkin_records (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  application_id uuid references applications(id),
  staff_user_id uuid not null references users(id),
  scanned_at timestamptz not null default now(),
  result text not null,
  fail_reason text,
  raw_token_fingerprint text,
  client_device_id text
);

-- AUDIT LOG
create table audit_logs (
  id uuid primary key,
  event_id uuid references events(id) on delete set null,
  actor_user_id uuid not null references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_event_time_idx on audit_logs(event_id, created_at desc);

-- migrate:down
drop table if exists audit_logs;
drop table if exists checkin_records;
drop table if exists attendance_records;
drop table if exists message_recipients;
drop table if exists messages;
drop table if exists admin_change_patches;
drop table if exists needs_info_requests;
drop table if exists review_records;
drop table if exists field_verifications;
drop table if exists file_objects;
drop table if exists step_submission_versions;
drop table if exists step_drafts;
drop table if exists application_step_states;
drop table if exists applications;
drop table if exists workflow_steps;
drop table if exists form_versions;
drop table if exists forms;
drop table if exists event_role_assignments;
drop table if exists events;
drop table if exists org_settings;
drop table if exists applicant_profiles;
drop table if exists users;
drop function if exists set_updated_at;
drop extension if exists citext;
