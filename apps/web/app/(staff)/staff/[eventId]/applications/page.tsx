"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEventBasePath } from "@/hooks/use-event-base-path";
import {
  Search,
  Download,
  Save,
  Plus,
  X,
  Pencil,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Tags,
  UserCheck,
  Mail,
  CheckCircle2,
  Award,
  Send,
  ListChecks,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  PageHeader,
  StatusBadge,
  TableSkeleton,
  ConfirmDialog,
} from "@/components/shared";
import { ApiError, apiClient } from "@/lib/api";
import {
  buildApplicationsQueryRequest,
  buildApplicationsQuerySignature,
  createAdvancedConditionNode,
  createEmptyAdvancedFilterTree,
  createQuickFilters,
  decodeFilterTreeFromUrl,
  encodeFilterTreeForUrl,
  fromApiFilterTree,
  formatProgressLabel,
  getFilterTreeStats,
  parseTagFilterInput,
  quickFiltersToApiFilterTree,
  quickFiltersToAdvancedTree,
  quickFiltersToSavedViewQuickState,
  toApiFilterTree,
  type ApplicationsApiFilterGroup,
  type ApplicationsFilterConditionNode,
  type ApplicationsFilterConditionType,
  type ApplicationsFilterGroupNode,
  type ApplicationsFilterNode,
  type ApplicationsAdvancedFilters,
  type ApplicationsQuickFilters,
  type ApplicationsSavedViewMode,
  type CompletionBucketValue,
  type DecisionStatusFilterValue,
  type DerivedStatusFilterValue,
  type StepStatusFilterValue,
} from "@/lib/applications-filters";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";
import {
  buildApplicationExportRequest,
  filenameFromContentDisposition,
  humanizeExportColumnKey,
  resolvePortalFromPathname,
} from "@/lib/export-payloads";
import { toast } from "sonner";
import { useAuth, usePermissions } from "@/lib/auth-context";
import {
  APPLICATION_EXPORT_CORE_COLUMNS,
  Permission,
  type ApplicationExportCoreColumn,
  type ResolveApplicationsByEmailsResult,
} from "@event-platform/shared";
import {
  MAX_PASTED_EMAILS,
  parsePastedEmails,
} from "@/lib/pasted-emails";

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const APPLICATIONS_PAGE_SIZE = 100;

interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  progress: string;
  submittedAt?: string;
  tags: string[];
  decision?: string;
}

interface ReviewerOption {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

interface DecisionTemplate {
  id: string;
  name: string;
  status: "ACCEPTED" | "WAITLISTED" | "REJECTED";
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
}

type ApplicationsListResponse =
  | Application[]
  | {
      data: Array<Record<string, unknown>>;
      meta?: { hasMore?: boolean; nextCursor?: string | null; total?: number };
    };

const DERIVED_STATUS_OPTIONS: Array<{
  value: DerivedStatusFilterValue;
  label: string;
}> = [
  { value: "waiting_applicant", label: "Waiting for applicant" },
  { value: "waiting_review", label: "Waiting for review" },
  { value: "revision_required", label: "Revision required" },
  { value: "all_required_steps_approved", label: "All steps approved" },
  { value: "accepted", label: "Accepted" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

const STEP_STATUS_OPTIONS: Array<{
  value: StepStatusFilterValue;
  label: string;
}> = [
  { value: "all", label: "Any step status" },
  { value: "LOCKED", label: "Locked" },
  { value: "UNLOCKED", label: "Unlocked" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "NEEDS_REVISION", label: "Needs revision" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED_FINAL", label: "Rejected final" },
];

const COMPLETION_BUCKET_OPTIONS: Array<{
  value: CompletionBucketValue;
  label: string;
}> = [
  { value: "0", label: "0%" },
  { value: "1_49", label: "1-49%" },
  { value: "50_99", label: "50-99%" },
  { value: "100", label: "100%" },
];

const DECISION_STATUS_OPTIONS: Array<{
  value: DecisionStatusFilterValue;
  label: string;
}> = [
  { value: "all", label: "Any decision" },
  { value: "NONE", label: "No decision" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "REJECTED", label: "Rejected" },
];

const DECISION_TEMPLATE_VARIABLE_TOKENS = [
  "{{eventTitle}}",
  "{{eventSlug}}",
  "{{eventId}}",
  "{{applicantName}}",
  "{{applicantEmail}}",
  "{{applicationId}}",
  "{{decisionStatus}}",
  "{{decisionLabel}}",
] as const;

const INITIAL_ADVANCED_FILTERS: ApplicationsAdvancedFilters = {
  derivedStatus: [],
  decisionStatus: "all",
  stepId: "__any__",
  stepStatus: "all",
  reviewerId: "__any__",
  tagsInput: "",
  hasDraftProgress: false,
  completionBucket: [],
  needsRevisionOnly: false,
};

const APPLICATIONS_VIEW_QUERY_PARAM = "applicationsView";
const APPLICATIONS_MODE_QUERY_PARAM = "applicationsMode";
const APPLICATIONS_TREE_QUERY_PARAM = "applicationsTree";
const NO_SAVED_VIEW_VALUE = "__none__";

interface ApplicationSavedView {
  id: string;
  name: string;
  mode: ApplicationsSavedViewMode;
  filterTree: ApplicationsApiFilterGroup;
  quickState?: Partial<ApplicationsQuickFilters>;
  createdBy: string;
  createdByEmail?: string;
  createdByName?: string | null;
}

interface FilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

function updateFilterNodeById(
  tree: ApplicationsFilterGroupNode,
  nodeId: string,
  updater: (node: ApplicationsFilterNode) => ApplicationsFilterNode,
): ApplicationsFilterGroupNode {
  const walk = (node: ApplicationsFilterNode): ApplicationsFilterNode => {
    if (node.id === nodeId) {
      return updater(node);
    }
    if (node.type !== "group") {
      return node;
    }
    return {
      ...node,
      children: node.children.map((child) => walk(child)),
    };
  };
  return walk(tree) as ApplicationsFilterGroupNode;
}

function removeFilterNodeById(
  tree: ApplicationsFilterGroupNode,
  nodeId: string,
): ApplicationsFilterGroupNode {
  const walk = (group: ApplicationsFilterGroupNode): ApplicationsFilterGroupNode => ({
    ...group,
    children: group.children
      .filter((child) => child.id !== nodeId)
      .map((child) =>
        child.type === "group" ? walk(child as ApplicationsFilterGroupNode) : child,
      ),
  });
  return walk(tree);
}

function addChildFilterNode(
  tree: ApplicationsFilterGroupNode,
  groupId: string,
  child: ApplicationsFilterNode,
): ApplicationsFilterGroupNode {
  return updateFilterNodeById(tree, groupId, (node) => {
    if (node.type !== "group") return node;
    return {
      ...node,
      children: [...node.children, child],
    };
  });
}

function collectAdvancedConditionNodes(
  group: ApplicationsFilterGroupNode,
): ApplicationsFilterConditionNode[] {
  const nodes: ApplicationsFilterConditionNode[] = [];
  const walk = (node: ApplicationsFilterNode) => {
    if (node.type === "group") {
      node.children.forEach(walk);
      return;
    }
    nodes.push(node);
  };
  walk(group);
  return nodes;
}

/** Normalise an API ApplicationSummary â†’ frontend Application */
function normalizeApplication(raw: Record<string, unknown>): Application {
  const ss = raw.stepsSummary as
    | { total?: number; completed?: number; progressed?: number }
    | undefined;
  return {
    id: raw.id as string,
    applicantName: (raw.applicantName ?? raw.applicantEmail ?? "Unknown") as string,
    applicantEmail: (raw.applicantEmail ?? "") as string,
    status: (raw.derivedStatus ?? raw.status ?? "UNKNOWN") as string,
    progress: formatProgressLabel(ss) || ((raw.currentStep ?? "") as string),
    submittedAt: (raw.createdAt ?? raw.submittedAt) as string | undefined,
    tags: (raw.tags ?? []) as string[],
    decision: (raw.decisionStatus ?? raw.decision) as string | undefined,
  };
}

export default function ApplicationsListPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const basePath = useEventBasePath();
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canDeleteApplications = hasPermission(Permission.EVENT_APPLICATION_DELETE);
  const canManageTags = hasPermission(Permission.EVENT_APPLICATION_TAGS_MANAGE);
  const canAssignReviewers = hasPermission(Permission.EVENT_APPLICATION_LIST);
  const canManageReviewerAssignment = hasPermission(Permission.EVENT_UPDATE);
  const canDraftDecisions = hasPermission(Permission.EVENT_DECISION_DRAFT);
  const canSendMessages = hasPermission(Permission.EVENT_MESSAGES_SEND);
  const canIssueCredentials = hasPermission(Permission.EVENT_UPDATE);
  const canPublishDecisions = hasPermission(Permission.EVENT_DECISION_PUBLISH);
  const canExport = hasPermission(Permission.EVENT_APPLICATION_EXPORT);
  const canStepOverride = hasPermission(Permission.EVENT_STEP_OVERRIDE_UNLOCK);
  const canStepReview = hasPermission(Permission.EVENT_STEP_REVIEW);
  const canUseBulkStepActions = canStepOverride || canStepReview;
  const exportPortal = resolvePortalFromPathname(pathname ?? "");

  const [applications, setApplications] = useState<Application[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [decisionTemplates, setDecisionTemplates] = useState<DecisionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMoreApplications, setIsLoadingMoreApplications] = useState(false);
  const [hasMoreApplications, setHasMoreApplications] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalMatchingApplications, setTotalMatchingApplications] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "selected">("all");
  const [exportColumns, setExportColumns] = useState<ApplicationExportCoreColumn[]>(
    [...APPLICATION_EXPORT_CORE_COLUMNS],
  );
  const [includeResponseColumnsInExport, setIncludeResponseColumnsInExport] =
    useState(true);
  const [isIssuingCredentials, setIsIssuingCredentials] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [searchInput, setSearchInput] = useState("");
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [filterMode, setFilterMode] = useState<ApplicationsSavedViewMode>("quick");
  const [derivedStatusFilter, setDerivedStatusFilter] = useState<
    DerivedStatusFilterValue[]
  >([]);
  const [decisionStatusFilter, setDecisionStatusFilter] =
    useState<DecisionStatusFilterValue>("all");
  const [stepFilterId, setStepFilterId] = useState("__any__");
  const [stepStatusFilter, setStepStatusFilter] =
    useState<StepStatusFilterValue>("all");
  const [reviewerFilterId, setReviewerFilterId] = useState("__any__");
  const [tagsFilterInput, setTagsFilterInput] = useState("");
  const [hasDraftProgressFilter, setHasDraftProgressFilter] = useState(false);
  const [completionBucketFilter, setCompletionBucketFilter] = useState<
    CompletionBucketValue[]
  >([]);
  const [needsRevisionOnlyFilter, setNeedsRevisionOnlyFilter] = useState(false);
  const [advancedFilterTree, setAdvancedFilterTree] = useState<ApplicationsFilterGroupNode>(
    createEmptyAdvancedFilterTree()
  );
  const [savedViews, setSavedViews] = useState<ApplicationSavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState(NO_SAVED_VIEW_VALUE);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [showRenameViewDialog, setShowRenameViewDialog] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [renameViewName, setRenameViewName] = useState("");
  const [isSavingView, setIsSavingView] = useState(false);
  const [isRenamingView, setIsRenamingView] = useState(false);
  const [isDeletingView, setIsDeletingView] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showPasteEmailsDialog, setShowPasteEmailsDialog] = useState(false);
  const [pastedEmailsText, setPastedEmailsText] = useState("");
  const [isResolvingEmails, setIsResolvingEmails] = useState(false);
  const [pasteSelectionResult, setPasteSelectionResult] =
    useState<ResolveApplicationsByEmailsResult | null>(null);
  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkMessage, setShowBulkMessage] = useState(false);
  const [showBulkDecision, setShowBulkDecision] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");
  const [bulkMessageSubject, setBulkMessageSubject] = useState("");
  const [bulkMessageBody, setBulkMessageBody] = useState("");
  const [bulkMessageSendEmail, setBulkMessageSendEmail] = useState(false);
  const [bulkDecisionStatus, setBulkDecisionStatus] = useState<
    "ACCEPTED" | "WAITLISTED" | "REJECTED"
  >("ACCEPTED");
  const [bulkDecisionTemplateId, setBulkDecisionTemplateId] = useState("__none__");
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isPublishingDecisions, setIsPublishingDecisions] = useState(false);
  const [showBulkStepAction, setShowBulkStepAction] = useState(false);
  const [bulkStepId, setBulkStepId] = useState("");
  const [bulkStepAction, setBulkStepAction] = useState<"UNLOCK" | "APPROVE" | "LOCK">("UNLOCK");
  const [workflowSteps, setWorkflowSteps] = useState<Array<{ id: string; title: string; stepIndex: number }>>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateStatus, setTemplateStatus] = useState<
    "ACCEPTED" | "WAITLISTED" | "REJECTED"
  >("ACCEPTED");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateIsActive, setTemplateIsActive] = useState(true);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const applicationsRequestVersionRef = useRef(0);
  const hasInitializedFiltersFromUrlRef = useRef(false);
  const selectedViewIdRef = useRef(NO_SAVED_VIEW_VALUE);
  const hasMoreApplicationsRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  const isLoadingMoreApplicationsRef = useRef(false);
  const hasResetInvalidFilterStateRef = useRef(false);
  const applicationsQueryRef = useRef<ReturnType<typeof buildApplicationsQueryRequest>>(
    buildApplicationsQueryRequest({
      limit: APPLICATIONS_PAGE_SIZE,
      mode: "quick",
      quickFilters: createQuickFilters(),
      advancedTree: createEmptyAdvancedFilterTree(),
    })
  );
  const applicationsRef = useRef<Application[]>([]);

  const advancedFilters = useMemo<ApplicationsAdvancedFilters>(
    () => ({
      derivedStatus: derivedStatusFilter,
      decisionStatus: decisionStatusFilter,
      stepId: stepFilterId,
      stepStatus: stepStatusFilter,
      reviewerId: reviewerFilterId,
      tagsInput: tagsFilterInput,
      hasDraftProgress: hasDraftProgressFilter,
      completionBucket: completionBucketFilter,
      needsRevisionOnly: needsRevisionOnlyFilter,
    }),
    [
      completionBucketFilter,
      decisionStatusFilter,
      derivedStatusFilter,
      hasDraftProgressFilter,
      needsRevisionOnlyFilter,
      reviewerFilterId,
      stepFilterId,
      stepStatusFilter,
      tagsFilterInput,
    ]
  );

  const quickFilters = useMemo<ApplicationsQuickFilters>(
    () =>
      createQuickFilters({
        searchQuery: searchInput.trim(),
        ...advancedFilters,
      }),
    [advancedFilters, searchInput]
  );

  const advancedFilterStats = useMemo(
    () => getFilterTreeStats(advancedFilterTree),
    [advancedFilterTree]
  );

  const applicationsQuery = useMemo(
    () =>
      buildApplicationsQueryRequest({
        limit: APPLICATIONS_PAGE_SIZE,
        mode: filterMode,
        quickFilters,
        advancedTree: advancedFilterTree,
      }),
    [advancedFilterTree, filterMode, quickFilters]
  );

  useEffect(() => {
    hasMoreApplicationsRef.current = hasMoreApplications;
  }, [hasMoreApplications]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    isLoadingMoreApplicationsRef.current = isLoadingMoreApplications;
  }, [isLoadingMoreApplications]);

  useEffect(() => {
    selectedViewIdRef.current = selectedViewId;
  }, [selectedViewId]);

  useEffect(() => {
    applicationsQueryRef.current = applicationsQuery;
  }, [applicationsQuery]);

  const fetchApplicationsPage = useCallback(
    async (params?: { cursor?: string | null }) => {
      const cursor = params?.cursor ?? null;
      const body = {
        ...applicationsQueryRef.current,
        ...(cursor ? { cursor } : {}),
      };

      const res = await apiClient<ApplicationsListResponse>(
        `/events/${eventId}/applications/query`,
        {
          method: "POST",
          body,
          csrfToken: csrfToken ?? undefined,
        }
      );

      const raw = Array.isArray(res)
        ? (res as unknown as Array<Record<string, unknown>>)
        : Array.isArray((res as any).data)
          ? (res as any).data
          : [];

      const normalized = raw.map(normalizeApplication);
      const pageNextCursor =
        !Array.isArray(res) &&
        typeof (res as any).meta?.nextCursor === "string" &&
        (res as any).meta?.nextCursor.length > 0
          ? (res as any).meta.nextCursor
          : null;
      const pageHasMore =
        !Array.isArray(res) &&
        Boolean((res as any).meta?.hasMore) &&
        Boolean(pageNextCursor);
      const pageTotal =
        !Array.isArray(res) &&
        typeof (res as any).meta?.total === "number" &&
        Number.isFinite((res as any).meta.total)
          ? (res as any).meta.total
          : undefined;

      return {
        applications: normalized,
        hasMore: pageHasMore,
        nextCursor: pageNextCursor,
        total: pageTotal,
      };
    },
    [csrfToken, eventId]
  );

  const loadApplications = useCallback(async (mode: "replace" | "append" = "replace", options?: {
    resetPageIndex?: boolean;
    clearSelection?: boolean;
  }) => {
    const isAppend = mode === "append";
    if (isAppend) {
      if (
        !hasMoreApplicationsRef.current ||
        !nextCursorRef.current ||
        isLoadingMoreApplicationsRef.current
      ) {
        return { fetched: false };
      }
      isLoadingMoreApplicationsRef.current = true;
      setIsLoadingMoreApplications(true);
    } else {
      setIsLoading(true);
    }

    const requestVersion = ++applicationsRequestVersionRef.current;
    try {
      const page = await fetchApplicationsPage({
        cursor: isAppend ? nextCursorRef.current : null,
      });

      if (requestVersion !== applicationsRequestVersionRef.current) {
        return { fetched: false };
      }

      const hasMore =
        page.hasMore && Boolean(page.nextCursor) && page.nextCursor !== null;
      const nextCursorValue = hasMore ? page.nextCursor : null;

      if (isAppend) {
        setApplications((prev) => {
          const byId = new Map<string, Application>();
          for (const application of [...prev, ...page.applications]) {
            byId.set(application.id, application);
          }
          const merged = Array.from(byId.values());
          applicationsRef.current = merged;
          return merged;
        });
      } else {
        applicationsRef.current = page.applications;
        setApplications(page.applications);
        setTotalMatchingApplications(
          typeof page.total === "number" ? page.total : page.applications.length
        );
        if (options?.clearSelection ?? true) {
          setSelectedIds([]);
        }
        if (options?.resetPageIndex ?? false) {
          setPagination((prev) =>
            prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
          );
        }
      }

      hasMoreApplicationsRef.current = hasMore;
      nextCursorRef.current = nextCursorValue;
      setHasMoreApplications(hasMore);
      setNextCursor(nextCursorValue);
      hasResetInvalidFilterStateRef.current = false;
      return { fetched: true };
    } catch (error) {
      if (requestVersion === applicationsRequestVersionRef.current) {
        if (
          !isAppend &&
          error instanceof ApiError &&
          error.status === 400 &&
          !hasResetInvalidFilterStateRef.current
        ) {
          hasResetInvalidFilterStateRef.current = true;
          setSelectedViewId(NO_SAVED_VIEW_VALUE);
          setFilterMode("quick");
          setSearchInput("");
          setDerivedStatusFilter([]);
          setDecisionStatusFilter("all");
          setStepFilterId("__any__");
          setStepStatusFilter("all");
          setReviewerFilterId("__any__");
          setTagsFilterInput("");
          setHasDraftProgressFilter(false);
          setCompletionBucketFilter([]);
          setNeedsRevisionOnlyFilter(false);
          setAdvancedFilterTree(createEmptyAdvancedFilterTree());
          toast.error("Invalid filters were reset. Reloading applications...");
        } else {
          toast.error(
            isAppend ? "Could not load more applications." : "Could not load applications."
          );
        }
      }
      return { fetched: false };
    } finally {
      if (isAppend) {
        isLoadingMoreApplicationsRef.current = false;
        setIsLoadingMoreApplications(false);
      } else {
        if (requestVersion === applicationsRequestVersionRef.current) {
          setIsLoading(false);
        }
      }
    }
  }, [fetchApplicationsPage]);

  const refreshApplications = useCallback(async (options?: {
    resetPageIndex?: boolean;
    clearSelection?: boolean;
  }) => {
    await loadApplications("replace", options);
  }, [loadApplications]);

  const refreshDecisionTemplates = useCallback(async () => {
    if (!canDraftDecisions) return;
    const templateRes = await apiClient<{ data?: DecisionTemplate[] }>(
      `/events/${eventId}/decision-templates`,
    ).catch(() => ({ data: [] }));
    setDecisionTemplates(Array.isArray(templateRes.data) ? templateRes.data : []);
  }, [canDraftDecisions, eventId]);

  const loadSavedViews = useCallback(async () => {
    const res = await apiClient<{ data?: ApplicationSavedView[] }>(
      `/events/${eventId}/applications/views`
    ).catch(() => ({ data: [] }));
    setSavedViews(Array.isArray(res.data) ? res.data : []);
  }, [eventId]);

  const applyQuickFiltersState = useCallback((state?: Partial<ApplicationsQuickFilters>) => {
    const normalized = createQuickFilters(state);
    setSearchInput(normalized.searchQuery);
    setDerivedStatusFilter(normalized.derivedStatus);
    setDecisionStatusFilter(normalized.decisionStatus);
    setStepFilterId(normalized.stepId);
    setStepStatusFilter(normalized.stepStatus);
    setReviewerFilterId(normalized.reviewerId);
    setTagsFilterInput(normalized.tagsInput);
    setHasDraftProgressFilter(normalized.hasDraftProgress);
    setCompletionBucketFilter(normalized.completionBucket);
    setNeedsRevisionOnlyFilter(normalized.needsRevisionOnly);
  }, []);

  const applySavedView = useCallback(
    (view: ApplicationSavedView) => {
      setFilterMode(view.mode);
      if (view.mode === "advanced") {
        setAdvancedFilterTree(fromApiFilterTree(view.filterTree));
      } else {
        applyQuickFiltersState(view.quickState);
      }
    },
    [applyQuickFiltersState]
  );

  function resetTemplateEditor() {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateStatus("ACCEPTED");
    setTemplateSubject("");
    setTemplateBody("");
    setTemplateIsActive(true);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadSavedViews();
        if (canAssignReviewers) {
          const reviewerRes = await apiClient<{ data?: ReviewerOption[] }>(
            `/events/${eventId}/review-queue/reviewers`,
          ).catch(() => ({ data: [] }));
          setReviewers(Array.isArray(reviewerRes.data) ? reviewerRes.data : []);
        }
        if (canDraftDecisions) {
          await refreshDecisionTemplates();
        }
        // Fetch workflow steps for bulk step action
        const stepsRes = await apiClient<{ data?: Array<any> }>(
          `/events/${eventId}/workflow/steps`,
        ).catch(() => ({ data: [] }));
        setWorkflowSteps(
          (stepsRes.data ?? []).map((s: any) => ({
            id: s.id,
            title: s.title,
            stepIndex: s.stepIndex ?? s.step_index ?? 0,
          }))
        );
      } catch {
        /* handled */
      }
    })();
  }, [
    canAssignReviewers,
    canDraftDecisions,
    eventId,
    loadSavedViews,
    refreshDecisionTemplates,
  ]);

  useEffect(() => {
    if (hasInitializedFiltersFromUrlRef.current) return;
    const modeFromUrl = searchParams.get(APPLICATIONS_MODE_QUERY_PARAM);
    const treeFromUrl = searchParams.get(APPLICATIONS_TREE_QUERY_PARAM);
    const viewFromUrl = searchParams.get(APPLICATIONS_VIEW_QUERY_PARAM);

    if (viewFromUrl) {
      setSelectedViewId(viewFromUrl);
    }

    if (modeFromUrl === "advanced" && treeFromUrl) {
      const decodedTree = decodeFilterTreeFromUrl(treeFromUrl);
      if (decodedTree) {
        setFilterMode("advanced");
        setAdvancedFilterTree(fromApiFilterTree(decodedTree));
      }
    }
    hasInitializedFiltersFromUrlRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (selectedViewIdRef.current === NO_SAVED_VIEW_VALUE) return;
    const selectedView = savedViews.find((view) => view.id === selectedViewIdRef.current);
    if (!selectedView) return;
    applySavedView(selectedView);
  }, [applySavedView, savedViews]);

  const filterSignature = useMemo(
    () =>
      buildApplicationsQuerySignature({
        mode: filterMode,
        quickFilters,
        advancedTree: advancedFilterTree,
      }),
    [advancedFilterTree, filterMode, quickFilters]
  );

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (selectedViewId !== NO_SAVED_VIEW_VALUE) {
      nextParams.set(APPLICATIONS_VIEW_QUERY_PARAM, selectedViewId);
      nextParams.delete(APPLICATIONS_MODE_QUERY_PARAM);
      nextParams.delete(APPLICATIONS_TREE_QUERY_PARAM);
    } else {
      nextParams.delete(APPLICATIONS_VIEW_QUERY_PARAM);
      if (filterMode === "advanced") {
        nextParams.set(APPLICATIONS_MODE_QUERY_PARAM, "advanced");
        const encodedTree = encodeFilterTreeForUrl(toApiFilterTree(advancedFilterTree));
        if (encodedTree) {
          nextParams.set(APPLICATIONS_TREE_QUERY_PARAM, encodedTree);
        } else {
          nextParams.delete(APPLICATIONS_TREE_QUERY_PARAM);
        }
      } else {
        nextParams.delete(APPLICATIONS_MODE_QUERY_PARAM);
        nextParams.delete(APPLICATIONS_TREE_QUERY_PARAM);
      }
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }
  }, [advancedFilterTree, filterMode, pathname, router, searchParams, selectedViewId]);

  useEffect(() => {
    if (!csrfToken) return;
    const timeout = window.setTimeout(() => {
      void refreshApplications({ resetPageIndex: true, clearSelection: true });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [csrfToken, filterSignature, refreshApplications]);

  const filteredData = applications;

  useEffect(() => {
    setPagination((prev) =>
      prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
    );
  }, [filterSignature]);

  useEffect(() => {
    setPagination((prev) => {
      const maxPageIndex = Math.max(
        0,
        Math.ceil(filteredData.length / prev.pageSize) - 1
      );
      if (prev.pageIndex <= maxPageIndex) return prev;
      return { ...prev, pageIndex: maxPageIndex };
    });
  }, [filteredData.length]);

  const selectedCount = selectedIds.length;
  const selectedApplicationIds = useMemo(
    () => Array.from(new Set(selectedIds)),
    [selectedIds],
  );
  const parsedPastedEmails = useMemo(
    () => parsePastedEmails(pastedEmailsText),
    [pastedEmailsText],
  );
  const decisionTemplatesForStatus = useMemo(
    () =>
      decisionTemplates.filter(
        (template) =>
          template.isActive && template.status === bulkDecisionStatus,
      ),
    [bulkDecisionStatus, decisionTemplates],
  );
  const sortedWorkflowSteps = useMemo(
    () => [...workflowSteps].sort((a, b) => a.stepIndex - b.stepIndex),
    [workflowSteps],
  );
  const parsedTagFilters = useMemo(
    () => parseTagFilterInput(tagsFilterInput),
    [tagsFilterInput]
  );
  const advancedConditionNodes = useMemo(
    () => collectAdvancedConditionNodes(advancedFilterTree),
    [advancedFilterTree]
  );
  const formatAdvancedConditionLabel = useCallback(
    (condition: ApplicationsFilterConditionNode): string => {
      const prefix = condition.negate ? "NOT " : "";
      switch (condition.type) {
        case "search_text":
          return `${prefix}Search: ${condition.value || "(empty)"}`;
        case "decision_status":
          return `${prefix}Decision in: ${condition.values.join(", ")}`;
        case "derived_status":
          return `${prefix}Status in: ${condition.values.join(", ")}`;
        case "step_status": {
          const stepLabel =
            sortedWorkflowSteps.find((step) => step.id === condition.stepId)?.title ??
            (condition.stepId || "Step");
          return `${prefix}Step ${stepLabel} in: ${condition.statuses.join(", ")}`;
        }
        case "assigned_reviewer":
          if (condition.matcher === "any") return `${prefix}Reviewer: any`;
          if (condition.matcher === "unassigned") return `${prefix}Reviewer: unassigned`;
          return `${prefix}Reviewer: ${condition.reviewerId ?? "specific"}`;
        case "tags_any":
          return `${prefix}Any tags: ${condition.values.join(", ")}`;
        case "tags_all":
          return `${prefix}All tags: ${condition.values.join(", ")}`;
        case "tags_none":
          return `${prefix}No tags: ${condition.values.join(", ")}`;
        case "completion_bucket":
          return `${prefix}Completion in: ${condition.values.join(", ")}`;
        case "has_draft_progress":
          return `${prefix}Has draft progress: ${condition.value ? "yes" : "no"}`;
        case "needs_revision":
          return `${prefix}Needs revision: ${condition.value ? "yes" : "no"}`;
        default:
          return "Condition";
      }
    },
    [sortedWorkflowSteps]
  );
  const activeFilterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filterMode === "quick") {
      if (searchInput.trim().length > 0) {
        chips.push({
          id: "quick:search",
          label: `Search: ${searchInput.trim()}`,
          onRemove: () => setSearchInput(""),
        });
      }
      derivedStatusFilter.forEach((value) => {
        const label =
          DERIVED_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
        chips.push({
          id: `quick:derived:${value}`,
          label: `Status: ${label}`,
          onRemove: () =>
            setDerivedStatusFilter((previous) =>
              previous.filter((entry) => entry !== value),
            ),
        });
      });
      if (decisionStatusFilter !== "all") {
        const label =
          DECISION_STATUS_OPTIONS.find((option) => option.value === decisionStatusFilter)
            ?.label ?? decisionStatusFilter;
        chips.push({
          id: "quick:decision",
          label: `Decision: ${label}`,
          onRemove: () => setDecisionStatusFilter("all"),
        });
      }
      if (stepFilterId !== "__any__" && stepStatusFilter !== "all") {
        const stepLabel =
          sortedWorkflowSteps.find((step) => step.id === stepFilterId)?.title ??
          "Selected step";
        const statusLabel =
          STEP_STATUS_OPTIONS.find((option) => option.value === stepStatusFilter)
            ?.label ?? stepStatusFilter;
        chips.push({
          id: "quick:step",
          label: `Step: ${stepLabel} (${statusLabel})`,
          onRemove: () => {
            setStepFilterId("__any__");
            setStepStatusFilter("all");
          },
        });
      }
      if (reviewerFilterId !== "__any__") {
        const reviewerLabel =
          reviewers.find((reviewer) => reviewer.userId === reviewerFilterId)?.fullName ??
          reviewers.find((reviewer) => reviewer.userId === reviewerFilterId)?.email ??
          "Assigned reviewer";
        chips.push({
          id: "quick:reviewer",
          label: `Reviewer: ${reviewerLabel}`,
          onRemove: () => setReviewerFilterId("__any__"),
        });
      }
      parsedTagFilters.forEach((tag) => {
        chips.push({
          id: `quick:tag:${tag}`,
          label: `Tag: ${tag}`,
          onRemove: () => {
            const next = parsedTagFilters.filter((value) => value !== tag);
            setTagsFilterInput(next.join(", "));
          },
        });
      });
      if (hasDraftProgressFilter) {
        chips.push({
          id: "quick:draft",
          label: "Has draft progress",
          onRemove: () => setHasDraftProgressFilter(false),
        });
      }
      completionBucketFilter.forEach((bucket) => {
        const label =
          COMPLETION_BUCKET_OPTIONS.find((option) => option.value === bucket)?.label ??
          bucket;
        chips.push({
          id: `quick:completion:${bucket}`,
          label: `Completion: ${label}`,
          onRemove: () =>
            setCompletionBucketFilter((previous) =>
              previous.filter((entry) => entry !== bucket),
            ),
        });
      });
      if (needsRevisionOnlyFilter) {
        chips.push({
          id: "quick:needs-revision",
          label: "Needs revision only",
          onRemove: () => setNeedsRevisionOnlyFilter(false),
        });
      }
      return chips;
    }

    advancedConditionNodes.forEach((condition) => {
      chips.push({
        id: `advanced:${condition.id}`,
        label: formatAdvancedConditionLabel(condition),
        onRemove: () =>
          setAdvancedFilterTree((previous) =>
            removeFilterNodeById(previous, condition.id),
          ),
      });
    });
    return chips;
  }, [
    advancedConditionNodes,
    completionBucketFilter,
    decisionStatusFilter,
    derivedStatusFilter,
    filterMode,
    formatAdvancedConditionLabel,
    hasDraftProgressFilter,
    needsRevisionOnlyFilter,
    parsedTagFilters,
    reviewerFilterId,
    reviewers,
    searchInput,
    sortedWorkflowSteps,
    stepFilterId,
    stepStatusFilter,
  ]);
  const hasActiveFilters = activeFilterChips.length > 0;

  const toggleDerivedStatusFilter = useCallback((value: DerivedStatusFilterValue) => {
    setDerivedStatusFilter((previous) =>
      previous.includes(value)
        ? previous.filter((entry) => entry !== value)
        : [...previous, value]
    );
  }, []);

  const toggleCompletionBucketFilter = useCallback(
    (value: CompletionBucketValue) => {
      setCompletionBucketFilter((previous) =>
        previous.includes(value)
          ? previous.filter((entry) => entry !== value)
          : [...previous, value]
      );
    },
    []
  );

  const clearAllFilters = useCallback(() => {
    if (filterMode === "advanced") {
      setAdvancedFilterTree(createEmptyAdvancedFilterTree());
      setSelectedViewId(NO_SAVED_VIEW_VALUE);
      return;
    }
    applyQuickFiltersState({
      ...INITIAL_ADVANCED_FILTERS,
      searchQuery: "",
    });
    setSelectedViewId(NO_SAVED_VIEW_VALUE);
  }, [applyQuickFiltersState, filterMode]);

  const switchToQuickMode = useCallback(() => {
    setFilterMode("quick");
    setSelectedViewId(NO_SAVED_VIEW_VALUE);
  }, []);

  const switchToAdvancedMode = useCallback(() => {
    setFilterMode("advanced");
    setSelectedViewId(NO_SAVED_VIEW_VALUE);
    setAdvancedFilterTree(quickFiltersToAdvancedTree(quickFilters));
  }, [quickFilters]);

  const addConditionToGroup = useCallback(
    (groupId: string, type: ApplicationsFilterConditionType = "search_text") => {
      if (advancedFilterStats.conditionCount >= 40) {
        toast.error("Maximum 40 conditions reached");
        return;
      }
      const newCondition = createAdvancedConditionNode(type, {
        stepId: sortedWorkflowSteps[0]?.id,
        reviewerId: reviewers[0]?.userId,
      });
      setAdvancedFilterTree((previous) =>
        addChildFilterNode(previous, groupId, newCondition),
      );
      setSelectedViewId(NO_SAVED_VIEW_VALUE);
    },
    [advancedFilterStats.conditionCount, reviewers, sortedWorkflowSteps]
  );

  const addGroupToGroup = useCallback((groupId: string) => {
    const newGroup = createEmptyAdvancedFilterTree();
    setAdvancedFilterTree((previous) => addChildFilterNode(previous, groupId, newGroup));
    setSelectedViewId(NO_SAVED_VIEW_VALUE);
  }, []);

  const removeAdvancedNode = useCallback((nodeId: string) => {
    setAdvancedFilterTree((previous) => removeFilterNodeById(previous, nodeId));
    setSelectedViewId(NO_SAVED_VIEW_VALUE);
  }, []);

  const selectSavedView = useCallback(
    (viewId: string) => {
      setSelectedViewId(viewId);
      if (viewId === NO_SAVED_VIEW_VALUE) return;
      const view = savedViews.find((entry) => entry.id === viewId);
      if (!view) return;
      applySavedView(view);
    },
    [applySavedView, savedViews]
  );

  const openRenameViewDialog = useCallback(() => {
    const selected = savedViews.find((entry) => entry.id === selectedViewId);
    if (!selected) return;
    setRenameViewName(selected.name);
    setShowRenameViewDialog(true);
  }, [savedViews, selectedViewId]);

  const currentSavedViewPayload = useMemo(
    () => ({
      mode: filterMode,
      filterTree:
        filterMode === "quick"
          ? quickFiltersToApiFilterTree(quickFilters)
          : toApiFilterTree(advancedFilterTree),
      quickState: quickFiltersToSavedViewQuickState(quickFilters),
    }),
    [advancedFilterTree, filterMode, quickFilters]
  );

  const saveCurrentView = useCallback(async () => {
    const name = saveViewName.trim();
    if (!name) {
      toast.error("View name is required");
      return;
    }
    setIsSavingView(true);
    try {
      const res = await apiClient<{ data?: ApplicationSavedView }>(
        `/events/${eventId}/applications/views`,
        {
          method: "POST",
          body: {
            name,
            ...currentSavedViewPayload,
          },
          csrfToken: csrfToken ?? undefined,
        }
      );
      await loadSavedViews();
      if (res?.data?.id) {
        setSelectedViewId(res.data.id);
      }
      setShowSaveViewDialog(false);
      setSaveViewName("");
      toast.success("Saved view created");
    } catch {
      /* handled */
    } finally {
      setIsSavingView(false);
    }
  }, [
    csrfToken,
    currentSavedViewPayload,
    eventId,
    loadSavedViews,
    saveViewName,
  ]);

  const renameSelectedView = useCallback(async () => {
    if (selectedViewId === NO_SAVED_VIEW_VALUE) return;
    const name = renameViewName.trim();
    if (!name) {
      toast.error("View name is required");
      return;
    }
    setIsRenamingView(true);
    try {
      await apiClient(`/events/${eventId}/applications/views/${selectedViewId}`, {
        method: "PATCH",
        body: { name },
        csrfToken: csrfToken ?? undefined,
      });
      await loadSavedViews();
      setShowRenameViewDialog(false);
      toast.success("Saved view renamed");
    } catch {
      /* handled */
    } finally {
      setIsRenamingView(false);
    }
  }, [
    csrfToken,
    eventId,
    loadSavedViews,
    renameViewName,
    selectedViewId,
  ]);

  const deleteSelectedView = useCallback(async () => {
    if (selectedViewId === NO_SAVED_VIEW_VALUE || isDeletingView) return;
    setIsDeletingView(true);
    try {
      await apiClient(`/events/${eventId}/applications/views/${selectedViewId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      await loadSavedViews();
      setSelectedViewId(NO_SAVED_VIEW_VALUE);
      toast.success("Saved view deleted");
    } catch {
      /* handled */
    } finally {
      setIsDeletingView(false);
    }
  }, [csrfToken, eventId, isDeletingView, loadSavedViews, selectedViewId]);

  const updateAdvancedConditionNode = useCallback(
    (
      nodeId: string,
      updater: (node: ApplicationsFilterConditionNode) => ApplicationsFilterConditionNode,
    ) => {
      setAdvancedFilterTree((previous) =>
        updateFilterNodeById(previous, nodeId, (node) => {
          if (node.type === "group") return node;
          return updater(node);
        }),
      );
      setSelectedViewId(NO_SAVED_VIEW_VALUE);
    },
    [],
  );

  function renderAdvancedConditionEditor(condition: ApplicationsFilterConditionNode) {
    return (
      <div
        key={condition.id}
        className="space-y-3 rounded-md border border-border/60 bg-background p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={condition.type}
            onValueChange={(value) => {
              const next = createAdvancedConditionNode(
                value as ApplicationsFilterConditionType,
                {
                  stepId: sortedWorkflowSteps[0]?.id,
                  reviewerId: reviewers[0]?.userId,
                },
              );
              updateAdvancedConditionNode(condition.id, () => ({
                ...next,
                id: condition.id,
                negate: condition.negate,
              }));
            }}
          >
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="search_text">Search text</SelectItem>
              <SelectItem value="decision_status">Decision status</SelectItem>
              <SelectItem value="derived_status">Derived status</SelectItem>
              <SelectItem value="step_status">Step status</SelectItem>
              <SelectItem value="assigned_reviewer">Assigned reviewer</SelectItem>
              <SelectItem value="tags_any">Tags any</SelectItem>
              <SelectItem value="tags_all">Tags all</SelectItem>
              <SelectItem value="tags_none">Tags none</SelectItem>
              <SelectItem value="completion_bucket">Completion bucket</SelectItem>
              <SelectItem value="has_draft_progress">Has draft progress</SelectItem>
              <SelectItem value="needs_revision">Needs revision</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">NOT</Label>
            <Switch
              checked={Boolean(condition.negate)}
              onCheckedChange={(checked) =>
                updateAdvancedConditionNode(condition.id, () => ({
                  ...condition,
                  negate: checked,
                }))
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeAdvancedNode(condition.id)}
            >
              Remove
            </Button>
          </div>
        </div>

        {condition.type === "search_text" && (
          <Input
            value={condition.value}
            onChange={(event) =>
              updateAdvancedConditionNode(condition.id, () => ({
                ...condition,
                value: event.target.value,
              }))
            }
            placeholder="Name or email contains..."
          />
        )}

        {condition.type === "decision_status" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {DECISION_STATUS_OPTIONS.filter((option) => option.value !== "all").map(
              (option) => {
                const decisionValue = option.value as Exclude<
                  DecisionStatusFilterValue,
                  "all"
                >;
                return (
                  <label key={option.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={condition.values.includes(decisionValue)}
                      onCheckedChange={() =>
                        updateAdvancedConditionNode(condition.id, (node) => {
                          const values = (node as any).values as string[];
                          return {
                            ...node,
                            values: values.includes(decisionValue)
                              ? values.filter((entry) => entry !== decisionValue)
                              : [...values, decisionValue],
                          } as ApplicationsFilterConditionNode;
                        })
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                );
              },
            )}
          </div>
        )}

        {condition.type === "derived_status" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {DERIVED_STATUS_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={condition.values.includes(option.value)}
                  onCheckedChange={() =>
                    updateAdvancedConditionNode(condition.id, (node) => {
                      const values = (node as any).values as string[];
                      return {
                        ...node,
                        values: values.includes(option.value)
                          ? values.filter((entry) => entry !== option.value)
                          : [...values, option.value],
                      } as ApplicationsFilterConditionNode;
                    })
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {condition.type === "step_status" && (
          <div className="space-y-3">
            <Select
              value={condition.stepId || "__none__"}
              onValueChange={(value) =>
                updateAdvancedConditionNode(condition.id, () => ({
                  ...condition,
                  stepId: value === "__none__" ? "" : value,
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select step" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select step</SelectItem>
                {sortedWorkflowSteps.map((step) => (
                  <SelectItem key={step.id} value={step.id}>
                    {step.stepIndex + 1}. {step.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              {STEP_STATUS_OPTIONS.filter((option) => option.value !== "all").map(
                (option) => {
                  const statusValue = option.value as Exclude<
                    StepStatusFilterValue,
                    "all"
                  >;
                  return (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={condition.statuses.includes(statusValue)}
                        onCheckedChange={() =>
                          updateAdvancedConditionNode(condition.id, (node) => {
                            const statuses = (node as any).statuses as string[];
                            return {
                              ...node,
                              statuses: statuses.includes(statusValue)
                                ? statuses.filter((entry) => entry !== statusValue)
                                : [...statuses, statusValue],
                            } as ApplicationsFilterConditionNode;
                          })
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                },
              )}
            </div>
          </div>
        )}

        {condition.type === "assigned_reviewer" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={condition.matcher}
              onValueChange={(value) =>
                updateAdvancedConditionNode(condition.id, () => ({
                  ...condition,
                  matcher: value as "any" | "unassigned" | "specific",
                  ...(value === "specific"
                    ? { reviewerId: condition.reviewerId ?? reviewers[0]?.userId ?? "" }
                    : { reviewerId: undefined }),
                }))
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any reviewer</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="specific">Specific reviewer</SelectItem>
              </SelectContent>
            </Select>

            {condition.matcher === "specific" && (
              <Select
                value={condition.reviewerId ?? "__none__"}
                onValueChange={(value) =>
                  updateAdvancedConditionNode(condition.id, () => ({
                    ...condition,
                    reviewerId: value === "__none__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select reviewer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select reviewer</SelectItem>
                  {reviewers.map((reviewer) => (
                    <SelectItem key={reviewer.userId} value={reviewer.userId}>
                      {reviewer.fullName ?? reviewer.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {(condition.type === "tags_any" ||
          condition.type === "tags_all" ||
          condition.type === "tags_none") && (
          <Input
            value={condition.values.join(", ")}
            onChange={(event) =>
              updateAdvancedConditionNode(condition.id, () => ({
                ...condition,
                values: parseTagFilterInput(event.target.value),
              }))
            }
            placeholder="vip, shortlisted"
          />
        )}

        {condition.type === "completion_bucket" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {COMPLETION_BUCKET_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={condition.values.includes(option.value)}
                  onCheckedChange={() =>
                    updateAdvancedConditionNode(condition.id, (node) => {
                      const values = (node as any).values as string[];
                      return {
                        ...node,
                        values: values.includes(option.value)
                          ? values.filter((entry) => entry !== option.value)
                          : [...values, option.value],
                      } as ApplicationsFilterConditionNode;
                    })
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {(condition.type === "has_draft_progress" ||
          condition.type === "needs_revision") && (
          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <p className="text-sm">
              {condition.type === "has_draft_progress"
                ? "Require draft progress"
                : "Require needs revision"}
            </p>
            <Switch
              checked={condition.value}
              onCheckedChange={(checked) =>
                updateAdvancedConditionNode(condition.id, () => ({
                  ...condition,
                  value: checked,
                }))
              }
            />
          </div>
        )}
      </div>
    );
  }

  function renderAdvancedGroupEditor(
    group: ApplicationsFilterGroupNode,
    depth: number,
    isRoot = false,
  ) {
    const canAddNestedGroup = depth < 3;
    return (
      <Card key={group.id} className="border-dashed">
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px] uppercase">
              Group depth {depth}
            </Badge>
            <Select
              value={group.mode}
              onValueChange={(value) => {
                setAdvancedFilterTree((previous) =>
                  updateFilterNodeById(previous, group.id, (node) =>
                    node.type === "group"
                      ? { ...node, mode: value as "all" | "any" }
                      : node,
                  ),
                );
                setSelectedViewId(NO_SAVED_VIEW_VALUE);
              }}
            >
              <SelectTrigger className="h-8 w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Match ALL conditions (AND)</SelectItem>
                <SelectItem value="any">Match ANY condition (OR)</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">NOT</Label>
              <Switch
                checked={Boolean(group.negate)}
                onCheckedChange={(checked) => {
                  setAdvancedFilterTree((previous) =>
                    updateFilterNodeById(previous, group.id, (node) =>
                      node.type === "group" ? { ...node, negate: checked } : node,
                    ),
                  );
                  setSelectedViewId(NO_SAVED_VIEW_VALUE);
                }}
              />
              {!isRoot && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeAdvancedNode(group.id)}
                >
                  Remove group
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => addConditionToGroup(group.id)}
              disabled={advancedFilterStats.conditionCount >= 40}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add condition
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addGroupToGroup(group.id)}
              disabled={!canAddNestedGroup}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add group
            </Button>
          </div>

          <div className="space-y-2">
            {group.children.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Empty group. Add at least one condition.
              </p>
            ) : (
              group.children.map((child) =>
                child.type === "group"
                  ? renderAdvancedGroupEditor(child, depth + 1, false)
                  : renderAdvancedConditionEditor(child),
              )
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleNextPage = useCallback(async () => {
    const targetPageIndex = pagination.pageIndex + 1;
    const requiredVisibleRows = (targetPageIndex + 1) * pagination.pageSize;
    const countVisibleRows = () => applicationsRef.current.length;

    if (countVisibleRows() >= requiredVisibleRows) {
      setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
      return;
    }

    while (
      hasMoreApplicationsRef.current &&
      !isLoadingMoreApplicationsRef.current &&
      countVisibleRows() < requiredVisibleRows
    ) {
      const result = await loadApplications("append");
      if (!result.fetched) break;
    }

    if (countVisibleRows() >= requiredVisibleRows) {
      setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
    }
  }, [loadApplications, pagination.pageIndex, pagination.pageSize]);

  useEffect(() => {
    const allowedActions: Array<"UNLOCK" | "APPROVE" | "LOCK"> = [];
    if (canStepOverride) {
      allowedActions.push("UNLOCK", "LOCK");
    }
    if (canStepReview) {
      allowedActions.push("APPROVE");
    }
    if (allowedActions.length === 0) return;
    if (!allowedActions.includes(bulkStepAction)) {
      setBulkStepAction(allowedActions[0]);
    }
  }, [bulkStepAction, canStepOverride, canStepReview]);

  function parseTagInput(input: string): string[] {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
  }

  function toggleExportColumn(column: ApplicationExportCoreColumn) {
    setExportColumns((previous) =>
      previous.includes(column)
        ? previous.filter((value) => value !== column)
        : [...previous, column],
    );
  }

  function openExportDialog(scope: "all" | "selected") {
    if (scope === "selected" && selectedApplicationIds.length === 0) {
      toast.error("Select at least one application to export.");
      return;
    }
    setExportScope(scope);
    setShowExportDialog(true);
  }

  async function applyPastedEmailSelection() {
    if (parsedPastedEmails.emails.length === 0) {
      toast.error("Paste at least one valid email address.");
      return;
    }

    setIsResolvingEmails(true);
    try {
      const response = await apiClient<{ data?: ResolveApplicationsByEmailsResult }>(
        `/events/${eventId}/applications/resolve-by-emails`,
        {
          method: "POST",
          body: { emails: parsedPastedEmails.emails },
          csrfToken: csrfToken ?? undefined,
        },
      );
      const result: ResolveApplicationsByEmailsResult = response.data ?? {
        applicationIds: [],
        userIds: [],
        matchedEmails: [],
        unmatchedEmails: [],
      };

      setSelectedIds(result.applicationIds);
      setPasteSelectionResult(result);

      toast.success(
        `Selected ${result.applicationIds.length} application(s) from ${result.matchedEmails.length} matched email(s).`,
      );
      if (
        result.unmatchedEmails.length > 0 ||
        parsedPastedEmails.invalidTokens.length > 0
      ) {
        toast.info(
          `${result.unmatchedEmails.length} unmatched and ${parsedPastedEmails.invalidTokens.length} invalid email token(s).`,
        );
      }
    } catch {
      toast.error("Could not resolve pasted emails.");
    } finally {
      setIsResolvingEmails(false);
    }
  }

  async function confirmExport() {
    const selectedColumns = Array.from(
      new Set(exportColumns.filter((column) => column.trim().length > 0)),
    );
    if (selectedColumns.length === 0) {
      toast.error("Select at least one column to export.");
      return;
    }

    const selectedIds =
      exportScope === "selected" ? selectedApplicationIds : [];
    if (exportScope === "selected" && selectedIds.length === 0) {
      toast.error("Select at least one application to export.");
      return;
    }

    setShowExportDialog(false);
    setIsExporting(true);
    try {
      const body = buildApplicationExportRequest({
        applicationIds: selectedIds,
        columns: selectedColumns,
        includeResponseColumns: includeResponseColumnsInExport,
        portal: exportPortal,
      });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
      const res = await fetch(
        `${PUBLIC_API_URL}/events/${eventId}/applications/export`,
        {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        exportScope === "selected"
          ? `applications-selected-${eventId}.csv`
          : `applications-${eventId}.csv`,
      );
      a.click();
      URL.revokeObjectURL(url);
      if (exportScope === "selected") {
        toast.success(`Exported ${selectedIds.length} application(s)`);
      } else {
        toast.success("Applications CSV downloaded.");
      }
    } catch {
      if (exportScope === "selected") {
        toast.error("Could not export selected applications");
      } else {
        toast.error("Could not export applications.");
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function deleteApplication() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await apiClient(`/events/${eventId}/applications/${deleteTarget.id}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      setApplications((prev) => {
        const next = prev.filter((application) => application.id !== deleteTarget.id);
        applicationsRef.current = next;
        return next;
      });
      toast.success("Application deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete application");
    } finally {
      setIsDeleting(false);
    }
  }

  async function issueSelectedCredentials() {
    if (!canIssueCredentials || selectedApplicationIds.length === 0 || isIssuingCredentials) {
      return;
    }
    setIsIssuingCredentials(true);
    try {
      const result = await apiClient<{
        data?: {
          requested?: number;
          issued?: number;
          alreadyIssued?: number;
          skippedNotCheckedIn?: number;
          notFound?: string[];
          failed?: Array<{ applicationId: string; reason: string }>;
        };
      }>(`/events/${eventId}/applications/completion-credentials/issue`, {
        method: "POST",
        body: { applicationIds: selectedApplicationIds },
        csrfToken: csrfToken ?? undefined,
      });

      const summary = result?.data ?? {};
      const issued = Number(summary.issued ?? 0);
      const alreadyIssued = Number(summary.alreadyIssued ?? 0);
      const skippedNotCheckedIn = Number(summary.skippedNotCheckedIn ?? 0);
      const failedCount = Array.isArray(summary.failed) ? summary.failed.length : 0;
      const notFoundCount = Array.isArray(summary.notFound) ? summary.notFound.length : 0;

      if (issued > 0) {
        toast.success(
          `Issued ${issued} credential${issued === 1 ? "" : "s"}. Already issued: ${alreadyIssued}. Skipped (not checked-in): ${skippedNotCheckedIn}.`
        );
      } else {
        toast.info(
          `No new credentials issued. Already issued: ${alreadyIssued}. Skipped (not checked-in): ${skippedNotCheckedIn}.`
        );
      }

      if (failedCount > 0 || notFoundCount > 0) {
        toast.warning(
          `Issues: ${failedCount} failed, ${notFoundCount} not found.`
        );
      }
    } catch {
      toast.error("Could not issue completion credentials.");
    } finally {
      setIsIssuingCredentials(false);
    }
  }

  async function applyBulkTags() {
    if (!canManageTags || selectedApplicationIds.length === 0) return;
    const addTags = parseTagInput(bulkAddTags);
    const removeTags = parseTagInput(bulkRemoveTags);
    if (addTags.length === 0 && removeTags.length === 0) {
      toast.error("Add at least one tag to add or remove");
      return;
    }
    setIsApplyingBulk(true);
    try {
      await apiClient(`/events/${eventId}/applications/bulk/tags`, {
        method: "POST",
        body: {
          applicationIds: selectedApplicationIds,
          addTags,
          removeTags,
        },
        csrfToken: csrfToken ?? undefined,
      });
      await refreshApplications();
      toast.success("Bulk tags updated");
      setShowBulkTags(false);
      setBulkAddTags("");
      setBulkRemoveTags("");
    } catch {
      /* handled */
    } finally {
      setIsApplyingBulk(false);
    }
  }

  async function applyBulkDecisionDraft() {
    if (!canDraftDecisions || selectedApplicationIds.length === 0) return;
    setIsApplyingBulk(true);
    try {
      await apiClient(`/events/${eventId}/applications/bulk/decision-draft`, {
        method: "POST",
        body: {
          applicationIds: selectedApplicationIds,
          status: bulkDecisionStatus,
          templateId:
            bulkDecisionTemplateId === "__none__"
              ? null
              : bulkDecisionTemplateId,
        },
        csrfToken: csrfToken ?? undefined,
      });
      await refreshApplications();
      toast.success("Decision drafts updated");
      setShowBulkDecision(false);
    } catch {
      /* handled */
    } finally {
      setIsApplyingBulk(false);
    }
  }

  async function applyBulkMessage() {
    if (!canSendMessages || selectedApplicationIds.length === 0) return;
    if (!bulkMessageSubject.trim() || !bulkMessageBody.trim()) {
      toast.error("Message subject and body are required");
      return;
    }
    setIsApplyingBulk(true);
    try {
      await apiClient(`/events/${eventId}/messages`, {
        method: "POST",
        body: {
          title: bulkMessageSubject.trim(),
          bodyRich: bulkMessageBody.trim(),
          bodyText: bulkMessageBody.trim(),
          recipientFilter: {
            applicationIds: selectedApplicationIds,
          },
          sendEmail: bulkMessageSendEmail,
        },
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Bulk message sent");
      setShowBulkMessage(false);
      setBulkMessageSubject("");
      setBulkMessageBody("");
      setBulkMessageSendEmail(false);
    } catch {
      /* handled */
    } finally {
      setIsApplyingBulk(false);
    }
  }

  async function bulkDeleteApplications() {
    if (!canDeleteApplications || selectedApplicationIds.length === 0 || isBulkDeleting) return;
    setIsBulkDeleting(true);
    try {
      await apiClient(`/events/${eventId}/applications/bulk/delete`, {
        method: "POST",
        body: { applicationIds: selectedApplicationIds },
        csrfToken: csrfToken ?? undefined,
      });
      await refreshApplications();
      toast.success(`${selectedApplicationIds.length} application(s) deleted`);
      setShowBulkDelete(false);
      setSelectedIds([]);
    } catch {
      toast.error("Could not delete applications");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function publishSelectedDecisions() {
    if (!canPublishDecisions || selectedApplicationIds.length === 0 || isPublishingDecisions) return;
    setIsPublishingDecisions(true);
    try {
      const res = await apiClient<{ data?: { count: number } }>(
        `/events/${eventId}/applications/decisions/publish`,
        {
          method: "POST",
          body: { applicationIds: selectedApplicationIds },
          csrfToken: csrfToken ?? undefined,
        },
      );
      const count = res?.data?.count ?? 0;
      await refreshApplications();
      toast.success(
        count > 0
          ? `Published ${count} decision(s)`
          : "No unpublished decisions found among selected"
      );
      setSelectedIds([]);
    } catch {
      toast.error("Could not publish decisions");
    } finally {
      setIsPublishingDecisions(false);
    }
  }

  async function applyBulkStepAction() {
    if (!bulkStepId || selectedApplicationIds.length === 0) return;
    setIsApplyingBulk(true);
    try {
      const res = await apiClient<{ data?: { updated: number; skipped: number } }>(
        `/events/${eventId}/applications/bulk/step-action`,
        {
          method: "POST",
          body: {
            applicationIds: selectedApplicationIds,
            stepId: bulkStepId,
            action: bulkStepAction,
          },
          csrfToken: csrfToken ?? undefined,
        },
      );
      const updated = res?.data?.updated ?? 0;
      const skipped = res?.data?.skipped ?? 0;
      await refreshApplications();
      toast.success(`Step action applied: ${updated} updated, ${skipped} skipped`);
      setShowBulkStepAction(false);
    } catch {
      toast.error("Could not apply step action");
    } finally {
      setIsApplyingBulk(false);
    }
  }

  function startTemplateCreate() {
    resetTemplateEditor();
  }

  function editTemplate(template: DecisionTemplate) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateStatus(template.status);
    setTemplateSubject(template.subjectTemplate);
    setTemplateBody(template.bodyTemplate);
    setTemplateIsActive(template.isActive);
  }

  async function saveTemplate() {
    if (!canDraftDecisions) return;
    if (!templateName.trim() || !templateSubject.trim() || !templateBody.trim()) {
      toast.error("Template name, subject, and body are required");
      return;
    }

    setIsSavingTemplate(true);
    try {
      if (editingTemplateId) {
        await apiClient(`/events/${eventId}/decision-templates/${editingTemplateId}`, {
          method: "PATCH",
          body: {
            name: templateName.trim(),
            status: templateStatus,
            subjectTemplate: templateSubject.trim(),
            bodyTemplate: templateBody.trim(),
            isActive: templateIsActive,
          },
          csrfToken: csrfToken ?? undefined,
        });
        toast.success("Template updated");
      } else {
        await apiClient(`/events/${eventId}/decision-templates`, {
          method: "POST",
          body: {
            name: templateName.trim(),
            status: templateStatus,
            subjectTemplate: templateSubject.trim(),
            bodyTemplate: templateBody.trim(),
            isActive: templateIsActive,
          },
          csrfToken: csrfToken ?? undefined,
        });
        toast.success("Template created");
      }
      await refreshDecisionTemplates();
      resetTemplateEditor();
    } catch {
      /* handled */
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!canDraftDecisions) return;
    setDeletingTemplateId(templateId);
    try {
      await apiClient(`/events/${eventId}/decision-templates/${templateId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      await refreshDecisionTemplates();
      if (editingTemplateId === templateId) {
        resetTemplateEditor();
      }
      toast.success("Template deleted");
    } catch {
      /* handled */
    } finally {
      setDeletingTemplateId(null);
    }
  }

  const columns: ColumnDef<Application>[] = useMemo(
    () => [
      {
        id: "select",
        header: () => {
          const visibleIds = filteredData.map((row) => row.id);
          const selectedVisibleCount = visibleIds.filter((id) =>
            selectedIds.includes(id),
          ).length;
          const allSelected =
            visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
          return (
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => {
                const nextChecked = checked === true;
                setSelectedIds((prev) => {
                  const withoutVisible = prev.filter((id) => !visibleIds.includes(id));
                  return nextChecked
                    ? Array.from(new Set([...withoutVisible, ...visibleIds]))
                    : withoutVisible;
                });
              }}
              aria-label="Select all applications"
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.includes(row.original.id)}
            onCheckedChange={(checked) => {
              const nextChecked = checked === true;
              setSelectedIds((prev) =>
                nextChecked
                  ? Array.from(new Set([...prev, row.original.id]))
                  : prev.filter((id) => id !== row.original.id),
              );
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${row.original.applicantName}`}
          />
        ),
      },
      {
        accessorKey: "applicantName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Applicant
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-sm">{row.original.applicantName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.applicantEmail}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "progress",
        header: "Progress",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.progress}
          </span>
        ),
      },
      {
        accessorKey: "decision",
        header: "Decision",
        cell: ({ row }) =>
          row.original.decision ? (
            <StatusBadge status={row.original.decision} />
          ) : (
            <span className="text-xs text-muted-foreground">â€”</span>
          ),
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "submittedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-3"
          >
            Submitted
            <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) =>
          row.original.submittedAt ? (
            <span className="text-sm text-muted-foreground">
              {new Date(row.original.submittedAt).toLocaleDateString("en-GB")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">â€”</span>
          ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                router.push(`${basePath}/applications/${row.original.id}`);
              }}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View
            </Button>
            {canDeleteApplications && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(row.original);
                }}
                disabled={isDeleting && deleteTarget?.id === row.original.id}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        ),
      },
    ],
    [
      basePath,
      canDeleteApplications,
      deleteTarget?.id,
      filteredData,
      isDeleting,
      router,
      selectedIds,
    ]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const hasLocalNextPage =
    (pagination.pageIndex + 1) * pagination.pageSize < filteredData.length;
  const canGoNextPage = hasLocalNextPage || hasMoreApplications;
  const currentPageVisibleRows = table.getRowModel().rows.length;
  const currentPageStart = currentPageVisibleRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const currentPageEnd = pagination.pageIndex * pagination.pageSize + currentPageVisibleRows;
  const showFiltersLabel =
    showFiltersPanel
      ? "Hide filters"
      : hasActiveFilters
        ? `Show filters (${activeFilterChips.length} active)`
        : "Show filters";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={`${totalMatchingApplications} ${
          totalMatchingApplications === 1 ? "application" : "applications"
        }`}
      >
        {canDraftDecisions && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowTemplateManager(true);
              startTemplateCreate();
            }}
          >
            Manage decision templates
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowPasteEmailsDialog(true);
            setPasteSelectionResult(null);
          }}
        >
          Paste emails
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => openExportDialog("all")}
          disabled={isExporting}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </PageHeader>

      {/* Search and filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(event) => {
              const value = event.target.value;
              setSearchInput(value);
              if (filterMode === "advanced") {
                setFilterMode("quick");
              }
              setSelectedViewId(NO_SAVED_VIEW_VALUE);
            }}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFiltersPanel((previous) => !previous)}
            aria-expanded={showFiltersPanel}
          >
            {showFiltersLabel}
          </Button>
          {showFiltersPanel && hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearAllFilters}>
              Clear all
            </Button>
          )}
        </div>

        {showFiltersPanel && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={filterMode === "quick" ? "default" : "outline"}
                size="sm"
                onClick={switchToQuickMode}
              >
                Quick filters
              </Button>
              <Button
                variant={filterMode === "advanced" ? "default" : "outline"}
                size="sm"
                onClick={switchToAdvancedMode}
              >
                Advanced builder
              </Button>
              <Select value={selectedViewId} onValueChange={selectSavedView}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Shared saved view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SAVED_VIEW_VALUE}>No saved view</SelectItem>
                  {savedViews.map((view) => (
                    <SelectItem key={view.id} value={view.id}>
                      {view.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSaveViewDialog(true)}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save view
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openRenameViewDialog}
                disabled={selectedViewId === NO_SAVED_VIEW_VALUE}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={deleteSelectedView}
                disabled={selectedViewId === NO_SAVED_VIEW_VALUE || isDeletingView}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {isDeletingView ? "Deleting..." : "Delete view"}
              </Button>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2">
                {activeFilterChips.map((chip) => (
                  <Badge
                    key={chip.id}
                    variant="secondary"
                    className="inline-flex items-center gap-1 text-xs"
                  >
                    <span>{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      className="rounded p-0.5 hover:bg-muted"
                      aria-label={`Remove ${chip.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {filterMode === "quick" && (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm">Derived status</Label>
                      <div className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-2">
                        {DERIVED_STATUS_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={derivedStatusFilter.includes(option.value)}
                              onCheckedChange={() => {
                                toggleDerivedStatusFilter(option.value);
                                setSelectedViewId(NO_SAVED_VIEW_VALUE);
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Decision</Label>
                      <Select
                        value={decisionStatusFilter}
                        onValueChange={(value) => {
                          setDecisionStatusFilter(value as DecisionStatusFilterValue);
                          setSelectedViewId(NO_SAVED_VIEW_VALUE);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DECISION_STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Step</Label>
                      <Select
                        value={stepFilterId}
                        onValueChange={(value) => {
                          setStepFilterId(value);
                          setSelectedViewId(NO_SAVED_VIEW_VALUE);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any step</SelectItem>
                          {sortedWorkflowSteps.map((step) => (
                            <SelectItem key={step.id} value={step.id}>
                              {step.stepIndex + 1}. {step.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Step status</Label>
                      <Select
                        value={stepStatusFilter}
                        onValueChange={(value) => {
                          setStepStatusFilter(value as StepStatusFilterValue);
                          setSelectedViewId(NO_SAVED_VIEW_VALUE);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STEP_STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Assigned reviewer</Label>
                      <Select
                        value={reviewerFilterId}
                        onValueChange={(value) => {
                          setReviewerFilterId(value);
                          setSelectedViewId(NO_SAVED_VIEW_VALUE);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any reviewer</SelectItem>
                          {reviewers.map((reviewer) => (
                            <SelectItem key={reviewer.userId} value={reviewer.userId}>
                              {reviewer.fullName ?? reviewer.email} ({reviewer.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Tags (match all)</Label>
                    <Input
                      value={tagsFilterInput}
                      onChange={(event) => {
                        setTagsFilterInput(event.target.value);
                        setSelectedViewId(NO_SAVED_VIEW_VALUE);
                      }}
                      placeholder="vip, shortlist"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm">Completion bucket</Label>
                      <div className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-2">
                        {COMPLETION_BUCKET_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={completionBucketFilter.includes(option.value)}
                              onCheckedChange={() => {
                                toggleCompletionBucketFilter(option.value);
                                setSelectedViewId(NO_SAVED_VIEW_VALUE);
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                        <div>
                          <Label className="text-sm">Has draft progress</Label>
                          <p className="text-xs text-muted-foreground">
                            Show applications with at least one draft.
                          </p>
                        </div>
                        <Switch
                          checked={hasDraftProgressFilter}
                          onCheckedChange={(checked) => {
                            setHasDraftProgressFilter(checked);
                            setSelectedViewId(NO_SAVED_VIEW_VALUE);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                        <div>
                          <Label className="text-sm">Needs revision only</Label>
                          <p className="text-xs text-muted-foreground">
                            Keep applications with at least one step in needs revision.
                          </p>
                        </div>
                        <Switch
                          checked={needsRevisionOnlyFilter}
                          onCheckedChange={(checked) => {
                            setNeedsRevisionOnlyFilter(checked);
                            setSelectedViewId(NO_SAVED_VIEW_VALUE);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {filterMode === "advanced" && (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      Conditions: {advancedFilterStats.conditionCount}/40
                    </span>
                    <span>Max depth: {advancedFilterStats.maxDepth}/3</span>
                  </div>
                  {renderAdvancedGroupEditor(advancedFilterTree, 1, true)}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save shared view</DialogTitle>
            <DialogDescription>
              Save the current filter setup so your team can reuse it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={saveViewName}
              onChange={(event) => setSaveViewName(event.target.value)}
              placeholder="High priority revisions"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveViewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveCurrentView} disabled={isSavingView}>
              {isSavingView ? "Saving..." : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameViewDialog} onOpenChange={setShowRenameViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename saved view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={renameViewName}
              onChange={(event) => setRenameViewName(event.target.value)}
              placeholder="View name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameViewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={renameSelectedView} disabled={isRenamingView}>
              {isRenamingView ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {exportScope === "selected"
                ? "Export selected applications"
                : "Export applications CSV"}
            </DialogTitle>
            <DialogDescription>
              Choose which columns to include in the CSV export.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
              <div>
                <Label className="text-sm">Include dynamic response columns</Label>
                <p className="text-xs text-muted-foreground">
                  Add one column per form response field from workflow submissions.
                </p>
              </div>
              <Switch
                checked={includeResponseColumnsInExport}
                onCheckedChange={setIncludeResponseColumnsInExport}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {exportColumns.length} column
                {exportColumns.length === 1 ? "" : "s"} selected
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setExportColumns([...APPLICATION_EXPORT_CORE_COLUMNS])
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setExportColumns([])}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border border-border/60 p-3 sm:grid-cols-2">
              {APPLICATION_EXPORT_CORE_COLUMNS.map((column) => (
                <label
                  key={column}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={exportColumns.includes(column)}
                    onCheckedChange={() => toggleExportColumn(column)}
                  />
                  <span>{humanizeExportColumnKey(column)}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmExport} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPasteEmailsDialog}
        onOpenChange={(open) => {
          setShowPasteEmailsDialog(open);
          if (!open) {
            setPasteSelectionResult(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Applications by Pasted Emails</DialogTitle>
            <DialogDescription>
              Paste emails from CSV, Excel, or Google Sheets. Matching is scoped
              to applicants of this event only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              rows={9}
              value={pastedEmailsText}
              onChange={(event) => {
                setPastedEmailsText(event.target.value);
                setPasteSelectionResult(null);
              }}
              placeholder={"alice@example.com\nbob@example.com"}
            />

            <div className="rounded-md border border-border/60 p-3 text-xs space-y-1">
              <p>{parsedPastedEmails.emails.length} valid unique email(s)</p>
              <p>{parsedPastedEmails.duplicateEmails.length} duplicate email(s) ignored</p>
              <p>{parsedPastedEmails.invalidTokens.length} invalid token(s)</p>
              {parsedPastedEmails.overLimit && (
                <p className="text-destructive">
                  Limit reached: only the first {MAX_PASTED_EMAILS} valid unique
                  emails are used ({parsedPastedEmails.truncatedCount} ignored).
                </p>
              )}
              {parsedPastedEmails.invalidTokens.length > 0 && (
                <p className="text-muted-foreground">
                  Invalid sample:{" "}
                  {parsedPastedEmails.invalidTokens.slice(0, 5).join(", ")}
                </p>
              )}
            </div>

            {pasteSelectionResult && (
              <div className="rounded-md border border-border/60 p-3 text-xs space-y-1">
                <p>
                  Selected {pasteSelectionResult.applicationIds.length} application(s)
                </p>
                <p>{pasteSelectionResult.matchedEmails.length} matched email(s)</p>
                <p>{pasteSelectionResult.unmatchedEmails.length} unmatched email(s)</p>
                {pasteSelectionResult.unmatchedEmails.length > 0 && (
                  <p className="text-muted-foreground">
                    Unmatched sample:{" "}
                    {pasteSelectionResult.unmatchedEmails.slice(0, 5).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPasteEmailsDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={applyPastedEmailSelection}
              disabled={isResolvingEmails || parsedPastedEmails.emails.length === 0}
            >
              {isResolvingEmails
                ? "Selecting..."
                : `Select ${parsedPastedEmails.emails.length} email(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedCount > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground mr-2">
              {selectedCount} selected
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulkTags(true)}
              disabled={!canManageTags}
            >
              <Tags className="mr-1.5 h-3.5 w-3.5" />
              Bulk tags
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`${basePath}/reviewer-assignment`)}
              disabled={!canManageReviewerAssignment}
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Reviewer assignment
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulkMessage(true)}
              disabled={!canSendMessages}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Send message
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulkDecision(true)}
              disabled={!canDraftDecisions}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Decision draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={issueSelectedCredentials}
              disabled={!canIssueCredentials || isIssuingCredentials}
            >
              <Award className="mr-1.5 h-3.5 w-3.5" />
              {isIssuingCredentials ? "Issuing..." : "Issue credentials"}
            </Button>
            {canPublishDecisions && (
              <Button
                size="sm"
                variant="outline"
                onClick={publishSelectedDecisions}
                disabled={isPublishingDecisions}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {isPublishingDecisions ? "Publishing..." : "Publish decisions"}
              </Button>
            )}
            {canExport && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openExportDialog("selected")}
                disabled={isExporting}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {isExporting ? "Exporting..." : "Export selected"}
              </Button>
            )}
            {canUseBulkStepActions && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowBulkStepAction(true)}
              >
                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                Step action
              </Button>
            )}
            {canDeleteApplications && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowBulkDelete(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete selected
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds([])}
            >
              Clear selection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center py-12 text-muted-foreground"
                    >
                      No applications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(
                          `${basePath}/applications/${row.original.id}`
                        )
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {currentPageVisibleRows === 0
            ? `Showing 0 of ${totalMatchingApplications} applications`
            : `Showing ${currentPageStart}-${currentPageEnd} of ${totalMatchingApplications} applications`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleNextPage();
            }}
            disabled={!canGoNextPage || isLoadingMoreApplications}
          >
            {isLoadingMoreApplications ? "Loading..." : "Next"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showBulkTags} onOpenChange={setShowBulkTags}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk tag applications</DialogTitle>
            <DialogDescription>
              Add and/or remove tags for {selectedCount} selected applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Add tags</Label>
              <Input
                value={bulkAddTags}
                onChange={(event) => setBulkAddTags(event.target.value)}
                placeholder="vip, shortlist"
              />
            </div>
            <div className="space-y-2">
              <Label>Remove tags</Label>
              <Input
                value={bulkRemoveTags}
                onChange={(event) => setBulkRemoveTags(event.target.value)}
                placeholder="needs_followup"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkTags(false)}>
              Cancel
            </Button>
            <Button onClick={applyBulkTags} disabled={isApplyingBulk}>
              {isApplyingBulk ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkMessage} onOpenChange={setShowBulkMessage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk message applicants</DialogTitle>
            <DialogDescription>
              Send one message to {selectedCount} selected applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={bulkMessageSubject}
                onChange={(event) => setBulkMessageSubject(event.target.value)}
                placeholder="Important update"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={6}
                value={bulkMessageBody}
                onChange={(event) => setBulkMessageBody(event.target.value)}
                placeholder="Write your message..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bulkMessageSendEmail}
                onChange={(event) =>
                  setBulkMessageSendEmail(event.target.checked)
                }
              />
              Also send by email
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkMessage(false)}>
              Cancel
            </Button>
            <Button onClick={applyBulkMessage} disabled={isApplyingBulk}>
              {isApplyingBulk ? "Sending..." : "Send message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDecision} onOpenChange={setShowBulkDecision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk decision draft</DialogTitle>
            <DialogDescription>
              Draft a decision for {selectedCount} selected applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={bulkDecisionStatus}
                onValueChange={(value) =>
                  setBulkDecisionStatus(
                    value as "ACCEPTED" | "WAITLISTED" | "REJECTED",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="WAITLISTED">Waitlisted</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template (optional)</Label>
              <Select
                value={bulkDecisionTemplateId}
                onValueChange={setBulkDecisionTemplateId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {decisionTemplatesForStatus.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDecision(false)}>
              Cancel
            </Button>
            <Button onClick={applyBulkDecisionDraft} disabled={isApplyingBulk}>
              {isApplyingBulk ? "Applying..." : "Apply draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTemplateManager}
        onOpenChange={(open) => {
          setShowTemplateManager(open);
          if (!open) resetTemplateEditor();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Decision Templates</DialogTitle>
            <DialogDescription>
              Create reusable accepted/waitlisted/rejected templates with variables.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Existing templates</p>
                <Button size="sm" variant="outline" onClick={startTemplateCreate}>
                  New
                </Button>
              </div>
              <div className="max-h-80 space-y-2 overflow-auto pr-1">
                {decisionTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No templates yet.
                  </p>
                ) : (
                  decisionTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="rounded-md border border-border/60 p-2 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{template.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {template.status} â€¢ {template.isActive ? "Active" : "Inactive"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => editTemplate(template)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteTemplate(template.id)}
                            disabled={deletingTemplateId === template.id}
                          >
                            {deletingTemplateId === template.id ? "..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border/60 p-3">
              <p className="text-sm font-medium">
                {editingTemplateId ? "Edit template" : "Create template"}
              </p>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Accepted with scholarship"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={templateStatus}
                  onValueChange={(value) =>
                    setTemplateStatus(value as "ACCEPTED" | "WAITLISTED" | "REJECTED")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCEPTED">Accepted</SelectItem>
                    <SelectItem value="WAITLISTED">Waitlisted</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject template</Label>
                <Input
                  value={templateSubject}
                  onChange={(event) => setTemplateSubject(event.target.value)}
                  placeholder="Decision for {{eventTitle}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Body template</Label>
                <Textarea
                  rows={7}
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                  placeholder="Hello {{applicantName}}, ..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={templateIsActive}
                  onCheckedChange={setTemplateIsActive}
                  id="decision-template-active"
                />
                <Label htmlFor="decision-template-active">Active</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Variables: {DECISION_TEMPLATE_VARIABLE_TOKENS.join(", ")}
              </p>
  
              <DialogFooter>
                <Button variant="outline" onClick={resetTemplateEditor}>
                  Reset
                </Button>
                <Button onClick={saveTemplate} disabled={isSavingTemplate}>
                  {isSavingTemplate ? "Saving..." : editingTemplateId ? "Save changes" : "Create template"}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete application?"
        description={
          deleteTarget
            ? `This will permanently delete ${deleteTarget.applicantName || deleteTarget.applicantEmail}'s application and related submissions.`
            : "This action cannot be undone."
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={deleteApplication}
      />

      <ConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        title={`Delete ${selectedCount} application(s)?`}
        description={`This will permanently delete ${selectedCount} selected application(s) and all related submissions, drafts, and step states. This action cannot be undone.`}
        confirmLabel={isBulkDeleting ? "Deleting..." : `Delete ${selectedCount}`}
        variant="destructive"
        onConfirm={bulkDeleteApplications}
      />

      {/* Bulk step action dialog */}
      <Dialog open={showBulkStepAction} onOpenChange={setShowBulkStepAction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk step action</DialogTitle>
            <DialogDescription>
              Apply a step action for {selectedCount} selected application(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Step</Label>
              <Select value={bulkStepId} onValueChange={setBulkStepId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select step..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedWorkflowSteps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.stepIndex + 1}. {step.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={bulkStepAction} onValueChange={(v) => setBulkStepAction(v as typeof bulkStepAction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canStepOverride && (
                    <SelectItem value="UNLOCK">Unlock</SelectItem>
                  )}
                  {canStepReview && (
                    <SelectItem value="APPROVE">Approve</SelectItem>
                  )}
                  {canStepOverride && (
                    <SelectItem value="LOCK">Lock</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkStepAction(false)}>
              Cancel
            </Button>
            <Button onClick={applyBulkStepAction} disabled={isApplyingBulk || !bulkStepId}>
              {isApplyingBulk ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
