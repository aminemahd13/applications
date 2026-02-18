import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)"],
};

const PUBLIC_FILE_RE = /\.[^/]+$/;

const ROUTING_MODE = (process.env.NEXT_PUBLIC_ROUTING_MODE || "path") as
  | "path"
  | "subdomain";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

function normalizeAbsoluteApiUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return null;
  }
  return raw;
}

const API_URL_CANDIDATES = Array.from(
  new Set(
    [
      normalizeAbsoluteApiUrl(process.env.INTERNAL_API_URL),
      normalizeAbsoluteApiUrl(process.env.NEXT_PUBLIC_API_URL),
      "http://localhost:3001/api/v1",
      "http://api:3001/api/v1",
    ].filter((value): value is string => Boolean(value)),
  ),
);

const SESSION_VALIDATION_COOKIE = "session_validated";
const SESSION_VALIDATION_MAX_AGE_SECONDS = Number(
  process.env.SESSION_VALIDATION_MAX_AGE_SECONDS || "900",
);

const APP_ROUTE_SEGMENTS = new Set([
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "verify-email",
  "credentials",
  "admin",
  "dashboard",
  "events",
  "inbox",
  "profile",
  "applications",
  "staff",
]);

function isAppRoute(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] || "";
  return APP_ROUTE_SEGMENTS.has(firstSegment);
}

function stripPort(host: string): string {
  return host.split(":")[0];
}

function getDomain(req: NextRequest): string {
  const raw =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost";
  return stripPort(raw);
}

const ROOT_DOMAIN_BARE = stripPort(ROOT_DOMAIN);

function isOrgDomain(domain: string): boolean {
  return (
    domain === ROOT_DOMAIN_BARE ||
    domain === `www.${ROOT_DOMAIN_BARE}` ||
    domain === "localhost" ||
    domain === "127.0.0.1"
  );
}

function extractSubdomain(domain: string): string | null {
  if (
    domain.endsWith(`.${ROOT_DOMAIN_BARE}`) &&
    domain !== `www.${ROOT_DOMAIN_BARE}`
  ) {
    const sub = domain.slice(0, -(ROOT_DOMAIN_BARE.length + 1));
    return sub || null;
  }

  if (domain.endsWith(".localhost") && domain !== "localhost") {
    const sub = domain.slice(0, -".localhost".length);
    return sub || null;
  }

  return null;
}

function rewriteToMicrosite(
  req: NextRequest,
  type: "org" | "event",
  subPath: string,
  slug?: string,
): NextResponse {
  const normalizedPath = subPath === "/" ? "" : subPath;
  const target =
    type === "org"
      ? `/site/org${normalizedPath}`
      : `/site/event/${slug}${normalizedPath}`;

  return NextResponse.rewrite(new URL(target, req.url));
}

const EVENT_PATH_RE = /^\/events\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(\/.*)?$/;

function handlePathMode(req: NextRequest, pathname: string): NextResponse {
  const match = pathname.match(EVENT_PATH_RE);
  if (match) {
    const [, slug, subPath] = match;
    return rewriteToMicrosite(req, "event", subPath || "/", slug);
  }

  if (isAppRoute(pathname)) {
    return NextResponse.next();
  }

  return rewriteToMicrosite(req, "org", pathname || "/");
}

function handleSubdomainMode(req: NextRequest, pathname: string): NextResponse {
  const domain = getDomain(req);

  if (isAppRoute(pathname)) {
    return NextResponse.next();
  }

  if (isOrgDomain(domain)) {
    return rewriteToMicrosite(req, "org", pathname || "/");
  }

  const subdomain = extractSubdomain(domain);
  if (subdomain) {
    return rewriteToMicrosite(req, "event", pathname || "/", subdomain);
  }

  return rewriteToMicrosite(req, "org", pathname || "/");
}

/* Auth-protected route segments */
const PROTECTED_SEGMENTS = new Set([
  "admin",
  "dashboard",
  "inbox",
  "profile",
  "applications",
  "staff",
]);

function isProtectedRoute(pathname: string): boolean {
  const first = pathname.split("/")[1] || "";
  return PROTECTED_SEGMENTS.has(first);
}

async function validateSession(req: NextRequest): Promise<boolean> {
  const cookie = req.headers.get("cookie") ?? "";

  for (const apiUrl of API_URL_CANDIDATES) {
    try {
      const res = await fetch(`${apiUrl}/auth/me`, {
        method: "GET",
        headers: {
          cookie,
          accept: "application/json",
        },
        cache: "no-store",
      });

      if (res.status === 404 || res.status >= 500) {
        continue;
      }

      return res.ok;
    } catch {
      continue;
    }
  }

  // If the auth service is temporarily unreachable, fail closed: require re-login.
  return false;
}

function sidMarker(sidValue: string): string {
  return encodeURIComponent(sidValue).slice(0, 32);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/site")) {
    return new NextResponse(null, { status: 404 });
  }

  // Keep static/public assets out of microsite rewrites.
  if (pathname.startsWith("/uploads/") || PUBLIC_FILE_RE.test(pathname)) {
    return NextResponse.next();
  }

  let refreshSessionValidationMarker: string | null = null;

  /* Server-side auth gate */
  if (isProtectedRoute(pathname)) {
    const sid =
      req.cookies.get("connect.sid") ?? req.cookies.get("sid");
    if (!sid?.value) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("returnUrl", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    const expectedMarker = sidMarker(sid.value);
    const existingMarker = req.cookies.get(SESSION_VALIDATION_COOKIE)?.value;
    if (existingMarker !== expectedMarker) {
      const isValid = await validateSession(req);
      if (!isValid) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set(
          "returnUrl",
          `${pathname}${req.nextUrl.search}`,
        );
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete("connect.sid");
        response.cookies.delete("sid");
        response.cookies.delete(SESSION_VALIDATION_COOKIE);
        return response;
      }
      refreshSessionValidationMarker = expectedMarker;
    }
  }

  const response =
    ROUTING_MODE === "path"
    ? handlePathMode(req, pathname)
    : handleSubdomainMode(req, pathname);

  if (refreshSessionValidationMarker) {
    response.cookies.set(SESSION_VALIDATION_COOKIE, refreshSessionValidationMarker, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: Number.isFinite(SESSION_VALIDATION_MAX_AGE_SECONDS)
        ? SESSION_VALIDATION_MAX_AGE_SECONDS
        : 900,
    });
  }

  return response;
}
