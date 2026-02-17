import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import {
  E2EAppHandle,
  createE2EApp,
  listRegisteredRoutes,
  materializeRoutePath,
} from './test-app.factory';

jest.setTimeout(180000);

describe('Route Smoke (e2e)', () => {
  let appHandle: E2EAppHandle;

  beforeAll(async () => {
    appHandle = await createE2EApp();
  });

  afterAll(async () => {
    await appHandle.close();
  });

  it('registers broad API route coverage', () => {
    const routes = listRegisteredRoutes(appHandle.app);
    expect(routes.length).toBeGreaterThanOrEqual(140);
  });

  it('all registered routes respond without 5xx for baseline requests', async () => {
    const routes = listRegisteredRoutes(appHandle.app);
    const server = appHandle.app.getHttpServer() as App;
    const failures: string[] = [];

    for (const route of routes) {
      const path = materializeRoutePath(route.path);
      let response: Response;

      switch (route.method) {
        case 'GET':
          response = await request(server).get(path);
          break;
        case 'POST':
          response = await request(server).post(path).send({});
          break;
        case 'PUT':
          response = await request(server).put(path).send({});
          break;
        case 'PATCH':
          response = await request(server).patch(path).send({});
          break;
        case 'DELETE':
          response = await request(server).delete(path).send({});
          break;
      }

      if (response.status >= 500) {
        failures.push(`${route.method} ${route.path} -> ${response.status}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
