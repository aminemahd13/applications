"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  PartyPopper,
  QrCode,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  StatusBadge,
  StepTimeline,
  PageHeader,
  PageSkeleton,
} from "@/components/shared";
import { apiClient } from "@/lib/api";

interface StepState {
  id: string;
  stepId: string;
  title: string;
  status: string;
  deadline?: string;
  category: string;
}

interface ApplicationDetail {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDescription?: string;
  decisionStatus: string;
  decisionPublishedAt?: string;
  completionCredential?: {
    certificateId: string;
    credentialId: string;
    certificateUrl: string;
    verifiableCredentialUrl: string;
    issuedAt: string;
    revokedAt: string | null;
    status: "ISSUED" | "REVOKED";
  };
  stepStates: StepState[];
  submissionHistory?: Array<{
    id: string;
    stepTitle: string;
    versionNumber: number;
    submittedAt: string;
  }>;
}

export default function ApplicationWorkspacePage() {
  const params = useParams();
  const applicationId = params.applicationId as string;
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  useEffect(() => {
    setIsDescriptionExpanded(false);
    (async () => {
      try {
        // First get all my applications to resolve the eventId for this application
        const listRes = await apiClient<
          | { applications: Array<Record<string, unknown>> }
          | Array<Record<string, unknown>>
        >("/applications/me");
        const apps = Array.isArray(listRes)
          ? listRes
          : (listRes as any).applications ?? (listRes as any).data ?? [];
        const match = apps.find((a: any) => a.id === applicationId);

        if (!match) {
          setIsLoading(false);
          return;
        }

        const eventId = (match as any).eventId as string;
        const eventSlug =
          typeof (match as any).eventSlug === "string"
            ? ((match as any).eventSlug as string)
            : "";

        // Fetch application details and event metadata in parallel.
        const [appRes, eventRes] = await Promise.allSettled([
          apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
            `/events/${eventId}/applications/me`
          ),
          eventSlug
            ? apiClient<Record<string, unknown> | { data: Record<string, unknown> }>(
                `/public/events/${eventSlug}`
              )
            : Promise.resolve(null),
        ]);

        const eventRaw =
          eventRes.status === "fulfilled" &&
          eventRes.value &&
          typeof eventRes.value === "object" &&
          "data" in eventRes.value &&
          (eventRes.value as any).data
            ? (eventRes.value as any).data
            : eventRes.status === "fulfilled" && eventRes.value
              ? eventRes.value
              : null;

        const eventDescriptionFromEvent =
          eventRaw && typeof (eventRaw as any).description === "string"
            ? (eventRaw as any).description
            : undefined;

        if (appRes.status !== "fulfilled") {
          setIsLoading(false);
          return;
        }

        const raw: any =
          appRes.value &&
          typeof appRes.value === "object" &&
          "data" in appRes.value &&
          (appRes.value as any).data
            ? (appRes.value as any).data
            : appRes.value;

        if (!raw) {
          setIsLoading(false);
          return;
        }

        const eventDescriptionFromApplication =
          typeof raw.eventDescription === "string"
            ? raw.eventDescription
            : raw.event &&
                typeof raw.event === "object" &&
                typeof raw.event.description === "string"
              ? raw.event.description
              : undefined;

        // Normalize API shape to frontend shape
        const detail: ApplicationDetail = {
          id: raw.id,
          eventId: raw.eventId ?? eventId,
          eventTitle:
            raw.eventTitle ?? (match as any).eventTitle ?? "Event",
          eventDescription:
            eventDescriptionFromApplication ??
            eventDescriptionFromEvent ??
            (typeof (match as any).eventDescription === "string"
              ? (match as any).eventDescription
              : undefined),
          decisionStatus: raw.decisionStatus ?? "NONE",
          decisionPublishedAt: raw.decisionPublishedAt,
          completionCredential:
            raw.completionCredential &&
            typeof raw.completionCredential === "object"
              ? {
                  certificateId: raw.completionCredential.certificateId,
                  credentialId: raw.completionCredential.credentialId,
                  certificateUrl: raw.completionCredential.certificateUrl,
                  verifiableCredentialUrl:
                    raw.completionCredential.verifiableCredentialUrl,
                  issuedAt: raw.completionCredential.issuedAt,
                  revokedAt: raw.completionCredential.revokedAt ?? null,
                  status: raw.completionCredential.status ?? "ISSUED",
                }
              : undefined,
          stepStates: (raw.stepStates ?? []).map((s: any) => ({
            id: s.stepId ?? s.id,
            stepId: s.stepId ?? s.id,
            title: s.stepTitle ?? s.title ?? "Step",
            status: s.status,
            deadline: s.deadlineAt ?? s.deadline,
            category: s.category ?? "form",
          })),
          submissionHistory: raw.submissionHistory,
        };
        setApp(detail);
      } catch {
        /* handled */
      } finally {
        setIsLoading(false);
      }
    })();
  }, [applicationId]);

  if (isLoading) return <PageSkeleton />;
  if (!app) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-bold">Application not found</h2>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const nextStep = app.stepStates.find(
    (s) =>
      s.status === "UNLOCKED" ||
      s.status === "UNLOCKED_DRAFT" ||
      s.status === "READY_TO_SUBMIT" ||
      s.status === "NEEDS_REVISION"
  );
  const completedSteps = app.stepStates.filter(
    (s) => s.status === "SUBMITTED" || s.status === "APPROVED"
  ).length;

  const allStepsComplete = completedSteps === app.stepStates.length && app.stepStates.length > 0;
  const showTicketBanner = app.decisionStatus === "ACCEPTED" && allStepsComplete;
  const completionCredential =
    app.completionCredential?.status === "ISSUED"
      ? app.completionCredential
      : undefined;
  const hasLongDescription = (app.eventDescription?.trim().length ?? 0) > 280;

  const decisionColors: Record<string, string> = {
    ACCEPTED: "border-success bg-success/5",
    WAITLISTED: "border-warning bg-warning/5",
    REJECTED: "border-destructive bg-destructive/5",
  };

  return (
    <div className="space-y-6">
      <PageHeader title={app.eventTitle} description="Application workspace" />

      {app.eventDescription && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">About this event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p
              className={`text-sm text-muted-foreground whitespace-pre-line ${
                isDescriptionExpanded || !hasLongDescription ? "" : "line-clamp-4"
              }`}
            >
              {app.eventDescription}
            </p>
            {hasLongDescription && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm"
                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
              >
                {isDescriptionExpanded ? "See less" : "See more"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Decision banner */}
      {app.decisionStatus && app.decisionStatus !== "NONE" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Alert
            className={
              decisionColors[app.decisionStatus] ?? "border-muted bg-muted/50"
            }
          >
            {app.decisionStatus === "ACCEPTED" ? (
              <PartyPopper className="h-4 w-4 text-success" />
            ) : app.decisionStatus === "WAITLISTED" ? (
              <Clock className="h-4 w-4 text-warning" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            <AlertTitle className="font-semibold">
              Decision: {app.decisionStatus.charAt(0) + app.decisionStatus.slice(1).toLowerCase()}
            </AlertTitle>
            <AlertDescription className="text-sm">
              {app.decisionStatus === "ACCEPTED" && allStepsComplete
                ? "Congratulations! You're confirmed. View your ticket below."
                : app.decisionStatus === "ACCEPTED"
                  ? "Congratulations! You've been accepted. Please complete the confirmation step."
                  : app.decisionStatus === "WAITLISTED"
                  ? "You've been waitlisted. We'll notify you if a spot opens up."
                  : "Unfortunately, your application was not accepted this time."}
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {/* Ticket banner — shown when accepted & all steps done */}
      {showTicketBanner && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card className="border-success bg-success/5">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-success/10 p-2">
                  <QrCode className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Your ticket is ready!</p>
                  <p className="text-xs text-muted-foreground">
                    View your QR code for event check-in
                  </p>
                </div>
              </div>
              <Button size="sm" asChild>
                <Link href={`/applications/${applicationId}/ticket`}>
                  <Ticket className="mr-1.5 h-3.5 w-3.5" />
                  View Ticket
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {completionCredential && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Completion credential issued</p>
                  <p className="text-xs text-muted-foreground">
                    Issued {new Date(completionCredential.issuedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={completionCredential.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Award className="mr-1.5 h-3.5 w-3.5" />
                    Certificate
                  </a>
                </Button>
                <Button size="sm" asChild>
                  <a
                    href={completionCredential.verifiableCredentialUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Verify
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Next action banner */}
      {nextStep && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {nextStep.status === "NEEDS_REVISION"
                    ? "Revision requested"
                    : "Next step"}
                  : {nextStep.title}
                </p>
                {nextStep.deadline && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    Due {new Date(nextStep.deadline).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" asChild>
              <Link
                href={`/applications/${applicationId}/steps/${nextStep.stepId}`}
              >
                {nextStep.status === "NEEDS_REVISION" ? "Revise" : "Continue"}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Step timeline */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflow Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <StepTimeline
                steps={app.stepStates.map((s) => ({
                  id: s.stepId,
                  title: s.title,
                  status: s.status,
                  deadline: s.deadline,
                }))}
                activeStepId={nextStep?.stepId}
                onStepClick={(stepId) => {
                  const step = app.stepStates.find((s) => s.stepId === stepId);
                  if (step && step.status !== "LOCKED") {
                    window.location.assign(`/applications/${applicationId}/steps/${stepId}`);
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — Submission history */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Decision</span>
                <StatusBadge status={app.decisionStatus} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Steps completed</span>
                <span className="font-medium">
                  {completedSteps}/{app.stepStates.length}
                </span>
              </div>
              {showTicketBanner && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Ticket</span>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                      <Link href={`/applications/${applicationId}/ticket`}>
                        <QrCode className="mr-1 h-3 w-3" />
                        QR ready
                      </Link>
                    </Button>
                  </div>
                </>
              )}
              {completionCredential && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Credential</span>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                      <a
                        href={completionCredential.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Award className="mr-1 h-3 w-3" />
                        Issued
                      </a>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {app.submissionHistory && app.submissionHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {app.submissionHistory.slice(0, 5).map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-xs">
                          {sub.stepTitle} (v{sub.versionNumber})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
