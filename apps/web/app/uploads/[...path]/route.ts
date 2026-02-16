import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const SENSITIVE_UPSTREAM_HEADERS = new Set(["cookie", "cookie2"]);
const UPLOADS_PREFIX = "/uploads/";
const MICROSITE_STORAGE_KEY_RE = /^events\/[^/]+\/microsite\/.+/i;

function hasSignatureQueryParam(searchParams: URLSearchParams): boolean {
  for (const key of searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("x-amz-")) return true;
    if (normalized === "signature") return true;
    if (normalized === "awsaccesskeyid") return true;
  }
  return false;
}

function extractStorageKeyFromUploadsPath(pathname: string): string | null {
  if (!pathname.startsWith(UPLOADS_PREFIX)) return null;
  const storageKey = pathname.slice(UPLOADS_PREFIX.length).replace(/^\/+/, "");
  return storageKey.length > 0 ? storageKey : null;
}

function maybeRedirectMicrositeAsset(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (hasSignatureQueryParam(req.nextUrl.searchParams)) return null;

  const storageKey = extractStorageKeyFromUploadsPath(req.nextUrl.pathname);
  if (!storageKey || !MICROSITE_STORAGE_KEY_RE.test(storageKey)) return null;

  const resolverUrl = new URL("/api/v1/microsites/assets", req.url);
  resolverUrl.searchParams.set("key", storageKey);
  return NextResponse.redirect(resolverUrl, 302);
}

function normalizeAbsoluteUrl(value: string | undefined): string | null {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return null;
  }
  return raw;
}

function resolveEndpointWithPort(
  rawEndpoint: string | undefined,
  defaultPort: string,
): string | null {
  const trimmed = (rawEndpoint ?? "").trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.port && defaultPort) {
      parsed.port = defaultPort;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function resolveStorageBaseUrls(): string[] {
  const minioPort = (process.env.MINIO_PORT ?? "9000").trim() || "9000";

  return Array.from(
    new Set(
      [
        normalizeAbsoluteUrl(process.env.STORAGE_PROXY_ENDPOINT),
        normalizeAbsoluteUrl(process.env.STORAGE_PUBLIC_ENDPOINT),
        resolveEndpointWithPort(process.env.STORAGE_ENDPOINT, minioPort),
        resolveEndpointWithPort(process.env.MINIO_ENDPOINT, minioPort),
        normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_DIRECT_ASSET_HOST),
        "http://minio:9000",
        "http://localhost:9000",
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildTargetUrl(baseUrl: string, pathname: string, search: string): URL {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(`${normalizedBase}${normalizedPath}${search}`);
}

function isSameOrigin(targetUrl: URL, req: NextRequest): boolean {
  const requestOrigin = req.nextUrl.origin.toLowerCase();
  return targetUrl.origin.toLowerCase() === requestOrigin;
}

function buildForwardHeaders(
  req: NextRequest,
  bodyByteLength?: number,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};

  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (SENSITIVE_UPSTREAM_HEADERS.has(lower)) continue;
    if (lower === "host") continue;
    headers[lower] = value;
  }

  const host = req.headers.get("host");
  if (host) {
    // Keep the original Host so AWS SigV4 signatures stay valid.
    headers.host = host;
    headers["x-forwarded-host"] = host;
  }
  headers["x-forwarded-proto"] = req.nextUrl.protocol.replace(":", "");

  if (typeof bodyByteLength === "number") {
    headers["content-length"] = String(bodyByteLength);
  } else {
    delete headers["content-length"];
  }

  return headers;
}

function copyResponseHeaders(source: IncomingHttpHeaders, target: Headers): void {
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;

    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        target.append(key, item);
      }
      continue;
    }

    target.set(key, value);
  }
}

async function proxyToStorage(
  baseUrl: string,
  req: NextRequest,
  body?: Buffer,
): Promise<Response> {
  const targetUrl = buildTargetUrl(baseUrl, req.nextUrl.pathname, req.nextUrl.search);
  if (isSameOrigin(targetUrl, req)) {
    throw new Error("Skipping same-origin upload proxy target");
  }

  const requestImpl = targetUrl.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const upstreamReq = requestImpl(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || undefined,
        method: req.method,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers: buildForwardHeaders(req, body?.byteLength),
        timeout: 5000,
      },
      (upstreamRes) => {
        const responseHeaders = new Headers();
        copyResponseHeaders(upstreamRes.headers, responseHeaders);

        const status = upstreamRes.statusCode ?? 502;
        const stream =
          status === 204 || status === 205 || status === 304
            ? null
            : (Readable.toWeb(
                upstreamRes as unknown as Readable,
              ) as ReadableStream<Uint8Array>);

        resolve(
          new NextResponse(stream, {
            status,
            headers: responseHeaders,
          }),
        );
      },
    );

    upstreamReq.on("error", reject);
    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("Storage upstream timeout"));
    });

    if (body && body.byteLength > 0) {
      upstreamReq.write(body);
    }
    upstreamReq.end();
  });
}

async function handle(req: NextRequest): Promise<Response> {
  const guardedMicrositeAssetRedirect = maybeRedirectMicrositeAsset(req);
  if (guardedMicrositeAssetRedirect) {
    return guardedMicrositeAssetRedirect;
  }

  const method = req.method.toUpperCase();
  const shouldReadBody = method !== "GET" && method !== "HEAD";
  const body = shouldReadBody ? Buffer.from(await req.arrayBuffer()) : undefined;

  for (const baseUrl of resolveStorageBaseUrls()) {
    try {
      return await proxyToStorage(baseUrl, req, body);
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { message: "Storage upstream unavailable" },
    { status: 502 },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function HEAD(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function OPTIONS(req: NextRequest): Promise<Response> {
  return handle(req);
}
