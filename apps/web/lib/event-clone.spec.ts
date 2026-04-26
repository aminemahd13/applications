import {
  buildCloneSourceListPath,
  fetchCloneSourceOptions,
  resolveCreateEventEndpoint,
} from "./event-clone";

describe("event clone helpers", () => {
  it("resolves create endpoint based on source selection", () => {
    expect(resolveCreateEventEndpoint(undefined)).toBe("/admin/events");
    expect(resolveCreateEventEndpoint(null)).toBe("/admin/events");
    expect(resolveCreateEventEndpoint("event-1")).toBe("/admin/events/clone");
  });

  it("builds clone source path with includeArchived and cursor", () => {
    expect(buildCloneSourceListPath()).toContain("includeArchived=true");
    expect(buildCloneSourceListPath()).toContain("limit=100");

    const withCursor = buildCloneSourceListPath("cursor-1");
    expect(withCursor).toContain("includeArchived=true");
    expect(withCursor).toContain("cursor=cursor-1");
  });

  it("fetches clone source options across pages with includeArchived=true", async () => {
    const calls: string[] = [];
    const apiClient = jest
      .fn()
      .mockImplementation(async (path: string) => {
        calls.push(path);
        if (calls.length === 1) {
          return {
            data: [
              { id: "event-1", title: "Active Event", status: "published" },
              { id: "event-2", title: "Archived Event", status: "archived" },
            ],
            meta: { hasMore: true, nextCursor: "cursor-2" },
          };
        }
        return {
          data: [{ id: "event-3", title: "Another Event", status: "draft" }],
          meta: { hasMore: false, nextCursor: null },
        };
      });

    const result = await fetchCloneSourceOptions(apiClient);

    expect(result).toEqual([
      {
        id: "event-1",
        title: "Active Event",
        slug: "",
        status: "published",
      },
      {
        id: "event-2",
        title: "Archived Event",
        slug: "",
        status: "archived",
      },
      {
        id: "event-3",
        title: "Another Event",
        slug: "",
        status: "draft",
      },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("includeArchived=true");
    expect(calls[1]).toContain("includeArchived=true");
  });
});
