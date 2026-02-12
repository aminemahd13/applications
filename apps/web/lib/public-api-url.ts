const LOCALHOST_API_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;

export function resolvePublicApiBaseUrl(rawValue?: string): string {
  const normalized = (rawValue ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return "/api/v1";
  if (LOCALHOST_API_RE.test(normalized)) return "/api/v1";
  return normalized;
}
