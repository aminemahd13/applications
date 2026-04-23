import { useMemo, useState } from "react";
import {
  Archive,
  Copy,
  ImagePlus,
  Layers3,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CertificateAsset,
  CertificateLayout,
  CertificateTemplateSummary,
  CertificateTemplateVersion,
} from "@/lib/certificates";
import { cn } from "@/lib/utils";
import type { AssetMode, LeftRailView } from "./utils";
import { buildElementLabel, formatDateTime, resolveAssetUrl } from "./utils";

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
  layout: CertificateLayout;
  selectedIds: string[];
  onSelectLayer: (ids: string[]) => void;
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
}

const VIEW_OPTIONS: Array<{ value: LeftRailView; label: string; icon: typeof Layers3 }> = [
  { value: "templates", label: "Templates", icon: Layers3 },
  { value: "layers", label: "Layers", icon: Layers3 },
  { value: "assets", label: "Assets", icon: ImagePlus },
];

const ASSET_KIND_OPTIONS = [
  { value: "all", label: "All assets" },
  { value: "background", label: "Backgrounds" },
  { value: "signature", label: "Signatures" },
  { value: "logo", label: "Logos" },
  { value: "image", label: "Images" },
  { value: "font", label: "Fonts" },
] as const;

function assetUploadKind(
  assetMode: AssetMode,
  assetKindFilter: LeftRailProps["assetKindFilter"],
): "background" | "signature" | "logo" | "image" | "font" {
  if (assetKindFilter !== "all") {
    return assetKindFilter;
  }
  if (assetMode === "background") return "background";
  if (assetMode === "signature") return "signature";
  if (assetMode === "font") return "font";
  return "image";
}

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
    layout,
    selectedIds,
    onSelectLayer,
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
  } = props;

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (assetKindFilter !== "all" && asset.kind !== assetKindFilter) {
        return false;
      }
      const query = assetSearch.trim().toLowerCase();
      if (!query) return true;
      const haystack = `${asset.originalFilename} ${asset.storageKey} ${asset.kind}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assetKindFilter, assetSearch, assets]);

  const orderedLayers = useMemo(() => {
    return [...layout.elements].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  }, [layout.elements]);

  const uploadKind = assetUploadKind(assetMode, assetKindFilter);
  const uploadLabel = `Upload ${uploadKind}`;

  return (
    <aside className="flex min-h-[72vh] min-w-[320px] max-w-[360px] flex-col overflow-hidden rounded-xl border bg-card/60">
      <div className="border-b p-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition",
                  view === option.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onViewChange(option.value)}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          {view === "templates" && (
            <>
              <section className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Selected template</p>
                    <p className="text-xs text-muted-foreground">
                      Choose a template, manage versions, and publish from the command bar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={!canManage}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          New
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>New certificate template</DialogTitle>
                          <DialogDescription>
                            Create a new draft template for a certificate type.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Template name</span>
                            <Input
                              value={templateNameDraft}
                              onChange={(event) => onTemplateNameDraftChange(event.target.value)}
                              placeholder="Participation Certificate"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Type label</span>
                            <Input
                              value={typeLabelDraft}
                              onChange={(event) => onTypeLabelDraftChange(event.target.value)}
                              placeholder="Participation"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">Type key</span>
                            <Input
                              value={typeKeyDraft}
                              onChange={(event) => onTypeKeyDraftChange(event.target.value)}
                              placeholder="participation"
                            />
                          </label>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => {
                              onCreateTemplate();
                              setCreateDialogOpen(false);
                            }}
                            disabled={!canManage || isCreatingTemplate}
                          >
                            {isCreatingTemplate ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="mr-1.5 h-4 w-4" />
                            )}
                            Create template
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {selectedTemplate ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={!canManage || isBusyTemplateAction}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Template actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={onDuplicateTemplate}>
                            <Copy className="h-4 w-4" />
                            Duplicate template
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={onArchiveTemplate}>
                            <Archive className="h-4 w-4" />
                            Archive template
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={onDeleteTemplate}>
                            <Trash2 className="h-4 w-4" />
                            Delete template
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>

                {selectedTemplate ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-sm font-semibold">{selectedTemplate.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedTemplate.typeLabel} ({selectedTemplate.typeKey})
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedTemplate.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                        {selectedTemplate.isActive ? (
                          <Badge variant="outline">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Archived</Badge>
                        )}
                        <Badge variant="outline">Draft r{selectedTemplate.draftRevision}</Badge>
                        <Badge variant="outline">Active v{selectedTemplate.activeVersionNumber ?? "-"}</Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Published versions</Label>
                      <Select
                        value={selectedVersionId ?? "none"}
                        onValueChange={(value) => onSelectVersion(value === "none" ? null : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a published version" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No published version</SelectItem>
                          {versions.map((version) => (
                            <SelectItem key={version.id} value={version.id}>
                              Version {version.versionNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedVersionId ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onActivateSelectedVersion}
                          disabled={!canManage || isBusyVersionAction}
                        >
                          Activate
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={onDeleteSelectedVersion}
                          disabled={!canManage || isBusyVersionAction}
                        >
                          Delete version
                        </Button>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        Publish the current draft to create a version.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Select a template to start editing its draft.
                  </p>
                )}
              </section>

              <section className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Template library</p>
                    <p className="text-xs text-muted-foreground">{templates.length} templates available</p>
                  </div>
                  <Badge variant="outline">{templates.length}</Badge>
                </div>

                <div className="mt-4 space-y-2">
                  {templates.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
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
                            "w-full rounded-xl border p-3 text-left transition",
                            selected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "hover:border-primary/40 hover:bg-muted/10",
                          )}
                          onClick={() => onSelectTemplate(template.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{template.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {template.typeLabel} ({template.typeKey})
                              </p>
                            </div>
                            <Badge variant="outline">v{template.activeVersionNumber ?? "-"}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {template.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                            {template.isActive ? (
                              <Badge variant="outline">Active</Badge>
                            ) : (
                              <Badge variant="destructive">Archived</Badge>
                            )}
                            <Badge variant="outline">r{template.draftRevision}</Badge>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            </>
          )}

          {view === "layers" && (
            <section className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Canvas layers</p>
                  <p className="text-xs text-muted-foreground">
                    Top layers appear first. Click a layer to focus it on the canvas.
                  </p>
                </div>
                <Badge variant="outline">{layout.elements.length}</Badge>
              </div>

              <div className="mt-4 space-y-2">
                {orderedLayers.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                    Add elements from the command bar to build the certificate layout.
                  </p>
                ) : (
                  orderedLayers.map((element) => {
                    const selected = selectedIds.includes(element.id);
                    return (
                      <button
                        key={element.id}
                        type="button"
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition",
                          selected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "hover:border-primary/40 hover:bg-muted/10",
                        )}
                        onClick={() => onSelectLayer([element.id])}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">{buildElementLabel(element)}</p>
                          <Badge variant="outline">z{element.zIndex ?? 0}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Math.round(element.width)} x {Math.round(element.height)} at {Math.round(element.x)},
                          {" "}
                          {Math.round(element.y)}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {view === "assets" && (
            <>
              <section className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Asset controls</p>
                    <p className="text-xs text-muted-foreground">
                      Current apply mode: <span className="font-medium capitalize text-foreground">{assetMode}</span>
                    </p>
                  </div>
                  <Badge variant="outline">{filteredAssets.length}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {(["background", "image", "signature", "font"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
                        assetMode === mode
                          ? "border-primary bg-primary/5 text-foreground"
                          : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                      onClick={() => onAssetModeChange(mode)}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-2">
                  <Select value={assetKindFilter} onValueChange={(value) => onAssetKindFilterChange(value as LeftRailProps["assetKindFilter"])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter assets" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSET_KIND_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={assetSearch}
                    onChange={(event) => onAssetSearchChange(event.target.value)}
                    placeholder="Search by filename or key"
                  />

                  <label>
                    <input
                      type="file"
                      accept={
                        uploadKind === "font"
                          ? ".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
                          : "image/*"
                      }
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        onUploadAsset(file, uploadKind);
                        event.currentTarget.value = "";
                      }}
                      disabled={!canManage || isUploadingAsset}
                    />
                    <Button asChild className="w-full" variant="outline" disabled={!canManage || isUploadingAsset}>
                      <span>
                        {isUploadingAsset ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-1.5 h-4 w-4" />
                        )}
                        {uploadLabel}
                      </span>
                    </Button>
                  </label>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Asset library</p>
                    <p className="text-xs text-muted-foreground">
                      Apply backgrounds, images, signatures, and fonts to the current draft.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredAssets.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                      No assets match the current filters.
                    </p>
                  ) : (
                    filteredAssets.map((asset) => (
                      <div key={asset.id} className="rounded-xl border p-3">
                        <div className="mb-3 aspect-[4/3] overflow-hidden rounded-lg bg-muted/40">
                          {asset.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveAssetUrl(asset.storageKey)}
                              alt={asset.originalFilename}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Font asset preview
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <p className="truncate text-sm font-medium">{asset.originalFilename}</p>
                          <p className="truncate text-xs text-muted-foreground">{asset.storageKey}</p>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Badge variant="outline">{asset.kind}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatDateTime(asset.createdAt)}</span>
                        </div>

                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <Button size="sm" variant="outline" onClick={() => onApplyAsset(asset)}>
                            <WandSparkles className="mr-1.5 h-4 w-4" />
                            Apply asset
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive"
                            onClick={() => onDeleteAsset(asset)}
                            disabled={!canManage}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete asset</span>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
