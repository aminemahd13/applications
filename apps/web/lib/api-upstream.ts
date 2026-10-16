/**
 * Which API hosts the web server may forward to (the /api/v1 proxy route and
 * the session check in proxy.ts).
 *
 * Production uses only the configured internal API (default `api:3000`):
 * the old fallback list included `http://localhost:3000/api/v1`, which inside
 * the web container is the web server itself, so after one slow or failed API
 * call the proxy started calling itself and stayed stuck (requests hung ~40 s,
 * then 502) until the web server restarted.
 */

/** Set on every forwarded request; an incoming request carrying it is a loop. */
export const API_PROXY_LOOP_HEADER = "x-ep-api-proxy";

const PRODUCTION_DEFAULT_API_URL = "http://api:3000/api/v1";
const DEVELOPMENT_FALLBACK_API_URLS = [
  "http://localhost:3001/api/v1",
  "http://api:3001/api/v1",
  "http://api:3000/api/v1",
];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export interface ApiUpstreamEnv {
  NODE_ENV?: string;
  INTERNAL_API_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  /** Port this web server listens on (default 3000). */
  PORT?: string;
}

export function normalizeAbsoluteApiUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return null;
  }
  return raw;
}

/** True when the URL points back at this web server (loopback + our port). */
export function isSelfApiUrl(url: string, webPort: string): boolean {
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) && port === webPort;
  } catch {
    return false;
  }
}

export function resolveApiUpstreamCandidates(env: ApiUpstreamEnv): string[] {
  const webPort = (env.PORT ?? "").trim() || "3000";
  const explicit = [
    normalizeAbsoluteApiUrl(env.INTERNAL_API_URL),
    normalizeAbsoluteApiUrl(env.NEXT_PUBLIC_API_URL),
  ].filter((value): value is string => Boolean(value));

  const candidates =
    env.NODE_ENV === "production"
      ? explicit.length > 0
        ? explicit
        : [PRODUCTION_DEFAULT_API_URL]
      : [...explicit, ...DEVELOPMENT_FALLBACK_API_URLS];

  const usable = Array.from(new Set(candidates)).filter(
    (candidate) => !isSelfApiUrl(candidate, webPort),
  );
  // Never end up with nothing: the production default is never this server.
  return usable.length > 0 ? usable : [PRODUCTION_DEFAULT_API_URL];
}

const SAFE_TO_REPLAY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a failed upstream attempt may be retried on another host.
 * A request that timed out may already have been processed by the API, so a
 * POST/PUT/PATCH/DELETE (upload registration, commit, submit…) must not be
 * re-sent; connection failures (the request never arrived) are always safe.
 */
export function canTryNextUpstream(method: string, error: unknown): boolean {
  if (SAFE_TO_REPLAY_METHODS.has(method.toUpperCase())) return true;
  return !isTimeoutError(error);
}

export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

/** Short error code for logs (never includes URLs or bodies). */
export function describeUpstreamError(error: unknown): string {
  if (isTimeoutError(error)) return "timeout";
  if (error && typeof error === "object") {
    const cause = (error as { cause?: { code?: unknown } }).cause;
    if (cause && typeof cause.code === "string") return cause.code;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "unknown";
}
