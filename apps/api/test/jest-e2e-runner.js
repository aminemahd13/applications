const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '..', '.env.test');

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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envPath);

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

async function ensureE2ESchema() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "citext";');
    await prisma.$executeRawUnsafe(`
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
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);',
    );
    await prisma.$executeRawUnsafe(`
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
    `);
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  await ensureE2ESchema();
  // Delegate to Jest CLI with the existing config
  require('jest').run(['--config', './test/jest-e2e.json']);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
