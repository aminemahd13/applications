export type AssignmentMode =
  | "equal_distribution"
  | "fixed_per_reviewer"
  | "hybrid_manual_then_random"
  | "pure_random";

export type RunPolicy = "reassign_all" | "unassigned_only";

export interface ReviewerAssignmentPreviewInput {
  mode: AssignmentMode;
  reviewerPoolUserIds: string[];
  includeStepIds: string[];
  excludeStepIds: string[];
  runPolicy: RunPolicy;
  ttlMinutes: number;
  fixedReviewsPerReviewer?: number;
  hybridCountsByReviewerId?: Record<string, number>;
}

export function computeEffectiveStepIds(
  includeStepIds: string[],
  excludeStepIds: string[],
): string[] {
  const include = Array.from(new Set(includeStepIds.filter(Boolean)));
  const exclude = new Set(excludeStepIds.filter(Boolean));
  return include.filter((stepId) => !exclude.has(stepId));
}

export function buildReviewerAssignmentPreviewPayload(
  input: ReviewerAssignmentPreviewInput,
): Record<string, unknown> {
  const reviewerPoolUserIds = Array.from(
    new Set(input.reviewerPoolUserIds.filter(Boolean)),
  );
  if (reviewerPoolUserIds.length === 0) {
    throw new Error("Select at least one reviewer.");
  }

  const ttlMinutes = Math.round(input.ttlMinutes);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1) {
    throw new Error("TTL must be at least 1 minute.");
  }

  const includeStepIds = Array.from(new Set(input.includeStepIds.filter(Boolean)));
  const excludeStepIds = Array.from(new Set(input.excludeStepIds.filter(Boolean)));
  const effectiveStepIds = computeEffectiveStepIds(includeStepIds, excludeStepIds);
  if (effectiveStepIds.length === 0) {
    throw new Error(
      "Choose at least one effective step (included and not excluded).",
    );
  }

  const payload: Record<string, unknown> = {
    mode: input.mode,
    reviewerPoolUserIds,
    includeStepIds,
    excludeStepIds,
    runPolicy: input.runPolicy,
    ttlMinutes,
  };

  if (input.mode === "fixed_per_reviewer") {
    const fixed = Math.round(input.fixedReviewsPerReviewer ?? -1);
    if (!Number.isFinite(fixed) || fixed < 0) {
      throw new Error("Fixed mode requires a non-negative reviews-per-reviewer value.");
    }
    payload.fixedReviewsPerReviewer = fixed;
  }

  if (input.mode === "hybrid_manual_then_random") {
    const counts = input.hybridCountsByReviewerId ?? {};
    payload.hybridTargets = reviewerPoolUserIds.map((reviewerId) => ({
      reviewerId,
      count: Math.max(0, Math.round(Number(counts[reviewerId] ?? 0) || 0)),
    }));
  }

  return payload;
}

export function isPreviewStaleApiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const payload = (error as { data?: { code?: unknown } }).data;
  return payload?.code === "PREVIEW_STALE";
}
