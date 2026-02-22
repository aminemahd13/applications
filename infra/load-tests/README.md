# Load Test Suite (k6)

This folder provides reproducible k6 scenarios for the core concurrency
validation flows.

## Prerequisites

- Install `k6` (https://k6.io/docs/get-started/installation/)
- Deploy API/Web with production-like config and realistic seed data

## Common Environment Variables

- `BASE_URL` (default: `http://localhost`) web origin
- `API_BASE_URL` (default: `${BASE_URL}/api/v1`) API base
- `VUS` virtual users
- `DURATION` test duration (example: `5m`)
- `SLEEP_MS` per-iteration pause in milliseconds
- `AUTH_COOKIE` authenticated session cookie for protected/auth scenarios

## High-Concurrency Notes

- The API has global IP throttling enabled (`THROTTLE_LIMIT` / `THROTTLE_TTL_MS`).
  At 1,000 VUs from a single load generator, default limits will trigger a high
  volume of `429` responses and fail thresholds before app capacity is measured.
- For capacity tests, point `API_BASE_URL` to the API service origin when
  possible (for example: `http://localhost:3001/api/v1`) to avoid adding Next.js
  API proxy overhead.

## Scenarios

1. Public microsite page view (`/events/:slug[/path]`)

```bash
k6 run infra/load-tests/public-microsite.k6.js \
  -e BASE_URL=http://localhost \
  -e EVENT_SLUG=my-event \
  -e PAGE_PATH= \
  -e VUS=400 \
  -e DURATION=5m
```

2. Public events list (`/public/events`)

```bash
k6 run infra/load-tests/public-events.k6.js \
  -e BASE_URL=http://localhost \
  -e API_BASE_URL=http://localhost/api/v1 \
  -e VUS=300 \
  -e DURATION=5m
```

3. Auth bootstrap (`/auth/csrf` + `/auth/me`) mixed traffic

```bash
k6 run infra/load-tests/auth-bootstrap.k6.js \
  -e BASE_URL=http://localhost \
  -e API_BASE_URL=http://localhost/api/v1 \
  -e AUTH_COOKIE="sid=..." \
  -e AUTH_RATIO=0.5 \
  -e VUS=250 \
  -e DURATION=5m
```

4. Protected dashboard navigation behind middleware

```bash
k6 run infra/load-tests/protected-dashboard.k6.js \
  -e BASE_URL=http://localhost \
  -e AUTH_COOKIE="sid=..." \
  -e VUS=250 \
  -e DURATION=5m
```

5. Mixed 1,000 concurrent visitors (recommended acceptance run)

```bash
k6 run infra/load-tests/mixed-1000-visitors.k6.js \
  -e BASE_URL=http://localhost \
  -e API_BASE_URL=http://localhost/api/v1 \
  -e EVENT_SLUG=my-event \
  -e AUTH_COOKIE="sid=..." \
  -e DURATION=6m \
  --summary-export infra/load-tests/results/mixed-1000-summary.json
```

Default mix in `mixed-1000-visitors.k6.js`:
- `PUBLIC_MICROSITE_VUS=550`
- `PUBLIC_EVENTS_VUS=250`
- `AUTH_BOOTSTRAP_VUS=120`
- `PROTECTED_NAV_VUS=80`

## Recording Results

Use `--summary-export` for baseline tracking:

```bash
k6 run infra/load-tests/public-events.k6.js \
  --summary-export infra/load-tests/results/public-events-baseline.json
```

Store baseline and post-fix summaries in `infra/load-tests/results/` with
timestamped filenames.
