export function normalizeMicrositeBasePath(basePath?: string): string {
  if (!basePath) return "";
  if (basePath === "/") return "";
  const normalized = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function extractEventSlugFromBasePath(basePath?: string): string | null {
  const base = normalizeMicrositeBasePath(basePath);
  const match = base.match(/^\/events\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function resolveMicrositeHref(href: string | null | undefined, basePath?: string): string {
  const trimmedHref = (typeof href === "string" ? href : "").trim();
  if (!trimmedHref) return normalizeMicrositeBasePath(basePath) || "/";

  const loweredHref = trimmedHref.toLowerCase();
  if (loweredHref.startsWith("javascript:") || loweredHref.startsWith("vbscript:")) {
    return normalizeMicrositeBasePath(basePath) || "/";
  }

  const isSpecial =
    trimmedHref.startsWith("#") ||
    trimmedHref.startsWith("http://") ||
    trimmedHref.startsWith("https://") ||
    trimmedHref.startsWith("mailto:") ||
    trimmedHref.startsWith("tel:");
  if (isSpecial) return trimmedHref;

  const eventSlug = extractEventSlugFromBasePath(basePath);
  const applyShortcut =
    trimmedHref.toLowerCase() === "apply" ||
    trimmedHref.toLowerCase() === "/apply" ||
    trimmedHref.toLowerCase() === "/applications/me" ||
    trimmedHref.toLowerCase() === "event-apply";
  if (eventSlug && applyShortcut) {
    return `/applications/event/${eventSlug}`;
  }

  const base = normalizeMicrositeBasePath(basePath);
  if (!base) return trimmedHref;

  if (trimmedHref === "/") return base;
  if (trimmedHref.startsWith(`${base}/`) || trimmedHref === base) return trimmedHref;

  if (trimmedHref.startsWith("/")) return `${base}${trimmedHref}`;
  return `${base}/${trimmedHref}`;
}
