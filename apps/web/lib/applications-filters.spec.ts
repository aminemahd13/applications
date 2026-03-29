import {
  buildApplicationsFilterSignature,
  buildApplicationsListQuery,
  formatProgressLabel,
  type ApplicationsAdvancedFilters,
} from "./applications-filters";

function createFilters(
  partial?: Partial<ApplicationsAdvancedFilters>
): ApplicationsAdvancedFilters {
  return {
    derivedStatus: [],
    decisionStatus: "all",
    stepId: "__any__",
    stepStatus: "all",
    reviewerId: "__any__",
    tagsInput: "",
    hasDraftProgress: false,
    completionBucket: [],
    needsRevisionOnly: false,
    ...partial,
  };
}

describe("buildApplicationsListQuery", () => {
  it("serializes all advanced filter params", () => {
    const query = buildApplicationsListQuery({
      limit: 100,
      cursor: "cursor-1",
      searchQuery: "  ada  ",
      filters: createFilters({
        derivedStatus: ["waiting_review", "accepted"],
        decisionStatus: "ACCEPTED",
        stepId: "step-1",
        stepStatus: "SUBMITTED",
        reviewerId: "reviewer-1",
        tagsInput: "vip, shortlist ,vip",
        hasDraftProgress: true,
        completionBucket: ["1_49", "100"],
        needsRevisionOnly: true,
      }),
    });

    expect(query.get("limit")).toBe("100");
    expect(query.get("cursor")).toBe("cursor-1");
    expect(query.get("q")).toBe("ada");
    expect(query.get("decisionStatus")).toBe("ACCEPTED");
    expect(query.get("stepId")).toBe("step-1");
    expect(query.get("stepStatus")).toBe("SUBMITTED");
    expect(query.get("assignedReviewerId")).toBe("reviewer-1");
    expect(query.getAll("tags")).toEqual(["vip", "shortlist"]);
    expect(query.getAll("derivedStatus")).toEqual(["waiting_review", "accepted"]);
    expect(query.get("hasDraftProgress")).toBe("true");
    expect(query.getAll("completionBucket")).toEqual(["1_49", "100"]);
    expect(query.get("needsRevisionOnly")).toBe("true");
  });

  it("omits stepStatus when stepId is not selected", () => {
    const query = buildApplicationsListQuery({
      limit: 100,
      filters: createFilters({
        stepId: "__any__",
        stepStatus: "SUBMITTED",
      }),
    });

    expect(query.get("stepId")).toBeNull();
    expect(query.get("stepStatus")).toBeNull();
  });
});

describe("buildApplicationsFilterSignature", () => {
  it("changes when any active filter changes", () => {
    const base = buildApplicationsFilterSignature("ada", createFilters());
    const changed = buildApplicationsFilterSignature(
      "ada",
      createFilters({ hasDraftProgress: true })
    );

    expect(base).not.toEqual(changed);
  });
});

describe("formatProgressLabel", () => {
  it("uses progressed count when available", () => {
    expect(
      formatProgressLabel({
        total: 4,
        completed: 1,
        progressed: 3,
      })
    ).toBe("3/4 steps");
  });

  it("falls back to completed count when progressed is missing", () => {
    expect(
      formatProgressLabel({
        total: 5,
        completed: 2,
      })
    ).toBe("2/5 steps");
  });
});
