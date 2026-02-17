import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { ZodExceptionFilter } from '../common/filters/zod-exception.filter';
import type { NextFunction, Request, Response } from 'express';
import session, { Session, SessionData, Store } from 'express-session';

type RedisStoreConstructor = new (options: {
  client: Redis;
  prefix?: string;
}) => Store;
const { default: RedisStore } = require('connect-redis') as {
  default: RedisStoreConstructor;
};

const IDLE_TTL_MS = 1000 * 60 * 60; // 1 hour idle timeout
const ABSOLUTE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days absolute timeout

export interface AppRuntimeResources {
  close: () => Promise<void>;
}

interface HttpAdapterLike {
  getInstance: <TServer = unknown>() => TServer;
}

interface NestAppWithAdapter {
  getHttpAdapter: () => HttpAdapterLike;
}

interface SessionDataWithMetadata extends SessionData {
  createdAt?: number;
}

type SessionWithMetadata = Session & Partial<SessionDataWithMetadata>;

type RequestWithSession = Request & {
  session?: SessionWithMetadata;
};

// Production environment validation - fail fast on boot
export function validateProductionEnv() {
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

function resolveCorsOrigins() {
  const corsEnv = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN;
  if (!corsEnv) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }
  return corsEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function configureHttpApp(app: INestApplication): AppRuntimeResources {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ZodExceptionFilter());

  // CORS configuration
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token', 'Authorization'],
  });

  // Trust proxy for production (behind Nginx/Cloudflare)
  // Required for secure cookies to work behind reverse proxy
  if (process.env.NODE_ENV === 'production') {
    const adapter = (app as unknown as NestAppWithAdapter).getHttpAdapter();
    adapter
      .getInstance<{ set: (name: string, value: number) => void }>()
      .set('trust proxy', 1);
  }

  // Initialize Redis
  const redisClient = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'sess:',
  });

  // Configure Session with Redis Store
  // - rolling: false -> avoid per-request session writes for anonymous/public traffic
  // - maxAge: 1h -> idle timeout
  // - Absolute TTL is checked via session.createdAt in middleware
  app.use(
    session({
      store: redisStore,
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
  app.use((req: Request, res: Response, next: NextFunction) => {
    const request = req as RequestWithSession;
    const sessionState = request.session;

    if (sessionState) {
      // Set createdAt on first request
      if (typeof sessionState.createdAt !== 'number') {
        sessionState.createdAt = Date.now();
      }

      // Check absolute TTL (14 days)
      const age = Date.now() - sessionState.createdAt;
      if (age > ABSOLUTE_TTL_MS) {
        return sessionState.destroy((err?: unknown) => {
          if (err) console.error('Session destroy error:', err);
          res.clearCookie('sid');
          res.status(401).json({ error: 'Session expired (absolute TTL)' });
        });
      }
    }
    next();
  });

  return {
    close: async () => {
      try {
        await redisClient.quit();
      } catch {
        redisClient.disconnect();
      }
    },
  };
}
