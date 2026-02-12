# 1) Deliverables and module boundaries

## 1.1 What the agents must ship (MVP+ that is production-correct)

1. **Auth + Accounts**

   * Email/password, email verification, password reset, session management, rate limits.
2. **Event Directory + Public Microsites**

   * `/events` directory, `/events/{slug}` microsites, page builder with draft/publish/version history/rollback.
3. **Workflow Engine (Steps)**

   * Step unlocking policies: submit-to-open, approval-to-open, date-based, manual, and after-decision-accepted.
   * Immutable submissions + versioning.
   * Needs-info reopening specific fields (including file fields).
4. **Forms Engine**

   * Versioned forms, validation, conditional logic, file fields as questions.
5. **File Storage**

   * Presigned uploads to S3/MinIO, finalize, optional antivirus hook, signed downloads, retention deletion.
6. **Review System**

   * Step review queue, field-level verifications, outcomes, request info, reject behavior, patches.
7. **Decisions + Confirmation + QR**

   * Decision staging + publish gate, confirmation step, seat management (optional), QR generation rules.
8. **Check-in Operations**

   * QR scanner + manual lookup, minimal data, audit, undo by organizer.
9. **Comms**

   * In-app inbox, announcements, segmentation, email sending logs.
10. **Global Admin**

* Event creation, role assignment, system settings, cross-event analytics, audit viewer, global search, impersonation (read-only).

## 1.2 Non-negotiable invariants

* **Submissions are immutable snapshots** (never overwritten).
* **Files are answers inside step forms** (no separate “document center” flow).
* **Every privileged action is audited** (who/what/when + before/after).
* **Event isolation is enforced server-side** (every query must include event scope checks).
* **Decision publish and check-in are idempotent** (safe against double clicks/retries).

---

# 2) Recommended stack and repo layout (agents can swap, must keep semantics)

## 2.1 Stack (safe defaults)

* Frontend: **Next.js** (or equivalent SPA), Tailwind + component library
* API: **NestJS / Fastify / Express** (or equivalent), OpenAPI
* DB: **PostgreSQL**
* Cache/queue: **Redis**
* Files: **S3-compatible** (MinIO)
* Email: SMTP via worker queue

## 2.2 Monorepo layout

```
/apps
  /web            # public + applicant + staff UI (role-based)
  /api            # REST API (OpenAPI)
/packages
  /shared         # types, validators, DSL parser
  /ui             # design system components
  /schemas        # JSON schemas for forms + blocks
/infra
  docker-compose.yml
  migrations/
  seed/
```

---

# 3) Database schema (implementation-grade)

Use Postgres. Below is the **minimum required schema** (you can expand). Keep constraints and indexes.

## 3.1 Core tables (DDL skeleton)

```sql
-- USERS
create table users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
```

---

# 4) Permission model and matrix (with multi-role union rule)

## 4.1 Union rule + safety exceptions

* **Union:** if user has multiple roles for an event, they get the union of allowed actions.
* **Safety exceptions (hard overrides):**

  1. **Global impersonation**: GA only.
  2. **System settings**: GA only.
  3. **Check-in endpoints** always return **minimal data** even if caller has reviewer role. (If they want full data, they must use reviewer/organizer endpoints/UI.)

## 4.2 Permissions dictionary (atomic actions)

Define actions as strings; store in code as constants for audit and RBAC. Example set:

### Global admin actions

* `admin.events.create|update|archive`
* `admin.roles.assign|revoke`
* `admin.settings.update`
* `admin.audit.view`
* `admin.search.global`
* `admin.impersonate.readonly`

### Event config

* `event.workflow.manage`
* `event.forms.manage_draft`
* `event.forms.publish`
* `event.microsite.manage_draft`
* `event.microsite.publish`
* `event.settings.update` (event metadata, deadlines, seat config)

### Applications and review

* `app.list.view`
* `app.detail.view`
* `app.tags.manage`
* `app.notes.manage`
* `step.review.approve|reject|request_info`
* `step.patch.create|deactivate`
* `step.override.unlock` (manual unlock)
* `decision.draft.set`
* `decision.publish`

### Communications

* `msg.announce.create`
* `msg.announce.send`
* `msg.segment.use`
* `msg.logs.view`

### Check-in

* `checkin.scan`
* `checkin.manual_lookup`
* `checkin.undo` (organizer only)
* `checkin.dashboard.view`

### Applicant (self)

* `self.profile.update`
* `self.application.create`
* `self.step.draft.save`
* `self.step.submit`
* `self.needs_info.respond`
* `self.qr.view`

## 4.3 Permission matrix (role → allowed actions)

Legend: ✅ allowed, ⚠️ allowed with constraints, ❌ not allowed

### Global scope

| Action                     | GA | ORG | REV | CHK | APP |
| -------------------------- | -: | --: | --: | --: | --: |
| admin.events.*             |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |
| admin.roles.*              |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |
| admin.settings.update      |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |
| admin.audit.view           |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |
| admin.search.global        |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |
| admin.impersonate.readonly |  ✅ |   ❌ |   ❌ |   ❌ |   ❌ |

### Event-scoped configuration

| Action                       | GA |                   ORG | REV | CHK | APP |
| ---------------------------- | -: | --------------------: | --: | --: | --: |
| event.settings.update        |  ✅ |                     ✅ |   ❌ |   ❌ |   ❌ |
| event.workflow.manage        |  ✅ |                     ✅ |   ❌ |   ❌ |   ❌ |
| event.forms.manage_draft     |  ✅ |                     ✅ |   ❌ |   ❌ |   ❌ |
| event.forms.publish          |  ✅ |                     ✅ |   ❌ |   ❌ |   ❌ |
| event.microsite.manage_draft |  ✅ | ✅ (or content_editor) |   ❌ |   ❌ |   ❌ |
| event.microsite.publish      |  ✅ | ✅ (or content_editor) |   ❌ |   ❌ |   ❌ |

### Applications + review

| Action                    | GA | ORG |                               REV |                  CHK | APP |
| ------------------------- | -: | --: | --------------------------------: | -------------------: | --: |
| app.list.view             |  ✅ |   ✅ |                                 ✅ |                    ❌ |   ❌ |
| app.detail.view (full)    |  ✅ |   ✅ |                                 ✅ |                    ❌ |   ❌ |
| app.detail.view (minimal) |  ✅ |   ✅ |                                 ✅ | ✅ (check-in UI only) |   ❌ |
| app.tags.manage           |  ✅ |   ✅ |                      ✅ (optional) |                    ❌ |   ❌ |
| app.notes.manage          |  ✅ |   ✅ |                 ✅ (internal only) |                    ❌ |   ❌ |
| step.review.*             |  ✅ |   ✅ |                                 ✅ |                    ❌ |   ❌ |
| step.patch.create         |  ✅ |   ✅ | ⚠️ (event toggle: direct/propose) |                    ❌ |   ❌ |
| step.override.unlock      |  ✅ |   ✅ |                                 ❌ |                    ❌ |   ❌ |
| decision.draft.set        |  ✅ |   ✅ |                                 ❌ |                    ❌ |   ❌ |
| decision.publish          |  ✅ |   ✅ |                                 ❌ |                    ❌ |   ❌ |

### Communications

| Action              | GA | ORG |          REV | CHK | APP |
| ------------------- | -: | --: | -----------: | --: | --: |
| msg.announce.create |  ✅ |   ✅ | ✅ (optional) |   ❌ |   ❌ |
| msg.announce.send   |  ✅ |   ✅ |            ❌ |   ❌ |   ❌ |
| msg.segment.use     |  ✅ |   ✅ | ✅ (optional) |   ❌ |   ❌ |
| msg.logs.view       |  ✅ |   ✅ |            ✅ |   ❌ |   ❌ |

### Check-in

| Action                | GA | ORG |                                  REV | CHK | APP |
| --------------------- | -: | --: | -----------------------------------: | --: | --: |
| checkin.scan          |  ✅ |   ✅ | ✅ (if they also have CHK or allowed) |   ✅ |   ❌ |
| checkin.manual_lookup |  ✅ |   ✅ |                       ✅ (if allowed) |   ✅ |   ❌ |
| checkin.undo          |  ✅ |   ✅ |                                    ❌ |   ❌ |   ❌ |
| self.qr.view          |  ❌ |   ❌ |                                    ❌ |   ❌ |   ✅ |

---

# 5) Workflow engine: definitive state machine

## 5.1 Step unlock policies (authoritative)

A step has exactly one unlock policy:

* `AUTO_AFTER_PREV_SUBMITTED`
* `AFTER_PREV_APPROVED`
* `DATE_BASED` (requires `unlock_at`)
* `ADMIN_MANUAL` (per-applicant manual unlock flag)
* `AFTER_DECISION_ACCEPTED` (special; requires `decision_status=ACCEPTED` and optionally `decision_published_at`)

## 5.2 Step statuses

* `LOCKED`
* `UNLOCKED_DRAFT`
* `READY_TO_SUBMIT` (derived, not necessarily stored)
* `SUBMITTED`
* `REVISION_REQUESTED`
* `APPROVED`
* `REJECTED_FINAL`
* `REJECTED_RESUBMITTABLE`

## 5.3 Transition table (canonical)

Applicant transitions:

* LOCKED → UNLOCKED_DRAFT (engine unlock)
* UNLOCKED_DRAFT → SUBMITTED (submit creates new immutable version)
* REVISION_REQUESTED → SUBMITTED (resubmit creates new version)
  Staff transitions:
* SUBMITTED → APPROVED
* SUBMITTED → REVISION_REQUESTED (creates needs-info)
* SUBMITTED → REJECTED_FINAL or REJECTED_RESUBMITTABLE
* REJECTED_RESUBMITTABLE → UNLOCKED_DRAFT (reopen)

Strict gating behavior:

* If step i is prerequisite for step j and i becomes not approved (revision requested), then **lock step j and all dependents** (preserve drafts but block submit).

## 5.4 Unlock computation algorithm (must be deterministic)

For each application, recompute unlockable steps when:

* a submission is created
* a review outcome changes
* decision published/changed
* manual unlock toggled
* date-based unlock time passes (worker or on request)

Pseudo:

```text
for step in steps ordered:
  if step is first:
    unlocked = now within application window OR staff override
  else:
    unlocked = check step.unlock_policy against previous step state/decision/date/manual flag

  if strict_gating and prerequisite is not satisfied:
    force LOCKED and prevent submit

  if unlocked and current status == LOCKED:
    set UNLOCKED_DRAFT (or keep SUBMITTED/APPROVED/etc)
```

---

# 6) Forms engine specification (versioned, conditional, file fields)

## 6.1 FormVersion JSON contract (agents must implement exactly)

```json
{
  "formId": "uuid",
  "version": 3,
  "title": "Step 2: Upload exam paper",
  "sections": [
    {
      "id": "sec_upload",
      "title": "Upload",
      "description": "Upload your paper as a PDF.",
      "fields": [
        {
          "fieldId": "exam_paper",
          "type": "file_upload",
          "label": "Exam paper (PDF)",
          "required": true,
          "constraints": {
            "maxFiles": 1,
            "maxSizeBytes": 20000000,
            "allowedMimeTypes": ["application/pdf"],
            "sensitivity": "normal"
          }
        }
      ]
    }
  ],
  "conditions": {
    "language": "simple-dsl-v1"
  }
}
```

## 6.2 Conditional logic DSL (simple and safe)

Supported ops:

* `equals(fieldId, value)`
* `exists(fieldId)`
* `and(a,b,...)`, `or(...)`, `not(x)`

Use to drive:

* `visibilityWhen`
* `requiredWhen`

Example:

```json
{
  "fieldId":"guardian_consent",
  "type":"file_upload",
  "label":"Guardian consent (minors)",
  "requiredWhen": {"and":[{"exists":"birthdate"},{"ltAgeYears":{"field":"birthdate","years":18}}]}
}
```

If you don’t want age helper, compute age client-side and store a derived boolean field.

## 6.3 File fields as answers (no separate document flow)

* File upload field answer = array of `fileObjectId`.
* On submit, snapshot stores `fileObjectIds` in `answers_snapshot`.
* Verification is stored per **submission version + fieldId**.

---

# 7) File upload and download (secure pipeline)

## 7.1 Upload flow (presigned, correct)

1. `POST /uploads/presign` with `{eventId, applicationId, stepId, fieldId, filename, mimeType, size}`
2. Server validates:

   * user owns application and step unlocked
   * field exists and is file_upload
   * constraints satisfied (type/size/count)
3. Server creates `file_objects` row with `virus_scan_status=pending`, returns:

   * `fileObjectId`
   * presigned PUT URL (S3)
4. Client uploads to S3 directly.
5. Client calls `POST /uploads/{fileObjectId}/finalize`
6. Server checks object exists + size matches; sets status to `pending|clean` depending on scanning policy.

## 7.2 Download flow (signed URL + authorization)

* `GET /files/{fileObjectId}/download`

  * Authorize based on:

    * event scope
    * role and endpoint namespace
    * sensitivity: sensitive requires ORG/REV/GA
* Return short-lived signed GET URL.

## 7.3 Virus scanning (optional but recommended)

* Worker picks finalized files:

  * scan → if flagged, set `virus_scan_status=flagged`
  * block step submission if flagged (configurable)

## 7.4 Retention deletion

* Worker runs daily:

  * delete sensitive files after `event.end_at + X days` (from event/org retention config)
  * record audit

---

# 8) Review system (step + field verification)

## 8.1 Review outcomes

* APPROVE (step becomes APPROVED; unlock dependents if policy requires approval)
* REQUEST_INFO (creates needs-info, step becomes REVISION_REQUESTED)
* REJECT_FINAL (step becomes REJECTED_FINAL; block application)
* REJECT_RESUBMITTABLE (step becomes REJECTED_RESUBMITTABLE; reopen)

## 8.2 “Approve step” rule (must be enforced)

A step submission can be approved only if:

* all required fields are present and valid
* all required file fields are **VERIFIED** (not PENDING/REJECTED)
* no open needs-info for this step

## 8.3 Needs-info request (reopen exact fields)

* Request includes `target_field_ids`
* Applicant UI:

  * shows only those fields as editable
  * everything else read-only (previous snapshot visible)
* Applicant resubmits → creates new submission version (v+1)

## 8.4 Staff patches (AdminChangePatch)

* Patches do not modify snapshots.
* EffectiveData = apply active patches to latest snapshot for display/export.
* Patch ops allowed: `set`, `normalize`, `annotate`.
* Every patch requires reason and audit entry.
* If patch is applicant-visible: show “Edited by staff (reason)” banner in applicant view.

---

# 9) Decisions, confirmation, QR, and seat management

## 9.1 Decision staging and publish

* Staff sets `decision_draft` for many apps (bulk).
* Publish gate:

  * shows counts by decision type
  * shows message preview
  * requires idempotency key
* On publish:

  * `decision_status` set
  * `decision_published_at` set
  * applicant gets inbox + email
  * if ACCEPTED → confirmation step unlocks (policy `AFTER_DECISION_ACCEPTED`)

## 9.2 Confirmation as a step

Confirmation step is a normal form submission, typical fields:

* confirm checkbox
* attendance days
* dietary/accommodation
* code of conduct consent
* photo/video consent

On confirmation submit:

* `attendance_records.confirmed_at` set
* `attendance_records.confirmation_submission_version_id` set
* QR eligibility may become true.

## 9.3 Seat management (optional)

Event config:

* capacity limit
* confirmation deadline
* auto-forfeit on missed confirmation
* auto-promote from waitlist

Worker job:

* at deadline: mark unconfirmed accepted as FORFEITED and promote waitlist if enabled.

---

# 10) Check-in system (fast, minimal data, audited)

## 10.1 QR token

* Generate random 128-bit token.
* Store hash in `attendance_records.qr_token_hash`.
* QR payload: `{eventId, token}` or signed JWT.

## 10.2 Check-in eligibility

Default: must be

* decision_status == ACCEPTED
* confirmed_at is not null
* not forfeited/canceled
  Optional: require onboarding steps approved.

## 10.3 Scanner endpoint contract

`POST /api/events/{eventId}/checkin/scan`
Request: `{ token }`
Response:

* Success: `{ displayName, decisionStatus, confirmedAt, checkedInAt, badgeHint? }`
* Fail: `{ reason, hint }`
  Reasons must be explicit:
* invalid_token, wrong_event, not_accepted, not_confirmed, already_checked_in, forfeited, outside_window

## 10.4 Manual lookup

Search fields: name/email/phone (masked display).
Return minimal identity + eligibility + check-in status.

## 10.5 Undo check-in

Organizer-only:

* requires reason
* creates audit + checkin_record “undo”

---

# 11) Communications + Inbox + Segmentation

## 11.1 Message types

* Announcement (broadcast)
* Action-required (needs-info)
* Decision
* Reminder
  All messages create:
* inbox entry (message_recipients)
* optional email (queued)

## 11.2 Segmentation DSL (safe and deterministic)

Segment definition JSON:

```json
{
  "and": [
    {"eq": ["decision_status", "ACCEPTED"]},
    {"eq": ["attendance.confirmed", false]},
    {"eq": ["current_step_index", 5]}
  ]
}
```

Supported operators:

* `eq`, `neq`, `in`, `not_in`
* `has_tag`, `missing_field_verification(fieldId)`
* `step_status(stepIndex, status)`
* `date_before`, `date_after`
* boolean `and/or/not`

Implementation: convert to SQL WHERE clauses with parameter binding.

## 11.3 Announcement sending safeguards

* Always preview recipient count.
* Always store campaign snapshot (segment, count, creator, time).
* Idempotency key for send.
* Delivery logs per recipient.

---

# 12) Public site + page builder (complete)

## 12.1 Directory

* Filters: open/upcoming/archived + date range + format + tags
* Cards: deadline badge, CTA state:

  * Apply / View my application / Closed / Archived

## 12.2 Microsite builder

* Pages: main + subpages
* Draft/publish/version history/rollback
* Draft preview share link with token + expiry

## 12.3 Block schema (minimum required)

Each block:

```json
{ "id":"b1", "type":"hero", "props":{...}, "visibilityRules":{...} }
```

Mandatory blocks:

* hero (smart CTA)
* event_facts
* rich_section
* eligibility
* timeline
* faq
* team
* sponsors
* resources_downloads
* results_archive

Visibility rules operators:

* before_deadline, after_deadline
* logged_in, has_applied
* decision_is_accepted (for private logistics pages)

---

# 13) UI/UX spec (beautiful and consistent)

## 13.1 Design system rules

* 8pt spacing, consistent radii (12–16px), soft shadows, neutral background
* Status colors only for semantic states (success/warn/error)
* Tables with sticky header, fast filters, saved views
* Every screen has:

  * clear primary CTA
  * explicit empty state with instructions
  * skeleton loading states

## 13.2 Applicant UI (screens)

1. **My Applications**

   * event cards, progress stepper, “Next action” button, deadlines
2. **Application Workspace**

   * left: step timeline
   * top: next action banner
   * center: current step details
   * bottom: submission history (versions)
3. **Step Form**

   * autosave drafts, clear validation, upload widget with constraints
4. **Inbox**

   * unified across events, action buttons (open step / confirm)
5. **QR Screen**

   * QR + fallback code + status label + instructions

## 13.3 Staff UI (screens)

### Organizer

* Overview dashboard: funnel by step + queues + check-in widget
* Applications table: filters, bulk actions, exports
* Application detail: Steps tab (versions/verification/needs-info), Decisions tab, Messages tab, Audit tab
* Workflow builder: step list, policy config, validation warnings
* Form builder: drag fields, conditional rules, publish
* Microsite builder: blocks + preview + publish
* Check-in dashboard: counters + scanner link + issues queue

### Reviewer

* Review queue: step-based filtering
* Review screen: answers left, verification/actions right, approve/request info/reject, patch (if enabled)

### Check-in staff

* Full-screen scanner + manual search + recent scans (minimal info only)

### Global admin

* Events list + KPIs
* Role assignment UI
* Audit viewer
* System settings UI
* Global search by email/name
* Read-only impersonation with watermark

---

# 14) API surface (complete list you should implement)

## 14.1 Auth

* POST /auth/signup, /auth/login, /auth/logout
* POST /auth/verify-email
* POST /auth/reset/request, /auth/reset/confirm
* GET /auth/sessions, POST /auth/sessions/revoke

## 14.2 Public

* GET /public/events
* GET /public/events/{slug}
* GET /public/events/{slug}/pages/{pageSlug}

## 14.3 Applicant

* GET /applicant/profile, PUT /applicant/profile
* POST /applicant/events/{eventId}/application (create if missing)
* GET /applicant/events/{eventId}/application
* PUT /applicant/application/{appId}/steps/{stepId}/draft
* POST /applicant/application/{appId}/steps/{stepId}/submit (idempotent)
* POST /applicant/uploads/presign
* POST /applicant/uploads/{fileObjectId}/finalize
* GET /applicant/inbox, POST /applicant/messages/{id}/read
* GET /applicant/application/{appId}/qr
* POST /applicant/application/{appId}/qr/regenerate (optional, rate-limited)

## 14.4 Reviewer (event scoped)

* GET /events/{eventId}/reviewer/queue
* GET /events/{eventId}/reviewer/submissions/{submissionVersionId}
* POST /events/{eventId}/reviewer/submissions/{submissionVersionId}/verify-field
* POST /events/{eventId}/reviewer/submissions/{submissionVersionId}/request-info
* POST /events/{eventId}/reviewer/submissions/{submissionVersionId}/approve
* POST /events/{eventId}/reviewer/submissions/{submissionVersionId}/reject
* POST /events/{eventId}/reviewer/patches (if allowed)

## 14.5 Organizer (event scoped)

* GET/PUT /events/{eventId}/organizer/event-settings
* GET/PUT /events/{eventId}/organizer/workflow
* GET/PUT /events/{eventId}/organizer/forms/{formId}/draft
* POST /events/{eventId}/organizer/forms/{formId}/publish
* GET /events/{eventId}/organizer/applications
* GET /events/{eventId}/organizer/applications/{appId}
* POST /events/{eventId}/organizer/decisions/draft-bulk
* POST /events/{eventId}/organizer/decisions/publish (idempotent)
* POST /events/{eventId}/organizer/announcements (segment + schedule)
* GET /events/{eventId}/organizer/checkin/dashboard
* POST /events/{eventId}/organizer/checkin/undo

## 14.6 Check-in (event scoped, minimal)

* POST /events/{eventId}/checkin/scan
* GET /events/{eventId}/checkin/recent
* GET /events/{eventId}/checkin/search?q=...

## 14.7 Global admin

* POST /admin/events, PUT /admin/events/{eventId}
* POST /admin/events/{eventId}/roles/assign, /roles/revoke
* GET /admin/audit
* GET /admin/search
* GET/PUT /admin/settings
* POST /admin/impersonate/start (read-only), POST /admin/impersonate/stop

---

# 15) Background jobs (agents must implement)

1. Email worker: send queued emails, retry with backoff, mark failed.
2. Scheduled campaigns: send announcements at scheduled time.
3. Confirmation deadline enforcement (optional seat mgmt).
4. Date-based step unlocker (optional; also recompute on page load).
5. Retention deletion of sensitive files.
6. Virus scan pipeline (optional).

---

# 16) Security checklist (must pass)

* Rate limits: login, presign, finalize, submit, decision publish, scan.
* Signed URLs: short TTL, scoped by file id, authorize each request.
* Audit logs: record actor, scope, action, before/after, idempotency key.
* CSRF protection if cookie sessions.
* Strict event scoping in every event endpoint.
* Minimal check-in API returns no sensitive data.

---

# 17) Test plan (agent-ready acceptance suite)

## 17.1 Core flows

1. Step2 unlocks after Step1 submit (AUTO).
2. Step3 unlocks only after Step2 approved (AFTER_APPROVED).
3. Needs-info reopens exactly targeted fields; resubmission creates v+1.
4. File constraints enforced on server (type/size/count).
5. Approve step requires required file fields VERIFIED.
6. Decision publish gate sends messages + unlocks confirmation step for accepted.
7. Confirmation submit triggers QR eligibility.
8. Check-in scan rejects not confirmed / not accepted / already checked-in.
9. Check-in staff cannot access file endpoints or full application details.

## 17.2 Idempotency tests

* double submit request → only one submission version created
* double publish decisions → only one publish

## 17.3 Authorization tests

* reviewer cannot edit workflow
* check-in staff cannot see sensitive fields
* organizer cannot access another event data
* GA can access all

---

# 18) Agent execution plan (how to build without ambiguity)

Implement in this order (reduces rework):

1. DB + migrations + seed (org_settings, example event)
2. Auth + RBAC middleware + audit logger
3. Events + role assignment + scoping enforcement
4. Forms (draft + publish) + renderer components
5. Upload pipeline (presign/finalize/download)
6. Workflow engine (step states + unlock algorithm + submit/versioning)
7. Review system (verifications + outcomes + needs-info + patches)
8. Decisions + confirmation + QR
9. Check-in module (minimal endpoints + scanner UI)
10. Messaging (inbox + campaigns + segmentation DSL)
11. Microsite builder + public serving
12. Dashboards polish + analytics widgets
13. Background jobs + retention + operational hardening
14. Full test suite + load test check-in
