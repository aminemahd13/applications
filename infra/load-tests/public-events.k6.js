import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost').replace(/\/+$/, '');
const API_BASE_URL = (__ENV.API_BASE_URL || `${BASE_URL}/api/v1`).replace(
  /\/+$/,
  '',
);
const VUS = Number(__ENV.VUS || 300);
const DURATION = __ENV.DURATION || '5m';
const SLEEP_SECONDS = Number(__ENV.SLEEP_MS || 200) / 1000;

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
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
  const first = http.get(`${API_BASE_URL}/public/events?limit=24`, {
    tags: { route: 'public_events' },
  });

  check(first, {
    'first page status is 200': (r) => r.status === 200,
    'first page latency < 1.5s': (r) => r.timings.duration < 1500,
  });

  const payload = parseJson(first.body);
  const nextCursor = payload?.meta?.nextCursor;
  if (typeof nextCursor === 'string' && nextCursor.length > 0) {
    const second = http.get(
      `${API_BASE_URL}/public/events?limit=24&cursor=${encodeURIComponent(nextCursor)}`,
      { tags: { route: 'public_events' } },
    );
    check(second, {
      'second page status is 200': (r) => r.status === 200,
    });
  }

  sleep(SLEEP_SECONDS);
}
