"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth, usePermissions } from "@/lib/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createCertificatePdfExportJob,
  getCertificatePdfExportJobDownloadUrl,
  issueCertificatesByTags,
  issueCertificatesBulk,
  listCertificateIssuanceTags,
  listCertificateRenderJobs,
  listCertificateTemplateVersions,
  listCertificateTemplates,
  listIssuedCertificates,
  pollCertificatePdfExportJobUntilTerminal,
  releaseIssuedCertificate,
  retryCertificateRenderJob,
  revokeIssuedCertificate,
  searchCertificateIssuanceCandidates,
  type CertificateIssuanceCandidate,
  type CertificateRenderJobSummary,
  type CertificateTemplateSummary,
  type CertificateTemplateVersion,
  type IssuedCertificateSummary,
} from "@/lib/certificates";
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";
import { cn } from "@/lib/utils";
import { formatDateTime, parseApplicationIdsInput } from "../studio/utils";

interface CertificateOperationsWorkspaceProps {
  eventId: string;
}

export function CertificateOperationsWorkspace(props: CertificateOperationsWorkspaceProps) {
  const { eventId } = props;
  const { csrfToken } = useAuth();
  const { hasPermission } = usePermissions(eventId);
  const canManage = hasPermission("event.update");

  const [activeTab, setActiveTab] = useState<"issue" | "issued" | "jobs">("issue");
  const [templates, setTemplates] = useState<CertificateTemplateSummary[]>([]);
  const [versions, setVersions] = useState<CertificateTemplateVersion[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [issuanceIssuerName, setIssuanceIssuerName] = useState("");
  const [issuanceReissueIfExists, setIssuanceReissueIfExists] = useState(false);
  const [issuanceDownloadAfterIssue, setIssuanceDownloadAfterIssue] = useState(false);
  const [issuanceSearchInput, setIssuanceSearchInput] = useState("");
  const [issuanceCandidates, setIssuanceCandidates] = useState<CertificateIssuanceCandidate[]>([]);
  const [issuanceSearchAttempted, setIssuanceSearchAttempted] = useState(false);
  const [issuanceTagSearchInput, setIssuanceTagSearchInput] = useState("");
  const [issuanceTags, setIssuanceTags] = useState<string[]>([]);
  const [issuanceSelectedTags, setIssuanceSelectedTags] = useState<string[]>([]);
  const [issuanceApplicationIds, setIssuanceApplicationIds] = useState("");

  const [issuedHistorySearchInput, setIssuedHistorySearchInput] = useState("");
  const [issuedCertificates, setIssuedCertificates] = useState<IssuedCertificateSummary[]>([]);
  const [renderJobs, setRenderJobs] = useState<CertificateRenderJobSummary[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearchingIssuanceCandidates, setIsSearchingIssuanceCandidates] = useState(false);
  const [isLoadingIssuanceTags, setIsLoadingIssuanceTags] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isDownloadingIssuanceZip, setIsDownloadingIssuanceZip] = useState(false);
  const [isRevokingIssuedCertificate, setIsRevokingIssuedCertificate] = useState(false);
  const [releasingIssuedCertificateId, setReleasingIssuedCertificateId] = useState<string | null>(null);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeReasonDraft, setRevokeReasonDraft] = useState("");
  const [revokeTargetCertificate, setRevokeTargetCertificate] = useState<IssuedCertificateSummary | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const issuedById = useMemo(() => {
    return new Map(issuedCertificates.map((item) => [item.id, item]));
  }, [issuedCertificates]);

  const refreshTemplateOptions = useCallback(async () => {
    const templateRows = await listCertificateTemplates(eventId);
    setTemplates(templateRows);

    let nextSelectedTemplateId: string | null = null;
    setSelectedTemplateId((current) => {
      const preferred =
        templateRows.find((template) => template.isDefault && template.isActive) ?? templateRows[0] ?? null;
      nextSelectedTemplateId =
        current && templateRows.some((template) => template.id === current)
          ? current
          : preferred?.id ?? null;
      return nextSelectedTemplateId;
    });

    return { templateRows, nextSelectedTemplateId };
  }, [eventId]);

  const refreshOperationsData = useCallback(async () => {
    const search = issuedHistorySearchInput.trim();
    const [issuedRows, jobRows] = await Promise.all([
      listIssuedCertificates(eventId, {
        limit: 100,
        search: search || undefined,
      }),
      listCertificateRenderJobs(eventId, { limit: 100 }),
    ]);

    setIssuedCertificates(issuedRows);
    setRenderJobs(jobRows);
  }, [eventId, issuedHistorySearchInput]);

  const refreshIssuanceTags = useCallback(() => {
    setIsLoadingIssuanceTags(true);
    listCertificateIssuanceTags(eventId, {
      search: issuanceTagSearchInput.trim() || undefined,
      limit: 80,
    })
      .then((tags) => setIssuanceTags(tags))
      .catch(() => {
        setIssuanceTags([]);
        toast.error("Failed to load tags.");
      })
      .finally(() => setIsLoadingIssuanceTags(false));
  }, [eventId, issuanceTagSearchInput]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;

    Promise.all([refreshTemplateOptions(), refreshOperationsData()])
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load certificate operations.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, refreshOperationsData, refreshTemplateOptions]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setVersions([]);
      setSelectedVersionId(null);
      return;
    }

    let cancelled = false;

    listCertificateTemplateVersions(eventId, selectedTemplateId)
      .then((versionRows) => {
        if (cancelled) return;
        setVersions(versionRows);
        const preferredVersion =
          versionRows.find((version) => version.id === selectedTemplate?.activeVersionId) ?? versionRows[0] ?? null;
        setSelectedVersionId(preferredVersion?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load template versions.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, selectedTemplate?.activeVersionId, selectedTemplateId]);

  useEffect(() => {
    if (issuanceSearchInput.trim()) return;
    setIssuanceCandidates([]);
    setIssuanceSearchAttempted(false);
  }, [issuanceSearchInput]);

  useEffect(() => {
    if (!canManage || activeTab !== "issue") return;
    const timer = setTimeout(() => {
      refreshIssuanceTags();
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab, canManage, refreshIssuanceTags]);

  useEffect(() => {
    if (!canManage) return;
    const timer = setTimeout(() => {
      refreshOperationsData().catch(() => {
        toast.error("Failed to refresh certificate activity.");
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [canManage, issuedHistorySearchInput, refreshOperationsData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([refreshTemplateOptions(), refreshOperationsData()])
      .then(() => {
        if (activeTab === "issue") {
          refreshIssuanceTags();
        }
      })
      .catch(() => toast.error("Failed to refresh certificate data."))
      .finally(() => setIsRefreshing(false));
  }, [activeTab, refreshIssuanceTags, refreshOperationsData, refreshTemplateOptions]);

  const handleSearchIssuanceCandidates = useCallback(() => {
    const search = issuanceSearchInput.trim();
    if (!search) {
      setIssuanceCandidates([]);
      setIssuanceSearchAttempted(false);
      return;
    }

    setIsSearchingIssuanceCandidates(true);
    setIssuanceSearchAttempted(true);
    searchCertificateIssuanceCandidates(eventId, { search, limit: 20 })
      .then((rows) => setIssuanceCandidates(rows))
      .catch(() => {
        setIssuanceCandidates([]);
        toast.error("Failed to search applications.");
      })
      .finally(() => setIsSearchingIssuanceCandidates(false));
  }, [eventId, issuanceSearchInput]);

  const downloadIssuanceZipByIssuedIds = useCallback(
    async (issuedCertificateIds: string[]) => {
      const ids = Array.from(
        new Set(
          issuedCertificateIds.filter(
            (issuedCertificateId) =>
              typeof issuedCertificateId === "string" &&
              issuedCertificateId.length > 0,
          ),
        ),
      );
      if (ids.length === 0) return;

      setIsDownloadingIssuanceZip(true);
      try {
        const queuedJob = await createCertificatePdfExportJob(
          eventId,
          { issuedCertificateIds: ids },
          csrfToken ?? undefined,
        );
        const terminalJob = await pollCertificatePdfExportJobUntilTerminal({
          eventId,
          jobId: queuedJob.id,
          intervalMs: 2000,
          timeoutMs: 15 * 60 * 1000,
        });
        if (String(terminalJob.status ?? "").toUpperCase() === "FAILED") {
          throw new Error(terminalJob.errorMessage || "Certificate PDF export failed.");
        }
        const download = await getCertificatePdfExportJobDownloadUrl(eventId, queuedJob.id);
        const anchor = document.createElement("a");
        anchor.href = download.url;
        anchor.download = download.filename || `${eventId}-certificates.zip`;
        anchor.click();
        toast.success("Certificates ZIP downloaded.");
      } catch (error) {
        if (error instanceof ApiError && error.message.trim().length > 0) {
          toast.error(error.message);
        } else if (error instanceof Error && error.message.trim().length > 0) {
          toast.error(error.message);
        } else {
          toast.error("Could not download certificates ZIP.");
        }
      } finally {
        setIsDownloadingIssuanceZip(false);
      }
    },
    [csrfToken, eventId],
  );

  const issueAndRefresh = useCallback(
    async (applicationIds: string[]) => {
      if (!selectedTemplateId) {
        toast.error("Select a template first.");
        return;
      }

      const result = await issueCertificatesBulk(
        eventId,
        {
          templateId: selectedTemplateId,
          templateVersionId: selectedVersionId ?? undefined,
          applicationIds,
          issuerName: issuanceIssuerName.trim() || undefined,
          reissueIfExists: issuanceReissueIfExists,
        },
        csrfToken ?? undefined,
      );

      await refreshOperationsData();

      if (issuanceDownloadAfterIssue) {
        await downloadIssuanceZipByIssuedIds(
          (result.certificates ?? [])
            .map((certificate) => String(certificate.id ?? "").trim())
            .filter((value) => value.length > 0),
        );
      }

      return result;
    },
    [
      csrfToken,
      downloadIssuanceZipByIssuedIds,
      eventId,
      issuanceDownloadAfterIssue,
      issuanceIssuerName,
      issuanceReissueIfExists,
      refreshOperationsData,
      selectedTemplateId,
      selectedVersionId,
    ],
  );

  const handleIssueCertificates = useCallback(() => {
    const ids = parseApplicationIdsInput(issuanceApplicationIds);
    if (ids.length === 0) {
      toast.error("Provide at least one application ID.");
      return;
    }

    setIsIssuing(true);
    issueAndRefresh(ids)
      .then((result) => {
        if (!result) return;
        toast.success(`Issued ${result.issued} certificate(s).`);
        setIssuanceApplicationIds("");
      })
      .catch(() => toast.error("Failed to issue certificates."))
      .finally(() => setIsIssuing(false));
  }, [issuanceApplicationIds, issueAndRefresh]);

  const handleIssueSingleCandidate = useCallback(
    (applicationId: string) => {
      setIsIssuing(true);
      issueAndRefresh([applicationId])
        .then((result) => {
          if (!result) return;
          if (result.issued > 0) {
            toast.success("Certificate issued.");
          } else if (result.alreadyIssued > 0) {
            toast.info("Certificate already issued.");
          } else if (result.notFound.length > 0) {
            toast.error("Application not found.");
          } else if (result.failed.length > 0) {
            toast.error(result.failed[0]?.reason || "Failed to issue certificate.");
          } else {
            toast.error("Failed to issue certificate.");
          }
        })
        .catch(() => toast.error("Failed to issue certificate."))
        .finally(() => setIsIssuing(false));
    },
    [issueAndRefresh],
  );

  const handleIssueCertificatesByTags = useCallback(() => {
    if (!selectedTemplateId) {
      toast.error("Select a template first.");
      return;
    }
    if (issuanceSelectedTags.length === 0) {
      toast.error("Select at least one tag.");
      return;
    }

    setIsIssuing(true);
    issueCertificatesByTags(
      eventId,
      {
        templateId: selectedTemplateId,
        templateVersionId: selectedVersionId ?? undefined,
        tags: issuanceSelectedTags,
        issuerName: issuanceIssuerName.trim() || undefined,
        reissueIfExists: issuanceReissueIfExists,
      },
      csrfToken ?? undefined,
    )
      .then(async (result) => {
        toast.success(`Issued ${result.issued} certificate(s).`);
        await refreshOperationsData();
        if (issuanceDownloadAfterIssue) {
          await downloadIssuanceZipByIssuedIds(
            (result.certificates ?? [])
              .map((certificate) => String(certificate.id ?? "").trim())
              .filter((value) => value.length > 0),
          );
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          toast.error(error.message);
          return;
        }
        toast.error("Failed to issue certificates by tags.");
      })
      .finally(() => setIsIssuing(false));
  }, [
    csrfToken,
    downloadIssuanceZipByIssuedIds,
    eventId,
    issuanceDownloadAfterIssue,
    issuanceIssuerName,
    issuanceReissueIfExists,
    issuanceSelectedTags,
    refreshOperationsData,
    selectedTemplateId,
    selectedVersionId,
  ]);

  const handleReleaseIssuedCertificate = useCallback(
    (certificate: IssuedCertificateSummary) => {
      setReleasingIssuedCertificateId(certificate.id);
      releaseIssuedCertificate(eventId, certificate.id, csrfToken ?? undefined)
        .then(() => {
          toast.success("Certificate released.");
          return refreshOperationsData();
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
            return;
          }
          toast.error("Failed to release certificate.");
        })
        .finally(() => setReleasingIssuedCertificateId(null));
    },
    [csrfToken, eventId, refreshOperationsData],
  );

  const handleRetryRenderJob = useCallback(
    (jobId: string) => {
      retryCertificateRenderJob(eventId, jobId, csrfToken ?? undefined)
        .then(() => {
          toast.success("Render job queued for retry.");
          return refreshOperationsData();
        })
        .catch(() => toast.error("Failed to retry render job."));
    },
    [csrfToken, eventId, refreshOperationsData],
  );

  const handleRequestRevokeIssuedCertificate = useCallback((certificate: IssuedCertificateSummary) => {
    setRevokeTargetCertificate(certificate);
    setRevokeReasonDraft("");
    setRevokeDialogOpen(true);
  }, []);

  const handleConfirmRevokeIssuedCertificate = useCallback(() => {
    if (!revokeTargetCertificate) return;

    setIsRevokingIssuedCertificate(true);
    revokeIssuedCertificate(
      eventId,
      revokeTargetCertificate.id,
      revokeReasonDraft.trim() || undefined,
      csrfToken ?? undefined,
    )
      .then(() => {
        toast.success("Certificate revoked.");
        setRevokeDialogOpen(false);
        setRevokeTargetCertificate(null);
        setRevokeReasonDraft("");
        return refreshOperationsData();
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError) {
          toast.error(error.message);
          return;
        }
        toast.error("Failed to revoke certificate.");
      })
      .finally(() => setIsRevokingIssuedCertificate(false));
  }, [csrfToken, eventId, refreshOperationsData, revokeReasonDraft, revokeTargetCertificate]);

  if (!canManage) {
    return (
      <Alert>
        <AlertDescription>
          You do not have permission to manage certificates for this event.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="rounded-xl border p-10 text-center text-muted-foreground">Loading operations...</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">Certificate operations</p>
              <p className="text-sm text-muted-foreground">
                Manage issuance, public release, revocation, and render monitoring.
              </p>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh data
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "issue" | "issued" | "jobs")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="issue">Issue</TabsTrigger>
              <TabsTrigger value="issued">Issued</TabsTrigger>
              <TabsTrigger value="jobs">Render jobs</TabsTrigger>
            </TabsList>

            <TabsContent value="issue" className="mt-4 space-y-4">
              <section className="rounded-xl border bg-card/60 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Shared setup</p>
                    <p className="text-sm text-muted-foreground">
                      Pick the template and default issuance options used by the issue tools below.
                    </p>
                  </div>
                  {selectedTemplate ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTemplate.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                      <Badge variant="outline">Active v{selectedTemplate.activeVersionNumber ?? "-"}</Badge>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Template</span>
                    <Select
                      value={selectedTemplateId ?? "none"}
                      onValueChange={(value) => setSelectedTemplateId(value === "none" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template selected</SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Published version</span>
                    <Select
                      value={selectedVersionId ?? "none"}
                      onValueChange={(value) => setSelectedVersionId(value === "none" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Latest active version</SelectItem>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            Version {version.versionNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Issuer name</span>
                    <Input
                      value={issuanceIssuerName}
                      onChange={(event) => setIssuanceIssuerName(event.target.value)}
                      placeholder="Math&Maroc Event Platform"
                    />
                  </label>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Reissue if already issued</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Revoke the active certificate and issue a fresh one.
                        </p>
                      </div>
                      <Switch
                        checked={issuanceReissueIfExists}
                        onCheckedChange={setIssuanceReissueIfExists}
                        disabled={isIssuing}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label className="text-xs">Download ZIP after issue</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Wait for PDF rendering and download a single ZIP.
                        </p>
                      </div>
                      <Switch
                        checked={issuanceDownloadAfterIssue}
                        onCheckedChange={setIssuanceDownloadAfterIssue}
                        disabled={isIssuing || isDownloadingIssuanceZip}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-3">
                <section className="rounded-xl border bg-card/60 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Search applicant</p>
                    <p className="text-sm text-muted-foreground">
                      Find one application by name or email and issue directly.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      value={issuanceSearchInput}
                      onChange={(event) => setIssuanceSearchInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSearchIssuanceCandidates();
                        }
                      }}
                      placeholder="Jane Doe or jane@example.com"
                      disabled={isSearchingIssuanceCandidates}
                    />
                    <Button
                      variant="outline"
                      onClick={handleSearchIssuanceCandidates}
                      disabled={isSearchingIssuanceCandidates}
                    >
                      {isSearchingIssuanceCandidates ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {issuanceSearchAttempted && !isSearchingIssuanceCandidates && issuanceCandidates.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No applications found.
                      </p>
                    ) : null}

                    {issuanceCandidates.map((candidate) => (
                      <div key={candidate.applicationId} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{candidate.applicantName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {candidate.applicantEmail || "-"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline">{candidate.decisionStatus}</Badge>
                              <Badge
                                variant={candidate.attendanceStatus === "CHECKED_IN" ? "secondary" : "outline"}
                              >
                                {candidate.attendanceStatus}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleIssueSingleCandidate(candidate.applicationId)}
                            disabled={!selectedTemplateId || isIssuing}
                          >
                            Issue
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border bg-card/60 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Issue by tags</p>
                    <p className="text-sm text-muted-foreground">
                      Match all selected tags and issue certificates in bulk.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <Input
                      value={issuanceTagSearchInput}
                      onChange={(event) => setIssuanceTagSearchInput(event.target.value)}
                      placeholder="Search tags"
                      disabled={isLoadingIssuanceTags}
                    />
                    <Button variant="outline" onClick={refreshIssuanceTags} disabled={isLoadingIssuanceTags}>
                      {isLoadingIssuanceTags ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {issuanceTags.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        No tags found.
                      </p>
                    ) : (
                      issuanceTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                            issuanceSelectedTags.includes(tag)
                              ? "border-primary bg-primary/10 text-foreground"
                              : "hover:border-primary/40 hover:bg-muted/10",
                          )}
                          onClick={() =>
                            setIssuanceSelectedTags((previous) =>
                              previous.includes(tag)
                                ? previous.filter((item) => item !== tag)
                                : [...previous, tag],
                            )
                          }
                        >
                          {tag}
                        </button>
                      ))
                    )}
                  </div>

                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={handleIssueCertificatesByTags}
                    disabled={!selectedTemplateId || isIssuing || issuanceSelectedTags.length === 0}
                  >
                    {isIssuing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    Issue selected tags
                  </Button>
                </section>

                <section className="rounded-xl border bg-card/60 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Issue by application IDs</p>
                    <p className="text-sm text-muted-foreground">
                      Paste application IDs separated by commas, spaces, or new lines.
                    </p>
                  </div>

                  <Textarea
                    className="mt-4 min-h-[240px]"
                    value={issuanceApplicationIds}
                    onChange={(event) => setIssuanceApplicationIds(event.target.value)}
                    placeholder={"uuid-1\nuuid-2"}
                  />

                  <Button className="mt-4 w-full" onClick={handleIssueCertificates} disabled={!selectedTemplateId || isIssuing}>
                    {isIssuing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    Issue certificates
                  </Button>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="issued" className="mt-4 space-y-4">
              <section className="rounded-xl border bg-card/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Issued certificates</p>
                    <p className="text-sm text-muted-foreground">
                      Search, release, revoke, and download issued certificate PDFs.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={issuedHistorySearchInput}
                      onChange={(event) => setIssuedHistorySearchInput(event.target.value)}
                      placeholder="Search by certificate, applicant, issuer, or type"
                      className="sm:w-96"
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadIssuanceZipByIssuedIds(
                          issuedCertificates
                            .filter((item) => item.status === "ISSUED")
                            .map((item) => item.id),
                        )
                      }
                      disabled={isDownloadingIssuanceZip || issuedCertificates.length === 0}
                    >
                      {isDownloadingIssuanceZip ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                      )}
                      Download ZIP
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certificate</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Render</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {issuedCertificates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            No issued certificates found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        issuedCertificates.map((item) => {
                          const certificateHref = sanitizeClientFacingUrl(item.certificateUrl) ?? item.certificateUrl;
                          const verifyHref = sanitizeClientFacingUrl(item.verifiableCredentialUrl) ?? item.verifiableCredentialUrl;
                          const pdfHref = sanitizeClientFacingUrl(item.pdfUrl);

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="align-top">
                                <div className="space-y-1">
                                  <p className="font-medium">{item.certificateTypeLabel}</p>
                                  <p className="text-xs text-muted-foreground">{item.certificateId}</p>
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="space-y-1">
                                  <p>{item.applicationId}</p>
                                  <p className="text-xs text-muted-foreground">{item.issuerName || "-"}</p>
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge variant={item.status === "REVOKED" ? "destructive" : "outline"}>
                                    {item.status}
                                  </Badge>
                                  <Badge variant={item.isReleased ? "secondary" : "outline"}>
                                    {item.isReleased ? "Released" : "Hidden"}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <Badge
                                  variant={
                                    item.renderStatus === "DONE"
                                      ? "secondary"
                                      : item.renderStatus === "FAILED"
                                        ? "destructive"
                                        : "outline"
                                  }
                                >
                                  {item.renderStatus}
                                </Badge>
                              </TableCell>
                              <TableCell className="align-top text-sm text-muted-foreground">
                                {formatDateTime(item.issuedAt)}
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" asChild>
                                    <a href={certificateHref} target="_blank" rel="noreferrer">
                                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                      Certificate
                                    </a>
                                  </Button>
                                  <Button size="sm" variant="outline" asChild>
                                    <a href={verifyHref} target="_blank" rel="noreferrer">
                                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                      Verify
                                    </a>
                                  </Button>
                                  {pdfHref ? (
                                    <Button size="sm" variant="outline" asChild>
                                      <a href={pdfHref} target="_blank" rel="noreferrer">
                                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                                        PDF
                                      </a>
                                    </Button>
                                  ) : null}
                                  {item.status === "ISSUED" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReleaseIssuedCertificate(item)}
                                      disabled={!canManage || releasingIssuedCertificateId === item.id || item.isReleased}
                                    >
                                      {releasingIssuedCertificateId === item.id ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                      )}
                                      {item.isReleased ? "Released" : "Release"}
                                    </Button>
                                  ) : null}
                                  {item.status === "ISSUED" ? (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleRequestRevokeIssuedCertificate(item)}
                                      disabled={!canManage || isRevokingIssuedCertificate}
                                    >
                                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                                      Revoke
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="jobs" className="mt-4 space-y-4">
              <section className="rounded-xl border bg-card/60 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Render jobs</p>
                  <p className="text-sm text-muted-foreground">
                    Track PDF rendering and retry failed jobs when needed.
                  </p>
                </div>

                <div className="mt-4 rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Certificate</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {renderJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            No render jobs found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        renderJobs.map((job) => {
                          const issued = issuedById.get(job.issuedCertificateId) ?? null;

                          return (
                            <TableRow key={job.id}>
                              <TableCell>
                                <Badge
                                  variant={
                                    job.status === "DONE"
                                      ? "secondary"
                                      : job.status === "FAILED"
                                        ? "destructive"
                                        : "outline"
                                  }
                                >
                                  {job.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="font-medium">
                                    {issued?.certificateTypeLabel ?? "Issued certificate"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {issued?.certificateId ?? job.issuedCertificateId}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{issued?.applicationId ?? "-"}</TableCell>
                              <TableCell>
                                {job.attempts}/{job.maxAttempts}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDateTime(job.updatedAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end">
                                  {job.status === "FAILED" ? (
                                    <Button size="sm" variant="outline" onClick={() => handleRetryRenderJob(job.id)}>
                                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                      Retry
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Next retry {formatDateTime(job.nextRetryAt)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </TabsContent>
          </Tabs>

          <Dialog
            open={revokeDialogOpen}
            onOpenChange={(open) => {
              if (isRevokingIssuedCertificate) return;
              setRevokeDialogOpen(open);
              if (!open) {
                setRevokeTargetCertificate(null);
                setRevokeReasonDraft("");
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Revoke certificate</DialogTitle>
                <DialogDescription>
                  {revokeTargetCertificate
                    ? `Certificate ${revokeTargetCertificate.certificateId} will be marked as revoked.`
                    : "This certificate will be marked as revoked."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Reason (optional)</p>
                <Textarea
                  value={revokeReasonDraft}
                  onChange={(event) => setRevokeReasonDraft(event.target.value)}
                  placeholder="Add a reason for revocation"
                  disabled={isRevokingIssuedCertificate}
                  className="min-h-24"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRevokeDialogOpen(false)}
                  disabled={isRevokingIssuedCertificate}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRevokeIssuedCertificate}
                  disabled={isRevokingIssuedCertificate}
                >
                  {isRevokingIssuedCertificate ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-1.5 h-4 w-4" />
                  )}
                  Confirm revoke
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
