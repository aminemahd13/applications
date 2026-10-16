import { NextRequest } from "next/server";
import proxy, { config } from "./proxy";

type MiddlewareMatcher = { regexp: string };
type GetMiddlewareMatchers = (
  matchers: string[],
  nextConfig: Record<string, unknown>,
) => MiddlewareMatcher[];

async function compileMatcher(): Promise<RegExp> {
  // Next's own compiler for `config.matcher` (not part of its public typings).
  const mod = (await import(
    "next/dist/build/analysis/get-page-static-info"
  )) as unknown as { getMiddlewareMatchers: GetMiddlewareMatchers };
  const [matcher] = mod.getMiddlewareMatchers(config.matcher, {});
  return new RegExp(matcher.regexp);
}

describe("proxy matcher", () => {
  it("never runs for /uploads/ so Next doesn't cap upload bodies at 10 MiB", async () => {
    const re = await compileMatcher();
    for (const path of [
      "/uploads/events/abc/uploads/1b2c-photo.jpg",
      "/uploads/events/abc/uploads/1b2c-scan.pdf",
      "/uploads/x",
    ]) {
      expect({ path, matches: re.test(path) }).toEqual({ path, matches: false });
    }
  });

  it("still runs for app and microsite pages", async () => {
    const re = await compileMatcher();
    for (const path of [
      "/",
      "/dashboard",
      "/events/x",
      "/applications/x",
      "/login",
      "/staff/x",
      "/uploads-guide",
    ]) {
      expect({ path, matches: re.test(path) }).toEqual({ path, matches: true });
    }
  });

  it("still skips the API proxy and files with an extension", async () => {
    const re = await compileMatcher();
    expect(re.test("/api/v1/auth/me")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
  });
});

describe("proxy session check", () => {
  let fetchMock: jest.SpyInstance;
  let sidCounter = 0;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function requestDashboard() {
    sidCounter += 1;
    return new NextRequest("http://localhost:3000/dashboard?tab=1", {
      headers: { cookie: `sid=s%3Asession${sidCounter}.signature` },
    });
  }

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function expectPassThroughWithoutCookieChanges(response: Response) {
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  }

  function expectLogoutRedirect(response: Response) {
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?returnUrl=%2Fdashboard%3Ftab%3D1",
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/(^|, )sid=;/);
    expect(setCookie).toMatch(/(^|, )session_validated=;/);
  }

  it("lets the request through untouched when the API times out", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("This operation was aborted"), {
        name: "AbortError",
      }),
    );

    expectPassThroughWithoutCookieChanges(await proxy(requestDashboard()));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("lets the request through untouched when the API answers 5xx", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(503, {}));

    expectPassThroughWithoutCookieChanges(await proxy(requestDashboard()));
  });

  it("does not cache an unknown result: the next request checks again", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const request = requestDashboard();
    await proxy(request);
    const callsAfterFirst = fetchMock.mock.calls.length;

    await proxy(
      new NextRequest(request.url, {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      }),
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("logs out on an explicit authenticated:false", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { authenticated: false }),
    );

    expectLogoutRedirect(await proxy(requestDashboard()));
  });

  it("logs out on 401", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(401, { message: "Unauthorized" }),
    );

    expectLogoutRedirect(await proxy(requestDashboard()));
  });

  it("marks a valid session and lets the request through", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { authenticated: true }),
    );

    const response = await proxy(requestDashboard());
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("set-cookie")).toMatch(
      /^session_validated=ssession\d+signature;/,
    );
  });
});
