import {
  canTryNextUpstream,
  describeUpstreamError,
  isSelfApiUrl,
  resolveApiUpstreamCandidates,
} from "./api-upstream";

function abortError(): Error {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}

function connectionRefused(): Error {
  const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
  error.cause = { code: "ECONNREFUSED" };
  return error;
}

describe("resolveApiUpstreamCandidates", () => {
  it("uses only the configured internal API in production (prod compose env)", () => {
    expect(
      resolveApiUpstreamCandidates({
        NODE_ENV: "production",
        INTERNAL_API_URL: "http://api:3000/api/v1",
        NEXT_PUBLIC_API_URL: "/api/v1",
        PORT: "3000",
      }),
    ).toEqual(["http://api:3000/api/v1"]);
  });

  it("falls back to api:3000 in production when nothing absolute is configured", () => {
    expect(
      resolveApiUpstreamCandidates({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "/api/v1" }),
    ).toEqual(["http://api:3000/api/v1"]);
  });

  it("never lists this web server itself", () => {
    const production = resolveApiUpstreamCandidates({
      NODE_ENV: "production",
      INTERNAL_API_URL: "http://localhost:3000/api/v1",
      PORT: "3000",
    });
    expect(production).toEqual(["http://api:3000/api/v1"]);

    const development = resolveApiUpstreamCandidates({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_URL: "http://localhost:3001/api/v1",
      PORT: "3000",
    });
    expect(development).not.toContain("http://localhost:3000/api/v1");
    expect(development[0]).toBe("http://localhost:3001/api/v1");
  });

  it("keeps the development fallbacks (minus self) and de-duplicates", () => {
    expect(
      resolveApiUpstreamCandidates({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_URL: "http://localhost:3001/api/v1/",
      }),
    ).toEqual([
      "http://localhost:3001/api/v1",
      "http://api:3001/api/v1",
      "http://api:3000/api/v1",
    ]);
  });
});

describe("isSelfApiUrl", () => {
  it("matches loopback hosts on the web port only", () => {
    expect(isSelfApiUrl("http://localhost:3000/api/v1", "3000")).toBe(true);
    expect(isSelfApiUrl("http://127.0.0.1:3000/api/v1", "3000")).toBe(true);
    expect(isSelfApiUrl("http://localhost:3001/api/v1", "3000")).toBe(false);
    expect(isSelfApiUrl("http://api:3000/api/v1", "3000")).toBe(false);
    expect(isSelfApiUrl("not a url", "3000")).toBe(false);
  });
});

describe("canTryNextUpstream", () => {
  it("never re-sends a timed-out POST/PUT/PATCH/DELETE to another host", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(canTryNextUpstream(method, abortError())).toBe(false);
    }
  });

  it("allows another host when the request never reached the API", () => {
    expect(canTryNextUpstream("POST", connectionRefused())).toBe(true);
  });

  it("allows another host for safe methods even after a timeout", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(canTryNextUpstream(method, abortError())).toBe(true);
    }
  });
});

describe("describeUpstreamError", () => {
  it("returns a short code", () => {
    expect(describeUpstreamError(abortError())).toBe("timeout");
    expect(describeUpstreamError(connectionRefused())).toBe("ECONNREFUSED");
    expect(describeUpstreamError("weird")).toBe("unknown");
  });
});
