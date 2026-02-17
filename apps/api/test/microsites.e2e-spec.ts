import request from 'supertest';
import { App } from 'supertest/types';
import { E2EAppHandle, createE2EApp } from './test-app.factory';

const EVENT_ID = '00000000-0000-4000-8000-000000000001';

describe('Microsites (e2e)', () => {
  let appHandle: E2EAppHandle;

  beforeAll(async () => {
    appHandle = await createE2EApp();
  });

  afterAll(async () => {
    await appHandle.close();
  });

  it('rejects unauthenticated admin microsite access without 5xx', async () => {
    const server = appHandle.app.getHttpServer() as App;
    const response = await request(server).get(
      `/api/v1/admin/events/${EVENT_ID}/microsite`,
    );

    expect(response.status).toBeLessThan(500);
    expect([401, 403]).toContain(response.status);
  });

  it('returns 404 for unpublished public microsite', async () => {
    const server = appHandle.app.getHttpServer() as App;
    await request(server)
      .get('/api/v1/microsites/public/nonexistent-event')
      .expect(404);
  });

  it('returns 404 for unknown public microsite page', async () => {
    const server = appHandle.app.getHttpServer() as App;
    await request(server)
      .get('/api/v1/microsites/public/nonexistent-event/pages/home')
      .expect(404);
  });

  it('validates microsite asset key input', async () => {
    const server = appHandle.app.getHttpServer() as App;
    await request(server).get('/api/v1/microsites/assets').expect(400);
  });
});
