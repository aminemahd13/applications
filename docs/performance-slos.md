# Performance SLOs And Pass/Fail Gates

Target scope: single-machine deployment (1 API + 1 Web), with up to ~1000
concurrent visitors under mixed public/authenticated traffic.

## API Latency Targets

Hard pass/fail thresholds (route class):

| Route class | p95 | p99 | Fail condition |
| --- | --- | --- | --- |
| Public microsite page view (`/events/:slug[/path]`) | <= 350 ms | <= 900 ms | p95 or p99 above threshold |
| Public events list (`/public/events`) | <= 300 ms | <= 800 ms | p95 or p99 above threshold |
| Auth bootstrap (`/auth/csrf` + `/auth/me`) | <= 350 ms | <= 1000 ms | p95 or p99 above threshold |
| Protected dashboard navigation | <= 450 ms | <= 1200 ms | p95 or p99 above threshold |

## Error Rate Target

- Global HTTP error rate: `< 1%` for each load scenario
- Hard fail if `5xx rate > 0.5%` on any scenario window

## Redis Saturation Targets

- `used_memory / maxmemory <= 0.80`
- `blocked_clients = 0`
- Command p99 latency (`LATENCY LATEST` for hot commands) <= `10 ms`
- Hard fail on sustained `evicted_keys > 0` during test windows

## Postgres Saturation Targets

- CPU utilization <= `80%` sustained
- Connections in use <= `80%` of configured max
- Buffer cache hit ratio >= `99%` on hot read paths
- Average lock wait <= `50 ms`, p99 lock wait <= `200 ms`
- Hard fail on sustained deadlocks or connection exhaustion

## Nginx Saturation Targets

- Active connections <= `75%` of effective ceiling
- Upstream 5xx <= `0.5%`
- Request queueing/backlog spikes not sustained for > 1 minute
- Hard fail on worker connection saturation or timeout cascades

## Acceptance Rule

A run is considered passing only if:

1. All route-class latency targets pass (p95 and p99).
2. Error-rate thresholds pass.
3. Redis, Postgres, and Nginx saturation targets remain within limits for the
   full steady-state window.
4. Results are recorded (baseline + post-change) in `infra/load-tests/results/`.
