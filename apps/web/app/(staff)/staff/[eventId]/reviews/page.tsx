"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PageHeader, EmptyState, CardSkeleton } from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { toast } from "sonner";
import { renderAnswerValue } from "@/lib/render-answer-value";
import { getRequiredFieldKeySet } from "@/lib/file-answer-utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelative, formatExactTimestamp } from "@/lib/relative-time";
import { Permission, type ReviewQueueStats } from "@event-platform/shared";
import {
  appendUniqueQueueItems,
  normalizeReviewQueueResponse,
  shouldAutoLoadNext,
  type ReviewQueueResponse,
} from "@/lib/review-queue-pagination";
import { QueueStatsBar } from "./queue-stats-bar";
import { VerdictWorkspace, type VerdictDraft } from "./verdict-workspace";

interface ReviewItem {
  id: string;
  queueItemId?: string;
  applicationId: string;
  applicantName: string | null;
  applicantEmail: string;
  stepTitle: string;
  stepId: string;
  submissionVersionId?: string;
  status: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  formDefinition?: Record<string, unknown> | null;
  assignedReviewerId: string | null;
  assignedReviewerEmail?: string | null;
  assignedReviewerName?: string | null;
  queueMode?: "direct" | "shared";
  assignmentExpiresAt?: string | null;
  isOverdue?: boolean;
  tags?: string[];
}

interface StepOption {
  id: string;
  title: string;
}

interface SavedView {
  id: string;
  name: string;
  isDefault: boolean;
  filters: {
    stepId?: string;
    assignedTo?: "any" | "me" | "unassigned";
    status?: "pending" | "needs_info" | "resubmitted";
    tags?: string[];
  };
}

interface RequestFieldOption {
  id: string;
  label: string;
  section?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFormDefinition(
  definition: unknown,
): Record<string, unknown> | null {
  if (!definition) return null;
  if (typeof definition === "string") {
    try {
      const parsed = JSON.parse(definition);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!isRecord(definition)) return null;
  if (isRecord(definition.schema)) {
    return definition.schema;
  }
  return definition;
}

function extractRequestFieldOptions(
  definition?: Record<string, unknown> | null,
  answers?: Record<string, unknown>,
): RequestFieldOption[] {
  const options: RequestFieldOption[] = [];
  const seen = new Set<string>();

  const addOption = (candidate: unknown, section: string) => {
    if (!isRecord(candidate)) return;
    const type =
      typeof candidate.type === "string" ? candidate.type.toLowerCase() : "";
    if (type === "info_text") return;

    const id = [candidate.key, candidate.fieldId, candidate.id]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .find((value) => value.length > 0);
    if (!id || seen.has(id)) return;

    seen.add(id);
    options.push({
      id,
      label:
        typeof candidate.label === "string" && candidate.label.trim().length > 0
          ? candidate.label.trim()
          : id,
      section,
    });
  };

  const schema = parseFormDefinition(definition);
  const sections = Array.isArray(schema?.sections)
    ? schema.sections
    : Array.isArray(schema?.pages)
      ? schema.pages
      : [];

  sections.forEach((section, index) => {
    const sectionRecord = isRecord(section) ? section : {};
    const sectionTitle =
      typeof sectionRecord.title === "string" &&
      sectionRecord.title.trim().length > 0
        ? sectionRecord.title.trim()
        : `Section ${index + 1}`;
    const fields = Array.isArray(sectionRecord.fields)
      ? sectionRecord.fields
      : [];
    fields.forEach((field) => addOption(field, sectionTitle));
  });

  const rootFields = Array.isArray(schema?.fields) ? schema.fields : [];
  rootFields.forEach((field) => addOption(field, "General"));

  if (answers) {
    Object.keys(answers)
      .filter((key) => key !== "data")
      .forEach((key) =>
        addOption(
          {
            key,
            label: key,
          },
          "Response",
        ),
      );
  }

  return options;
}

type QueueStatusFilter = "all" | "pending" | "needs_info" | "resubmitted";
type QueueOwnershipFilter = "any" | "me" | "unassigned";
const QUEUE_PAGE_LIMIT = 50;
const AUTO_ADVANCE_STORAGE_PREFIX = "reviewer-auto-advance:";

export default function ReviewsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken, user } = useAuth();
  const { hasPermission } = usePermissions(eventId);

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [stepOptions, setStepOptions] = useState<StepOption[]>([]);
  const [stats, setStats] = useState<ReviewQueueStats | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepFilter, setStepFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] =
    useState<QueueOwnershipFilter>("any");
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [autoAdvance, setAutoAdvanceState] = useState(false);
  const queueRequestVersionRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);

  const canSendMessages = hasPermission(Permission.EVENT_MESSAGES_SEND);
  const canManageAssignments = hasPermission(Permission.EVENT_UPDATE);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const activeTags = useMemo(
    () =>
      tagFilter
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [tagFilter],
  );

  const loadSavedViews = useCallback(async () => {
    const res = await apiClient<{ data?: SavedView[] }>(
      `/events/${eventId}/review-queue/views`,
    );
    const list = Array.isArray(res?.data) ? res.data : [];
    setSavedViews(list);

    const defaultView = list.find((view) => view.isDefault);
    if (defaultView && selectedViewId === "none") {
      setSelectedViewId(defaultView.id);
      setStepFilter(defaultView.filters.stepId ?? "all");
      setOwnershipFilter(defaultView.filters.assignedTo ?? "any");
      setStatusFilter(defaultView.filters.status ?? "all");
      setTagFilter((defaultView.filters.tags ?? []).join(", "));
    }
  }, [eventId, selectedViewId]);

  const loadStats = useCallback(async () => {
    const res = await apiClient<{ data?: ReviewQueueStats }>(
      `/events/${eventId}/review-queue/stats`,
    );
    const data = res?.data ?? null;
    setStats(data);
    const rows = Array.isArray(data?.byStep) ? data.byStep : [];
    const options: StepOption[] = rows.map((row) => ({
      id: String(row.stepId ?? ""),
      title: String(row.stepTitle ?? "Step"),
    }));
    setStepOptions(options.filter((option) => option.id.length > 0));
  }, [eventId]);

  const loadQueue = useCallback(async (mode: "replace" | "append" = "replace") => {
    const isAppend = mode === "append";
    if (isAppend) {
      if (
        loadingMoreRef.current ||
        !hasMoreRef.current ||
        !nextCursorRef.current
      ) {
        return 0;
      }
      loadingMoreRef.current = true;
      setIsLoadingMore(true);
    }

    const requestVersion = ++queueRequestVersionRef.current;
    const query = new URLSearchParams();
    query.set("limit", String(QUEUE_PAGE_LIMIT));
    if (stepFilter !== "all") query.set("stepId", stepFilter);
    if (ownershipFilter !== "any") query.set("assignedTo", ownershipFilter);
    if (statusFilter !== "all") query.set("status", statusFilter);
    for (const tag of activeTags) {
      query.append("tags", tag);
    }
    if (isAppend && nextCursorRef.current) {
      query.set("cursor", nextCursorRef.current);
    }

    try {
      const qs = query.toString();
      const res = await apiClient<ReviewQueueResponse<ReviewItem>>(
        `/events/${eventId}/review-queue${qs ? `?${qs}` : ""}`,
      );

      if (requestVersion !== queueRequestVersionRef.current) {
        return 0;
      }

      const normalized = normalizeReviewQueueResponse<ReviewItem>(res);
      const list = normalized.items;
      const nextMetaCursor = normalized.meta.nextCursor;
      const nextMetaHasMore = normalized.meta.hasMore;

      let addedCount = 0;
      if (isAppend) {
        setQueue((prev) => {
          const merged = appendUniqueQueueItems(prev, list);
          addedCount = merged.length - prev.length;
          return merged;
        });
      } else {
        setQueue(list);
        setCurrentIndex((prev) => {
          if (list.length === 0) return 0;
          return Math.min(prev, list.length - 1);
        });
        addedCount = list.length;
      }

      nextCursorRef.current = nextMetaCursor;
      hasMoreRef.current = nextMetaHasMore;
      setNextCursor(nextMetaCursor);
      setHasMore(nextMetaHasMore);
      return addedCount;
    } finally {
      if (isAppend) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [activeTags, eventId, ownershipFilter, statusFilter, stepFilter]);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadSavedViews(), loadStats()]);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadSavedViews, loadStats]);

  // Persist the auto-advance preference per-event. Default OFF on first visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(
        `${AUTO_ADVANCE_STORAGE_PREFIX}${eventId}`,
      );
      setAutoAdvanceState(stored === "1");
    } catch {
      /* storage blocked — leave default OFF */
    }
  }, [eventId]);

  const setAutoAdvance = useCallback(
    (value: boolean) => {
      setAutoAdvanceState(value);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          `${AUTO_ADVANCE_STORAGE_PREFIX}${eventId}`,
          value ? "1" : "0",
        );
      } catch {
        /* storage blocked — preference applies for this tab only */
      }
    },
    [eventId],
  );

  useEffect(() => {
    if (isLoading) return;
    (async () => {
      try {
        await loadQueue("replace");
      } catch {
        /* handled */
      }
    })();
  }, [isLoading, loadQueue]);

  const current = queue[currentIndex];
  const requiredFieldKeys = getRequiredFieldKeySet(current?.formDefinition);
  const requestFieldOptions = useMemo(
    () => extractRequestFieldOptions(current?.formDefinition, current?.answers),
    [current?.formDefinition, current?.answers],
  );
  const requestFieldIdSet = useMemo(
    () => new Set(requestFieldOptions.map((option) => option.id)),
    [requestFieldOptions],
  );
  const currentQueueItemId = current?.queueItemId ?? current?.id;
  const isCurrentAssignedToActor =
    !!current &&
    !!user?.id &&
    current.queueMode === "direct" &&
    current.assignedReviewerId === user.id;
  const canActOnCurrentItem = Boolean(
    current && (canManageAssignments || isCurrentAssignedToActor),
  );

  async function saveCurrentView() {
    if (!saveViewName.trim()) {
      toast.error("View name is required");
      return;
    }
    setIsSavingView(true);
    try {
      const payload = {
        name: saveViewName.trim(),
        isDefault: saveAsDefault,
        filters: {
          ...(stepFilter !== "all" ? { stepId: stepFilter } : {}),
          ...(ownershipFilter !== "any" ? { assignedTo: ownershipFilter } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(activeTags.length > 0 ? { tags: activeTags } : {}),
        },
      };
      await apiClient(`/events/${eventId}/review-queue/views`, {
        method: "POST",
        body: payload,
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Saved view");
      setShowSaveViewDialog(false);
      setSaveViewName("");
      setSaveAsDefault(false);
      await loadSavedViews();
    } catch {
      /* handled */
    } finally {
      setIsSavingView(false);
    }
  }

  async function deleteSelectedView() {
    if (selectedViewId === "none") return;
    try {
      await apiClient(`/events/${eventId}/review-queue/views/${selectedViewId}`, {
        method: "DELETE",
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Saved view deleted");
      setSelectedViewId("none");
      await loadSavedViews();
    } catch {
      /* handled */
    }
  }

  function applySavedView(viewId: string) {
    setSelectedViewId(viewId);
    if (viewId === "none") return;
    const view = savedViews.find((entry) => entry.id === viewId);
    if (!view) return;
    setStepFilter(view.filters.stepId ?? "all");
    setOwnershipFilter(view.filters.assignedTo ?? "any");
    setStatusFilter(view.filters.status ?? "all");
    setTagFilter((view.filters.tags ?? []).join(", "));
  }

  async function submitReview(draft: VerdictDraft) {
    if (!current) return;
    if (!canActOnCurrentItem) {
      toast.error(
        "Claim this queue item before reviewing, or use organizer/admin access.",
      );
      return;
    }
    const versionId = current.submissionVersionId;
    if (!versionId) {
      toast.error("No submission version found for this step");
      return;
    }
    setIsSubmittingReview(true);
    try {
      const selectedTargetFieldIds =
        draft.outcome === "REQUEST_INFO"
          ? Array.from(
              new Set(
                draft.requestInfoFieldIds.filter((fieldId) =>
                  requestFieldIdSet.has(fieldId),
                ),
              ),
            )
          : [];
      await apiClient(
        `/events/${eventId}/applications/${current.applicationId}/steps/${current.stepId}/versions/${versionId}/reviews`,
        {
          method: "POST",
          body: {
            outcome: draft.outcome,
            messageToApplicant: draft.comment || undefined,
            targetFieldIds:
              draft.outcome === "REQUEST_INFO" &&
              selectedTargetFieldIds.length > 0
                ? selectedTargetFieldIds
                : undefined,
            deadline: draft.requestInfoDeadline || undefined,
          },
          csrfToken: csrfToken ?? undefined,
        },
      );

      if (
        draft.outcome === "REQUEST_INFO" &&
        draft.requestInfoNotifyApplicant &&
        canSendMessages
      ) {
        const fallbackMessage =
          draft.comment.trim() ||
          `Please review and update the requested fields for ${current.stepTitle}.`;
        try {
          await apiClient(`/events/${eventId}/messages`, {
            method: "POST",
            body: {
              title: `Revision requested: ${current.stepTitle}`,
              bodyRich: fallbackMessage,
              bodyText: fallbackMessage,
              actionButtons: [
                {
                  kind: "OPEN_STEP",
                  eventId,
                  stepId: current.stepId,
                  label: "Update step",
                },
              ],
              recipientFilter: {
                applicationIds: [current.applicationId],
              },
              sendEmail: draft.requestInfoSendEmail,
            },
            csrfToken: csrfToken ?? undefined,
          });
        } catch {
          toast.error("Revision requested, but message failed to send.");
        }
      }

      toast.success(
        draft.outcome === "APPROVE"
          ? "Step approved"
          : draft.outcome === "REJECT"
            ? "Step rejected"
            : "Revision requested",
      );
      let nextLength = 0;
      setQueue((prev) => {
        const updated = prev.filter((item) => item.id !== current.id);
        nextLength = updated.length;
        return updated;
      });
      setCurrentIndex((prev) => {
        if (nextLength <= 0) return 0;
        return Math.min(prev, nextLength - 1);
      });
      // Refresh queue counts after every successful verdict so the stats bar
      // (and the staff sidebar badge in PR B1) stay in sync.
      void loadStats();
      if (autoAdvance) {
        void goNext();
      }
    } catch {
      /* handled */
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function claimCurrentItem() {
    if (!currentQueueItemId) return;
    try {
      const res = await apiClient<{
        data?: {
          queueItemId: string;
          queueMode: "direct";
          assignedReviewerId: string;
          assignmentExpiresAt: string | null;
        };
      }>(`/events/${eventId}/review-queue/items/${currentQueueItemId}/claim`, {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      const payload = res?.data;
      if (!payload) return;
      let nextLength = 0;
      setQueue((prev) => {
        const updated = prev.flatMap((item) => {
          if ((item.queueItemId ?? item.id) !== payload.queueItemId) {
            return [item];
          }
          if (ownershipFilter === "unassigned") {
            return [];
          }
          return [
            {
              ...item,
              queueMode: payload.queueMode,
              assignedReviewerId: payload.assignedReviewerId,
              assignedReviewerName: user?.fullName ?? item.assignedReviewerName,
              assignedReviewerEmail: user?.email ?? item.assignedReviewerEmail,
              assignmentExpiresAt: payload.assignmentExpiresAt,
              isOverdue: false,
            },
          ];
        });
        nextLength = updated.length;
        return updated;
      });
      setCurrentIndex((prev) => {
        if (nextLength <= 0) return 0;
        return Math.min(prev, nextLength - 1);
      });
      void loadStats();
      toast.success("Queue item claimed.");
    } catch {
      /* handled */
    }
  }

  async function releaseCurrentItem() {
    if (!currentQueueItemId) return;
    try {
      const res = await apiClient<{
        data?: {
          queueItemId: string;
          queueMode: "shared";
          assignedReviewerId: null;
          assignmentExpiresAt: null;
        };
      }>(
        `/events/${eventId}/review-queue/items/${currentQueueItemId}/release`,
        {
          method: "POST",
          csrfToken: csrfToken ?? undefined,
        },
      );
      const payload = res?.data;
      if (!payload) return;
      let nextLength = 0;
      setQueue((prev) => {
        const updated = prev.flatMap((item) => {
          if ((item.queueItemId ?? item.id) !== payload.queueItemId) {
            return [item];
          }
          if (ownershipFilter === "me") {
            return [];
          }
          return [
            {
              ...item,
              queueMode: payload.queueMode,
              assignedReviewerId: null,
              assignedReviewerName: null,
              assignedReviewerEmail: null,
              assignmentExpiresAt: null,
              isOverdue: false,
            },
          ];
        });
        nextLength = updated.length;
        return updated;
      });
      setCurrentIndex((prev) => {
        if (nextLength <= 0) return 0;
        return Math.min(prev, nextLength - 1);
      });
      void loadStats();
      toast.success("Queue item released to shared pool.");
    } catch {
      /* handled */
    }
  }

  async function goNext() {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((prev) => Math.min(queue.length - 1, prev + 1));
      return;
    }

    if (
      !shouldAutoLoadNext({
        currentIndex,
        queueLength: queue.length,
        hasMore,
        isLoadingMore,
      })
    ) {
      return;
    }

    const previousLength = queue.length;
    const added = await loadQueue("append");
    if (added > 0) {
      setCurrentIndex((prev) =>
        Math.min(prev + 1, previousLength + added - 1),
      );
    }
  }

  const nextPreview = useMemo(() => {
    const next = queue[currentIndex + 1];
    if (!next) return null;
    const title = next.applicantName ?? next.applicantEmail;
    return { title, subtitle: next.stepTitle };
  }, [queue, currentIndex]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Review Queue" />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event · Reviews"
        title="Review Queue"
        description={`${queue.length}${hasMore ? "+" : ""} submissions awaiting review`}
      />

      <QueueStatsBar
        stats={stats}
        loading={isLoading}
        scope={ownershipFilter === "me" ? "me" : "any"}
      />

      <div className="grid gap-3 lg:grid-cols-6">
        <Select value={stepFilter} onValueChange={setStepFilter}>
          <SelectTrigger>
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue placeholder="All steps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All steps</SelectItem>
            {stepOptions.map((step) => (
              <SelectItem key={step.id} value={step.id}>
                {step.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as QueueStatusFilter)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending review</SelectItem>
            <SelectItem value="needs_info">Needs info</SelectItem>
            <SelectItem value="resubmitted">Resubmitted</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={ownershipFilter}
          onValueChange={(value) =>
            setOwnershipFilter(value as QueueOwnershipFilter)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All visible" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All visible</SelectItem>
            <SelectItem value="me">My queue</SelectItem>
            <SelectItem value="unassigned">Shared pool</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          placeholder="Tags (comma-separated)"
          className="lg:col-span-2"
        />

        <div className="text-sm text-muted-foreground flex items-center justify-end">
          {queue.length > 0 ? `${currentIndex + 1} of ${queue.length}` : "0 of 0"}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Select value={selectedViewId} onValueChange={applySavedView}>
          <SelectTrigger>
            <SelectValue placeholder="Saved view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No saved view</SelectItem>
            {savedViews.map((view) => (
              <SelectItem key={view.id} value={view.id}>
                {view.name}
                {view.isDefault ? " (Default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => setShowSaveViewDialog(true)}
          className="justify-start"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save current view
        </Button>
        <Button
          variant="outline"
          onClick={deleteSelectedView}
          disabled={selectedViewId === "none"}
          className="justify-start text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete selected view
        </Button>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          description="There are no submissions matching this queue filter."
        />
      ) : current ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-4 lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="break-words text-base">
                          {current.applicantName ?? current.applicantEmail}
                        </CardTitle>
                        <CardDescription className="break-all">
                          {current.applicantEmail}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="secondary"
                        className="max-w-[45%] shrink-0 truncate"
                      >
                        {current.stepTitle}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        Submitted {new Date(current.submittedAt).toLocaleDateString("en-GB")}
                      </span>
                      <Badge
                        variant={
                          current.queueMode === "direct" ? "secondary" : "outline"
                        }
                      >
                        {current.queueMode === "direct"
                          ? "Direct assignment"
                          : "Shared pool"}
                      </Badge>
                      {current.queueMode === "direct" &&
                        current.assignedReviewerId && (
                          <Badge variant="outline">
                            {current.assignedReviewerId === user?.id
                              ? "Assigned to you"
                              : `Assigned to ${
                                  current.assignedReviewerName ??
                                  current.assignedReviewerEmail ??
                                  "another reviewer"
                                }`}
                          </Badge>
                        )}
                      {current.queueMode === "direct" &&
                        current.assignmentExpiresAt && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant={
                                    current.isOverdue
                                      ? "destructive"
                                      : "outline"
                                  }
                                  className="cursor-default"
                                >
                                  {current.isOverdue
                                    ? `Overdue by ${formatRelative(current.assignmentExpiresAt).replace(/^overdue by /, "")}`
                                    : `Expires ${formatRelative(current.assignmentExpiresAt)}`}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatExactTimestamp(
                                  current.assignmentExpiresAt,
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      {(current.tags ?? []).slice(0, 4).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="max-w-full break-all text-[10px]"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="min-w-0 overflow-hidden">
                    <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2">
                      <div className="space-y-4">
                        {Object.entries(current.answers).map(([key, val]) => (
                          <div key={key}>
                            <p className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider">
                              <span className="break-all">{key}</span>
                              {requiredFieldKeys.has(key) && (
                                <span
                                  className="text-destructive text-sm leading-none"
                                  aria-label="Required field"
                                  title="Required"
                                >
                                  *
                                </span>
                              )}
                            </p>
                            <div className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {renderAnswerValue(val, {
                                eventId,
                                verification: current.submissionVersionId
                                  ? {
                                      applicationId: current.applicationId,
                                      stepId: current.stepId,
                                      submissionVersionId: current.submissionVersionId,
                                      fieldKey: key,
                                    }
                                  : undefined,
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void goNext();
                }}
                disabled={
                  (currentIndex >= queue.length - 1 && !hasMore) ||
                  isLoadingMore
                }
              >
                {isLoadingMore ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <VerdictWorkspace
              currentItemId={current.id}
              currentQueueMode={current.queueMode}
              canActOnCurrentItem={canActOnCurrentItem}
              isCurrentAssignedToActor={isCurrentAssignedToActor}
              canSendMessages={canSendMessages}
              requestFieldOptions={requestFieldOptions}
              onClaim={claimCurrentItem}
              onRelease={releaseCurrentItem}
              onSubmit={submitReview}
              isSubmittingReview={isSubmittingReview}
              autoAdvance={autoAdvance}
              setAutoAdvance={setAutoAdvance}
              nextPreview={nextPreview}
            />
          </div>
        </div>
      ) : null}

      <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save review view</DialogTitle>
            <DialogDescription>
              Save the current queue filters for faster triage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={saveViewName}
                onChange={(event) => setSaveViewName(event.target.value)}
                placeholder="My review queue"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(event) => setSaveAsDefault(event.target.checked)}
              />
              Set as default for this event
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveViewDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveCurrentView} disabled={isSavingView}>
              {isSavingView && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
