import {
  buildCheckinAttendeesQuery,
  buildCheckinExportRequest,
  normalizeCheckinTags,
} from "./checkin-filters";

describe("normalizeCheckinTags", () => {
  it("trims and deduplicates tags", () => {
    expect(normalizeCheckinTags([" campus-a ", "campus-a", "", "campus-b"])).toEqual([
      "campus-a",
      "campus-b",
    ]);
  });
});

describe("buildCheckinAttendeesQuery", () => {
  it("serializes attendee filters and pagination", () => {
    const params = buildCheckinAttendeesQuery({
      status: "not_checked_in",
      tags: ["campus-a", "campus-a", "campus-b"],
      search: "  ada ",
      page: 2,
      pageSize: 75,
    });

    expect(params.get("status")).toBe("not_checked_in");
    expect(params.get("tags")).toBe("campus-a,campus-b");
    expect(params.get("search")).toBe("ada");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("75");
  });
});

describe("buildCheckinExportRequest", () => {
  it("serializes filters and export columns", () => {
    const request = buildCheckinExportRequest({
      status: "checked_in",
      tags: ["campus-a", "campus-a"],
      search: "  ada  ",
      columns: ["applicationId", "applicationId", "isCheckedIn"] as any,
      portal: "staff",
    });

    expect(request).toEqual({
      status: "checked_in",
      tags: ["campus-a"],
      search: "ada",
      columns: ["applicationId", "isCheckedIn"],
      portal: "staff",
    });
  });
});

