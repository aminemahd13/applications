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

## Recording Results

Use `--summary-export` for baseline tracking:

```bash
k6 run infra/load-tests/public-events.k6.js \
  --summary-export infra/load-tests/results/public-events-baseline.json
```

Store baseline and post-fix summaries in `infra/load-tests/results/` with
timestamped filenames.
