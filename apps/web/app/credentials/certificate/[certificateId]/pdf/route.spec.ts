import { GET } from "./route";

describe("credentials certificate pdf route", () => {
  it("returns a relative redirect location", async () => {
    const response = await GET(
      {
        nextUrl: {
          search: "?download=1",
        },
      } as any,
      {
        params: Promise.resolve({ certificateId: "cert-1" }),
      },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/api/v1/credentials/certificate/cert-1/pdf?download=1",
    );
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });
});
