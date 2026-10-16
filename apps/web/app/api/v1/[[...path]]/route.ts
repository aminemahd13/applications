import { NextRequest, NextResponse } from "next/server";
import {
  API_PROXY_LOOP_HEADER,
  canTryNextUpstream,
  describeUpstreamError,
  resolveApiUpstreamCandidates,
} from "@/lib/api-upstream";

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

// Production: only the internal API (never this web server itself).
const API_BASE_URL_CANDIDATES = resolveApiUpstreamCandidates(process.env);
const PROXY_UPSTREAM_TIMEOUT_MS = Math.max(
  Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS || "30000"),
  250,
);
const PROXY_UPSTREAM_EXPORT_TIMEOUT_MS = Math.max(
  Number(process.env.PROXY_UPSTREAM_EXPORT_TIMEOUT_MS || "180000"),
  PROXY_UPSTREAM_TIMEOUT_MS,
);
const PROXY_UPSTREAM_FAILURE_BACKOFF_MS = Math.max(
  Number(process.env.PROXY_UPSTREAM_FAILURE_BACKOFF_MS || "30000"),
  1_000,
);
const upstreamCooldownUntil = new Map<string, number>();

export function resolveUpstreamTimeoutMs(path: string[]): number {
  const normalizedPath = `/${path.join("/")}`;
  if (normalizedPath.endsWith("/export")) {
    return PROXY_UPSTREAM_EXPORT_TIMEOUT_MS;
  }
  return PROXY_UPSTREAM_TIMEOUT_MS;
}

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
  // Marks proxied requests so a request that loops back here is refused.
  headers.set(API_PROXY_LOOP_HEADER, "1");

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
  if (req.headers.get(API_PROXY_LOOP_HEADER)) {
    console.warn(`[api-proxy] loop refused: ${method} /${path.join("/")}`);
    return NextResponse.json(
      { message: "API proxy loop detected" },
      { status: 508 },
    );
  }
  const timeoutMs = resolveUpstreamTimeoutMs(path);
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

    const startedAt = Date.now();
    try {
      const upstream = await fetchWithTimeout(
        targetUrl,
        init,
        timeoutMs,
      );
      markUpstreamHealthy(baseUrl);
      const responseHeaders = new Headers();
      copyResponseHeaders(upstream.headers, responseHeaders);

      return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      markUpstreamFailure(baseUrl);
      console.warn(
        `[api-proxy] ${method} /${path.join("/")} via ${new URL(baseUrl).host} failed: ${describeUpstreamError(error)} after ${Date.now() - startedAt} ms`,
      );
      // A timed-out POST/PUT/PATCH/DELETE may already have been processed by
      // the API: never re-send it to another host (no duplicate uploads or
      // submissions); report it so the client can retry deliberately.
      if (!canTryNextUpstream(method, error)) {
        return NextResponse.json(
          { message: "The server took too long to respond. Please try again." },
          { status: 504 },
        );
      }
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
