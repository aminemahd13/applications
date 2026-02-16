const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '..', '..', '.env.test');
const E2E_BOOTSTRAP_TIMEOUT_MS = 45_000;
const E2E_DB_STEP_TIMEOUT_MS = 15_000;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function forceIpv4Localhost(urlValue) {
  if (!urlValue) return urlValue;
  try {
    const parsed = new URL(urlValue);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    }
    return urlValue;
  } catch {
    return urlValue;
  }
}

loadEnvFile(envPath);
process.env.DATABASE_URL = forceIpv4Localhost(process.env.DATABASE_URL);
process.env.REDIS_URL = forceIpv4Localhost(process.env.REDIS_URL);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
// Work around local Prisma engine startup hangs observed in this environment.
process.env.RUST_LOG = 'info';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

async function ensureE2ESchema() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await withTimeout(prisma.$connect(), E2E_DB_STEP_TIMEOUT_MS, 'prisma connect');
    try {
      await withTimeout(
        prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "citext";'),
        E2E_DB_STEP_TIMEOUT_MS,
        'create citext extension',
      );
    } catch {
      // Extension may already exist or be restricted in some test environments.
    }

    await withTimeout(
      prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email citext NOT NULL,
        password_hash text NOT NULL,
        email_verified_at timestamptz NULL,
        is_disabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        is_global_admin boolean NOT NULL DEFAULT false
      );
    `),
      E2E_DB_STEP_TIMEOUT_MS,
      'create users table',
    );
    await withTimeout(
      prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);',
      ),
      E2E_DB_STEP_TIMEOUT_MS,
      'create users email index',
    );
    await withTimeout(
      prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY,
        event_id uuid NULL,
        actor_user_id uuid NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        before jsonb NULL,
        after jsonb NULL,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        request_id text NULL,
        ip_address text NULL,
        user_agent text NULL,
        redaction_applied boolean NOT NULL DEFAULT false
      );
    `),
      E2E_DB_STEP_TIMEOUT_MS,
      'create audit_logs table',
    );
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  await withTimeout(
    ensureE2ESchema(),
    E2E_BOOTSTRAP_TIMEOUT_MS,
    'ensureE2ESchema',
  );
  const passthroughArgs = process.argv.slice(2);
  // Delegate to Jest CLI with the existing config
  require('jest').run([
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    '--detectOpenHandles',
    '--forceExit',
    ...passthroughArgs,
  ]);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
