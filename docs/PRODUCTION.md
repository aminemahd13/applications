# Production Guide

This guide details how to deploy, secure, and maintain the platform in a production environment.

## Architecture

The production setup uses a **Single-Host Docker Architecture**.

- **Nginx**: Reverse Proxy / Gateway (Ports: 80/443).
- **Web Container**: Next.js (Standalone build).
- **API Container**: NestJS.
- **Postgres Container**: Database.
- **Redis Container**: Cache & Sessions.
- **MinIO Container**: Object Storage (S3 Compatible).

## 1. Deployment Checklist

### Hardware Requirements
- **CPU**: 2+ Cores recommended.
- **RAM**: 4GB+ recommended (Node.js apps + DB can be memory hungry).
- **Disk**: SSD recommended (Database & MinIO storage).

### Environment Variables
Ensure all security-critical variables are changed from defaults.

- `POSTGRES_PASSWORD`: Use a random string.
- `JWT_SECRET`: Use `openssl rand -hex 32`.
- `SESSION_SECRET`: Use `openssl rand -hex 32`.
- `MINIO_ROOT_PASSWORD`: Use a strong password.

## 2. Setting Up

### Step 1: Clone & Configure
Refer to the [README](../README.md#production-configuration) for initial setup.

### Step 2: SSL/TLS (HTTPS)
The provided Nginx config listens on port 80. For HTTPS, you have two options:

**Option A: Let's Encrypt with Certbot (on host)**
1. Install Nginx on the host machine (outside Docker) to handle SSL termination.
2. Proxy traffic from Host Nginx -> Docker Nginx (Port 80).

**Option B: Cloudflare / Load Balancer**
1. Put the server behind Cloudflare.
2. Cloudflare handles SSL.
3. Allow traffic only from Cloudflare IPs to your server's port 80.

## 3. Maintenance

### Backups

**Database (Postgres)**
Create a cron job on the host machine to dump the database.

```bash
# Daily Backup
docker exec -t app-mm-postgres-1 pg_dumpall -c -U postgres > /backups/dump_$(date +%Y-%m-%d).sql
```

**File Storage (MinIO)**
Backup the volume directory mapping (e.g., `./minio_data`).

```bash
tar -czf /backups/files_$(date +%Y-%m-%d).tar.gz ./minio_data
```

### Updates

To update the application code:

1. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

2. **Rebuild Containers**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build
   ```
   *Note: This effectively re-deploys with zero-downtime (rolling update if you have multiple replicas, but with single compose it's a brief restart).*

3. **Run Migrations**:
   Run the migration command inside the API container.
   ```bash
   docker exec -it app-mm-api-1 npx prisma migrate deploy
   ```

## 4. Security Measures

### Network Isolation
The Docker Compose file creates an `internal` network.
- **Postgres, Redis, MinIO** are NOT exposed to the host/internet.
- Only **Nginx** ports are mapped to the host.

### User Permissions
- **API & Web** containers run as non-root users (`nodejs` / `nestjs`).
- **MinIO** runs as a dedicated user (check MinIO docs for advanced non-root setup).

### Rate Limiting
- **Nginx**: Configure `limit_req` in `nginx.conf` if needed.
- **API**: Uses `ThrottlerModule` (default: 60 req/min).

### Headers
Nginx should be configured to send security headers (HSTS, X-Frame-Options, etc.).
*The default `nginx.conf` provided is basic. Consider hardening it.*

## 5. Logs & Monitoring

### View Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

### Health Checks
The API exposes a health check endpoint. You can monitor this with an external uptime service (e.g., UptimeRobot).
- Endpoint: `http://<your-domain>/api/v1/health`
