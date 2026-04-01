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

export type DecisionStatusConditionValue = Exclude<DecisionStatusFilterValue, "all">;

export type StepStatusFilterValue =
  | "all"
  | "LOCKED"
  | "UNLOCKED"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "APPROVED"
  | "REJECTED_FINAL";

export type StepStatusConditionValue = Exclude<StepStatusFilterValue, "all">;

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

export interface ApplicationsQuickFilters extends ApplicationsAdvancedFilters {
  searchQuery: string;
}

export type ApplicationsSavedViewMode = "quick" | "advanced";
export type ApplicationsFilterMode = "all" | "any";
export type ApplicationsAssignedReviewerMatcher = "any" | "unassigned" | "specific";
export type ApplicationsFilterConditionType =
  | "search_text"
  | "decision_status"
  | "derived_status"
  | "step_status"
  | "assigned_reviewer"
  | "tags_any"
  | "tags_all"
  | "tags_none"
  | "completion_bucket"
  | "has_draft_progress"
  | "needs_revision";

interface ApplicationsFilterNodeBase {
  id: string;
  negate: boolean;
}

export interface ApplicationsFilterGroupNode extends ApplicationsFilterNodeBase {
  type: "group";
  mode: ApplicationsFilterMode;
  children: ApplicationsFilterNode[];
}

export interface ApplicationsSearchTextConditionNode
  extends ApplicationsFilterNodeBase {
  type: "search_text";
  value: string;
}

export interface ApplicationsDecisionStatusConditionNode
  extends ApplicationsFilterNodeBase {
  type: "decision_status";
  values: DecisionStatusConditionValue[];
}

export interface ApplicationsDerivedStatusConditionNode
  extends ApplicationsFilterNodeBase {
  type: "derived_status";
  values: DerivedStatusFilterValue[];
}

export interface ApplicationsStepStatusConditionNode
  extends ApplicationsFilterNodeBase {
  type: "step_status";
  stepId: string;
  statuses: StepStatusConditionValue[];
}

export interface ApplicationsAssignedReviewerConditionNode
  extends ApplicationsFilterNodeBase {
  type: "assigned_reviewer";
  matcher: ApplicationsAssignedReviewerMatcher;
  reviewerId?: string;
}

export interface ApplicationsTagsAnyConditionNode
  extends ApplicationsFilterNodeBase {
  type: "tags_any";
  values: string[];
}

export interface ApplicationsTagsAllConditionNode
  extends ApplicationsFilterNodeBase {
  type: "tags_all";
  values: string[];
}

export interface ApplicationsTagsNoneConditionNode
  extends ApplicationsFilterNodeBase {
  type: "tags_none";
  values: string[];
}

export interface ApplicationsCompletionBucketConditionNode
  extends ApplicationsFilterNodeBase {
  type: "completion_bucket";
  values: CompletionBucketValue[];
}

export interface ApplicationsHasDraftProgressConditionNode
  extends ApplicationsFilterNodeBase {
  type: "has_draft_progress";
  value: boolean;
}

export interface ApplicationsNeedsRevisionConditionNode
  extends ApplicationsFilterNodeBase {
  type: "needs_revision";
  value: boolean;
}

export type ApplicationsFilterConditionNode =
  | ApplicationsSearchTextConditionNode
  | ApplicationsDecisionStatusConditionNode
  | ApplicationsDerivedStatusConditionNode
  | ApplicationsStepStatusConditionNode
  | ApplicationsAssignedReviewerConditionNode
  | ApplicationsTagsAnyConditionNode
  | ApplicationsTagsAllConditionNode
  | ApplicationsTagsNoneConditionNode
  | ApplicationsCompletionBucketConditionNode
  | ApplicationsHasDraftProgressConditionNode
  | ApplicationsNeedsRevisionConditionNode;

export type ApplicationsFilterNode =
  | ApplicationsFilterGroupNode
  | ApplicationsFilterConditionNode;

interface ApplicationsApiFilterNodeBase {
  negate?: boolean;
}

export interface ApplicationsApiFilterGroup extends ApplicationsApiFilterNodeBase {
  type: "group";
  mode: ApplicationsFilterMode;
  children: ApplicationsApiFilterNode[];
}

export interface ApplicationsApiSearchTextCondition
  extends ApplicationsApiFilterNodeBase {
  type: "search_text";
  value: string;
}

export interface ApplicationsApiDecisionStatusCondition
  extends ApplicationsApiFilterNodeBase {
  type: "decision_status";
  values: DecisionStatusConditionValue[];
}

export interface ApplicationsApiDerivedStatusCondition
  extends ApplicationsApiFilterNodeBase {
  type: "derived_status";
  values: DerivedStatusFilterValue[];
}

export interface ApplicationsApiStepStatusCondition
  extends ApplicationsApiFilterNodeBase {
  type: "step_status";
  stepId: string;
  statuses: StepStatusConditionValue[];
}

export interface ApplicationsApiAssignedReviewerCondition
  extends ApplicationsApiFilterNodeBase {
  type: "assigned_reviewer";
  matcher: ApplicationsAssignedReviewerMatcher;
  reviewerId?: string;
}

export interface ApplicationsApiTagsAnyCondition
  extends ApplicationsApiFilterNodeBase {
  type: "tags_any";
  values: string[];
}

export interface ApplicationsApiTagsAllCondition
  extends ApplicationsApiFilterNodeBase {
  type: "tags_all";
  values: string[];
}

export interface ApplicationsApiTagsNoneCondition
  extends ApplicationsApiFilterNodeBase {
  type: "tags_none";
  values: string[];
}

export interface ApplicationsApiCompletionBucketCondition
  extends ApplicationsApiFilterNodeBase {
  type: "completion_bucket";
  values: CompletionBucketValue[];
}

export interface ApplicationsApiHasDraftProgressCondition
  extends ApplicationsApiFilterNodeBase {
  type: "has_draft_progress";
  value: boolean;
}

export interface ApplicationsApiNeedsRevisionCondition
  extends ApplicationsApiFilterNodeBase {
  type: "needs_revision";
  value: boolean;
}

export type ApplicationsApiFilterCondition =
  | ApplicationsApiSearchTextCondition
  | ApplicationsApiDecisionStatusCondition
  | ApplicationsApiDerivedStatusCondition
  | ApplicationsApiStepStatusCondition
  | ApplicationsApiAssignedReviewerCondition
  | ApplicationsApiTagsAnyCondition
  | ApplicationsApiTagsAllCondition
  | ApplicationsApiTagsNoneCondition
  | ApplicationsApiCompletionBucketCondition
  | ApplicationsApiHasDraftProgressCondition
  | ApplicationsApiNeedsRevisionCondition;

export type ApplicationsApiFilterNode =
  | ApplicationsApiFilterGroup
  | ApplicationsApiFilterCondition;

export interface ApplicationsQueryRequest {
  cursor?: string;
  limit: number;
  order: "asc" | "desc";
  filterTree: ApplicationsApiFilterGroup;
}

interface BuildApplicationsListQueryInput {
  limit: number;
  cursor?: string | null;
  searchQuery?: string;
  filters: ApplicationsAdvancedFilters;
}

interface BuildApplicationsQueryRequestInput {
  limit: number;
  cursor?: string | null;
  order?: "asc" | "desc";
  mode: ApplicationsSavedViewMode;
  quickFilters: ApplicationsQuickFilters;
  advancedTree: ApplicationsFilterGroupNode;
}

interface BuildApplicationsQuerySignatureInput {
  mode: ApplicationsSavedViewMode;
  quickFilters: ApplicationsQuickFilters;
  advancedTree: ApplicationsFilterGroupNode;
}

interface FilterTreeStats {
  maxDepth: number;
  conditionCount: number;
}

let filterNodeCounter = 0;

function nextFilterNodeId(): string {
  filterNodeCounter += 1;
  return `flt_${filterNodeCounter.toString(36)}`;
}

function toBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized.length % 4 === 0
      ? normalized
      : `${normalized}${"=".repeat(4 - (normalized.length % 4))}`;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isApiFilterCondition(value: unknown): value is ApplicationsApiFilterCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; [key: string]: unknown };
  switch (candidate.type) {
    case "search_text":
      return typeof candidate.value === "string";
    case "decision_status":
      return isStringArray(candidate.values);
    case "derived_status":
      return isStringArray(candidate.values);
    case "step_status":
      return typeof candidate.stepId === "string" && isStringArray(candidate.statuses);
    case "assigned_reviewer":
      return (
        (candidate.matcher === "any" ||
          candidate.matcher === "unassigned" ||
          candidate.matcher === "specific") &&
        (candidate.reviewerId === undefined || typeof candidate.reviewerId === "string")
      );
    case "tags_any":
    case "tags_all":
    case "tags_none":
      return isStringArray(candidate.values);
    case "completion_bucket":
      return isStringArray(candidate.values);
    case "has_draft_progress":
    case "needs_revision":
      return typeof candidate.value === "boolean";
    default:
      return false;
  }
}

function isApiFilterGroup(value: unknown): value is ApplicationsApiFilterGroup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; mode?: unknown; children?: unknown };
  if (candidate.type !== "group") return false;
  if (candidate.mode !== "all" && candidate.mode !== "any") return false;
  if (!Array.isArray(candidate.children)) return false;
  return candidate.children.every(
    (child) => isApiFilterGroup(child) || isApiFilterCondition(child),
  );
}

export function parseTagFilterInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function createQuickFilters(
  partial?: Partial<ApplicationsQuickFilters>,
): ApplicationsQuickFilters {
  return {
    searchQuery: "",
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

export function createEmptyAdvancedFilterTree(): ApplicationsFilterGroupNode {
  return {
    id: nextFilterNodeId(),
    type: "group",
    mode: "all",
    negate: false,
    children: [],
  };
}

export function createAdvancedConditionNode(
  type: ApplicationsFilterConditionType,
  context?: {
    stepId?: string;
    reviewerId?: string;
  },
): ApplicationsFilterConditionNode {
  const id = nextFilterNodeId();
  switch (type) {
    case "search_text":
      return { id, type, negate: false, value: "" };
    case "decision_status":
      return { id, type, negate: false, values: ["ACCEPTED"] };
    case "derived_status":
      return { id, type, negate: false, values: ["waiting_review"] };
    case "step_status":
      return {
        id,
        type,
        negate: false,
        stepId: context?.stepId ?? "",
        statuses: ["SUBMITTED"],
      };
    case "assigned_reviewer":
      return {
        id,
        type,
        negate: false,
        matcher: context?.reviewerId ? "specific" : "any",
        ...(context?.reviewerId ? { reviewerId: context.reviewerId } : {}),
      };
    case "tags_any":
      return { id, type, negate: false, values: ["vip"] };
    case "tags_all":
      return { id, type, negate: false, values: ["vip"] };
    case "tags_none":
      return { id, type, negate: false, values: ["vip"] };
    case "completion_bucket":
      return { id, type, negate: false, values: ["100"] };
    case "has_draft_progress":
      return { id, type, negate: false, value: true };
    case "needs_revision":
      return { id, type, negate: false, value: true };
    default:
      return { id, type: "search_text", negate: false, value: "" };
  }
}

export function toApiFilterTree(
  tree: ApplicationsFilterGroupNode,
): ApplicationsApiFilterGroup {
  const convert = (node: ApplicationsFilterNode): ApplicationsApiFilterNode => {
    if (node.type === "group") {
      return {
        type: "group",
        mode: node.mode,
        ...((node.negate && { negate: true }) || {}),
        children: node.children.map(convert),
      };
    }
    switch (node.type) {
      case "search_text":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          value: node.value,
        };
      case "decision_status":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          values: [...node.values],
        };
      case "derived_status":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          values: [...node.values],
        };
      case "step_status":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          stepId: node.stepId,
          statuses: [...node.statuses],
        };
      case "assigned_reviewer":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          matcher: node.matcher,
          ...(node.reviewerId ? { reviewerId: node.reviewerId } : {}),
        };
      case "tags_any":
      case "tags_all":
      case "tags_none":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          values: [...node.values],
        };
      case "completion_bucket":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          values: [...node.values],
        };
      case "has_draft_progress":
      case "needs_revision":
        return {
          type: node.type,
          ...((node.negate && { negate: true }) || {}),
          value: node.value,
        };
      default:
        return {
          type: "search_text",
          value: "",
        };
    }
  };
  return convert(tree) as ApplicationsApiFilterGroup;
}

export function fromApiFilterTree(
  tree: ApplicationsApiFilterGroup,
): ApplicationsFilterGroupNode {
  const convert = (node: ApplicationsApiFilterNode): ApplicationsFilterNode => {
    if (node.type === "group") {
      return {
        id: nextFilterNodeId(),
        type: "group",
        mode: node.mode,
        negate: Boolean(node.negate),
        children: node.children.map(convert),
      };
    }

    switch (node.type) {
      case "search_text":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          value: node.value,
        };
      case "decision_status":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          values: [...node.values],
        };
      case "derived_status":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          values: [...node.values],
        };
      case "step_status":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          stepId: node.stepId,
          statuses: [...node.statuses],
        };
      case "assigned_reviewer":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          matcher: node.matcher,
          ...(node.reviewerId ? { reviewerId: node.reviewerId } : {}),
        };
      case "tags_any":
      case "tags_all":
      case "tags_none":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          values: [...node.values],
        };
      case "completion_bucket":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          values: [...node.values],
        };
      case "has_draft_progress":
      case "needs_revision":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          value: node.value,
        };
      default:
        return createAdvancedConditionNode("search_text");
    }
  };
  return convert(tree) as ApplicationsFilterGroupNode;
}

export function quickFiltersToApiFilterTree(
  quickFilters: ApplicationsQuickFilters,
): ApplicationsApiFilterGroup {
  const children: ApplicationsApiFilterNode[] = [];
  const query = quickFilters.searchQuery.trim();

  if (query.length > 0) {
    children.push({
      type: "search_text",
      value: query,
    });
  }
  if (quickFilters.decisionStatus !== "all") {
    children.push({
      type: "decision_status",
      values: [quickFilters.decisionStatus],
    });
  }
  if (quickFilters.derivedStatus.length > 0) {
    children.push({
      type: "derived_status",
      values: [...quickFilters.derivedStatus],
    });
  }
  if (
    quickFilters.stepId &&
    quickFilters.stepId !== "__any__" &&
    quickFilters.stepStatus !== "all"
  ) {
    children.push({
      type: "step_status",
      stepId: quickFilters.stepId,
      statuses: [quickFilters.stepStatus],
    });
  }
  if (quickFilters.reviewerId !== "__any__") {
    children.push({
      type: "assigned_reviewer",
      matcher: "specific",
      reviewerId: quickFilters.reviewerId,
    });
  }
  const tags = parseTagFilterInput(quickFilters.tagsInput);
  if (tags.length > 0) {
    children.push({
      type: "tags_all",
      values: tags,
    });
  }
  if (quickFilters.hasDraftProgress) {
    children.push({
      type: "has_draft_progress",
      value: true,
    });
  }
  if (quickFilters.completionBucket.length > 0) {
    children.push({
      type: "completion_bucket",
      values: [...quickFilters.completionBucket],
    });
  }
  if (quickFilters.needsRevisionOnly) {
    children.push({
      type: "needs_revision",
      value: true,
    });
  }

  return {
    type: "group",
    mode: "all",
    children,
  };
}

export function quickFiltersToAdvancedTree(
  quickFilters: ApplicationsQuickFilters,
): ApplicationsFilterGroupNode {
  return fromApiFilterTree(quickFiltersToApiFilterTree(quickFilters));
}

export function buildApplicationsQueryRequest(
  input: BuildApplicationsQueryRequestInput,
): ApplicationsQueryRequest {
  return {
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: input.limit,
    order: input.order ?? "desc",
    filterTree:
      input.mode === "quick"
        ? quickFiltersToApiFilterTree(input.quickFilters)
        : toApiFilterTree(input.advancedTree),
  };
}

export function buildApplicationsQuerySignature(
  input: BuildApplicationsQuerySignatureInput,
): string {
  return JSON.stringify({
    mode: input.mode,
    quick: {
      searchQuery: input.quickFilters.searchQuery.trim(),
      derivedStatus: [...input.quickFilters.derivedStatus].sort(),
      decisionStatus: input.quickFilters.decisionStatus,
      stepId: input.quickFilters.stepId,
      stepStatus: input.quickFilters.stepStatus,
      reviewerId: input.quickFilters.reviewerId,
      tags: parseTagFilterInput(input.quickFilters.tagsInput),
      hasDraftProgress: input.quickFilters.hasDraftProgress,
      completionBucket: [...input.quickFilters.completionBucket].sort(),
      needsRevisionOnly: input.quickFilters.needsRevisionOnly,
    },
    advanced: toApiFilterTree(input.advancedTree),
  });
}

export function encodeFilterTreeForUrl(
  tree: ApplicationsApiFilterGroup,
): string | null {
  try {
    return toBase64Url(JSON.stringify(tree));
  } catch {
    return null;
  }
}

export function decodeFilterTreeFromUrl(
  encoded: string,
): ApplicationsApiFilterGroup | null {
  if (!encoded || encoded.trim().length === 0) return null;
  try {
    const decoded = fromBase64Url(encoded.trim());
    const parsed = JSON.parse(decoded);
    return isApiFilterGroup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getFilterTreeStats(tree: ApplicationsFilterGroupNode): FilterTreeStats {
  const walk = (
    node: ApplicationsFilterNode,
    depth: number,
  ): { maxDepth: number; conditionCount: number } => {
    if (node.type !== "group") {
      return { maxDepth: depth, conditionCount: 1 };
    }
    let maxDepth = depth;
    let conditionCount = 0;
    node.children.forEach((child) => {
      const stats = walk(child, depth + 1);
      maxDepth = Math.max(maxDepth, stats.maxDepth);
      conditionCount += stats.conditionCount;
    });
    return { maxDepth, conditionCount };
  };
  return walk(tree, 1);
}

export function buildApplicationsFilterSignature(
  searchQuery: string,
  filters: ApplicationsAdvancedFilters,
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
  input: BuildApplicationsListQueryInput,
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
