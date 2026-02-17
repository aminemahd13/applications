import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/bootstrap/configure-app';

type SupportedMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RouteLayer {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
  name?: string;
  handle?: {
    stack?: RouteLayer[];
  };
}

export interface RouteDescriptor {
  method: SupportedMethod;
  path: string;
}

export interface E2EAppHandle {
  app: INestApplication;
  close: () => Promise<void>;
}

const SUPPORTED_METHODS = new Set<SupportedMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

export async function createE2EApp(): Promise<E2EAppHandle> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const runtime = configureHttpApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      await runtime.close();
    },
  };
}

function walkRoutes(stack: RouteLayer[] = []): RouteDescriptor[] {
  const routes: RouteDescriptor[] = [];

  for (const layer of stack) {
    if (layer.route?.path) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods ?? {})
        .filter((method) => layer.route?.methods?.[method] === true)
        .map((method) => method.toUpperCase())
        .filter((method): method is SupportedMethod =>
          SUPPORTED_METHODS.has(method as SupportedMethod),
        );

      for (const method of methods) {
        routes.push({ method, path });
      }
      continue;
    }

    if (layer.name === 'router' && layer.handle?.stack) {
      routes.push(...walkRoutes(layer.handle.stack));
    }
  }

  return routes;
}

export function listRegisteredRoutes(app: INestApplication): RouteDescriptor[] {
  const server = app.getHttpAdapter().getInstance() as {
    _router?: { stack?: RouteLayer[] };
    router?: { stack?: RouteLayer[] };
  };

  const stack = server?._router?.stack ?? server?.router?.stack ?? [];
  return walkRoutes(stack)
    .filter((route) => route.path !== '*')
    .sort((a, b) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
    );
}

export function materializeRoutePath(routePath: string): string {
  return routePath
    .replace(/:eventId/g, '00000000-0000-4000-8000-000000000001')
    .replace(/:applicationId/g, '00000000-0000-4000-8000-000000000002')
    .replace(/:stepId/g, '00000000-0000-4000-8000-000000000003')
    .replace(/:versionId/g, '00000000-0000-4000-8000-000000000004')
    .replace(/:templateId/g, '00000000-0000-4000-8000-000000000005')
    .replace(/:assignmentId/g, '00000000-0000-4000-8000-000000000006')
    .replace(/:fileId/g, '00000000-0000-4000-8000-000000000007')
    .replace(/:needsInfoId/g, '00000000-0000-4000-8000-000000000008')
    .replace(/:patchId/g, '00000000-0000-4000-8000-000000000009')
    .replace(/:messageId/g, '00000000-0000-4000-8000-000000000010')
    .replace(/:recipientId/g, '00000000-0000-4000-8000-000000000011')
    .replace(/:viewId/g, '00000000-0000-4000-8000-000000000012')
    .replace(/:id/g, '00000000-0000-4000-8000-000000000013')
    .replace(/:slug/g, 'demo-slug')
    .replace(/:pageSlug/g, 'home');
}
