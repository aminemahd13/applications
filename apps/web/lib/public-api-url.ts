const DEFAULT_PUBLIC_API_BASE_URL = "/api/v1";
const LOCALHOST_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i;

function normalizeAbsoluteHttpUrl(rawValue: string): string | null {
  if (!rawValue.startsWith("http://") && !rawValue.startsWith("https://")) {
    return null;
  }

  try {
    return new URL(rawValue).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function resolvePublicApiBaseUrl(rawValue?: string): string {
  const normalized = (rawValue ?? "").trim().replace(/\/+$/, "");
  if (!normalized) return DEFAULT_PUBLIC_API_BASE_URL;

  if (normalized.startsWith("/")) {
    return normalized;
  }

  const absoluteUrl = normalizeAbsoluteHttpUrl(normalized);
  if (!absoluteUrl) return DEFAULT_PUBLIC_API_BASE_URL;

  try {
    const hostname = new URL(absoluteUrl).hostname;
    if (LOCALHOST_HOST_RE.test(hostname)) {
      return DEFAULT_PUBLIC_API_BASE_URL;
    }
  } catch {
    return DEFAULT_PUBLIC_API_BASE_URL;
  }

  return absoluteUrl;
}
