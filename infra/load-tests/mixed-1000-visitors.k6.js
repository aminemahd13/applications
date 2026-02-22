import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost').replace(/\/+$/, '');
const API_BASE_URL = (__ENV.API_BASE_URL || `${BASE_URL}/api/v1`).replace(
  /\/+$/,
  '',
);
const EVENT_SLUG = (__ENV.EVENT_SLUG || '').trim();
const PAGE_PATH = (__ENV.PAGE_PATH || '').replace(/^\/+/, '');
const AUTH_COOKIE = (__ENV.AUTH_COOKIE || '').trim();
const AUTH_RATIO = Math.min(Math.max(Number(__ENV.AUTH_RATIO || 0.75), 0), 1);
const DURATION = __ENV.DURATION || '6m';

const PUBLIC_MICROSITE_VUS = Math.max(
  Number(__ENV.PUBLIC_MICROSITE_VUS || 275),
  0,
);
const PUBLIC_EVENTS_VUS = Math.max(Number(__ENV.PUBLIC_EVENTS_VUS || 125), 0);
const AUTH_BOOTSTRAP_VUS = Math.max(
  Number(__ENV.AUTH_BOOTSTRAP_VUS || 60),
  0,
);
const PROTECTED_NAV_VUS = Math.max(
  Number(__ENV.PROTECTED_NAV_VUS || 40),
  0,
);

const PUBLIC_MICROSITE_SLEEP_SECONDS =
  Number(__ENV.PUBLIC_MICROSITE_SLEEP_MS || 250) / 1000;
const PUBLIC_EVENTS_SLEEP_SECONDS =
  Number(__ENV.PUBLIC_EVENTS_SLEEP_MS || 200) / 1000;
const AUTH_BOOTSTRAP_SLEEP_SECONDS =
  Number(__ENV.AUTH_BOOTSTRAP_SLEEP_MS || 150) / 1000;
const PROTECTED_NAV_SLEEP_SECONDS =
  Number(__ENV.PROTECTED_NAV_SLEEP_MS || 200) / 1000;
const COOKIE_ATTRIBUTE_NAMES = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'secure',
  'httponly',
  'samesite',
]);

const PROTECTED_ROUTES = (__ENV.PROTECTED_ROUTES || '/dashboard,/events,/inbox')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

function parseCookieHeader(value) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes('='))
    .map((part) => {
      const index = part.indexOf('=');
      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
      };
    })
    .filter((cookie) => cookie.name.length > 0 && cookie.value.length > 0);
}

const AUTH_COOKIE_PAIRS = parseCookieHeader(AUTH_COOKIE).filter(
  (cookie) => !COOKIE_ATTRIBUTE_NAMES.has(cookie.name.toLowerCase()),
);
const AUTH_COOKIE_HEADER = AUTH_COOKIE_PAIRS.map(
  (cookie) => `${cookie.name}=${cookie.value}`,
).join('; ');

if (!EVENT_SLUG) {
  throw new Error('EVENT_SLUG is required (example: -e EVENT_SLUG=my-event)');
}

if (
  (AUTH_BOOTSTRAP_VUS > 0 || PROTECTED_NAV_VUS > 0) &&
  AUTH_COOKIE_HEADER.length === 0
) {
  throw new Error(
    'AUTH_COOKIE is required and must contain at least one cookie pair',
  );
}

const MICROSITE_PATH = PAGE_PATH
  ? `/events/${EVENT_SLUG}/${PAGE_PATH}`
  : `/events/${EVENT_SLUG}`;

function getProtectedNavAuthJar() {
  const jar = http.cookieJar();
  for (const cookie of AUTH_COOKIE_PAIRS) {
    jar.set(BASE_URL, cookie.name, cookie.value);
  }
  return jar;
}

const scenarios = {
  public_microsite: {
    executor: 'constant-vus',
    exec: 'publicMicrositeScenario',
    vus: PUBLIC_MICROSITE_VUS,
    duration: DURATION,
  },
  public_events: {
    executor: 'constant-vus',
    exec: 'publicEventsScenario',
    vus: PUBLIC_EVENTS_VUS,
    duration: DURATION,
  },
};

if (AUTH_BOOTSTRAP_VUS > 0) {
  scenarios.auth_bootstrap = {
    executor: 'constant-vus',
    exec: 'authBootstrapScenario',
    vus: AUTH_BOOTSTRAP_VUS,
    duration: DURATION,
  };
}

if (PROTECTED_NAV_VUS > 0) {
  scenarios.protected_navigation = {
    executor: 'constant-vus',
    exec: 'protectedNavigationScenario',
    vus: PROTECTED_NAV_VUS,
    duration: DURATION,
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{route:public_microsite}': ['p(95)<350', 'p(99)<900'],
    'http_req_duration{route:public_events}': ['p(95)<300', 'p(99)<800'],
    'http_req_duration{route:auth_bootstrap}': ['p(95)<350', 'p(99)<1000'],
    'http_req_duration{route:protected_navigation}': [
      'p(95)<450',
      'p(99)<1200',
    ],
  },
};

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function publicMicrositeScenario() {
  const res = http.get(`${BASE_URL}${MICROSITE_PATH}`, {
    redirects: 0,
    tags: { route: 'public_microsite' },
  });

  check(res, {
    'microsite status is 200/304': (r) => r.status === 200 || r.status === 304,
    'microsite not redirected': (r) => r.status !== 301 && r.status !== 302,
    'microsite latency < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(PUBLIC_MICROSITE_SLEEP_SECONDS);
}

export function publicEventsScenario() {
  const first = http.get(`${API_BASE_URL}/public/events?limit=24`, {
    tags: { route: 'public_events' },
  });

  check(first, {
    'events first page status is 200': (r) => r.status === 200,
  });

  const payload = parseJson(first.body);
  const nextCursor = payload?.meta?.nextCursor;
  if (typeof nextCursor === 'string' && nextCursor.length > 0) {
    const second = http.get(
      `${API_BASE_URL}/public/events?limit=24&cursor=${encodeURIComponent(nextCursor)}`,
      { tags: { route: 'public_events' } },
    );
    check(second, {
      'events second page status is 200': (r) => r.status === 200,
    });
  }

  sleep(PUBLIC_EVENTS_SLEEP_SECONDS);
}

export function authBootstrapScenario() {
  const asAuthenticated =
    AUTH_COOKIE_HEADER.length > 0 && Math.random() < AUTH_RATIO;
  const headers = asAuthenticated ? { Cookie: AUTH_COOKIE_HEADER } : undefined;
  const params = { headers, tags: { route: 'auth_bootstrap' } };

  const csrfRes = http.get(`${API_BASE_URL}/auth/csrf`, params);
  check(csrfRes, {
    'csrf status is 200': (r) => r.status === 200,
  });

  const meRes = http.get(`${API_BASE_URL}/auth/me`, params);
  const mePayload = parseJson(meRes.body);
  check(meRes, {
    'me status is 200': (r) => r.status === 200,
    'me latency < 1.5s': (r) => r.timings.duration < 1500,
    'authenticated me has user': () =>
      !asAuthenticated ||
      Boolean(
        mePayload &&
          mePayload.user &&
          typeof mePayload.user.id === 'string' &&
          mePayload.user.id.length > 0,
      ),
    'anonymous me has no user': () => asAuthenticated || !mePayload?.user,
  });

  sleep(AUTH_BOOTSTRAP_SLEEP_SECONDS);
}

export function protectedNavigationScenario() {
  const route =
    PROTECTED_ROUTES[Math.floor(Math.random() * PROTECTED_ROUTES.length)];
  const res = http.get(`${BASE_URL}${route}`, {
    jar: getProtectedNavAuthJar(),
    redirects: 0,
    tags: { route: 'protected_navigation' },
  });

  check(res, {
    'protected nav status is 200': (r) => r.status === 200,
    'protected nav not redirected': (r) =>
      r.status !== 301 && r.status !== 302,
  });

  sleep(PROTECTED_NAV_SLEEP_SECONDS);
}
