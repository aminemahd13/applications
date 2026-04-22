import { useMemo } from "react";
import {
  Archive,
  CheckCircle2,
  Copy,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  CertificateAsset,
  CertificateRenderJobSummary,
  CertificateTemplateSummary,
  CertificateTemplateVersion,
  IssuedCertificateSummary,
} from "@/lib/certificates";
import { cn } from "@/lib/utils";
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
  assetMode: AssetMode;
  onAssetModeChange: (mode: AssetMode) => void;
  assets: CertificateAsset[];
  assetSearch: string;
  onAssetSearchChange: (value: string) => void;
  assetKindFilter: "all" | "background" | "signature" | "logo" | "image";
  onAssetKindFilterChange: (value: "all" | "background" | "signature" | "logo" | "image") => void;
  onApplyAsset: (asset: CertificateAsset) => void;
  onUploadAsset: (file: File, kind: "background" | "signature" | "logo" | "image") => void;
  onDeleteAsset: (asset: CertificateAsset) => void;
  isUploadingAsset: boolean;
  issuanceApplicationIds: string;
  onIssuanceApplicationIdsChange: (value: string) => void;
  issuanceIssuerName: string;
  onIssuanceIssuerNameChange: (value: string) => void;
  onIssueCertificates: () => void;
  isIssuing: boolean;
  issuedCertificates: IssuedCertificateSummary[];
  renderJobs: CertificateRenderJobSummary[];
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
    issuanceIssuerName,
    onIssuanceIssuerNameChange,
    onIssueCertificates,
    isIssuing,
    issuedCertificates,
    renderJobs,
    onRetryRenderJob,
    onRefreshIssuance,
    isRefreshingIssuance,
  } = props;

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const filteredAssets = useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) => {
      const haystack = `${asset.originalFilename} ${asset.storageKey} ${asset.kind}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [assetSearch, assets]);

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
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold">Create template</p>
                <div className="mt-3 space-y-2">
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
                </div>
              </div>

              <div className="rounded-lg border p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Template library</p>
                  <Badge variant="outline">{templates.length}</Badge>
                </div>
                <div className="space-y-2">
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
                </div>
              </div>

              {selectedTemplate && (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Template actions</p>
                    <Badge variant="outline">{versions.length} versions</Badge>
                  </div>

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
                </div>
              )}
            </div>
          )}

          {view === "assets" && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-semibold">Asset mode</p>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
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
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
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
                    </SelectContent>
                  </Select>
                  <label>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const fallbackKind =
                          assetKindFilter === "all" ? (assetMode === "background" ? "background" : assetMode === "signature" ? "signature" : "image") : assetKindFilter;
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
                  className="mt-2 h-8"
                  placeholder="Search assets"
                />
              </div>

              <div className="space-y-2">
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
                            {asset.mimeType}
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
              </div>
            </div>
          )}

          {view === "issuance" && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Batch issuance</p>
                  <Button size="sm" variant="outline" onClick={onRefreshIssuance} disabled={isRefreshingIssuance}>
                    <RefreshCw className={`h-4 w-4 ${isRefreshingIssuance ? "animate-spin" : ""}`} />
                  </Button>
                </div>

                <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
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

                <label className="mt-2 block space-y-1">
                  <span className="text-xs text-muted-foreground">Issuer Name</span>
                  <Input
                    value={issuanceIssuerName}
                    onChange={(event) => onIssuanceIssuerNameChange(event.target.value)}
                    className="h-8"
                    placeholder="Math&Maroc Event Platform"
                  />
                </label>

                <label className="mt-2 block space-y-1">
                  <span className="text-xs text-muted-foreground">Application IDs (comma/newline separated)</span>
                  <Textarea
                    value={issuanceApplicationIds}
                    onChange={(event) => onIssuanceApplicationIdsChange(event.target.value)}
                    className="min-h-[100px]"
                    placeholder="uuid-1\nuuid-2"
                  />
                </label>

                <Button className="mt-2 w-full" size="sm" onClick={onIssueCertificates} disabled={!canManage || isIssuing || !selectedTemplate}>
                  {isIssuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                  Issue certificates
                </Button>
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Issued history</p>
                  <Badge variant="outline">{issuedCertificates.length}</Badge>
                </div>
                <div className="space-y-2">
                  {issuedCertificates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No certificates issued yet.</p>
                  ) : (
                    issuedCertificates.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.certificateTypeLabel}</span>
                          <Badge variant={item.renderStatus === "DONE" ? "secondary" : item.renderStatus === "FAILED" ? "destructive" : "outline"}>
                            {item.renderStatus}
                          </Badge>
                        </div>
                        <p className="truncate text-muted-foreground">Application {item.applicationId}</p>
                        <p className="text-muted-foreground">{formatDateTime(item.issuedAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Render queue</p>
                  <Badge variant="outline">{renderJobs.length}</Badge>
                </div>
                <div className="space-y-2">
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
                </div>
              </div>
            </div>
          )}

          {view === "issuance" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              Published versions are immutable snapshots. Draft edits are never issued until you publish.
            </div>
          )}

          {selectedTemplate?.draftUpdatedAt && (
            <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
              Last draft update: {formatDateTime(selectedTemplate.draftUpdatedAt)}
            </div>
          )}

          {selectedTemplate?.activeVersionNumber && (
            <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
              Active published version: v{selectedTemplate.activeVersionNumber}
            </div>
          )}

          {selectedTemplate && view !== "issuance" && (
            <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Template selected
              </div>
              <p className="mt-1 truncate">{selectedTemplate.name}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
