# Troubleshooting Guide

## Common Issues

### 1. "Connection Refused" (ECONNREFUSED)

**Symptoms**:
- Frontend shows "Network Error".
- API logs show database connection errors.

**Causes**:
- Docker containers are not running.
- Incorrect environment variables (wrong host/port).
- Network isolation (trying to access `localhost` from inside a container).

**Solutions**:
- Run `docker ps` to verify containers are up.
- Check `.env`. For Docker Compose, usage `postgres` as hostname, not `localhost`.
- If running apps locally (outside Docker), use `localhost` and ensure Docker ports are mapped.

### 2. Prisma / Database Errors

**"Table does not exist"**:
- You haven't run migrations.
- Run `pnpm db:migrate`.

**"Unique constraint failed"**:
- You are trying to insert duplicate data (e.g., seeding twice without cleaning).
- Reset DB: `pnpm db:migrate:reset` (Caution: Deletes all data).

**"Prisma Client not initialized"**:
- You added a new model but didn't generate the client.
- Run `pnpm db:generate`.

**"P3009 migrate found failed migrations"**:
- This usually means a migration failed earlier and Prisma blocked new ones.
- If the failed migration is `20260205173053_add_expires_at_to_files`, your DB likely came from historical SQL files in `infra/migrations` (legacy baseline).
- Current API startup auto-resolves that baseline migration when it detects legacy tables, then retries deploy.

**"npm ERR! enoent Could not read package.json: /app/package.json" (while seeding in Docker)**:
- Root workspace metadata is missing in the API runtime image, so `npm run -w packages/db seed` cannot resolve workspaces.
- Rebuild the API image: `docker compose -f docker-compose.prod.yml build api`.
- Run seed again, or use a workspace-independent fallback:
  `docker compose -f docker-compose.prod.yml run --rm api sh -lc "cd packages/db && npm run seed"`.

### 3. Build Errors

**"Type error: Property 'x' does not exist on type 'y'"**:
- You are using an outdated shared package.
- Rebuild shared packages: `pnpm --filter @event-platform/shared build`.
- Restart the TS server in VS Code.

**"Module not found"**:
- Shared package not linked correctly.
- Run `pnpm install` again.

### 4. MinIO / Storage Issues

**"Access Denied"**:
- Check `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in `.env`.
- Ensure the bucket (`uploads`) exists.

**"SignatureDoesNotMatch"**:
- The keys in the API env vars don't match the MinIO container env vars.

## Diagnostic Commands

### Check Logs

```bash
# Docker Compose logs
docker-compose logs -f --tail=50
docker-compose logs -f api
```

### Inspect Database

Connect to the DB via CLI:

```bash
docker exec -it app-mm-postgres-1 psql -U postgres -d event_platform
```

### Clean State

If everything is broken, try a fresh start:

```bash
# Stop containers and remove volumes
docker-compose down -v

# Reinstall dependencies
rm -rf node_modules
pnpm install

# Restart
docker-compose up -d
pnpm db:migrate
pnpm db:seed
```
