import http from "node:http";
import type { AddressInfo } from "node:net";
import type { NextRequest } from "next/server";
import { PUT } from "./route";

const UPLOAD_PATH = "/uploads/events/event-1/uploads/uuid-cv.pdf";
const SIGNED_QUERY = "?X-Amz-Signature=secret-signature&X-Amz-Expires=3600";

interface StorageRequestLog {
  received: number;
  completed: boolean;
}

function startStorage(status = 200) {
  const requests: StorageRequestLog[] = [];
  const server = http.createServer((req, res) => {
    const entry: StorageRequestLog = { received: 0, completed: false };
    requests.push(entry);
    req.on("data", (chunk: Buffer) => {
      entry.received += chunk.byteLength;
    });
    req.on("error", () => undefined);
    req.on("end", () => {
      entry.completed = true;
      res.statusCode = status;
      res.setHeader("content-type", "application/xml");
      res.end(status === 200 ? "" : "<Error><Code>AccessDenied</Code></Error>");
    });
  });
  return new Promise<{ server: http.Server; port: number; requests: StorageRequestLog[] }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve({ server, port: (server.address() as AddressInfo).port, requests });
      });
    },
  );
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function bodyStream(byteLength: number): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(byteLength).fill(65));
      controller.close();
    },
  });
}

function uploadRequest(contentLength: number, sentBytes: number): NextRequest {
  const url = new URL(`${UPLOAD_PATH}${SIGNED_QUERY}`, "http://app.test");
  return {
    method: "PUT",
    headers: new Headers({
      host: "app.test",
      "content-type": "application/pdf",
      "content-length": String(contentLength),
    }),
    body: bodyStream(sentBytes),
    nextUrl: {
      pathname: url.pathname,
      search: url.search,
      searchParams: url.searchParams,
      protocol: url.protocol,
      origin: url.origin,
    },
  } as unknown as NextRequest;
}

describe("uploads route PUT proxy", () => {
  const ENV_KEYS = [
    "STORAGE_PROXY_ENDPOINT",
    "STORAGE_PROXY_UPLOAD_TIMEOUT_MS",
    "STORAGE_PUBLIC_ENDPOINT",
    "STORAGE_ENDPOINT",
    "MINIO_ENDPOINT",
    "NEXT_PUBLIC_DIRECT_ASSET_HOST",
  ] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let warn: jest.SpyInstance;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.STORAGE_PROXY_UPLOAD_TIMEOUT_MS = "5000";
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("streams a complete body to storage and logs nothing", async () => {
    const { server, port, requests } = await startStorage(200);
    process.env.STORAGE_PROXY_ENDPOINT = `http://127.0.0.1:${port}`;
    try {
      const response = await PUT(uploadRequest(4096, 4096));
      await response.text();

      expect(response.status).toBe(200);
      expect(requests).toEqual([{ received: 4096, completed: true }]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
    }
  });

  it("fails fast with a retryable 408 when the body ends short of Content-Length", async () => {
    const { server, port, requests } = await startStorage(200);
    process.env.STORAGE_PROXY_ENDPOINT = `http://127.0.0.1:${port}`;
    try {
      const startedAt = Date.now();
      const response = await PUT(uploadRequest(10_000, 4096));

      expect(response.status).toBe(408);
      await expect(response.json()).resolves.toEqual({
        message: "Upload was incomplete. Please try again.",
      });
      // Long before the 5 s upstream timeout.
      expect(Date.now() - startedAt).toBeLessThan(4000);
      expect(requests.every((request) => !request.completed)).toBe(true);

      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain(`[uploads] PUT ${UPLOAD_PATH} failed`);
      expect(line).toContain("code=UPLOAD_BODY_TRUNCATED");
      expect(line).toMatch(/elapsedMs=\d+/);
      expect(line).not.toContain("?");
      expect(line).not.toContain("secret-signature");
    } finally {
      await closeServer(server);
    }
  });

  it("passes a storage error status through and logs it without the query", async () => {
    const { server, port } = await startStorage(403);
    process.env.STORAGE_PROXY_ENDPOINT = `http://127.0.0.1:${port}`;
    try {
      const response = await PUT(uploadRequest(100, 100));
      await response.text();

      expect(response.status).toBe(403);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain(`[uploads] PUT ${UPLOAD_PATH} failed`);
      expect(line).toContain("code=UPSTREAM_STATUS");
      expect(line).toContain("status=403");
      expect(line).not.toContain("secret-signature");
    } finally {
      await closeServer(server);
    }
  });

  it("returns 502 and logs the error code when storage is unreachable", async () => {
    const { server, port } = await startStorage(200);
    await closeServer(server);
    process.env.STORAGE_PROXY_ENDPOINT = `http://127.0.0.1:${port}`;

    const response = await PUT(uploadRequest(100, 100));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Storage upstream unavailable",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("code=ECONNREFUSED");
    expect(line).not.toContain("secret-signature");
  });
});
