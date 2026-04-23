import { useMemo } from "react";
import {
  Archive,
  Ban,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  CertificateAsset,
  CertificateIssuanceCandidate,
  CertificateRenderJobSummary,
  CertificateTemplateSummary,
  CertificateTemplateVersion,
  IssuedCertificateSummary,
} from "@/lib/certificates";
import { cn } from "@/lib/utils";
import { sanitizeClientFacingUrl } from "@/lib/public-link-url";
import type { AssetMode, LeftRailView } from "./utils";
import { formatDateTime, resolveAssetUrl } from "./utils";

interface LeftRailProps {
  canManage: boolean;
  view: LeftRailView;
  onViewChange: (view: LeftRailView) => void;
  templates: CertificateTemplateSummary[];
  selectedTemplateId: string | null;
  versions: CertificateTemplateVersion[];
  selectedVersionId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onSelectVersion: (versionId: string | null) => void;
  onActivateSelectedVersion: () => void;
  onDeleteSelectedVersion: () => void;
  onCreateTemplate: () => void;
  onDuplicateTemplate: () => void;
  onDeleteTemplate: () => void;
  onArchiveTemplate: () => void;
  templateNameDraft: string;
  typeLabelDraft: string;
  typeKeyDraft: string;
  onTemplateNameDraftChange: (value: string) => void;
  onTypeLabelDraftChange: (value: string) => void;
  onTypeKeyDraftChange: (value: string) => void;
  isCreatingTemplate: boolean;
  isBusyTemplateAction: boolean;
  isBusyVersionAction: boolean;
  assetMode: AssetMode;
  onAssetModeChange: (mode: AssetMode) => void;
  assets: CertificateAsset[];
  assetSearch: string;
  onAssetSearchChange: (value: string) => void;
  assetKindFilter: "all" | "background" | "signature" | "logo" | "image" | "font";
  onAssetKindFilterChange: (value: "all" | "background" | "signature" | "logo" | "image" | "font") => void;
  onApplyAsset: (asset: CertificateAsset) => void;
  onUploadAsset: (file: File, kind: "background" | "signature" | "logo" | "image" | "font") => void;
  onDeleteAsset: (asset: CertificateAsset) => void;
  isUploadingAsset: boolean;
  issuanceApplicationIds: string;
  onIssuanceApplicationIdsChange: (value: string) => void;
  issuanceSearchInput: string;
  onIssuanceSearchInputChange: (value: string) => void;
  onSearchIssuanceCandidates: () => void;
  issuanceCandidates: CertificateIssuanceCandidate[];
  issuanceSearchAttempted: boolean;
  isSearchingIssuanceCandidates: boolean;
  issuanceTagSearchInput: string;
  onIssuanceTagSearchInputChange: (value: string) => void;
  onRefreshIssuanceTags: () => void;
  issuanceTags: string[];
  issuanceSelectedTags: string[];
  onToggleIssuanceTag: (tag: string) => void;
  onIssueCertificatesByTags: () => void;
  issuanceIssuerName: string;
  onIssuanceIssuerNameChange: (value: string) => void;
  issuanceReissueIfExists: boolean;
  onIssuanceReissueIfExistsChange: (value: boolean) => void;
  issuanceDownloadAfterIssue: boolean;
  onIssuanceDownloadAfterIssueChange: (value: boolean) => void;
  onIssueCertificates: () => void;
  onIssueCandidate: (applicationId: string) => void;
  isIssuing: boolean;
  isLoadingIssuanceTags: boolean;
  isDownloadingIssuanceZip: boolean;
  issuedCertificates: IssuedCertificateSummary[];
  renderJobs: CertificateRenderJobSummary[];
  onRequestRevokeIssuedCertificate: (certificate: IssuedCertificateSummary) => void;
  onReleaseIssuedCertificate: (certificate: IssuedCertificateSummary) => void;
  revokingIssuedCertificateId: string | null;
  releasingIssuedCertificateId: string | null;
  onDownloadIssuedCertificates: (issuedCertificateIds: string[]) => void;
  onRetryRenderJob: (jobId: string) => void;
  onRefreshIssuance: () => void;
  isRefreshingIssuance: boolean;
}

const VIEW_OPTIONS: Array<{ value: LeftRailView; label: string }> = [
  { value: "templates", label: "Templates" },
  { value: "assets", label: "Assets" },
  { value: "issuance", label: "Issuance" },
];

export function LeftRail(props: LeftRailProps) {
  const {
    canManage,
    view,
    onViewChange,
    templates,
    selectedTemplateId,
    versions,
    selectedVersionId,
    onSelectTemplate,
    onSelectVersion,
    onActivateSelectedVersion,
    onDeleteSelectedVersion,
    onCreateTemplate,
    onDuplicateTemplate,
    onDeleteTemplate,
    onArchiveTemplate,
    templateNameDraft,
    typeLabelDraft,
    typeKeyDraft,
    onTemplateNameDraftChange,
    onTypeLabelDraftChange,
    onTypeKeyDraftChange,
    isCreatingTemplate,
    isBusyTemplateAction,
    isBusyVersionAction,
    assetMode,
    onAssetModeChange,
    assets,
    assetSearch,
    onAssetSearchChange,
    assetKindFilter,
    onAssetKindFilterChange,
    onApplyAsset,
    onUploadAsset,
    onDeleteAsset,
    isUploadingAsset,
    issuanceApplicationIds,
    onIssuanceApplicationIdsChange,
    issuanceSearchInput,
    onIssuanceSearchInputChange,
    onSearchIssuanceCandidates,
    issuanceCandidates,
    issuanceSearchAttempted,
    isSearchingIssuanceCandidates,
    issuanceTagSearchInput,
    onIssuanceTagSearchInputChange,
    onRefreshIssuanceTags,
    issuanceTags,
    issuanceSelectedTags,
    onToggleIssuanceTag,
    onIssueCertificatesByTags,
    issuanceIssuerName,
    onIssuanceIssuerNameChange,
    issuanceReissueIfExists,
    onIssuanceReissueIfExistsChange,
    issuanceDownloadAfterIssue,
    onIssuanceDownloadAfterIssueChange,
    onIssueCertificates,
    onIssueCandidate,
    isIssuing,
    isLoadingIssuanceTags,
    isDownloadingIssuanceZip,
    issuedCertificates,
    renderJobs,
    onRequestRevokeIssuedCertificate,
    onReleaseIssuedCertificate,
    revokingIssuedCertificateId,
    releasingIssuedCertificateId,
    onDownloadIssuedCertificates,
    onRetryRenderJob,
    onRefreshIssuance,
    isRefreshingIssuance,
  } = props;

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (assetKindFilter !== "all" && asset.kind !== assetKindFilter) {
        return false;
      }
      const q = assetSearch.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${asset.originalFilename} ${asset.storageKey} ${asset.kind}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [assetKindFilter, assetSearch, assets]);

  return (
    <aside className="flex min-h-[72vh] min-w-[320px] max-w-[360px] flex-col overflow-hidden rounded-xl border bg-card/60">
      <div className="border-b p-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition",
                view === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onViewChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          {view === "templates" && (
            <Accordion
              type="multiple"
              defaultValue={["template-create", "template-library", "template-actions"]}
              className="space-y-2"
            >
              <AccordionItem value="template-create" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  Create template
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Name</span>
                    <Input
                      value={templateNameDraft}
                      onChange={(event) => onTemplateNameDraftChange(event.target.value)}
                      placeholder="Participation Certificate"
                      className="h-8"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Type Label</span>
                    <Input
                      value={typeLabelDraft}
                      onChange={(event) => onTypeLabelDraftChange(event.target.value)}
                      placeholder="Participation"
                      className="h-8"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Type Key</span>
                    <Input
                      value={typeKeyDraft}
                      onChange={(event) => onTypeKeyDraftChange(event.target.value)}
                      placeholder="participation"
                      className="h-8"
                    />
                  </label>
                  <Button className="w-full" size="sm" onClick={onCreateTemplate} disabled={!canManage || isCreatingTemplate}>
                    {isCreatingTemplate ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Create
                  </Button>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="template-library" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    Template library
                    <Badge variant="outline">{templates.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {templates.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      No templates yet.
                    </p>
                  ) : (
                    templates.map((template) => {
                      const selected = template.id === selectedTemplateId;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          className={cn(
                            "w-full rounded-md border p-2 text-left",
                            selected ? "border-primary bg-primary/5" : "hover:border-primary/40",
                          )}
                          onClick={() => onSelectTemplate(template.id)}
                        >
                          <p className="truncate text-sm font-medium">{template.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {template.typeLabel} ({template.typeKey})
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {template.isDefault && <Badge variant="secondary">Default</Badge>}
                            {template.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Archived</Badge>}
                            <Badge variant="outline">Draft r{template.draftRevision}</Badge>
                            <Badge variant="outline">v{template.activeVersionNumber ?? "-"}</Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </AccordionContent>
              </AccordionItem>

              {selectedTemplate && (
                <AccordionItem value="template-actions" className="rounded-lg border px-3">
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    <span className="flex items-center gap-2">
                      Template actions
                      <Badge variant="outline">{versions.length} versions</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    <Label className="text-xs text-muted-foreground">Published version</Label>
                    <Select value={selectedVersionId ?? "none"} onValueChange={(value) => onSelectVersion(value === "none" ? null : value)}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            Version {version.versionNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="col-span-2"
                        onClick={onActivateSelectedVersion}
                        disabled={!canManage || !selectedVersionId || isBusyVersionAction}
                      >
                        Activate selected version
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="col-span-2"
                        onClick={onDeleteSelectedVersion}
                        disabled={!canManage || !selectedVersionId || isBusyVersionAction}
                      >
                        Delete selected version
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onDuplicateTemplate}
                        disabled={!canManage || isBusyTemplateAction}
                      >
                        <Copy className="mr-1.5 h-4 w-4" />
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onArchiveTemplate}
                        disabled={!canManage || isBusyTemplateAction}
                      >
                        <Archive className="mr-1.5 h-4 w-4" />
                        Archive
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="col-span-2"
                        onClick={onDeleteTemplate}
                        disabled={!canManage || isBusyTemplateAction}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Delete template
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}

          {view === "assets" && (
            <Accordion
              type="multiple"
              defaultValue={["assets-controls", "assets-library"]}
              className="space-y-2"
            >
              <AccordionItem value="assets-controls" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  Asset controls
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <div className="mt-1 grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        assetMode === "background" ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => onAssetModeChange("background")}
                    >
                      Background
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        assetMode === "image" ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => onAssetModeChange("image")}
                    >
                      Image
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        assetMode === "signature" ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => onAssetModeChange("signature")}
                    >
                      Signature
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-1 text-xs",
                        assetMode === "font" ? "bg-background shadow-sm" : "text-muted-foreground",
                      )}
                      onClick={() => onAssetModeChange("font")}
                    >
                      Font
                    </button>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select value={assetKindFilter} onValueChange={(value) => onAssetKindFilterChange(value as LeftRailProps["assetKindFilter"])}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Kind" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="background">Background</SelectItem>
                        <SelectItem value="signature">Signature</SelectItem>
                        <SelectItem value="logo">Logo</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="font">Font</SelectItem>
                      </SelectContent>
                    </Select>
                    <label>
                      <input
                        type="file"
                        accept={
                          assetKindFilter === "font" || (assetKindFilter === "all" && assetMode === "font")
                            ? ".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
                            : "image/*"
                        }
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const fallbackKind =
                            assetKindFilter === "all"
                              ? assetMode === "background"
                                ? "background"
                                : assetMode === "signature"
                                  ? "signature"
                                  : assetMode === "font"
                                    ? "font"
                                    : "image"
                              : assetKindFilter;
                          onUploadAsset(file, fallbackKind);
                          event.currentTarget.value = "";
                        }}
                        disabled={!canManage || isUploadingAsset}
                      />
                      <Button asChild size="sm" variant="outline" disabled={!canManage || isUploadingAsset}>
                        <span>
                          {isUploadingAsset ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </span>
                      </Button>
                    </label>
                  </div>
                  <Input
                    value={assetSearch}
                    onChange={(event) => onAssetSearchChange(event.target.value)}
                    className="h-8"
                    placeholder="Search assets"
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="assets-library" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    Asset library
                    <Badge variant="outline">{filteredAssets.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {filteredAssets.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      No assets found.
                    </p>
                  ) : (
                    filteredAssets.map((asset) => (
                      <div key={asset.id} className="rounded-lg border p-2">
                        <div className="mb-2 aspect-video overflow-hidden rounded bg-muted/40">
                          {asset.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveAssetUrl(asset.storageKey)}
                              alt={asset.originalFilename}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              {asset.kind === "font" ? "Font Asset" : asset.mimeType}
                            </div>
                          )}
                        </div>
                        <p className="truncate text-xs font-medium">{asset.originalFilename}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{asset.storageKey}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant="outline">{asset.kind}</Badge>
                          <span className="text-[10px] text-muted-foreground">{formatDateTime(asset.createdAt)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                          <Button size="sm" variant="outline" onClick={() => onApplyAsset(asset)}>
                            <WandSparkles className="mr-1.5 h-4 w-4" />
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => onDeleteAsset(asset)}
                            disabled={!canManage}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {view === "issuance" && (
            <Accordion
              type="multiple"
              defaultValue={["issuance-batch", "issuance-history", "issuance-jobs"]}
              className="space-y-2"
            >
              <AccordionItem value="issuance-batch" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  Batch issuance
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  <div className="flex items-center justify-end">
                    <Button size="sm" variant="outline" onClick={onRefreshIssuance} disabled={isRefreshingIssuance}>
                      <RefreshCw className={`h-4 w-4 ${isRefreshingIssuance ? "animate-spin" : ""}`} />
                    </Button>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    {selectedTemplate ? (
                      <>
                        <p className="font-medium">{selectedTemplate.name}</p>
                        <p className="text-muted-foreground">
                          Active version {selectedTemplate.activeVersionNumber ?? "-"}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Select a template first.</p>
                    )}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Issuer Name</span>
                    <Input
                      value={issuanceIssuerName}
                      onChange={(event) => onIssuanceIssuerNameChange(event.target.value)}
                      className="h-8"
                      placeholder="Math&Maroc Event Platform"
                    />
                  </label>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs">Reissue if already issued</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Revoke active certificate and issue a fresh one.
                      </p>
                    </div>
                    <Switch
                      checked={issuanceReissueIfExists}
                      onCheckedChange={onIssuanceReissueIfExistsChange}
                      disabled={!canManage || isIssuing}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs">Download ZIP After Issue</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Wait for PDF rendering, then download one ZIP.
                      </p>
                    </div>
                    <Switch
                      checked={issuanceDownloadAfterIssue}
                      onCheckedChange={onIssuanceDownloadAfterIssueChange}
                      disabled={!canManage || isIssuing || isDownloadingIssuanceZip}
                    />
                  </div>

                  <div className="space-y-2 rounded-md border p-2">
                    <Label className="text-xs">Search by name or email</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        value={issuanceSearchInput}
                        onChange={(event) => onIssuanceSearchInputChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onSearchIssuanceCandidates();
                          }
                        }}
                        className="h-8"
                        placeholder="Jane Doe or jane@example.com"
                        disabled={!canManage || isSearchingIssuanceCandidates}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onSearchIssuanceCandidates}
                        disabled={!canManage || isSearchingIssuanceCandidates}
                      >
                        {isSearchingIssuanceCandidates ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {issuanceSearchAttempted && !isSearchingIssuanceCandidates && issuanceCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground">No applications found.</p>
                    )}

                    {issuanceCandidates.length > 0 && (
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {issuanceCandidates.map((candidate) => (
                          <div
                            key={candidate.applicationId}
                            className="flex items-center justify-between gap-2 rounded-md border p-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{candidate.applicantName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{candidate.applicantEmail || "-"}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="outline">{candidate.decisionStatus}</Badge>
                                <Badge
                                  variant={
                                    candidate.attendanceStatus === "CHECKED_IN" ? "secondary" : "outline"
                                  }
                                >
                                  {candidate.attendanceStatus}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => onIssueCandidate(candidate.applicationId)}
                              disabled={!canManage || !selectedTemplate || isIssuing}
                            >
                              Issue
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-md border p-2">
                    <Label className="text-xs">Issue by tags (match all)</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        value={issuanceTagSearchInput}
                        onChange={(event) =>
                          onIssuanceTagSearchInputChange(event.target.value)
                        }
                        className="h-8"
                        placeholder="Search tags"
                        disabled={!canManage || isLoadingIssuanceTags}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onRefreshIssuanceTags}
                        disabled={!canManage || isLoadingIssuanceTags}
                      >
                        {isLoadingIssuanceTags ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {issuanceTags.length > 0 ? (
                      <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                        {issuanceTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={cn(
                              "w-full rounded-md border px-2 py-1 text-left text-xs",
                              issuanceSelectedTags.includes(tag)
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background",
                            )}
                            onClick={() => onToggleIssuanceTag(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No tags found.
                      </p>
                    )}
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={onIssueCertificatesByTags}
                      disabled={
                        !canManage ||
                        !selectedTemplate ||
                        isIssuing ||
                        issuanceSelectedTags.length === 0
                      }
                    >
                      {isIssuing ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-4 w-4" />
                      )}
                      Issue selected tags
                    </Button>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Application IDs (comma/newline separated)</span>
                    <Textarea
                      value={issuanceApplicationIds}
                      onChange={(event) => onIssuanceApplicationIdsChange(event.target.value)}
                      className="min-h-[100px]"
                      placeholder="uuid-1\nuuid-2"
                    />
                  </label>

                  <Button className="w-full" size="sm" onClick={onIssueCertificates} disabled={!canManage || isIssuing || !selectedTemplate}>
                    {isIssuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    Issue certificates
                  </Button>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="issuance-history" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    Issued history
                    <Badge variant="outline">{issuedCertificates.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {issuedCertificates.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[11px]"
                      onClick={() =>
                        onDownloadIssuedCertificates(
                          issuedCertificates
                            .filter((item) => item.status === "ISSUED")
                            .map((item) => item.id),
                        )
                      }
                      disabled={isDownloadingIssuanceZip}
                    >
                      {isDownloadingIssuanceZip ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Download ZIP
                    </Button>
                  )}
                  {issuedCertificates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No certificates issued yet.</p>
                  ) : (
                    issuedCertificates.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-md border p-2 text-xs">
                        {(() => {
                          const certificateHref = sanitizeClientFacingUrl(item.certificateUrl) ?? item.certificateUrl;
                          const verifyHref = sanitizeClientFacingUrl(item.verifiableCredentialUrl) ?? item.verifiableCredentialUrl;
                          const pdfHref = sanitizeClientFacingUrl(item.pdfUrl);

                          return (
                            <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.certificateTypeLabel}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant={item.status === "REVOKED" ? "destructive" : "outline"}>
                              {item.status}
                            </Badge>
                            <Badge
                              variant={item.isReleased ? "secondary" : "outline"}
                            >
                              {item.isReleased ? "RELEASED" : "HIDDEN"}
                            </Badge>
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
                          </div>
                        </div>
                        <p className="truncate text-muted-foreground">Application {item.applicationId}</p>
                        <p className="truncate text-muted-foreground">Certificate {item.certificateId}</p>
                        <p className="text-muted-foreground">{formatDateTime(item.issuedAt)}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" asChild>
                            <a href={certificateHref} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Certificate
                            </a>
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" asChild>
                            <a href={verifyHref} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Verify
                            </a>
                          </Button>
                          {pdfHref && (
                            <Button size="sm" variant="outline" className="col-span-2 h-7 text-[11px]" asChild>
                              <a href={pdfHref} target="_blank" rel="noreferrer">
                                <FileText className="mr-1.5 h-3.5 w-3.5" />
                                PDF
                              </a>
                            </Button>
                          )}
                          {item.status === "ISSUED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="col-span-2 h-7 text-[11px]"
                              onClick={() => onReleaseIssuedCertificate(item)}
                              disabled={!canManage || releasingIssuedCertificateId === item.id || item.isReleased}
                            >
                              {releasingIssuedCertificateId === item.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              {item.isReleased ? "Released" : "Release"}
                            </Button>
                          )}
                          {item.status === "ISSUED" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="col-span-2 h-7 text-[11px]"
                              onClick={() => onRequestRevokeIssuedCertificate(item)}
                              disabled={!canManage || revokingIssuedCertificateId === item.id}
                            >
                              {revokingIssuedCertificateId === item.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Ban className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Revoke
                            </Button>
                          )}
                        </div>
                            </>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="issuance-jobs" className="rounded-lg border px-3">
                <AccordionTrigger className="py-2 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    Render queue
                    <Badge variant="outline">{renderJobs.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {renderJobs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No render jobs.</p>
                  ) : (
                    renderJobs.slice(0, 10).map((job) => (
                      <div key={job.id} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{job.status}</span>
                          <span className="text-muted-foreground">
                            {job.attempts}/{job.maxAttempts}
                          </span>
                        </div>
                        <p className="truncate text-muted-foreground">Next {formatDateTime(job.nextRetryAt)}</p>
                        {job.status === "FAILED" && (
                          <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => onRetryRenderJob(job.id)}>
                            <Package className="mr-1.5 h-3.5 w-3.5" />
                            Retry
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

        </div>
      </ScrollArea>
    </aside>
  );
}
