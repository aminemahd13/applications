# Development Guide

This guide covers everything you need to know to set up your local development environment and start contributing to the Math&Maroc Event Platform.

## Prerequisites

- **Node.js**: v18 or higher (LTS recommended).
- **pnpm**: v9 or higher (`npm install -g pnpm`).
- **Docker**: Desktop or Engine 20.10+ (for running Postgres, Redis, MinIO).
- **VS Code** (Recommended): With ESLint and Prettier plugins.

## 1. Local Setup

### Step 1: Clone and Install

```bash
git clone <repo-url>
cd <repo-folder>
pnpm install
```

### Step 2: Environment Configuration

Copy the example environment file and configure it.

```bash
cp .env.example .env
# Also copy for apps if they have specific .env files (usually monorepo root .env is sufficient for shared config)
```

### Step 3: Start Infrastructure

We use Docker Compose to run the database, cache, and object storage.

```bash
docker-compose up -d postgres redis minio
```

### Step 4: Initialize Config

Run the following commands to set up the database and generate clients.

```bash
# 1. Apply Migrations
pnpm db:migrate

# 2. Generate Prisma Client
pnpm db:generate

# 3. Seed Database (Optional, for dummy data)
pnpm db:seed
```

### Step 5: Start Applications

We use Turbo to run both the API and Web apps in parallel.

```bash
pnpm dev
# OR specific apps:
pnpm --filter api dev
pnpm --filter web dev
```

- **Frontend**: `http://localhost:3000`
- **API**: `http://localhost:3001`
- **MinIO Console**: `http://localhost:9001`

## 2. Common Workflows

### Database Changes

We use **Prisma** for schema management and **dbmate** (or Prisma Migrate) for migrations.

1.  **Modify Schema**: Edit `packages/db/prisma/schema.prisma`.
2.  **Create Migration**:
    ```bash
    pnpm db:migrate:dev --name <descriptive-name>
    ```
3.  **Update Client**:
    ```bash
    pnpm db:generate
    ```

### Adding a New Package

1.  Create a folder in `packages/<name>`.
2.  Add `package.json` with `@event-platform/<name>` as name.
3.  Add it to dependencies of apps using:
    ```bash
    pnpm add @event-platform/<name> --filter api
    ```

## 3. Testing

### Run All Tests

```bash
pnpm test
```

### Run Specific Tests

```bash
# API Unit Tests
pnpm --filter api test

# Watch Mode
pnpm --filter api test:watch
```

## 4. Linting & Formatting

We use **ESLint** and **Prettier**.

```bash
# Lint everything
pnpm lint

# Fix auto-fixable issues
pnpm lint --fix

# Format code
pnpm format
```

## 5. Debugging

### VS Code

Launch configurations are provided in `.vscode/launch.json`. You can attach the debugger to:
- **API**: Select "Debug NestJS API".
- **Web**: Select "Debug Next.js".

### Inspecting Database

You can use Prisma Studio:

```bash
pnpm db:studio
```

Opens a web interface at `http://localhost:5555`.

## 6. Accessing Local Services

| Service | internal URL | Localhost URL | Credentials (Default) |
|---------|--------------|---------------|-----------------------|
| **Postgres** | `postgres:5432` | `localhost:5432` | `postgres` / `postgres` |
| **Redis** | `redis:6379` | `localhost:6379` | (none) |
| **MinIO API** | `minio:9000` | `localhost:9000` | `minioadmin` / `minioadmin` |
| **MinIO UI** | `minio:9001` | `localhost:9001` | `minioadmin` / `minioadmin` |

## Troubleshooting

- **"Prisma Client not found"**: Run `pnpm db:generate`.
- **"Connection Refused"**: Ensure Docker containers are running (`docker ps`).
- **"TypeScript errors in shared packages"**: If you changed a shared package, you might need to rebuild it if it's not in watch mode.
