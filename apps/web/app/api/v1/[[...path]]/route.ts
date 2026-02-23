import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
]);

function normalizeAbsoluteApiUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return null;
  }
  return raw;
}

function resolveInternalApiBaseUrls(): string[] {
  const explicitCandidates = [
    normalizeAbsoluteApiUrl(process.env.INTERNAL_API_URL),
    normalizeAbsoluteApiUrl(process.env.NEXT_PUBLIC_API_URL),
  ].filter((value): value is string => Boolean(value));

  const fallbackCandidates =
    process.env.NODE_ENV === "production"
      ? [
          "http://api:3000/api/v1",
          "http://localhost:3000/api/v1",
          "http://api:3001/api/v1",
          "http://localhost:3001/api/v1",
        ]
      : [
          "http://localhost:3001/api/v1",
          "http://api:3001/api/v1",
          "http://localhost:3000/api/v1",
          "http://api:3000/api/v1",
        ];

  return Array.from(new Set([...explicitCandidates, ...fallbackCandidates]));
}

const API_BASE_URL_CANDIDATES = resolveInternalApiBaseUrls();
const PROXY_UPSTREAM_TIMEOUT_MS = Math.max(
  Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS || "2000"),
  250,
);
const PROXY_UPSTREAM_FAILURE_BACKOFF_MS = Math.max(
  Number(process.env.PROXY_UPSTREAM_FAILURE_BACKOFF_MS || "30000"),
  1_000,
);
const upstreamCooldownUntil = new Map<string, number>();

function buildTargetUrl(baseUrl: string, path: string[], search: string): string {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = encodedPath ? `/${encodedPath}` : "";
  return `${baseUrl}${suffix}${search}`;
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);

  headers.delete("host");
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.set("x-forwarded-host", req.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

  return headers;
}

function copyResponseHeaders(source: Headers, target: Headers): void {
  for (const [key, value] of source.entries()) {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") continue;
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    target.set(key, value);
  }

  const typed = source as unknown as { getSetCookie?: () => string[] };
  if (typeof typed.getSetCookie === "function") {
    for (const cookie of typed.getSetCookie()) {
      target.append("set-cookie", cookie);
    }
    return;
  }

  const setCookie = source.get("set-cookie");
  if (setCookie) {
    target.append("set-cookie", setCookie);
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function orderedUpstreamCandidates(): string[] {
  const now = Date.now();
  const preferred: string[] = [];
  const coolingDown: string[] = [];

  for (const candidate of API_BASE_URL_CANDIDATES) {
    const cooldownUntil = upstreamCooldownUntil.get(candidate) ?? 0;
    if (cooldownUntil > now) {
      coolingDown.push(candidate);
    } else {
      preferred.push(candidate);
    }
  }

  return [...preferred, ...coolingDown];
}

function markUpstreamFailure(candidate: string) {
  upstreamCooldownUntil.set(
    candidate,
    Date.now() + PROXY_UPSTREAM_FAILURE_BACKOFF_MS,
  );
}

function markUpstreamHealthy(candidate: string) {
  upstreamCooldownUntil.delete(candidate);
}

async function proxy(req: NextRequest, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const method = req.method.toUpperCase();
  const forwardHeaders = buildForwardHeaders(req);
  const body =
    method !== "GET" && method !== "HEAD" ? await req.arrayBuffer() : undefined;

  for (const baseUrl of orderedUpstreamCandidates()) {
    const targetUrl = buildTargetUrl(baseUrl, path, req.nextUrl.search);
    const init: RequestInit = {
      method,
      headers: new Headers(forwardHeaders),
      redirect: "manual",
      cache: "no-store",
      body,
    };

    try {
      const upstream = await fetchWithTimeout(
        targetUrl,
        init,
        PROXY_UPSTREAM_TIMEOUT_MS,
      );
      markUpstreamHealthy(baseUrl);
      const responseHeaders = new Headers();
      copyResponseHeaders(upstream.headers, responseHeaders);

      return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      markUpstreamFailure(baseUrl);
      continue;
    }
  }

  return NextResponse.json(
    { message: "Upstream API unavailable" },
    { status: 502 },
  );
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return proxy(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return proxy(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return proxy(req, context);
}

export async function OPTIONS(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  return proxy(req, context);
}
