import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost').replace(/\/+$/, '');
const API_BASE_URL = (__ENV.API_BASE_URL || `${BASE_URL}/api/v1`).replace(
  /\/+$/,
  '',
);
const AUTH_COOKIE = (__ENV.AUTH_COOKIE || '').trim();
const AUTH_RATIO = Math.min(Math.max(Number(__ENV.AUTH_RATIO || 0.5), 0), 1);
const VUS = Number(__ENV.VUS || 250);
const DURATION = __ENV.DURATION || '5m';
const SLEEP_SECONDS = Number(__ENV.SLEEP_MS || 150) / 1000;
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

const AUTH_COOKIE_PAIRS = parseCookieHeader(AUTH_COOKIE).filter(
  (cookie) => !COOKIE_ATTRIBUTE_NAMES.has(cookie.name.toLowerCase()),
);
const AUTH_COOKIE_HEADER = AUTH_COOKIE_PAIRS.map(
  (cookie) => `${cookie.name}=${cookie.value}`,
).join('; ');

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<350', 'p(99)<1000'],
  },
};

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export default function () {
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
    'authenticated payload has user': () =>
      !asAuthenticated ||
      Boolean(
        mePayload &&
          mePayload.user &&
          typeof mePayload.user.id === 'string' &&
          mePayload.user.id.length > 0,
      ),
    'anonymous payload has no user': () =>
      asAuthenticated || !mePayload?.user,
  });

  sleep(SLEEP_SECONDS);
}
