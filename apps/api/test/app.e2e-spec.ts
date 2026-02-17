import request from 'supertest';
import { App } from 'supertest/types';
import { E2EAppHandle, createE2EApp } from './test-app.factory';

describe('AppController (e2e)', () => {
  let appHandle: E2EAppHandle;

  beforeAll(async () => {
    appHandle = await createE2EApp();
  });

  afterAll(async () => {
    await appHandle.close();
  });

  it('/api/v1/ (GET)', () => {
    const server = appHandle.app.getHttpServer() as App;
    return request(server).get('/api/v1/').expect(200).expect('Hello World!');
  });

  it('/api/v1/auth/csrf (GET) returns token and cookie', async () => {
    const server = appHandle.app.getHttpServer() as App;
    const response = await request(server).get('/api/v1/auth/csrf').expect(200);

    expect(response.body).toHaveProperty('csrfToken');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('csrf_token=')]),
    );
  });
});
