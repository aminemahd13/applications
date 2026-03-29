export type DerivedStatusFilterValue =
  | "waiting_applicant"
  | "waiting_review"
  | "revision_required"
  | "all_required_steps_approved"
  | "accepted"
  | "waitlisted"
  | "confirmed"
  | "rejected";

export type CompletionBucketValue = "0" | "1_49" | "50_99" | "100";

export type DecisionStatusFilterValue =
  | "all"
  | "NONE"
  | "ACCEPTED"
  | "WAITLISTED"
  | "REJECTED";

export type StepStatusFilterValue =
  | "all"
  | "LOCKED"
  | "UNLOCKED"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED_FINAL";

export interface ApplicationsAdvancedFilters {
  derivedStatus: DerivedStatusFilterValue[];
  decisionStatus: DecisionStatusFilterValue;
  stepId: string;
  stepStatus: StepStatusFilterValue;
  reviewerId: string;
  tagsInput: string;
  hasDraftProgress: boolean;
  completionBucket: CompletionBucketValue[];
  needsRevisionOnly: boolean;
}

interface BuildApplicationsListQueryInput {
  limit: number;
  cursor?: string | null;
  searchQuery?: string;
  filters: ApplicationsAdvancedFilters;
}

export function parseTagFilterInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

export function buildApplicationsFilterSignature(
  searchQuery: string,
  filters: ApplicationsAdvancedFilters
): string {
  return JSON.stringify({
    q: searchQuery.trim(),
    derivedStatus: [...filters.derivedStatus].sort(),
    decisionStatus: filters.decisionStatus,
    stepId: filters.stepId,
    stepStatus: filters.stepStatus,
    reviewerId: filters.reviewerId,
    tags: parseTagFilterInput(filters.tagsInput),
    hasDraftProgress: filters.hasDraftProgress,
    completionBucket: [...filters.completionBucket].sort(),
    needsRevisionOnly: filters.needsRevisionOnly,
  });
}

export function buildApplicationsListQuery(
  input: BuildApplicationsListQueryInput
): URLSearchParams {
  const { limit, cursor, searchQuery, filters } = input;
  const query = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) query.set("cursor", cursor);

  const normalizedQuery = (searchQuery ?? "").trim();
  if (normalizedQuery.length > 0) {
    query.set("q", normalizedQuery);
  }

  if (filters.decisionStatus !== "all") {
    query.set("decisionStatus", filters.decisionStatus);
  }

  if (filters.stepId && filters.stepId !== "__any__" && filters.stepStatus !== "all") {
    query.set("stepId", filters.stepId);
    query.set("stepStatus", filters.stepStatus);
  }

  if (filters.reviewerId && filters.reviewerId !== "__any__") {
    query.set("assignedReviewerId", filters.reviewerId);
  }

  for (const tag of parseTagFilterInput(filters.tagsInput)) {
    query.append("tags", tag);
  }

  for (const status of filters.derivedStatus) {
    query.append("derivedStatus", status);
  }

  if (filters.hasDraftProgress) {
    query.set("hasDraftProgress", "true");
  }

  for (const bucket of filters.completionBucket) {
    query.append("completionBucket", bucket);
  }

  if (filters.needsRevisionOnly) {
    query.set("needsRevisionOnly", "true");
  }

  return query;
}

export function formatProgressLabel(stepsSummary?: {
  total?: number;
  completed?: number;
  progressed?: number;
}): string {
  if (!stepsSummary) return "";
  const total =
    typeof stepsSummary.total === "number" && Number.isFinite(stepsSummary.total)
      ? stepsSummary.total
      : 0;
  const progressed =
    typeof stepsSummary.progressed === "number" &&
    Number.isFinite(stepsSummary.progressed)
      ? stepsSummary.progressed
      : typeof stepsSummary.completed === "number" &&
        Number.isFinite(stepsSummary.completed)
      ? stepsSummary.completed
      : 0;
  return `${progressed}/${total} steps`;
}
