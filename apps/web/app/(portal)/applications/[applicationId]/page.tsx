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
  FileText,
  PartyPopper,
  QrCode,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";

interface StepState {
  id: string;
  stepId: string;
  title: string;
  status: string;
  deadline?: string;
  category: string;
}

interface ApplicationCertificate {
  id: string;
  certificateTypeLabel: string;
  certificateUrl: string;
  verifiableCredentialUrl: string;
  issuedAt: string;
  revokedAt: string | null;
  status: "ISSUED" | "REVOKED";
  renderStatus: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  pdfUrl: string | null;
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
  certificates?: ApplicationCertificate[];
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
          certificates: Array.isArray(raw.certificates)
            ? raw.certificates
                .filter((certificate: unknown) => Boolean(certificate) && typeof certificate === "object")
                .map((certificate: any) => ({
                  id: String(certificate.id ?? ""),
                  certificateTypeLabel: String(certificate.certificateTypeLabel ?? "Certificate"),
                  certificateUrl: String(certificate.certificateUrl ?? ""),
                  verifiableCredentialUrl: String(certificate.verifiableCredentialUrl ?? ""),
                  issuedAt: String(certificate.issuedAt ?? ""),
                  revokedAt: certificate.revokedAt ?? null,
                  status: certificate.status === "REVOKED" ? "REVOKED" : "ISSUED",
                  renderStatus:
                    certificate.renderStatus === "DONE" ||
                    certificate.renderStatus === "FAILED" ||
                    certificate.renderStatus === "PROCESSING"
                      ? certificate.renderStatus
                      : "PENDING",
                  pdfUrl:
                    typeof certificate.pdfUrl === "string" && certificate.pdfUrl.length > 0
                      ? certificate.pdfUrl
                      : null,
                }))
                .filter((certificate: ApplicationCertificate) =>
                  certificate.certificateUrl.length > 0 &&
                  certificate.verifiableCredentialUrl.length > 0,
                )
            : [],
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

  const confirmationSteps = app.stepStates.filter(
    (s) => s.category === "CONFIRMATION"
  );
  const allConfirmationStepsApproved =
    confirmationSteps.length > 0 &&
    confirmationSteps.every((s) => s.status === "APPROVED");
  const showTicketBanner =
    app.decisionStatus === "ACCEPTED" && allConfirmationStepsApproved;
  const completionCredentialFallback =
    app.completionCredential?.status === "ISSUED"
      ? app.completionCredential
      : undefined;
  const issuedCertificates =
    (app.certificates ?? []).filter(
      (certificate) => certificate.status === "ISSUED",
    ) ?? [];
  const visibleCertificates =
    issuedCertificates.length > 0
      ? issuedCertificates.map((certificate) => ({
          id: certificate.id,
          label: certificate.certificateTypeLabel,
          certificateUrl: certificate.certificateUrl,
          verificationUrl: certificate.verifiableCredentialUrl,
          issuedAt: certificate.issuedAt,
          renderStatus: certificate.renderStatus,
          pdfUrl: certificate.pdfUrl,
        }))
      : completionCredentialFallback
        ? [
            {
              id: completionCredentialFallback.certificateId,
              label: "Completion credential",
              certificateUrl: completionCredentialFallback.certificateUrl,
              verificationUrl: completionCredentialFallback.verifiableCredentialUrl,
              issuedAt: completionCredentialFallback.issuedAt,
              renderStatus: "DONE" as const,
              pdfUrl: null,
            },
          ]
        : [];
  const primaryCertificate = visibleCertificates[0];
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
              {app.decisionStatus === "ACCEPTED" && showTicketBanner
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

      {/* Ticket banner â€” shown when accepted & all steps done */}
      {showTicketBanner && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card className="border-success bg-success/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-full bg-success/10 p-2">
                  <QrCode className="h-5 w-5 text-success" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-snug break-words [overflow-wrap:anywhere]">
                    Your ticket is ready!
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug break-words [overflow-wrap:anywhere]">
                    View your QR code for event check-in
                  </p>
                </div>
              </div>
              <Button size="sm" className="w-full sm:w-auto" asChild>
                <Link href={`/applications/${applicationId}/ticket`}>
                  <Ticket className="mr-1.5 h-3.5 w-3.5" />
                  View Ticket
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {visibleCertificates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {visibleCertificates.length === 1
                      ? "Certificate issued"
                      : `${visibleCertificates.length} certificates issued`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Latest issue{" "}
                    {new Date(visibleCertificates[0].issuedAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {visibleCertificates.slice(0, 4).map((certificate) => (
                  <div
                    key={certificate.id}
                    className="rounded-md border bg-background/70 p-2"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{certificate.label}</p>
                      <Badge variant="outline">{certificate.renderStatus}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Issued {new Date(certificate.issuedAt).toLocaleDateString("en-GB")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(() => {
                        const certificateHref =
                          sanitizeClientFacingUrl(certificate.certificateUrl) ??
                          certificate.certificateUrl;
                        const verifyHref =
                          sanitizeClientFacingUrl(certificate.verificationUrl) ??
                          certificate.verificationUrl;
                        const pdfHref = sanitizeClientFacingUrl(certificate.pdfUrl);

                        return (
                          <>
                      <Button size="sm" variant="outline" asChild>
                        <a href={certificateHref} target="_blank" rel="noreferrer">
                          <Award className="mr-1.5 h-3.5 w-3.5" />
                          Certificate
                        </a>
                      </Button>
                      <Button size="sm" asChild>
                        <a href={verifyHref} target="_blank" rel="noreferrer">
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          Verify
                        </a>
                      </Button>
                      {pdfHref && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={pdfHref} target="_blank" rel="noreferrer">
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            PDF
                          </a>
                        </Button>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {visibleCertificates.length > 4 && (
                  <p className="text-xs text-muted-foreground">
                    +{visibleCertificates.length - 4} more certificate(s) are available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Next action banner */}
      {nextStep && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm leading-snug break-words [overflow-wrap:anywhere]">
                  {nextStep.status === "NEEDS_REVISION"
                    ? "Revision requested"
                    : "Next step"}
                  : {nextStep.title}
                </p>
                {nextStep.deadline && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    Due {new Date(nextStep.deadline).toLocaleDateString("en-GB")}
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" className="w-full sm:w-auto" asChild>
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

        {/* Sidebar â€” Submission history */}
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
              {primaryCertificate && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Credential</span>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                      <a
                        href={
                          sanitizeClientFacingUrl(primaryCertificate.certificateUrl) ??
                          primaryCertificate.certificateUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Award className="mr-1 h-3 w-3" />
                        {visibleCertificates.length > 1 ? `${visibleCertificates.length} issued` : "Issued"}
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
                          {new Date(sub.submittedAt).toLocaleDateString("en-GB")}
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
