import { resolvePublicApiBaseUrl } from "./public-api-url";

describe("resolvePublicApiBaseUrl", () => {
  it("falls back to same-origin API for empty values", () => {
    expect(resolvePublicApiBaseUrl(undefined)).toBe("/api/v1");
    expect(resolvePublicApiBaseUrl("")).toBe("/api/v1");
    expect(resolvePublicApiBaseUrl("   ")).toBe("/api/v1");
  });

  it("keeps explicit relative API paths", () => {
    expect(resolvePublicApiBaseUrl("/api/v1")).toBe("/api/v1");
    expect(resolvePublicApiBaseUrl("/api/v1/")).toBe("/api/v1");
  });

  it("falls back to same-origin API for loopback hosts", () => {
    expect(resolvePublicApiBaseUrl("http://localhost:3001/api/v1")).toBe(
      "/api/v1",
    );
    expect(resolvePublicApiBaseUrl("http://127.0.0.1:3001/api/v1")).toBe(
      "/api/v1",
    );
    expect(resolvePublicApiBaseUrl("http://0.0.0.0:3001/api/v1")).toBe(
      "/api/v1",
    );
    expect(resolvePublicApiBaseUrl("http://[::1]:3001/api/v1")).toBe(
      "/api/v1",
    );
  });

  it("falls back to same-origin API for malformed values", () => {
    expect(resolvePublicApiBaseUrl("0.0.0.0:3000/api/v1")).toBe("/api/v1");
    expect(resolvePublicApiBaseUrl("api.example.com/api/v1")).toBe("/api/v1");
    expect(resolvePublicApiBaseUrl("not-a-url")).toBe("/api/v1");
  });

  it("keeps valid absolute non-loopback API origins", () => {
    expect(resolvePublicApiBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1",
    );
    expect(resolvePublicApiBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1",
    );
  });
});
