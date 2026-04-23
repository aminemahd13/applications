import { apiClient } from "@/lib/api";
import {
  listIssuedCertificates,
  revokeIssuedCertificate,
} from "./certificates";

jest.mock("@/lib/api", () => ({
  apiClient: jest.fn(),
}));

describe("certificates api client", () => {
  const apiClientMock = apiClient as jest.MockedFunction<typeof apiClient>;

  beforeEach(() => {
    apiClientMock.mockReset();
  });

  it("passes issued history search through to the issued certificates endpoint", async () => {
    apiClientMock.mockResolvedValue({ data: [] } as never);

    await listIssuedCertificates("event-1", {
      search: "  amina  ",
      limit: 100,
    });

    const [path] = apiClientMock.mock.calls[0] ?? [];
    expect(path).toContain("/events/event-1/certificates/issued?");
    expect(path).toContain("search=amina");
    expect(path).toContain("limit=100");
  });

  it("returns deletion acknowledgement from revoke endpoint", async () => {
    apiClientMock.mockResolvedValue({
      data: { id: "issued-1", deleted: true },
    } as never);

    const response = await revokeIssuedCertificate(
      "event-1",
      "issued-1",
      "Duplicate issuance",
      "csrf-token",
    );

    expect(apiClientMock).toHaveBeenCalledWith(
      "/events/event-1/certificates/issued-1/revoke",
      {
        method: "POST",
        body: { reason: "Duplicate issuance" },
        csrfToken: "csrf-token",
      },
    );
    expect(response).toEqual({ id: "issued-1", deleted: true });
  });
});
