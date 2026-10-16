import { resolveUpstreamTimeoutMs } from "./route";

describe("resolveUpstreamTimeoutMs", () => {
  const DEFAULT_TIMEOUT_MS = Math.max(
    Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS || "30000"),
    250,
  );
  const EXPORT_TIMEOUT_MS = Math.max(
    Number(process.env.PROXY_UPSTREAM_EXPORT_TIMEOUT_MS || "180000"),
    DEFAULT_TIMEOUT_MS,
  );

  it("returns the long export timeout for any path ending in /export", () => {
    const paths: string[][] = [
      ["events", "abc", "applications", "export"],
      ["events", "abc", "files", "export"],
      ["admin", "users", "export"],
      ["something", "deeply", "nested", "export"],
    ];
    for (const path of paths) {
      expect(resolveUpstreamTimeoutMs(path)).toBe(EXPORT_TIMEOUT_MS);
    }
  });

  it("returns the default timeout for non-export paths", () => {
    expect(resolveUpstreamTimeoutMs(["events", "abc"])).toBe(DEFAULT_TIMEOUT_MS);
    expect(resolveUpstreamTimeoutMs(["health"])).toBe(DEFAULT_TIMEOUT_MS);
    // A path containing "export" mid-segment does NOT match.
    expect(
      resolveUpstreamTimeoutMs(["events", "export-templates"]),
    ).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe("API proxy upstream failures", () => {
  type RouteModule = typeof import("./route");
  const realFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  function loadRoute(): RouteModule {
    let mod: RouteModule | undefined;
    // Fresh module per test: the upstream cooldown map is module state.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require("./route") as RouteModule;
    });
    return mod as RouteModule;
  }

  function context(path: string[]) {
    return { params: Promise.resolve({ path }) };
  }

  function request(method: string, headers: Record<string, string> = {}) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextRequest } = require("next/server") as typeof import("next/server");
    return new NextRequest("http://localhost:3000/api/v1/events/e/uploads", {
      method,
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify({ a: 1 }) }),
    });
  }

  function abortError(): Error {
    const error = new Error("aborted");
    error.name = "AbortError";
    return error;
  }

  function refused(): Error {
    const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
    error.cause = { code: "ECONNREFUSED" };
    return error;
  }

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    warnSpy.mockRestore();
  });

  it("refuses a request that already went through the proxy (loop guard)", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    const res = await route.POST(
      request("POST", { "x-ep-api-proxy": "1" }),
      context(["events", "e", "uploads"]),
    );

    expect(res.status).toBe(508);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks forwarded requests with the loop header", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    await route.GET(request("GET"), context(["auth", "me"]));

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("x-ep-api-proxy")).toBe("1");
  });

  it("never re-sends a timed-out POST to another host (504, one attempt)", async () => {
    const fetchMock = jest.fn().mockRejectedValue(abortError());
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    const res = await route.POST(request("POST"), context(["events", "e", "uploads"]));

    expect(res.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries the next host for a POST that never reached the API", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(refused())
      .mockResolvedValue(new Response("{}", { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    const res = await route.POST(request("POST"), context(["events", "e", "uploads"]));

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still fails over for a timed-out GET", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    const res = await route.GET(request("GET"), context(["auth", "me"]));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("with the production env, uses only the internal API: one attempt, never itself", async () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = {
      NODE_ENV: env.NODE_ENV,
      INTERNAL_API_URL: env.INTERNAL_API_URL,
      NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
      PORT: env.PORT,
    };
    Object.assign(env, {
      NODE_ENV: "production",
      INTERNAL_API_URL: "http://api:3000/api/v1",
      NEXT_PUBLIC_API_URL: "/api/v1",
      PORT: "3000",
    });
    try {
      const fetchMock = jest.fn().mockRejectedValue(abortError());
      global.fetch = fetchMock as unknown as typeof fetch;
      const route = loadRoute();

      const getRes = await route.GET(request("GET"), context(["auth", "me"]));
      expect(getRes.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe("http://api:3000/api/v1/auth/me");

      fetchMock.mockClear();
      const postRes = await route.POST(request("POST"), context(["events", "e", "uploads"]));
      expect(postRes.status).toBe(504);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
      }
    }
  });

  it("never targets this web server itself", async () => {
    const fetchMock = jest.fn().mockRejectedValue(refused());
    global.fetch = fetchMock as unknown as typeof fetch;
    const route = loadRoute();

    const res = await route.GET(request("GET"), context(["auth", "me"]));

    expect(res.status).toBe(502);
    const targets = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.some((url) => url.startsWith("http://localhost:3000/"))).toBe(false);
  });
});
