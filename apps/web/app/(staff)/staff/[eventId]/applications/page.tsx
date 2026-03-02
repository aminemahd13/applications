"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBasePath } from "@/hooks/use-event-base-path";
import {
  Search,
  Download,
  Filter,
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
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
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
import { apiClient } from "@/lib/api";
import { resolvePublicApiBaseUrl } from "@/lib/public-api-url";
import { toast } from "sonner";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Permission } from "@event-platform/shared";

const PUBLIC_API_URL = resolvePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  currentStep: string;
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

type StatusFilterValue =
  | "all"
  | "waiting_applicant"
  | "waiting_review"
  | "revision_required"
  | "all_required_steps_approved"
  | "accepted"
  | "waitlisted"
  | "confirmed"
  | "rejected";

function matchesStatusFilter(status: string, filter: StatusFilterValue): boolean {
  if (filter === "all") return true;

  const normalized = String(status ?? "").toUpperCase();
  switch (filter) {
    case "waiting_applicant":
      return normalized.startsWith("WAITING_FOR_APPLICANT_STEP_");
    case "waiting_review":
      return (
        normalized.startsWith("WAITING_FOR_REVIEW_STEP_") ||
        normalized === "IN_REVIEW"
      );
    case "revision_required":
      return (
        normalized.startsWith("REVISION_REQUIRED_STEP_") ||
        normalized === "NEEDS_REVISION"
      );
    case "all_required_steps_approved":
      return normalized === "ALL_REQUIRED_STEPS_APPROVED";
    case "accepted":
      return (
        normalized === "ACCEPTED" || normalized.startsWith("DECISION_ACCEPTED")
      );
    case "waitlisted":
      return (
        normalized === "WAITLISTED" ||
        normalized.startsWith("DECISION_WAITLISTED")
      );
    case "confirmed":
      return normalized === "CONFIRMED";
    case "rejected":
      return (
        normalized === "BLOCKED_REJECTED" ||
        normalized === "REJECTED" ||
        normalized === "REJECTED_FINAL" ||
        normalized.startsWith("DECISION_REJECTED")
      );
    default:
      return false;
  }
}

/** Normalise an API ApplicationSummary â†’ frontend Application */
function normalizeApplication(raw: Record<string, unknown>): Application {
  const ss = raw.stepsSummary as { total?: number; completed?: number } | undefined;
  return {
    id: raw.id as string,
    applicantName: (raw.applicantName ?? raw.applicantEmail ?? "Unknown") as string,
    applicantEmail: (raw.applicantEmail ?? "") as string,
    status: (raw.derivedStatus ?? raw.status ?? "UNKNOWN") as string,
    currentStep: ss
      ? `${ss.completed ?? 0}/${ss.total ?? 0} steps`
      : (raw.currentStep ?? "") as string,
    submittedAt: (raw.createdAt ?? raw.submittedAt) as string | undefined,
    tags: (raw.tags ?? []) as string[],
    decision: (raw.decisionStatus ?? raw.decision) as string | undefined,
  };
}

function filenameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return fallback;
}

export default function ApplicationsListPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const basePath = useEventBasePath();
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canDeleteApplications = hasPermission(Permission.EVENT_APPLICATION_DELETE);
  const canManageTags = hasPermission(Permission.EVENT_APPLICATION_TAGS_MANAGE);
  const canAssignReviewers = hasPermission(Permission.EVENT_APPLICATION_LIST);
  const canDraftDecisions = hasPermission(Permission.EVENT_DECISION_DRAFT);
  const canSendMessages = hasPermission(Permission.EVENT_MESSAGES_SEND);
  const canIssueCredentials = hasPermission(Permission.EVENT_UPDATE);
  const canPublishDecisions = hasPermission(Permission.EVENT_DECISION_PUBLISH);
  const canExport = hasPermission(Permission.EVENT_APPLICATION_EXPORT);
  const canStepOverride = hasPermission(Permission.EVENT_STEP_OVERRIDE_UNLOCK);
  const canStepReview = hasPermission(Permission.EVENT_STEP_REVIEW);
  const canUseBulkStepActions = canStepOverride || canStepReview;

  const [applications, setApplications] = useState<Application[]>([]);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);
  const [decisionTemplates, setDecisionTemplates] = useState<DecisionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isIssuingCredentials, setIsIssuingCredentials] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkMessage, setShowBulkMessage] = useState(false);
  const [showBulkDecision, setShowBulkDecision] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");
  const [bulkReviewerId, setBulkReviewerId] = useState("__unassigned__");
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
  const [bulkStepAction, setBulkStepAction] = useState<"UNLOCK" | "APPROVE" | "NEEDS_REVISION" | "LOCK">("UNLOCK");
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

  const refreshApplications = useCallback(async () => {
    const res = await apiClient<
      | Application[]
      | { data: Array<Record<string, unknown>>; meta?: unknown }
    >(`/events/${eventId}/applications`);
    const raw = Array.isArray(res)
      ? (res as unknown as Array<Record<string, unknown>>)
      : Array.isArray((res as any).data)
        ? (res as any).data
        : [];
    const mapped: Application[] = raw.map(normalizeApplication);
    setApplications(mapped);
    setSelectedIds((prev) => prev.filter((id) => mapped.some((app) => app.id === id)));
  }, [eventId]);

  const refreshDecisionTemplates = useCallback(async () => {
    if (!canDraftDecisions) return;
    const templateRes = await apiClient<{ data?: DecisionTemplate[] }>(
      `/events/${eventId}/decision-templates`,
    ).catch(() => ({ data: [] }));
    setDecisionTemplates(Array.isArray(templateRes.data) ? templateRes.data : []);
  }, [canDraftDecisions, eventId]);

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
        await refreshApplications();
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
      } finally {
        setIsLoading(false);
      }
    })();
  }, [
    canAssignReviewers,
    canDraftDecisions,
    eventId,
    refreshApplications,
    refreshDecisionTemplates,
  ]);

  const filteredData = useMemo(
    () => applications.filter((a) => matchesStatusFilter(a.status, statusFilter)),
    [applications, statusFilter]
  );
  const selectedCount = selectedIds.length;
  const selectedApplicationIds = useMemo(
    () => selectedIds.filter((id) => applications.some((app) => app.id === id)),
    [applications, selectedIds],
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

  useEffect(() => {
    const allowedActions: Array<"UNLOCK" | "APPROVE" | "NEEDS_REVISION" | "LOCK"> = [];
    if (canStepOverride) {
      allowedActions.push("UNLOCK", "LOCK");
    }
    if (canStepReview) {
      allowedActions.push("APPROVE", "NEEDS_REVISION");
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

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/events/${eventId}/applications/export`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        `applications-${eventId}.csv`
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Applications CSV downloaded.");
    } catch {
      toast.error("Could not export applications.");
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
      setApplications((prev) =>
        prev.filter((application) => application.id !== deleteTarget.id)
      );
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

  async function applyBulkReviewer() {
    if (!canAssignReviewers || selectedApplicationIds.length === 0) return;
    setIsApplyingBulk(true);
    try {
      await apiClient(`/events/${eventId}/applications/bulk/assign-reviewer`, {
        method: "POST",
        body: {
          applicationIds: selectedApplicationIds,
          reviewerId: bulkReviewerId === "__unassigned__" ? null : bulkReviewerId,
        },
        csrfToken: csrfToken ?? undefined,
      });
      await refreshApplications();
      toast.success("Bulk reviewer assignment updated");
      setShowBulkAssign(false);
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

  async function handleExportSelected() {
    if (selectedApplicationIds.length === 0) return;
    setIsExporting(true);
    try {
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
          body: JSON.stringify({ applicationIds: selectedApplicationIds }),
        },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFromContentDisposition(
        res.headers.get("content-disposition"),
        `applications-selected-${eventId}.csv`,
      );
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selectedApplicationIds.length} application(s)`);
    } catch {
      toast.error("Could not export selected applications");
    } finally {
      setIsExporting(false);
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
        accessorKey: "currentStep",
        header: "Current Step",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.currentStep}
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
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description={`${applications.length} total applications`}
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
          onClick={handleExport}
          disabled={isExporting}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="waiting_applicant">Waiting for applicant</SelectItem>
            <SelectItem value="waiting_review">Waiting for review</SelectItem>
            <SelectItem value="revision_required">Revision required</SelectItem>
            <SelectItem value="all_required_steps_approved">
              All steps approved
            </SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="waitlisted">Waitlisted</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
              onClick={() => setShowBulkAssign(true)}
              disabled={!canAssignReviewers}
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Assign reviewer
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
                onClick={handleExportSelected}
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
          Showing {table.getRowModel().rows.length} of {filteredData.length}{" "}
          applications
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
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
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

      <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk assign reviewer</DialogTitle>
            <DialogDescription>
              Assign or clear reviewer for {selectedCount} selected applications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reviewer</Label>
            <Select value={bulkReviewerId} onValueChange={setBulkReviewerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {reviewers.map((reviewer) => (
                  <SelectItem key={reviewer.userId} value={reviewer.userId}>
                    {reviewer.fullName ?? reviewer.email} ({reviewer.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkAssign(false)}>
              Cancel
            </Button>
            <Button onClick={applyBulkReviewer} disabled={isApplyingBulk}>
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
                  placeholder="Decision for {{event.title}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Body template</Label>
                <Textarea
                  rows={7}
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                  placeholder="Hello {{applicant.name}}, ..."
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
                Variables: {"{{event.title}}"}, {"{{event.slug}}"}, {"{{applicant.name}}"}, {"{{applicant.email}}"}, {"{{application.id}}"}, {"{{decision.status}}"}
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
                  {canStepReview && (
                    <SelectItem value="NEEDS_REVISION">Request revision</SelectItem>
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
