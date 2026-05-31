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

export interface ApplicationsSavedViewQuickState {
  searchQuery?: string;
  derivedStatus?: DerivedStatusFilterValue[];
  decisionStatus?: DecisionStatusFilterValue;
  stepId?: string;
  stepStatus?: StepStatusFilterValue;
  reviewerId?: "__any__" | string;
  tagsInput?: string;
  hasDraftProgress?: boolean;
  completionBucket?: CompletionBucketValue[];
  needsRevisionOnly?: boolean;
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
  | "needs_revision"
  | "field_answer";

export type ApplicationsFieldAnswerMatcher =
  | "any"
  | "all"
  | "none"
  | "equals"
  | "contains"
  | "not_contains";

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

export interface ApplicationsFieldAnswerConditionNode
  extends ApplicationsFilterNodeBase {
  type: "field_answer";
  stepId: string;
  fieldKey: string;
  matcher: ApplicationsFieldAnswerMatcher;
  values: string[];
  /** UI-only display hints; not sent to the API. */
  fieldLabel?: string;
  fieldType?: string;
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
  | ApplicationsNeedsRevisionConditionNode
  | ApplicationsFieldAnswerConditionNode;

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

export interface ApplicationsApiFieldAnswerCondition
  extends ApplicationsApiFilterNodeBase {
  type: "field_answer";
  stepId: string;
  fieldKey: string;
  matcher: ApplicationsFieldAnswerMatcher;
  values: string[];
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
  | ApplicationsApiNeedsRevisionCondition
  | ApplicationsApiFieldAnswerCondition;

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
const MAX_QUERY_FILTER_DEPTH = 3;
const MAX_QUERY_FILTER_CONDITIONS = 40;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DERIVED_STATUS_VALUES: readonly DerivedStatusFilterValue[] = [
  "waiting_applicant",
  "waiting_review",
  "revision_required",
  "all_required_steps_approved",
  "accepted",
  "waitlisted",
  "confirmed",
  "rejected",
];

const DECISION_STATUS_FILTER_VALUES: readonly DecisionStatusFilterValue[] = [
  "all",
  "NONE",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
];

const DECISION_STATUS_CONDITION_VALUES: readonly DecisionStatusConditionValue[] = [
  "NONE",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
];

const STEP_STATUS_FILTER_VALUES: readonly StepStatusFilterValue[] = [
  "all",
  "LOCKED",
  "UNLOCKED",
  "SUBMITTED",
  "NEEDS_REVISION",
  "APPROVED",
  "REJECTED_FINAL",
];

const STEP_STATUS_CONDITION_VALUES: readonly StepStatusConditionValue[] = [
  "LOCKED",
  "UNLOCKED",
  "SUBMITTED",
  "NEEDS_REVISION",
  "APPROVED",
  "REJECTED_FINAL",
];

const COMPLETION_BUCKET_VALUES: readonly CompletionBucketValue[] = [
  "0",
  "1_49",
  "50_99",
  "100",
];

const DERIVED_STATUS_SET = new Set<string>(DERIVED_STATUS_VALUES);
const DECISION_STATUS_FILTER_SET = new Set<string>(DECISION_STATUS_FILTER_VALUES);
const DECISION_STATUS_CONDITION_SET = new Set<string>(DECISION_STATUS_CONDITION_VALUES);
const STEP_STATUS_FILTER_SET = new Set<string>(STEP_STATUS_FILTER_VALUES);
const STEP_STATUS_CONDITION_SET = new Set<string>(STEP_STATUS_CONDITION_VALUES);
const COMPLETION_BUCKET_SET = new Set<string>(COMPLETION_BUCKET_VALUES);

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function isDerivedStatusFilterValue(value: unknown): value is DerivedStatusFilterValue {
  return typeof value === "string" && DERIVED_STATUS_SET.has(value);
}

function isDecisionStatusFilterValue(value: unknown): value is DecisionStatusFilterValue {
  return typeof value === "string" && DECISION_STATUS_FILTER_SET.has(value);
}

function isDecisionStatusConditionValue(value: unknown): value is DecisionStatusConditionValue {
  return typeof value === "string" && DECISION_STATUS_CONDITION_SET.has(value);
}

function isStepStatusFilterValue(value: unknown): value is StepStatusFilterValue {
  return typeof value === "string" && STEP_STATUS_FILTER_SET.has(value);
}

function isStepStatusConditionValue(value: unknown): value is StepStatusConditionValue {
  return typeof value === "string" && STEP_STATUS_CONDITION_SET.has(value);
}

function isCompletionBucketValue(value: unknown): value is CompletionBucketValue {
  return typeof value === "string" && COMPLETION_BUCKET_SET.has(value);
}

function uniqueTrimmedStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function pickAllowedValues<T extends string>(
  values: readonly string[],
  predicate: (value: unknown) => value is T,
): T[] {
  return uniqueTrimmedStrings(values).filter(predicate);
}

function normalizeNegate(
  negate: boolean | undefined,
): { negate: true } | Record<string, never> {
  return negate ? { negate: true } : {};
}

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

const FIELD_ANSWER_MATCHERS: ApplicationsFieldAnswerMatcher[] = [
  "any",
  "all",
  "none",
  "equals",
  "contains",
  "not_contains",
];

export function isFieldAnswerMatcher(
  value: unknown,
): value is ApplicationsFieldAnswerMatcher {
  return (
    typeof value === "string" &&
    (FIELD_ANSWER_MATCHERS as string[]).includes(value)
  );
}

function isApiFilterCondition(value: unknown): value is ApplicationsApiFilterCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; [key: string]: unknown };
  switch (candidate.type) {
    case "search_text":
      return typeof candidate.value === "string" && candidate.value.trim().length > 0;
    case "decision_status": {
      if (!isStringArray(candidate.values) || candidate.values.length === 0) return false;
      return candidate.values.every((entry) => isDecisionStatusConditionValue(entry));
    }
    case "derived_status": {
      if (!isStringArray(candidate.values) || candidate.values.length === 0) return false;
      return candidate.values.every((entry) => isDerivedStatusFilterValue(entry));
    }
    case "step_status":
      return (
        isUuid(candidate.stepId) &&
        isStringArray(candidate.statuses) &&
        candidate.statuses.length > 0 &&
        candidate.statuses.every((entry) => isStepStatusConditionValue(entry))
      );
    case "assigned_reviewer": {
      if (candidate.matcher === "specific") {
        return isUuid(candidate.reviewerId);
      }
      if (candidate.matcher === "any" || candidate.matcher === "unassigned") {
        return candidate.reviewerId === undefined;
      }
      return false;
    }
    case "tags_any":
    case "tags_all":
    case "tags_none":
      return (
        isStringArray(candidate.values) &&
        candidate.values.length > 0 &&
        candidate.values.every((entry) => entry.trim().length > 0)
      );
    case "completion_bucket":
      return (
        isStringArray(candidate.values) &&
        candidate.values.length > 0 &&
        candidate.values.every((entry) => isCompletionBucketValue(entry))
      );
    case "has_draft_progress":
    case "needs_revision":
      return typeof candidate.value === "boolean";
    case "field_answer":
      return (
        isUuid(candidate.stepId) &&
        typeof candidate.fieldKey === "string" &&
        candidate.fieldKey.trim().length > 0 &&
        isFieldAnswerMatcher(candidate.matcher) &&
        isStringArray(candidate.values) &&
        candidate.values.length > 0 &&
        candidate.values.every((entry) => entry.trim().length > 0)
      );
    default:
      return false;
  }
}

function isApiFilterNode(
  value: unknown,
  depth: number,
  stats: { conditionCount: number },
): value is ApplicationsApiFilterNode {
  if (depth > MAX_QUERY_FILTER_DEPTH) return false;
  if (isApiFilterCondition(value)) {
    stats.conditionCount += 1;
    return stats.conditionCount <= MAX_QUERY_FILTER_CONDITIONS;
  }
  return isApiFilterGroup(value, depth, stats);
}

function isApiFilterGroup(
  value: unknown,
  depth = 1,
  stats: { conditionCount: number } = { conditionCount: 0 },
): value is ApplicationsApiFilterGroup {
  if (depth > MAX_QUERY_FILTER_DEPTH) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; mode?: unknown; children?: unknown };
  if (candidate.type !== "group") return false;
  if (candidate.mode !== "all" && candidate.mode !== "any") return false;
  if (!Array.isArray(candidate.children)) return false;
  return candidate.children.every(
    (child) => isApiFilterNode(child, depth + 1, stats),
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
  const merged = {
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
  } as Partial<ApplicationsQuickFilters>;

  return {
    searchQuery: typeof merged.searchQuery === "string" ? merged.searchQuery : "",
    derivedStatus: Array.isArray(merged.derivedStatus)
      ? pickAllowedValues(merged.derivedStatus, isDerivedStatusFilterValue)
      : [],
    decisionStatus: isDecisionStatusFilterValue(merged.decisionStatus)
      ? merged.decisionStatus
      : "all",
    stepId:
      typeof merged.stepId === "string" && merged.stepId.trim().length > 0
        ? merged.stepId.trim()
        : "__any__",
    stepStatus: isStepStatusFilterValue(merged.stepStatus) ? merged.stepStatus : "all",
    reviewerId:
      typeof merged.reviewerId === "string" && merged.reviewerId.trim().length > 0
        ? merged.reviewerId.trim()
        : "__any__",
    tagsInput: typeof merged.tagsInput === "string" ? merged.tagsInput : "",
    hasDraftProgress: Boolean(merged.hasDraftProgress),
    completionBucket: Array.isArray(merged.completionBucket)
      ? pickAllowedValues(merged.completionBucket, isCompletionBucketValue)
      : [],
    needsRevisionOnly: Boolean(merged.needsRevisionOnly),
  };
}

export function quickFiltersToSavedViewQuickState(
  partial?: Partial<ApplicationsQuickFilters>,
): ApplicationsSavedViewQuickState {
  const normalized = createQuickFilters(partial);
  const stepId = normalized.stepId.trim();
  const reviewerId = normalized.reviewerId.trim();

  return {
    searchQuery: normalized.searchQuery,
    derivedStatus: [...normalized.derivedStatus],
    decisionStatus: normalized.decisionStatus,
    ...(isUuid(stepId) ? { stepId } : {}),
    stepStatus: normalized.stepStatus,
    ...(reviewerId === "__any__" || isUuid(reviewerId) ? { reviewerId } : {}),
    tagsInput: normalized.tagsInput,
    hasDraftProgress: normalized.hasDraftProgress,
    completionBucket: [...normalized.completionBucket],
    needsRevisionOnly: normalized.needsRevisionOnly,
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
    fieldKey?: string;
    fieldLabel?: string;
    fieldType?: string;
    defaultValue?: string;
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
    case "field_answer": {
      const fieldType = context?.fieldType;
      const isOption =
        fieldType === "select" ||
        fieldType === "multiselect" ||
        fieldType === "checkbox";
      return {
        id,
        type,
        negate: false,
        stepId: context?.stepId ?? "",
        fieldKey: context?.fieldKey ?? "",
        matcher: isOption ? "any" : "contains",
        values: context?.defaultValue ? [context.defaultValue] : [],
        fieldLabel: context?.fieldLabel,
        fieldType,
      };
    }
    default:
      return { id, type: "search_text", negate: false, value: "" };
  }
}

export function toApiFilterTree(
  tree: ApplicationsFilterGroupNode,
): ApplicationsApiFilterGroup {
  let conditionCount = 0;

  const convertCondition = (
    node: ApplicationsFilterConditionNode,
  ): ApplicationsApiFilterCondition | null => {
    const negate = normalizeNegate(node.negate);
    switch (node.type) {
      case "search_text": {
        const value = node.value.trim();
        if (value.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          value,
        };
      }
      case "decision_status": {
        const values = pickAllowedValues(node.values, isDecisionStatusConditionValue);
        if (values.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          values,
        };
      }
      case "derived_status": {
        const values = pickAllowedValues(node.values, isDerivedStatusFilterValue);
        if (values.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          values,
        };
      }
      case "step_status": {
        const stepId = node.stepId.trim();
        const statuses = pickAllowedValues(node.statuses, isStepStatusConditionValue);
        if (!isUuid(stepId) || statuses.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          stepId,
          statuses,
        };
      }
      case "assigned_reviewer": {
        if (node.matcher === "any" || node.matcher === "unassigned") {
          return {
            type: node.type,
            ...negate,
            matcher: node.matcher,
          };
        }
        const reviewerId = node.reviewerId?.trim();
        if (!isUuid(reviewerId)) return null;
        return {
          type: node.type,
          ...negate,
          matcher: "specific",
          reviewerId,
        };
      }
      case "tags_any":
      case "tags_all":
      case "tags_none": {
        const values = uniqueTrimmedStrings(node.values);
        if (values.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          values,
        };
      }
      case "completion_bucket": {
        const values = pickAllowedValues(node.values, isCompletionBucketValue);
        if (values.length === 0) return null;
        return {
          type: node.type,
          ...negate,
          values,
        };
      }
      case "has_draft_progress":
      case "needs_revision":
        return {
          type: node.type,
          ...negate,
          value: Boolean(node.value),
        };
      case "field_answer": {
        const stepId = node.stepId.trim();
        const fieldKey = node.fieldKey.trim();
        const values = uniqueTrimmedStrings(node.values);
        if (!isUuid(stepId) || fieldKey.length === 0 || values.length === 0) {
          return null;
        }
        return {
          type: node.type,
          ...negate,
          stepId,
          fieldKey,
          matcher: node.matcher,
          values,
        };
      }
      default:
        return null;
    }
  };

  const convertNode = (
    node: ApplicationsFilterNode,
    depth: number,
  ): ApplicationsApiFilterNode | null => {
    if (depth > MAX_QUERY_FILTER_DEPTH) {
      return null;
    }
    if (node.type === "group") {
      const children = node.children
        .map((child) => convertNode(child, depth + 1))
        .filter((child): child is ApplicationsApiFilterNode => Boolean(child));

      if (depth > 1 && children.length === 0) {
        return null;
      }

      return {
        type: "group",
        mode: node.mode === "any" ? "any" : "all",
        ...normalizeNegate(node.negate),
        children,
      };
    }

    if (conditionCount >= MAX_QUERY_FILTER_CONDITIONS) {
      return null;
    }
    const convertedCondition = convertCondition(node);
    if (!convertedCondition) return null;
    conditionCount += 1;
    return convertedCondition;
  };

  const converted = convertNode(tree, 1);
  if (converted && converted.type === "group") {
    return converted;
  }
  return {
    type: "group",
    mode: "all",
    children: [],
  };
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
      case "field_answer":
        return {
          id: nextFilterNodeId(),
          type: node.type,
          negate: Boolean(node.negate),
          stepId: node.stepId,
          fieldKey: node.fieldKey,
          matcher: node.matcher,
          values: [...node.values],
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
  if (isDecisionStatusConditionValue(quickFilters.decisionStatus)) {
    children.push({
      type: "decision_status",
      values: [quickFilters.decisionStatus],
    });
  }
  const derivedStatuses = pickAllowedValues(
    quickFilters.derivedStatus,
    isDerivedStatusFilterValue,
  );
  if (derivedStatuses.length > 0) {
    children.push({
      type: "derived_status",
      values: derivedStatuses,
    });
  }
  const stepId = quickFilters.stepId.trim();
  if (
    quickFilters.stepId !== "__any__" &&
    isUuid(stepId) &&
    isStepStatusConditionValue(quickFilters.stepStatus)
  ) {
    children.push({
      type: "step_status",
      stepId,
      statuses: [quickFilters.stepStatus],
    });
  }
  const reviewerId = quickFilters.reviewerId.trim();
  if (reviewerId === "__unassigned__") {
    children.push({
      type: "assigned_reviewer",
      matcher: "unassigned",
    });
  } else if (isUuid(reviewerId)) {
    children.push({
      type: "assigned_reviewer",
      matcher: "specific",
      reviewerId,
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
  const completionBuckets = pickAllowedValues(
    quickFilters.completionBucket,
    isCompletionBucketValue,
  );
  if (completionBuckets.length > 0) {
    children.push({
      type: "completion_bucket",
      values: completionBuckets,
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
