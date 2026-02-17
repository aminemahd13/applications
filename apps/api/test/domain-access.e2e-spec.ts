import request from 'supertest';
import { App } from 'supertest/types';
import { E2EAppHandle, createE2EApp } from './test-app.factory';

const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const APPLICATION_ID = '00000000-0000-4000-8000-000000000002';

const DOMAIN_ROUTES: Array<{
  domain: string;
  path: string;
}> = [
  { domain: 'auth', path: '/api/v1/auth/me' },
  { domain: 'admin', path: '/api/v1/admin/events' },
  {
    domain: 'applications',
    path: `/api/v1/events/${EVENT_ID}/applications`,
  },
  { domain: 'events', path: '/api/v1/public/events' },
  {
    domain: 'workflow',
    path: `/api/v1/events/${EVENT_ID}/workflow`,
  },
  {
    domain: 'reviews',
    path: `/api/v1/events/${EVENT_ID}/review-queue`,
  },
  {
    domain: 'check-in',
    path: `/api/v1/events/${EVENT_ID}/check-in/stats`,
  },
  {
    domain: 'messages',
    path: `/api/v1/events/${EVENT_ID}/messages`,
  },
  {
    domain: 'microsites',
    path: '/api/v1/microsites/public/nonexistent-event',
  },
  {
    domain: 'applications-detail',
    path: `/api/v1/events/${EVENT_ID}/applications/${APPLICATION_ID}`,
  },
];

describe('Domain Access Baseline (e2e)', () => {
  let appHandle: E2EAppHandle;

  beforeAll(async () => {
    appHandle = await createE2EApp();
  });

  afterAll(async () => {
    await appHandle.close();
  });

  it.each(DOMAIN_ROUTES)(
    '$domain route responds without server error',
    async ({ path }) => {
      const server = appHandle.app.getHttpServer() as App;
      const response = await request(server).get(path);

      expect(response.status).toBeLessThan(500);
    },
  );
});
