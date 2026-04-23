import { GET } from "./route";

describe("credentials assets route", () => {
  it("returns a relative redirect location", async () => {
    const response = await GET(
      {
        nextUrl: {
          search: "?key=events%2Fevent-1%2Fcertificates%2Fassets%2Ffont%2Fmy.woff2",
        },
      } as any,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/api/v1/credentials/assets?key=events%2Fevent-1%2Fcertificates%2Fassets%2Ffont%2Fmy.woff2",
    );
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });
});
