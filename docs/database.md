# Database Documentation

The platform uses **PostgreSQL** as the primary datastore, managed by **Prisma ORM**.

## Schema Overview

The schema is defined in `packages/db/prisma/schema.prisma`. It is normalized and heavily relational.

### Core Domains

#### 1. Identity & Access
- **`users`**: The central identity table. Supports Email/Password auth.
    - `is_global_admin`: Boolean flag for superusers.
- **`password_reset_tokens`** / **`email_verification_tokens`**: Security tokens.

#### 2. Events & Organization
- **`org_settings`**: Singleton table for platform-wide configuration (branding, security policy).
- **`events`**: The core entity. Defines dates, venue, and config JSONs (`decision_config`, `checkin_config`).
- **`event_role_assignments`**: Links Users to Events with specific roles (`reviewer`, `checkin_staff`).

#### 3. Application Lifecycle
- **`applications`**: Represents a user's application to an event.
- **`workflow_steps`**: Configurable steps for an event (e.g., "Personal Info", "Essay").
- **`step_submission_versions`**: Immutable snapshots of user answers for a step.
- **`step_drafts`**: Mutable work-in-progress answers.
- **`review_records`**: Reviewer evaluations of a submission.

#### 4. Microsite (CMS)
- **`microsites`**: 1:1 relation with Events. Stores site-wide settings.
- **`microsite_pages`**: Pages belonging to a microsite (e.g., "Home", "Schedule").
- **`microsite_versions`**: Version control for the entire site configuration.

#### 5. Operations
- **`audit_logs`**: Immutable record of all critical actions.
- **`messages`**: Broadcasts or direct messages sent to users.
- **`file_objects`**: Metadata for uploaded files (S3 keys, mime types).
- **`checkin_records`**: Logs of QR code scans at the event venue.

## Migrations Workflow

Use Prisma Migrate as the single source of truth.

1.  **Edit Schema**: Modify `schema.prisma`.
2.  **Generate Migration**:
    ```bash
    pnpm db:migrate:dev --name add_new_field
    ```
    This creates a SQL file in `packages/db/prisma/migrations`.
3.  **Apply Migration**: This happens automatically with the above command for dev. In production, use `pnpm db:migrate:deploy`.

### Legacy Baseline Note

- `infra/migrations` contains historical SQL migrations from an older dbmate-based flow.
- Databases created from that old flow already have app tables (`users`, `events`, `file_objects`, etc.) before Prisma migration `20260205173053_add_expires_at_to_files`.
- The API startup script now auto-detects that shape and resolves that Prisma migration as applied so `prisma migrate deploy` can continue safely.
- Do not run `infra/migrations` for new environments; use Prisma migrations in `packages/db/prisma/migrations`.

## Seeding

The seed script (`packages/db/prisma/seed.ts`) populates the database with:
- Global Admin user.
- Sample Events (`mmc`, `olympiad-2026`).
- Sample Applications in various states.
- Workflow Steps and Forms.

To run seeds:
```bash
pnpm db:seed
```

## Important Design Decisions

- **JSON Columns**: Used for flexible configuration (`audit_logs.meta`, `events.decision_config`, `forms.schema`).
- **UUIDs**: All primary keys are UUIDs for security and scalability.
- **Timestamps**: Most tables have `created_at` and `updated_at`.
- **Soft Deletes**: Not universally applied; be careful with deletions (relations usually `onDelete: Cascade` or `NoAction`).
