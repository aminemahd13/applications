import {
  buildAdminUsersExportQuery,
  buildApplicationExportRequest,
  filenameFromContentDisposition,
  resolvePortalFromPathname,
} from "./export-payloads";

describe("buildApplicationExportRequest", () => {
  it("deduplicates ids/columns and preserves explicit options", () => {
    const result = buildApplicationExportRequest({
      applicationIds: ["  app-1 ", "app-1", "app-2"],
      columns: ["applicationId", "applicationId", "applicantName"] as any,
      includeResponseColumns: false,
      portal: "admin",
    });

    expect(result).toEqual({
      applicationIds: ["app-1", "app-2"],
      columns: ["applicationId", "applicantName"],
      includeResponseColumns: false,
      portal: "admin",
    });
  });
});

describe("buildAdminUsersExportQuery", () => {
  it("serializes search/filter/columns and boolean flags", () => {
    const params = buildAdminUsersExportQuery({
      search: "  ada ",
      filter: " staff ",
      columns: ["userId", "userId", "email"] as any,
      includeResponseColumns: true,
      portal: "admin",
    });

    expect(params.get("search")).toBe("ada");
    expect(params.get("filter")).toBe("staff");
    expect(params.getAll("columns")).toEqual(["userId", "email"]);
    expect(params.get("includeResponseColumns")).toBe("true");
    expect(params.get("portal")).toBe("admin");
  });
});

describe("resolvePortalFromPathname", () => {
  it("detects admin and staff portals from route path", () => {
    expect(resolvePortalFromPathname("/admin/events/abc/applications")).toBe(
      "admin",
    );
    expect(resolvePortalFromPathname("/staff/abc/applications")).toBe("staff");
  });
});

describe("filenameFromContentDisposition", () => {
  it("extracts utf8 filename fallback-safe", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''users-export.csv",
        "fallback.csv",
      ),
    ).toBe("users-export.csv");
    expect(filenameFromContentDisposition(null, "fallback.csv")).toBe(
      "fallback.csv",
    );
  });
});

