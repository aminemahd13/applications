import { GET } from "./route";

describe("credentials qr route", () => {
  it("returns a relative redirect location", async () => {
    const response = await GET(
      {
        nextUrl: {
          search: "?source=qr",
        },
      } as any,
      {
        params: Promise.resolve({ token: "token-1" }),
      },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/api/v1/credentials/qr/token-1?source=qr",
    );
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });
});
