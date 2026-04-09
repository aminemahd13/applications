import {
  buildApplicationsFilterSignature,
  buildApplicationsListQuery,
  buildApplicationsQueryRequest,
  createAdvancedConditionNode,
  createEmptyAdvancedFilterTree,
  createQuickFilters,
  decodeFilterTreeFromUrl,
  encodeFilterTreeForUrl,
  formatProgressLabel,
  getFilterTreeStats,
  quickFiltersToApiFilterTree,
  quickFiltersToAdvancedTree,
  quickFiltersToSavedViewQuickState,
  toApiFilterTree,
  type ApplicationsAdvancedFilters,
} from "./applications-filters";
import { CreateApplicationSavedViewSchema } from "@event-platform/shared";

const STEP_ID = "11111111-1111-4111-8111-111111111111";
const REVIEWER_ID = "22222222-2222-4222-8222-222222222222";

function createLegacyFilters(
  partial?: Partial<ApplicationsAdvancedFilters>,
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
  it("serializes all legacy filter params", () => {
    const query = buildApplicationsListQuery({
      limit: 100,
      cursor: "cursor-1",
      searchQuery: "  ada  ",
      filters: createLegacyFilters({
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
      filters: createLegacyFilters({
        stepId: "__any__",
        stepStatus: "SUBMITTED",
      }),
    });

    expect(query.get("stepId")).toBeNull();
    expect(query.get("stepStatus")).toBeNull();
  });
});

describe("buildApplicationsFilterSignature", () => {
  it("changes when any active quick filter changes", () => {
    const base = buildApplicationsFilterSignature("ada", createLegacyFilters());
    const changed = buildApplicationsFilterSignature(
      "ada",
      createLegacyFilters({ hasDraftProgress: true }),
    );

    expect(base).not.toEqual(changed);
  });
});

describe("quickFiltersToApiFilterTree", () => {
  it("maps active quick filters into an AND root group", () => {
    const tree = quickFiltersToApiFilterTree(
      createQuickFilters({
        searchQuery: "ada",
        decisionStatus: "ACCEPTED",
        derivedStatus: ["waiting_review", "accepted"],
        stepId: STEP_ID,
        stepStatus: "SUBMITTED",
        reviewerId: REVIEWER_ID,
        tagsInput: "vip, intl",
        hasDraftProgress: true,
        completionBucket: ["50_99"],
        needsRevisionOnly: true,
      }),
    );

    expect(tree.type).toBe("group");
    expect(tree.mode).toBe("all");
    expect(tree.children.map((node) => node.type)).toEqual([
      "search_text",
      "decision_status",
      "derived_status",
      "step_status",
      "assigned_reviewer",
      "tags_all",
      "has_draft_progress",
      "completion_bucket",
      "needs_revision",
    ]);
  });

  it("drops invalid step IDs and supports unassigned reviewer sentinel", () => {
    const tree = quickFiltersToApiFilterTree(
      createQuickFilters({
        stepId: "not-a-uuid",
        stepStatus: "SUBMITTED",
        reviewerId: "__unassigned__",
      }),
    );

    expect(tree.children).toEqual([
      {
        type: "assigned_reviewer",
        matcher: "unassigned",
      },
    ]);
  });
});

describe("quickFiltersToSavedViewQuickState", () => {
  it("produces quickState that passes create saved view schema for default filters", () => {
    const quickFilters = createQuickFilters();
    const payload = {
      name: "My View",
      mode: "quick" as const,
      filterTree: quickFiltersToApiFilterTree(quickFilters),
      quickState: quickFiltersToSavedViewQuickState(quickFilters),
    };

    const result = CreateApplicationSavedViewSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("preserves valid selected stepId values", () => {
    const quickFilters = createQuickFilters({
      stepId: STEP_ID,
      stepStatus: "SUBMITTED",
    });
    const quickState = quickFiltersToSavedViewQuickState(quickFilters);

    expect(quickState.stepId).toBe(STEP_ID);
    const result = CreateApplicationSavedViewSchema.safeParse({
      name: "With Step",
      mode: "quick",
      filterTree: quickFiltersToApiFilterTree(quickFilters),
      quickState,
    });
    expect(result.success).toBe(true);
  });

  it("omits sentinel and invalid stepId values", () => {
    const sentinelState = quickFiltersToSavedViewQuickState(
      createQuickFilters({
        stepId: "__any__",
        stepStatus: "SUBMITTED",
      }),
    );
    const invalidState = quickFiltersToSavedViewQuickState(
      createQuickFilters({
        stepId: "not-a-uuid",
        stepStatus: "SUBMITTED",
      }),
    );

    expect(sentinelState.stepId).toBeUndefined();
    expect(invalidState.stepId).toBeUndefined();

    const invalidPayloadResult = CreateApplicationSavedViewSchema.safeParse({
      name: "Without Invalid Step",
      mode: "quick",
      filterTree: quickFiltersToApiFilterTree(
        createQuickFilters({
          stepId: "not-a-uuid",
          stepStatus: "SUBMITTED",
        }),
      ),
      quickState: invalidState,
    });
    expect(invalidPayloadResult.success).toBe(true);
  });
});

describe("buildApplicationsQueryRequest", () => {
  it("uses quick filters when mode is quick", () => {
    const request = buildApplicationsQueryRequest({
      limit: 50,
      mode: "quick",
      quickFilters: createQuickFilters({
        searchQuery: "ada",
      }),
      advancedTree: createEmptyAdvancedFilterTree(),
    });

    expect(request.filterTree.children).toEqual([
      { type: "search_text", value: "ada" },
    ]);
  });

  it("uses advanced tree when mode is advanced", () => {
    const root = createEmptyAdvancedFilterTree();
    const node = createAdvancedConditionNode("search_text", {
      stepId: STEP_ID,
    });
    if (node.type === "search_text") {
      node.value = "ada";
    }
    root.children.push(node);
    const request = buildApplicationsQueryRequest({
      limit: 20,
      mode: "advanced",
      quickFilters: createQuickFilters({
        searchQuery: "ignored",
      }),
      advancedTree: root,
    });

    expect(request.filterTree).toEqual(toApiFilterTree(root));
  });

  it("drops invalid advanced conditions before sending to API", () => {
    const root = createEmptyAdvancedFilterTree();
    const invalidStep = createAdvancedConditionNode("step_status");
    const validSearch = createAdvancedConditionNode("search_text");
    if (validSearch.type === "search_text") {
      validSearch.value = "ada";
    }
    root.children.push(invalidStep);
    root.children.push(validSearch);

    const request = buildApplicationsQueryRequest({
      limit: 20,
      mode: "advanced",
      quickFilters: createQuickFilters(),
      advancedTree: root,
    });

    expect(request.filterTree.children).toEqual([
      { type: "search_text", value: "ada" },
    ]);
  });
});

describe("advanced tree encoding", () => {
  it("round-trips through URL encoding/decoding", () => {
    const source = quickFiltersToApiFilterTree(
      createQuickFilters({
        searchQuery: "ada",
        tagsInput: "vip",
      }),
    );
    const encoded = encodeFilterTreeForUrl(source);
    expect(typeof encoded).toBe("string");
    const decoded = decodeFilterTreeFromUrl(encoded ?? "");
    expect(decoded).toEqual(source);
  });

  it("returns null for malformed encoded value", () => {
    expect(decodeFilterTreeFromUrl("@@not-base64@@")).toBeNull();
  });

  it("returns null for invalid encoded filter node values", () => {
    const encoded = encodeFilterTreeForUrl({
      type: "group",
      mode: "all",
      children: [
        {
          type: "step_status",
          stepId: "not-a-uuid",
          statuses: ["SUBMITTED"],
        },
      ],
    } as any);

    expect(decodeFilterTreeFromUrl(encoded ?? "")).toBeNull();
  });
});

describe("getFilterTreeStats", () => {
  it("counts depth and conditions", () => {
    const root = createEmptyAdvancedFilterTree();
    const nested = createEmptyAdvancedFilterTree();
    nested.children.push(createAdvancedConditionNode("search_text"));
    root.children.push(nested);
    root.children.push(createAdvancedConditionNode("needs_revision"));

    expect(getFilterTreeStats(root)).toEqual({
      maxDepth: 3,
      conditionCount: 2,
    });
  });

  it("quick->advanced conversion returns condition nodes", () => {
    const tree = quickFiltersToAdvancedTree(
      createQuickFilters({
        searchQuery: "ada",
        needsRevisionOnly: true,
      }),
    );
    expect(tree.children.some((child) => child.type === "search_text")).toBe(true);
    expect(tree.children.some((child) => child.type === "needs_revision")).toBe(true);
  });
});

describe("formatProgressLabel", () => {
  it("uses progressed count when available", () => {
    expect(
      formatProgressLabel({
        total: 4,
        completed: 1,
        progressed: 3,
      }),
    ).toBe("3/4 steps");
  });

  it("falls back to completed count when progressed is missing", () => {
    expect(
      formatProgressLabel({
        total: 5,
        completed: 2,
      }),
    ).toBe("2/5 steps");
  });
});
