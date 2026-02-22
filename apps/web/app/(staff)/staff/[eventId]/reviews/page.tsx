"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  EmptyState,
  CardSkeleton,
} from "@/components/shared";
import { apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { toast } from "sonner";
import { renderAnswerValue } from "@/lib/render-answer-value";
import { getRequiredFieldKeySet } from "@/lib/file-answer-utils";
import { Badge } from "@/components/ui/badge";
import { Permission } from "@event-platform/shared";

interface ReviewItem {
  id: string;
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  stepTitle: string;
  stepId: string;
  submissionVersionId?: string;
  status: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  formDefinition?: Record<string, unknown> | null;
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

type ReviewVerdict = "APPROVE" | "REJECT" | "REQUEST_INFO";
type QueueStatusFilter = "all" | "pending" | "needs_info" | "resubmitted";

export default function ReviewsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [stepOptions, setStepOptions] = useState<StepOption[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepFilter, setStepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);

  // Review dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewVerdict, setReviewVerdict] = useState<ReviewVerdict | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [requestInfoFieldIds, setRequestInfoFieldIds] = useState<string[]>([]);
  const [requestInfoDeadline, setRequestInfoDeadline] = useState("");
  const [requestInfoNotifyApplicant, setRequestInfoNotifyApplicant] =
    useState(true);
  const [requestInfoSendEmail, setRequestInfoSendEmail] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const canSendMessages = hasPermission(Permission.EVENT_MESSAGES_SEND);

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
      setStatusFilter(defaultView.filters.status ?? "all");
      setTagFilter((defaultView.filters.tags ?? []).join(", "));
    }
  }, [eventId, selectedViewId]);

  const loadStepOptions = useCallback(async () => {
    const res = await apiClient<any>(`/events/${eventId}/review-queue/stats`);
    const rows = Array.isArray(res?.data?.byStep) ? res.data.byStep : [];
    const options: StepOption[] = rows.map((row: any) => ({
      id: String(row.stepId ?? ""),
      title: String(row.stepTitle ?? "Step"),
    }));
    setStepOptions(options.filter((option) => option.id.length > 0));
  }, [eventId]);

  const loadQueue = useCallback(async () => {
    const query = new URLSearchParams();
    if (stepFilter !== "all") query.set("stepId", stepFilter);
    if (statusFilter !== "all") query.set("status", statusFilter);
    for (const tag of activeTags) {
      query.append("tags", tag);
    }

    const qs = query.toString();
    const res = await apiClient<any>(
      `/events/${eventId}/review-queue${qs ? `?${qs}` : ""}`,
    );
    const list: ReviewItem[] = Array.isArray(res)
      ? res
      : Array.isArray(res?.data)
        ? res.data
        : [];
    setQueue(list);
    setCurrentIndex((prev) => {
      if (list.length === 0) return 0;
      return Math.min(prev, list.length - 1);
    });
  }, [activeTags, eventId, statusFilter, stepFilter]);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadSavedViews(), loadStepOptions()]);
        await loadQueue();
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadQueue, loadSavedViews, loadStepOptions]);

  useEffect(() => {
    if (isLoading) return;
    (async () => {
      try {
        await loadQueue();
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
    setStatusFilter(view.filters.status ?? "all");
    setTagFilter((view.filters.tags ?? []).join(", "));
  }

  function openReviewDialog(verdict: ReviewVerdict) {
    setReviewVerdict(verdict);
    setReviewComment("");
    setRequestInfoFieldIds([]);
    setRequestInfoDeadline("");
    setRequestInfoNotifyApplicant(canSendMessages);
    setRequestInfoSendEmail(false);
    setShowReviewDialog(true);
  }

  async function submitReview() {
    if (!current || !reviewVerdict) return;
    const versionId = current.submissionVersionId;
    if (!versionId) {
      toast.error("No submission version found for this step");
      return;
    }
    setIsSubmittingReview(true);
    try {
      const selectedTargetFieldIds =
        reviewVerdict === "REQUEST_INFO"
          ? Array.from(
              new Set(
                requestInfoFieldIds.filter((fieldId) =>
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
            outcome: reviewVerdict,
            messageToApplicant: reviewComment || undefined,
            targetFieldIds:
              reviewVerdict === "REQUEST_INFO" &&
              selectedTargetFieldIds.length > 0
                ? selectedTargetFieldIds
                : undefined,
            deadline: requestInfoDeadline || undefined,
          },
          csrfToken: csrfToken ?? undefined,
        },
      );

      if (
        reviewVerdict === "REQUEST_INFO" &&
        requestInfoNotifyApplicant &&
        canSendMessages
      ) {
        const fallbackMessage =
          reviewComment.trim() ||
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
              sendEmail: requestInfoSendEmail,
            },
            csrfToken: csrfToken ?? undefined,
          });
        } catch {
          toast.error("Revision requested, but message failed to send.");
        }
      }

      toast.success(
        reviewVerdict === "APPROVE"
          ? "Step approved"
          : reviewVerdict === "REJECT"
            ? "Step rejected"
            : "Revision requested",
      );
      setQueue((prev) => prev.filter((item) => item.id !== current.id));
      setCurrentIndex((prev) =>
        queue.length <= 1 ? 0 : Math.max(0, Math.min(prev, queue.length - 2)),
      );
    } catch {
      /* handled */
    } finally {
      setIsSubmittingReview(false);
      setShowReviewDialog(false);
    }
  }

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
        title="Review Queue"
        description={`${queue.length} submissions awaiting review`}
      />

      <div className="grid gap-3 lg:grid-cols-5">
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
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {current.applicantName}
                        </CardTitle>
                        <CardDescription>{current.applicantEmail}</CardDescription>
                      </div>
                      <Badge variant="secondary">{current.stepTitle}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>
                        Submitted {new Date(current.submittedAt).toLocaleDateString()}
                      </span>
                      {(current.tags ?? []).slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    <div className="max-h-[60vh] overflow-y-auto pr-2">
                      <div className="space-y-4">
                        {Object.entries(current.answers).map(([key, val]) => (
                          <div key={key}>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-2">
                              <span>{key}</span>
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
                            <div className="text-sm whitespace-pre-wrap break-words">
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
                onClick={() =>
                  setCurrentIndex(Math.min(queue.length - 1, currentIndex + 1))
                }
                disabled={currentIndex >= queue.length - 1}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Review actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("APPROVE")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                  Approve
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("REQUEST_INFO")}
                >
                  <AlertTriangle className="mr-2 h-4 w-4 text-warning" />
                  Request revision
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => openReviewDialog("REJECT")}
                >
                  <XCircle className="mr-2 h-4 w-4 text-destructive" />
                  Reject
                </Button>
              </CardContent>
            </Card>
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

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewVerdict === "APPROVE"
                ? "Approve submission"
                : reviewVerdict === "REJECT"
                  ? "Reject submission"
                  : "Request revision"}
            </DialogTitle>
            <DialogDescription>
              {reviewVerdict === "REQUEST_INFO"
                ? "Specify fields that need revision and an optional deadline."
                : "Add an optional comment."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">
                {reviewVerdict === "REQUEST_INFO"
                  ? "Message to applicant"
                  : "Comment (optional)"}
              </Label>
              <Textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={
                  reviewVerdict === "REQUEST_INFO"
                    ? "Explain what needs to be updated..."
                    : "Add a review comment..."
                }
                rows={3}
              />
            </div>
            {reviewVerdict === "REQUEST_INFO" && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Fields to revise</Label>
                    {requestFieldOptions.length > 0 && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setRequestInfoFieldIds(
                              requestFieldOptions.map((field) => field.id),
                            )
                          }
                        >
                          Select all
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRequestInfoFieldIds([])}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-muted/40 p-3">
                    {requestFieldOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No fields available for this step. Leave this empty to
                        request a full-step revision.
                      </p>
                    ) : (
                      requestFieldOptions.map((field) => (
                        <label
                          key={field.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Checkbox
                            checked={requestInfoFieldIds.includes(field.id)}
                            onCheckedChange={(checked) => {
                              const isChecked = checked === true;
                              setRequestInfoFieldIds((prev) =>
                                isChecked
                                  ? Array.from(new Set([...prev, field.id]))
                                  : prev.filter((id) => id !== field.id),
                              );
                            }}
                          />
                          <span>
                            {field.label}
                            {field.section && (
                              <span className="block text-xs text-muted-foreground">
                                {field.section}
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to request a full-step revision.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Deadline (optional)</Label>
                  <Input
                    type="date"
                    value={requestInfoDeadline}
                    onChange={(e) => setRequestInfoDeadline(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Notify applicant</Label>
                    <p className="text-xs text-muted-foreground">
                      Send an inbox message with a direct link to the step.
                    </p>
                  </div>
                  <Switch
                    checked={requestInfoNotifyApplicant}
                    onCheckedChange={(checked) => {
                      const enabled = Boolean(checked);
                      setRequestInfoNotifyApplicant(enabled);
                      if (!enabled) {
                        setRequestInfoSendEmail(false);
                      }
                    }}
                    disabled={!canSendMessages}
                  />
                </div>
                {requestInfoNotifyApplicant && (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Also send email</Label>
                      <p className="text-xs text-muted-foreground">
                        Deliver the revision request via email.
                      </p>
                    </div>
                    <Switch
                      checked={requestInfoSendEmail}
                      onCheckedChange={(checked) =>
                        setRequestInfoSendEmail(Boolean(checked))
                      }
                      disabled={!canSendMessages}
                    />
                  </div>
                )}
                {!canSendMessages && (
                  <p className="text-xs text-muted-foreground">
                    You do not have permission to send applicant messages.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={isSubmittingReview}
              variant={reviewVerdict === "REJECT" ? "destructive" : "default"}
            >
              {isSubmittingReview && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {reviewVerdict === "APPROVE"
                ? "Approve"
                : reviewVerdict === "REJECT"
                  ? "Reject"
                  : "Request revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
