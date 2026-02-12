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
  return Array.from(
    new Set(
      [
        normalizeAbsoluteApiUrl(process.env.INTERNAL_API_URL),
        normalizeAbsoluteApiUrl(process.env.NEXT_PUBLIC_API_URL),
        "http://localhost:3001/api/v1",
        "http://api:3001/api/v1",
      ].filter((value): value is string => Boolean(value)),
    ),
  );
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

async function proxy(req: NextRequest, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const method = req.method.toUpperCase();
  const forwardHeaders = buildForwardHeaders(req);
  const body =
    method !== "GET" && method !== "HEAD" ? await req.arrayBuffer() : undefined;

  for (const baseUrl of resolveInternalApiBaseUrls()) {
    const targetUrl = buildTargetUrl(baseUrl, path, req.nextUrl.search);
    const init: RequestInit = {
      method,
      headers: new Headers(forwardHeaders),
      redirect: "manual",
      cache: "no-store",
      body,
    };

    try {
      const upstream = await fetch(targetUrl, init);
      const responseHeaders = new Headers();
      copyResponseHeaders(upstream.headers, responseHeaders);

      return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
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
