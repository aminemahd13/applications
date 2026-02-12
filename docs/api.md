# API Documentation

The backend is built with **NestJS** and follows a modular architecture.

## Global Architecture

- **Global Prefix**: `/api/v1`
- **Guards**: 
    - `ThrottlerGuard`: Rate limiting (60 req/min).
    - `CsrfGuard`: Protects non-GET requests.
- **Interceptors**:
    - `EventScopeInterceptor`: Automatically binds `eventId` to the request context for multi-tenant isolation.
- **Filters**:
    - `ZodExceptionFilter`: Transforms Zod validation errors into user-friendly 400 responses.

## Authentication

We use **Session-based Authentication** backed by Redis.

- **Login**: `POST /auth/login` → Sets `connect.sid` cookie.
- **Session Store**: Redis (`sess:` prefix).
- **CSRF**: Double-submit cookie pattern.
    - `GET /auth/csrf` sets `csrf_token` cookie.
    - Client must send `x-csrf-token` header matching the cookie.
    - `CsrfGuard` validates this on all mutating requests.

## Key Modules

### 1. Events Module (`/events`)
Handles event creation, public listings, and microsite fetching.
- **Public**: `GET /events/public` (List), `GET /events/public/:slug` (Detail).
- **Staff**: CRUD operations for events (requires `GlobalAdmin` or `Organizer` role).

### 2. Applications Module (`/applications`)
Manages the application lifecycle.
- **My Application**: `GET /applications/me/:eventId` (Student view).
- **Steps**: Handles `draft` saving and `submission` of specific workflow steps.
- **Review**: Reviewers fetch applications via `/applications/:id/review`.

### 3. Workflow Module (`/workflow`)
Defines the structure of an event's application process.
- **Steps**: Configurable units (e.g., "Personal Info").
- **Locking**: Steps can be locked based on deadlines or dependencies.

### 4. Microsites Module (`/microsites`)
A headless CMS for event pages.
- **Structure**: `Microsite` -> `Pages` -> `Blocks`.
- **Versioning**: Content is versioned. `published_version` points to the live version.

## Infrastructure Services

### Prisma Service
Extends `PrismaClient`. Handles DB connection and lifecycle.

### Storage Service
Wraps AWS S3 / MinIO.
- **Buckets**: `uploads` (default).
- **Key Strategy**: UUID-based keys to prevent collisions.
- **Presigned URLs**: Used for secure uploads and private file access.

### Email Service
Wraps `Nodemailer`.
- Uses Handlebars templates for emails (Welcome, Reset Password, Invite).
- Support for `SMTP` transport.

## Queues (Redis)

We use **BullMQ** (or simple Redis lists) for background tasks if needed (currently minimal, mostly direct execution).
- **Audit Logs**: Stored asynchronously to prevent blocking main request flow.
