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
const COOKIE_ATTRIBUTE_NAMES = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'secure',
  'httponly',
  'samesite',
]);

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

if (!AUTH_COOKIE) {
  throw new Error(
    'AUTH_COOKIE is required (example: -e AUTH_COOKIE="sid=...")',
  );
}

const AUTH_COOKIE_PAIRS = parseCookieHeader(AUTH_COOKIE).filter(
  (cookie) => !COOKIE_ATTRIBUTE_NAMES.has(cookie.name.toLowerCase()),
);

if (AUTH_COOKIE_PAIRS.length === 0) {
  throw new Error('AUTH_COOKIE must contain at least one cookie pair');
}

let authJar = null;
let authJarInitialized = false;

function getAuthJar() {
  if (!authJar) {
    authJar = http.cookieJar();
  }
  if (!authJarInitialized) {
    for (const cookie of AUTH_COOKIE_PAIRS) {
      authJar.set(BASE_URL, cookie.name, cookie.value);
    }
    authJarInitialized = true;
  }
  return authJar;
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
    jar: getAuthJar(),
    redirects: 0,
    tags: { route: 'protected_navigation' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'not redirected to auth': (r) => r.status !== 301 && r.status !== 302,
  });

  sleep(SLEEP_SECONDS);
}
