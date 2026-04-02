"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, RefreshCw, Shuffle } from "lucide-react";
import { Permission } from "@event-platform/shared";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ApiError, apiClient } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { normalizeReviewQueueResponse } from "@/lib/review-queue-pagination";
import {
  buildReviewerAssignmentPreviewPayload,
  isPreviewStaleApiError,
} from "@/lib/reviewer-assignment";
import { toast } from "sonner";

type AssignmentMode =
  | "equal_distribution"
  | "fixed_per_reviewer"
  | "hybrid_manual_then_random"
  | "pure_random";
type RunPolicy = "reassign_all" | "unassigned_only";

interface ContextPayload {
  steps: Array<{ stepId: string; stepTitle: string; stepIndex: number }>;
  reviewers: Array<{
    userId: string;
    email: string;
    fullName: string | null;
    workload: { assigned: number; pending: number; overdue: number; completed: number };
  }>;
  sharedQueueCount: number;
  defaults: { defaultTtlMinutes: number; previewTtlSeconds: number };
}

interface PreviewPayload {
  previewId: string;
  mode: AssignmentMode;
  runPolicy: RunPolicy;
  totalCandidates: number;
  operationCount: number;
  sharedQueueAfter: number;
  reviewerImpact: Array<{
    reviewerId: string;
    beforeAssigned: number;
    afterAssigned: number;
    deltaAssigned: number;
  }>;
}

interface QueueItem {
  id?: string;
  queueItemId?: string;
  applicantName: string | null;
  applicantEmail: string;
  stepTitle: string;
  queueMode?: "direct" | "shared";
  assignedReviewerId: string | null;
  isOverdue?: boolean;
}

function reviewerLabel(reviewer: ContextPayload["reviewers"][number]): string {
  return `${reviewer.fullName ?? reviewer.email} (${reviewer.email})`;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}`;
}

export default function ReviewerAssignmentPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManage = hasPermission(Permission.EVENT_UPDATE);

  const [context, setContext] = useState<ContextPayload | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isReleasingExpired, setIsReleasingExpired] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);

  const [mode, setMode] = useState<AssignmentMode>("equal_distribution");
  const [runPolicy, setRunPolicy] = useState<RunPolicy>("reassign_all");
  const [ttlMinutes, setTtlMinutes] = useState("120");
  const [fixedPerReviewer, setFixedPerReviewer] = useState("1");
  const [reviewerPoolUserIds, setReviewerPoolUserIds] = useState<string[]>([]);
  const [includeStepIds, setIncludeStepIds] = useState<string[]>([]);
  const [excludeStepIds, setExcludeStepIds] = useState<string[]>([]);
  const [hybridCounts, setHybridCounts] = useState<Record<string, string>>({});
  const [overrideReviewerByItemId, setOverrideReviewerByItemId] = useState<Record<string, string>>({});

  const previewImpactByReviewerId = useMemo(() => {
    const map = new Map<string, PreviewPayload["reviewerImpact"][number]>();
    for (const impact of preview?.reviewerImpact ?? []) map.set(impact.reviewerId, impact);
    return map;
  }, [preview]);

  const loadContext = useCallback(async () => {
    const res = await apiClient<{ data?: ContextPayload }>(
      `/events/${eventId}/reviewer-assignment/context`,
    );
    const data = res?.data;
    if (!data) return;
    setContext(data);
    setReviewerPoolUserIds((current) => {
      if (current.length > 0) return current.filter((id) => data.reviewers.some((r) => r.userId === id));
      return data.reviewers.map((reviewer) => reviewer.userId);
    });
    setIncludeStepIds((current) => {
      if (current.length > 0) return current.filter((id) => data.steps.some((s) => s.stepId === id));
      return data.steps.map((step) => step.stepId);
    });
    setExcludeStepIds((current) => current.filter((id) => data.steps.some((s) => s.stepId === id)));
    setTtlMinutes((current) => (Number(current) > 0 ? current : String(data.defaults.defaultTtlMinutes)));
  }, [eventId]);

  const loadQueueItems = useCallback(async () => {
    const res = await apiClient(`/events/${eventId}/review-queue?assignedTo=any&limit=50`);
    setQueueItems(normalizeReviewQueueResponse<QueueItem>(res).items);
  }, [eventId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadContext(), loadQueueItems()]);
  }, [loadContext, loadQueueItems]);

  useEffect(() => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        await loadAll();
      } catch {
        /* handled by apiClient */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [canManage, loadAll]);

  async function refreshAll() {
    setIsRefreshing(true);
    try {
      await loadAll();
      toast.success("Reviewer assignment data refreshed.");
    } catch {
      /* handled by apiClient */
    } finally {
      setIsRefreshing(false);
    }
  }

  async function runPreview() {
    if (!context) return;
    setIsPreviewing(true);
    try {
      const payload = buildReviewerAssignmentPreviewPayload({
        mode,
        reviewerPoolUserIds,
        includeStepIds,
        excludeStepIds,
        runPolicy,
        ttlMinutes: Number(ttlMinutes),
        fixedReviewsPerReviewer: Number(fixedPerReviewer),
        hybridCountsByReviewerId: Object.fromEntries(
          Object.entries(hybridCounts).map(([reviewerId, value]) => [
            reviewerId,
            Number(value),
          ]),
        ),
      });
      const res = await apiClient<{ data?: PreviewPayload }>(
        `/events/${eventId}/reviewer-assignment/preview`,
        { method: "POST", csrfToken: csrfToken ?? undefined, body: payload },
      );
      if (res?.data) {
        setPreview(res.data);
        toast.success("Preview generated.");
      }
    } catch (error) {
      if (error instanceof Error && !(error instanceof ApiError)) {
        toast.error(error.message);
      }
    } finally {
      setIsPreviewing(false);
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setIsApplying(true);
    try {
      const res = await apiClient<{ data?: { updatedItems: number } }>(
        `/events/${eventId}/reviewer-assignment/apply`,
        {
          method: "POST",
          csrfToken: csrfToken ?? undefined,
          body: { previewId: preview.previewId, idempotencyKey: createIdempotencyKey() },
        },
      );
      toast.success(`Applied preview. Updated ${res?.data?.updatedItems ?? 0} item(s).`);
      setShowApplyDialog(false);
      setPreview(null);
      await loadAll();
    } catch (error) {
      if (error instanceof ApiError && isPreviewStaleApiError(error)) {
        toast.error("Preview is stale. Refresh and generate a new preview.");
      }
    } finally {
      setIsApplying(false);
    }
  }

  async function releaseExpiredNow() {
    setIsReleasingExpired(true);
    try {
      await apiClient(`/events/${eventId}/reviewer-assignment/release-expired`, {
        method: "POST",
        csrfToken: csrfToken ?? undefined,
      });
      toast.success("Expired direct assignments released.");
      await loadAll();
    } catch {
      /* handled by apiClient */
    } finally {
      setIsReleasingExpired(false);
    }
  }

  async function overrideQueueItem(item: QueueItem, releaseShared: boolean) {
    const queueItemId = item.queueItemId ?? item.id;
    if (!queueItemId) return;
    const reviewerId = overrideReviewerByItemId[queueItemId] ?? item.assignedReviewerId ?? "";
    if (!releaseShared && !reviewerId) {
      toast.error("Select a reviewer first.");
      return;
    }
    await apiClient(`/events/${eventId}/reviewer-assignment/items/${queueItemId}`, {
      method: "PATCH",
      csrfToken: csrfToken ?? undefined,
      body: releaseShared
        ? { action: "release_shared" }
        : {
            action: item.queueMode === "direct" ? "reassign_direct" : "assign_direct",
            reviewerId,
            ttlMinutes: Math.max(1, Math.round(Number(ttlMinutes) || 1)),
          },
    });
    toast.success("Queue item updated.");
    setPreview(null);
    await loadAll();
  }

  if (!canManage) {
    return <Card><CardContent className="pt-6">Organizer/admin access is required.</CardContent></Card>;
  }
  if (isLoading || !context) {
    return <Card><CardContent className="pt-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reviewer Assignment"
        description="Deterministic step-level assignment with preview/apply and manual overrides."
        actions={[{ label: isRefreshing ? "Refreshing..." : "Refresh", icon: RefreshCw, onClick: refreshAll, variant: "outline" }]}
      />

      <Card>
        <CardHeader><CardTitle>Workload Visibility</CardTitle><CardDescription>Shared queue: {context.sharedQueueCount}</CardDescription></CardHeader>
        <CardContent className="grid gap-2">
          {context.reviewers.map((reviewer) => (
            <div key={reviewer.userId} className="rounded border p-2 text-sm flex flex-wrap items-center gap-2">
              <span className="font-medium">{reviewerLabel(reviewer)}</span>
              <Badge variant="secondary">Assigned {reviewer.workload.assigned}</Badge>
              <Badge variant="secondary">Pending {reviewer.workload.pending}</Badge>
              <Badge variant={reviewer.workload.overdue > 0 ? "destructive" : "outline"}>Overdue {reviewer.workload.overdue}</Badge>
              <Badge variant="outline">Completed {reviewer.workload.completed}</Badge>
              {previewImpactByReviewerId.has(reviewer.userId) ? (
                <Badge variant="outline">Delta {previewImpactByReviewerId.get(reviewer.userId)?.deltaAssigned ?? 0}</Badge>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Scope</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label>Reviewer Pool</Label>
            {context.reviewers.map((reviewer) => (
              <label key={reviewer.userId} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={reviewerPoolUserIds.includes(reviewer.userId)}
                  onCheckedChange={(checked) =>
                    setReviewerPoolUserIds((current) =>
                      Boolean(checked)
                        ? Array.from(new Set([...current, reviewer.userId]))
                        : current.filter((id) => id !== reviewer.userId),
                    )
                  }
                />
                <span>{reviewerLabel(reviewer)}</span>
              </label>
            ))}
            <Label>Step Inclusion / Exclusion</Label>
            {context.steps.map((step) => {
              const included = includeStepIds.includes(step.stepId);
              return (
                <div key={step.stepId} className="rounded border p-2 text-sm flex items-center justify-between gap-2">
                  <span>{step.stepIndex}. {step.stepTitle}</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1"><Checkbox checked={included} onCheckedChange={(checked) => setIncludeStepIds((current) => Boolean(checked) ? Array.from(new Set([...current, step.stepId])) : current.filter((id) => id !== step.stepId))} />Include</label>
                    <label className="flex items-center gap-1"><Checkbox checked={excludeStepIds.includes(step.stepId)} disabled={!included} onCheckedChange={(checked) => setExcludeStepIds((current) => Boolean(checked) ? Array.from(new Set([...current, step.stepId])) : current.filter((id) => id !== step.stepId))} />Exclude</label>
                  </div>
                </div>
              );
            })}
            <Label>Run Policy</Label>
            <Select value={runPolicy} onValueChange={(value) => setRunPolicy(value as RunPolicy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="reassign_all">Reassign all</SelectItem><SelectItem value="unassigned_only">Unassigned only</SelectItem></SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mode & Reliability</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as AssignmentMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equal_distribution">Equal distribution</SelectItem>
                <SelectItem value="fixed_per_reviewer">Fixed per reviewer</SelectItem>
                <SelectItem value="hybrid_manual_then_random">Hybrid manual then random</SelectItem>
                <SelectItem value="pure_random">Pure random</SelectItem>
              </SelectContent>
            </Select>
            {mode === "fixed_per_reviewer" ? <><Label>Fixed reviews per reviewer</Label><Input type="number" min={0} value={fixedPerReviewer} onChange={(e) => setFixedPerReviewer(e.target.value)} /></> : null}
            {mode === "hybrid_manual_then_random" ? (
              <div className="space-y-2">
                <Label>Manual targets</Label>
                {reviewerPoolUserIds.map((reviewerId) => (
                  <div key={reviewerId} className="flex items-center justify-between gap-2 text-sm">
                    <span>{context.reviewers.find((r) => r.userId === reviewerId)?.fullName ?? reviewerId}</span>
                    <Input className="w-24" type="number" min={0} value={hybridCounts[reviewerId] ?? "0"} onChange={(e) => setHybridCounts((current) => ({ ...current, [reviewerId]: e.target.value }))} />
                  </div>
                ))}
              </div>
            ) : null}
            <Label>TTL minutes</Label>
            <Input type="number" min={1} value={ttlMinutes} onChange={(e) => setTtlMinutes(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={runPreview} disabled={isPreviewing}>{isPreviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Previewing...</> : <><Shuffle className="mr-2 h-4 w-4" />Preview</>}</Button>
              <Button variant="outline" onClick={releaseExpiredNow} disabled={isReleasingExpired}>{isReleasingExpired ? "Releasing..." : "Release expired now"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Preview Impact</CardTitle><CardDescription>Inspect changes before apply.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {!preview ? <p className="text-sm text-muted-foreground">Generate a preview first.</p> : <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Candidates {preview.totalCandidates}</Badge>
              <Badge variant="secondary">Updates {preview.operationCount}</Badge>
              <Badge variant="secondary">Shared after {preview.sharedQueueAfter}</Badge>
              <Badge variant="outline">{preview.previewId}</Badge>
            </div>
            <Button onClick={() => setShowApplyDialog(true)} disabled={preview.operationCount === 0}>Apply preview</Button>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Manual Overrides</CardTitle><CardDescription>Assign/reassign direct ownership or release to shared queue.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {queueItems.map((item) => {
            const queueItemId = item.queueItemId ?? item.id ?? "";
            const reviewerId = overrideReviewerByItemId[queueItemId] ?? item.assignedReviewerId ?? "";
            return (
              <div key={queueItemId} className="rounded border p-2 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.applicantName ?? item.applicantEmail}</span>
                  <Badge variant="outline">{item.stepTitle}</Badge>
                  <Badge variant={item.queueMode === "direct" ? "secondary" : "outline"}>{item.queueMode === "direct" ? "Direct" : "Shared"}</Badge>
                  {item.isOverdue ? <Badge variant="destructive">Overdue</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={reviewerId} onValueChange={(value) => setOverrideReviewerByItemId((current) => ({ ...current, [queueItemId]: value }))}>
                    <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                    <SelectContent>{context.reviewers.map((reviewer) => <SelectItem key={reviewer.userId} value={reviewer.userId}>{reviewerLabel(reviewer)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => overrideQueueItem(item, false)}>{item.queueMode === "direct" ? "Reassign direct" : "Assign direct"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => overrideQueueItem(item, true)}>Release shared</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm assignment apply</DialogTitle><DialogDescription>Apply exactly the current preview snapshot.</DialogDescription></DialogHeader>
          <div className="text-sm space-y-1">
            <div>Preview ID: {preview?.previewId}</div>
            <div>Mode: {preview?.mode}</div>
            <div>Run policy: {preview?.runPolicy}</div>
            <div>Items to update: {preview?.operationCount ?? 0}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
            <Button onClick={applyPreview} disabled={isApplying}>{isApplying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying...</> : "Confirm apply"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
