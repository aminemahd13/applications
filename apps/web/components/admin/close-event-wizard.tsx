"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArchiveX,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MicrositePolicy = "KEEP_PUBLIC" | "UNPUBLISH" | "DELETE";
type PurgePolicy = "NONE" | "PURGE_FILES_AND_ANSWERS";
type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

interface ArchivalJob {
  id: string;
  eventId: string;
  status: JobStatus;
  micrositePolicy: MicrositePolicy;
  purgePolicy: PurgePolicy;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  filesTotal: number;
  filesDeleted: number;
  submissionsTotal: number;
  submissionsPurged: number;
  errorMessage: string | null;
}

interface CloseEventWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: {
    id: string;
    slug: string;
    title: string;
    status: string;
    micrositeExists: boolean;
    micrositePublishedVersion: number;
  };
  onCompleted?: () => void;
}

type Step = "status" | "microsite" | "data" | "confirm" | "progress";

const STEP_ORDER: Step[] = ["status", "microsite", "data", "confirm", "progress"];

export function CloseEventWizard({
  open,
  onOpenChange,
  event,
  onCompleted,
}: CloseEventWizardProps) {
  const { csrfToken } = useAuth();
  const [step, setStep] = useState<Step>("status");
  const [archive, setArchive] = useState(true);
  const [micrositePolicy, setMicrositePolicy] = useState<MicrositePolicy>("KEEP_PUBLIC");
  const [purgePolicy, setPurgePolicy] = useState<PurgePolicy>("NONE");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<ArchivalJob | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const isAlreadyArchived = event.status === "archived";

  // Stable ref for the latest pollJob fn so the polling interval can call it
  // without re-creating the interval on every state change.
  const pollJobRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Reset wizard whenever it reopens. If a job for this event is already
  // running, jump straight to the progress view instead of restarting the
  // wizard — admins shouldn't be able to queue concurrent closes by accident.
  useEffect(() => {
    if (!open) return;
    setStep("status");
    setArchive(!isAlreadyArchived);
    setMicrositePolicy("KEEP_PUBLIC");
    setPurgePolicy("NONE");
    setConfirmSlug("");
    setJob(null);
    setPollError(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient<{ data: ArchivalJob | null }>(
          `/admin/events/${event.id}/archival-job/latest`,
        );
        if (cancelled) return;
        const latest = res.data ?? null;
        if (latest && (latest.status === "PENDING" || latest.status === "RUNNING")) {
          setJob(latest);
          setStep("progress");
        }
      } catch {
        /* ignore — fresh wizard is fine if probe fails */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isAlreadyArchived, event.id]);

  const destructive =
    micrositePolicy === "DELETE" || purgePolicy === "PURGE_FILES_AND_ANSWERS";

  const slugMatches = confirmSlug.trim() === event.slug;

  const next = () => {
    const idx = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  };
  const back = () => {
    const idx = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.max(idx - 1, 0)]);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // For destructive flows the user has typed the slug to confirm. For
      // non-destructive flows we still send the slug so the backend can
      // sanity-check the request, but the user is not asked to type it.
      const slugToSend = destructive ? confirmSlug : event.slug;
      const res = await apiClient<{ data: { job: ArchivalJob | null } }>(
        `/admin/events/${event.id}/close`,
        {
          method: "POST",
          csrfToken: csrfToken ?? undefined,
          body: {
            archive,
            micrositePolicy,
            purgePolicy,
            confirmSlug: slugToSend,
          },
        },
      );
      const created = res.data?.job ?? null;
      setJob(created);
      setStep("progress");
      toast.success("Event close in progress");
      if (!created) {
        // No purge job — flow is done synchronously.
        onCompleted?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to close event";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Poll job progress while the wizard is open and a job exists. Stored in
  // a ref so the polling interval doesn't have to be re-created on every
  // state change.
  const pollJob = useCallback(async () => {
    try {
      const res = await apiClient<{ data: ArchivalJob | null }>(
        `/admin/events/${event.id}/archival-job/latest`,
      );
      if (res.data) setJob(res.data);
      if (res.data?.status === "COMPLETED") onCompleted?.();
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Poll failed");
    }
  }, [event.id, onCompleted]);

  // Keep the ref pointing at the latest pollJob without invalidating
  // the polling interval below.
  useEffect(() => {
    pollJobRef.current = pollJob;
  }, [pollJob]);

  // Single interval, keyed only on whether we should be polling at all.
  // The poll itself reads from the ref so a state update doesn't reset the
  // 5s timer.
  const shouldPoll =
    step === "progress" &&
    !!job &&
    job.status !== "COMPLETED" &&
    job.status !== "FAILED";
  useEffect(() => {
    if (!shouldPoll) return;
    const interval = window.setInterval(() => {
      void pollJobRef.current();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [shouldPoll]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close event: {event.title}</DialogTitle>
          <DialogDescription>
            Walk through three decisions: event status, microsite, and applicant
            data. Certificates remain QR-verifiable in every case.
          </DialogDescription>
        </DialogHeader>

        {step === "status" && (
          <div className="space-y-4">
            {isAlreadyArchived && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                This event is already archived. You can still update the
                microsite policy or purge applicant data below.
              </div>
            )}
            <RadioGroup
              value={archive ? "archive" : "keep"}
              onValueChange={(v) => setArchive(v === "archive")}
            >
              <ChoiceCard
                value="archive"
                title="Archive event"
                description="Event is hidden from the public /events listing. Applicants can no longer start new applications. Existing data is unaffected unless you choose to purge it later."
                icon={<ArchiveX className="h-4 w-4" />}
              />
              <ChoiceCard
                value="keep"
                title="Keep open"
                description="Don't change the status. Useful if you only want to manage the microsite or purge data."
                icon={<Eye className="h-4 w-4" />}
              />
            </RadioGroup>
          </div>
        )}

        {step === "microsite" && (
          <div className="space-y-4">
            {!event.micrositeExists ? (
              <div className="text-sm text-muted-foreground">
                This event has no microsite. Skipping this step.
              </div>
            ) : (
              <RadioGroup
                value={micrositePolicy}
                onValueChange={(v) => setMicrositePolicy(v as MicrositePolicy)}
              >
                <ChoiceCard
                  value="KEEP_PUBLIC"
                  title="Keep public"
                  description="The microsite stays live at its current published version. Visitors can still see the past edition."
                  icon={<Eye className="h-4 w-4" />}
                />
                <ChoiceCard
                  value="UNPUBLISH"
                  title="Unpublish"
                  description="The microsite is hidden from the public. Pages and content are preserved; you can re-publish later."
                  icon={<EyeOff className="h-4 w-4" />}
                />
                <ChoiceCard
                  value="DELETE"
                  title="Delete permanently"
                  description="Removes the microsite, all its pages, and version history. Cannot be undone."
                  icon={<Trash2 className="h-4 w-4 text-destructive" />}
                  destructive
                />
              </RadioGroup>
            )}
          </div>
        )}

        {step === "data" && (
          <div className="space-y-4">
            <RadioGroup
              value={purgePolicy}
              onValueChange={(v) => setPurgePolicy(v as PurgePolicy)}
            >
              <ChoiceCard
                value="NONE"
                title="Keep all data"
                description="No changes. Applicant files, draft answers, and submission history stay in the database."
                icon={<Eye className="h-4 w-4" />}
              />
              <ChoiceCard
                value="PURGE_FILES_AND_ANSWERS"
                title="Purge files + raw answers"
                description="Deletes uploaded files and form-answer JSON. Keeps application rows, decision status, and certificates — so the People page still shows who applied and the outcome."
                icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                destructive
              />
            </RadioGroup>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <SummaryRow
                label="Event status"
                value={archive ? "Archive" : "No change"}
              />
              <SummaryRow
                label="Microsite"
                value={
                  !event.micrositeExists
                    ? "No microsite"
                    : micrositePolicy === "KEEP_PUBLIC"
                      ? "Keep public"
                      : micrositePolicy === "UNPUBLISH"
                        ? "Unpublish"
                        : "Delete permanently"
                }
                emphasis={micrositePolicy === "DELETE"}
              />
              <SummaryRow
                label="Applicant data"
                value={
                  purgePolicy === "NONE"
                    ? "Keep all"
                    : "Purge files + raw answers"
                }
                emphasis={purgePolicy !== "NONE"}
              />
            </div>

            {destructive && (
              <div className="space-y-2">
                <Label className="text-sm">
                  Type the event slug to confirm
                </Label>
                <Input
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                  placeholder={event.slug}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Expected:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {event.slug}
                  </code>
                </p>
              </div>
            )}
          </div>
        )}

        {step === "progress" && (
          <div className="space-y-4">
            <ProgressRow
              label="Status"
              done={archive || isAlreadyArchived}
              text={
                archive || isAlreadyArchived
                  ? "Event archived"
                  : "Status unchanged"
              }
            />
            {event.micrositeExists && (
              <ProgressRow
                label="Microsite"
                done
                text={
                  micrositePolicy === "KEEP_PUBLIC"
                    ? "Kept public"
                    : micrositePolicy === "UNPUBLISH"
                      ? "Unpublished"
                      : "Deleted"
                }
              />
            )}
            {job ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Data purge</span>
                  <Badge variant="secondary">{job.status}</Badge>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                    <span>Files</span>
                    <span>
                      {job.filesDeleted} / {job.filesTotal || "—"}
                    </span>
                  </div>
                  <Progress
                    value={
                      job.filesTotal > 0
                        ? Math.round((job.filesDeleted / job.filesTotal) * 100)
                        : job.status === "COMPLETED"
                          ? 100
                          : 0
                    }
                    className="h-2"
                  />
                </div>
                {job.submissionsTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>Submissions</span>
                      <span>
                        {job.submissionsPurged} / {job.submissionsTotal}
                      </span>
                    </div>
                    <Progress
                      value={Math.round(
                        (job.submissionsPurged / job.submissionsTotal) * 100,
                      )}
                      className="h-2"
                    />
                  </div>
                )}
                {job.status === "FAILED" && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    {job.errorMessage || "Job failed."}
                  </div>
                )}
                {pollError && (
                  <div className="text-xs text-muted-foreground">
                    Could not refresh progress: {pollError}
                  </div>
                )}
              </div>
            ) : (
              <ProgressRow label="Applicant data" done text="No purge requested" />
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              Certificates issued for this event remain QR-verifiable regardless
              of what you chose.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2">
          {step !== "progress" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {step !== "status" && (
                  <Button variant="outline" onClick={back} disabled={submitting}>
                    Back
                  </Button>
                )}
                {step !== "confirm" ? (
                  <Button onClick={next}>Next</Button>
                ) : (
                  <Button
                    onClick={submit}
                    disabled={submitting || (destructive && !slugMatches)}
                    variant={destructive ? "destructive" : "default"}
                  >
                    {submitting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {destructive ? "Apply (irreversible)" : "Apply"}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Button
              onClick={() => onOpenChange(false)}
              variant={job?.status === "COMPLETED" || !job ? "default" : "outline"}
            >
              {job?.status === "COMPLETED" && (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {job && job.status !== "COMPLETED" && job.status !== "FAILED"
                ? "Run in background"
                : "Done"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  value,
  title,
  description,
  icon,
  destructive,
}: {
  value: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40",
        destructive && "border-destructive/40",
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <div className="grid gap-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </label>
  );
}

function SummaryRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", emphasis && "text-destructive")}>
        {value}
      </span>
    </div>
  );
}

function ProgressRow({
  label,
  done,
  text,
}: {
  label: string;
  done: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {done && <CheckCircle2 className="h-4 w-4 text-success" />}
        {text}
      </span>
    </div>
  );
}
