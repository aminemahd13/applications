import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost').replace(/\/+$/, '');
const AUTH_COOKIE = (__ENV.AUTH_COOKIE || '').trim();
const VUS = Number(__ENV.VUS || 250);
const DURATION = __ENV.DURATION || '5m';
const SLEEP_SECONDS = Number(__ENV.SLEEP_MS || 200) / 1000;
const ROUTES = (__ENV.ROUTES || '/dashboard,/events,/inbox')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

if (!AUTH_COOKIE) {
  throw new Error('AUTH_COOKIE is required (example: -e AUTH_COOKIE=\"sid=...\" )');
}

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<450', 'p(99)<1200'],
  },
};

export default function () {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  const res = http.get(`${BASE_URL}${route}`, {
    headers: { Cookie: AUTH_COOKIE },
    redirects: 0,
    tags: { route: 'protected_navigation' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'not redirected to auth': (r) => r.status !== 301 && r.status !== 302,
  });

  sleep(SLEEP_SECONDS);
}
