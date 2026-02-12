import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';

import Redis from 'ioredis';

const session = require('express-session');
// connect-redis v7 exports RedisStore class directly as default

const RedisStore = require('connect-redis').default;

const IDLE_TTL_MS = 1000 * 60 * 60; // 1 hour idle timeout
const ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days absolute timeout

// Production environment validation - fail fast on boot
function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;

  const errors: string[] = [];

  // Required secrets with minimum length
  const secretRequirements = {
    JWT_SECRET: 32,
    SESSION_SECRET: 32,
  };

  for (const [key, minLength] of Object.entries(secretRequirements)) {
    const value = process.env[key];
    if (!value) {
      errors.push(`${key} is required in production`);
    } else if (value.length < minLength) {
      errors.push(`${key} must be at least ${minLength} characters`);
    } else if (
      value.includes('dev_') ||
      value.includes('changeme') ||
      value === 'super-secret'
    ) {
      errors.push(`${key} appears to be a development value`);
    }
  }

  // Required configuration vars
  const requiredVars = ['DATABASE_URL', 'REDIS_URL', 'APP_BASE_URL'];
  for (const key of requiredVars) {
    if (!process.env[key]) {
      errors.push(`${key} is required in production`);
    }
  }

  // Optional but recommended with warnings
  if (!process.env.MINIO_ENDPOINT) {
    console.warn('WARNING: MINIO_ENDPOINT not set; file storage may not work');
  }

  if (errors.length > 0) {
    console.error('Production environment validation failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

async function bootstrap() {
  validateProductionEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ZodExceptionFilter());

  // CORS configuration
  const corsEnv = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN;
  const corsOrigins = corsEnv
    ? corsEnv.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token', 'Authorization'],
  });

  // Trust proxy for production (behind Nginx/Cloudflare)
  // Required for secure cookies to work behind reverse proxy
  if (process.env.NODE_ENV === 'production') {
    (app as any).getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Initialize Redis
  const redisClient = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );

  // Configure Session with Redis Store
  // - rolling: false -> avoid per-request session writes for anonymous/public traffic
  // - maxAge: 1h -> idle timeout
  // - Absolute TTL is checked via session.createdAt in middleware
  app.use(
    session({
      store: new RedisStore({ client: redisClient, prefix: 'sess:' }),
      secret: process.env.SESSION_SECRET || 'dev_secret_unsafe',
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: {
        maxAge: IDLE_TTL_MS, // 1 hour idle timeout
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: process.env.COOKIE_DOMAIN,
      },
      name: 'sid',
    }),
  );

  // Absolute TTL middleware - check session.createdAt
  app.use((req: any, res: any, next: any) => {
    if (req.session) {
      // Set createdAt on first request
      if (!req.session.createdAt) {
        req.session.createdAt = Date.now();
      }

      // Check absolute TTL (14 days)
      const age = Date.now() - req.session.createdAt;
      if (age > ABSOLUTE_TTL_MS) {
        return req.session.destroy((err: any) => {
          if (err) console.error('Session destroy error:', err);
          res.clearCookie('sid');
          res.status(401).json({ error: 'Session expired (absolute TTL)' });
        });
      }
    }
    next();
  });

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
