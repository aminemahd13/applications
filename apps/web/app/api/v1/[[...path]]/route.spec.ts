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
