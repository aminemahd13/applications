import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost').replace(/\/+$/, '');
const EVENT_SLUG = (__ENV.EVENT_SLUG || '').trim();
const PAGE_PATH = (__ENV.PAGE_PATH || '').replace(/^\/+/, '');
const VUS = Number(__ENV.VUS || 400);
const DURATION = __ENV.DURATION || '5m';
const SLEEP_SECONDS = Number(__ENV.SLEEP_MS || 250) / 1000;

if (!EVENT_SLUG) {
  throw new Error('EVENT_SLUG is required (example: -e EVENT_SLUG=my-event)');
}

const micrositePath = PAGE_PATH
  ? `/events/${EVENT_SLUG}/${PAGE_PATH}`
  : `/events/${EVENT_SLUG}`;

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<350', 'p(99)<900'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}${micrositePath}`, {
    tags: { route: 'public_microsite' },
  });

  check(res, {
    'status is 200/304': (r) => r.status === 200 || r.status === 304,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(SLEEP_SECONDS);
}
