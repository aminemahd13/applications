import {
  buildReviewerAssignmentPreviewPayload,
  computeEffectiveStepIds,
  isPreviewStaleApiError,
} from "./reviewer-assignment";

describe("reviewer-assignment helpers", () => {
  it("computes effective step ids from include/exclude", () => {
    expect(
      computeEffectiveStepIds(["step-1", "step-2", "step-1"], ["step-2"]),
    ).toEqual(["step-1"]);
  });

  it("throws validation error when reviewer pool is empty", () => {
    expect(() =>
      buildReviewerAssignmentPreviewPayload({
        mode: "equal_distribution",
        reviewerPoolUserIds: [],
        includeStepIds: ["step-1"],
        excludeStepIds: [],
        runPolicy: "reassign_all",
        ttlMinutes: 120,
      }),
    ).toThrow("Select at least one reviewer.");
  });

  it("throws validation error when fixed mode input is invalid", () => {
    expect(() =>
      buildReviewerAssignmentPreviewPayload({
        mode: "fixed_per_reviewer",
        reviewerPoolUserIds: ["r1"],
        includeStepIds: ["step-1"],
        excludeStepIds: [],
        runPolicy: "reassign_all",
        ttlMinutes: 120,
        fixedReviewsPerReviewer: -1,
      }),
    ).toThrow("Fixed mode requires a non-negative reviews-per-reviewer value.");
  });

  it("builds hybrid payload with per-reviewer targets", () => {
    const payload = buildReviewerAssignmentPreviewPayload({
      mode: "hybrid_manual_then_random",
      reviewerPoolUserIds: ["r1", "r2"],
      includeStepIds: ["step-1"],
      excludeStepIds: [],
      runPolicy: "unassigned_only",
      ttlMinutes: 90,
      hybridCountsByReviewerId: { r1: 2, r2: 0 },
    });

    expect(payload).toMatchObject({
      mode: "hybrid_manual_then_random",
      runPolicy: "unassigned_only",
      ttlMinutes: 90,
      hybridTargets: [
        { reviewerId: "r1", count: 2 },
        { reviewerId: "r2", count: 0 },
      ],
    });
  });

  it("detects PREVIEW_STALE API errors", () => {
    expect(isPreviewStaleApiError({ data: { code: "PREVIEW_STALE" } })).toBe(
      true,
    );
    expect(isPreviewStaleApiError({ data: { code: "OTHER" } })).toBe(false);
    expect(isPreviewStaleApiError(null)).toBe(false);
  });
});
