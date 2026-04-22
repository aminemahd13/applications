const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\]|.+\.localhost)$/i;

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const [a, b] = hostname.split(".").map((part) => Number(part));
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

export function sanitizeClientFacingUrl(rawValue: string | null | undefined): string | null {
  const value = (rawValue ?? "").trim();
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const internalHost = !hostname.includes(".");
    const rewriteToRelative =
      LOOPBACK_HOST_RE.test(hostname) ||
      isPrivateIpv4(hostname) ||
      isPrivateIpv6(hostname) ||
      internalHost;

    if (!rewriteToRelative) {
      return parsed.toString();
    }

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return value;
  }
}
