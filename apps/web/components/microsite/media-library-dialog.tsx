"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Eye, Loader2, Trash2, Upload } from "lucide-react";
import { resolveAssetUrl } from "./asset-url";
import {
  deleteMicrositeAsset,
  listMicrositeMedia,
  uploadMicrositeAsset,
  type MicrositeMediaItem,
} from "@/lib/microsite-media";
import { toast } from "sonner";

type MediaKind = "all" | "image" | "video";
type SortMode = "newest" | "oldest" | "name" | "size_desc" | "size_asc";

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatCreatedAt(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return parsed.toLocaleString();
}

export function MediaLibraryDialog({
  eventId,
  open,
  onOpenChange,
  onSelect,
  kind = "all",
  csrfToken,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (assetKey: string) => void;
  kind?: MediaKind;
  csrfToken?: string;
}) {
  const [items, setItems] = useState<MicrositeMediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MicrositeMediaItem | null>(null);
  const [typeFilter, setTypeFilter] = useState<MediaKind>(kind === "all" ? "all" : kind);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const effectiveKind = kind === "all" ? typeFilter : kind;

    const filteredItems = items.filter((item) => {
      const matchesKind =
        effectiveKind === "all"
          ? true
          : effectiveKind === "video"
            ? item.mimeType.startsWith("video/")
            : item.mimeType.startsWith("image/");
      if (!matchesKind) return false;
      if (!q) return true;
      return `${item.originalFilename} ${item.storageKey}`.toLowerCase().includes(q);
    });

    filteredItems.sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name":
          return a.originalFilename.localeCompare(b.originalFilename);
        case "size_desc":
          return b.sizeBytes - a.sizeBytes;
        case "size_asc":
          return a.sizeBytes - b.sizeBytes;
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filteredItems;
  }, [items, kind, query, sortMode, typeFilter]);

  useEffect(() => {
    setTypeFilter(kind === "all" ? "all" : kind);
  }, [kind, open]);

  useEffect(() => {
    if (!open) return;
    setPreviewItem(null);
    setIsLoading(true);
    listMicrositeMedia(eventId, kind)
      .then(setItems)
      .catch(() => toast.error("Failed to load media library"))
      .finally(() => setIsLoading(false));
  }, [eventId, kind, open]);

  useEffect(() => {
    if (!previewItem) return;
    const latest = items.find((item) => item.id === previewItem.id);
    if (!latest) {
      setPreviewItem(null);
      return;
    }
    setPreviewItem(latest);
  }, [items, previewItem]);

  async function handleUpload(file: File) {
    setIsUploading(true);
    try {
      const uploadedStorageKey = await uploadMicrositeAsset(eventId, file, csrfToken);
      const refreshed = await listMicrositeMedia(eventId, kind);
      setItems(refreshed);
      const uploadedItem = refreshed.find((item) => item.storageKey === uploadedStorageKey);
      if (uploadedItem) {
        setPreviewItem(uploadedItem);
      }
      toast.success("Upload complete");
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(item: MicrositeMediaItem) {
    if (deletingId) return;
    setDeletingId(item.id);
    try {
      await deleteMicrositeAsset(eventId, item.id, csrfToken);
      setItems((prev) => prev.filter((current) => current.id !== item.id));
      if (previewItem?.id === item.id) {
        setPreviewItem(null);
      }
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }

  function handleUseAsset(item: MicrositeMediaItem) {
    onSelect(item.storageKey);
    onOpenChange(false);
  }

  async function handleCopyStorageKey(item: MicrositeMediaItem) {
    try {
      await navigator.clipboard.writeText(item.storageKey);
      toast.success("Asset key copied");
    } catch {
      toast.error("Unable to copy key");
    }
  }

  function handleOpenAsset(item: MicrositeMediaItem) {
    window.open(resolveAssetUrl(item.storageKey), "_blank", "noopener,noreferrer");
  }

  const previewUrl = previewItem ? resolveAssetUrl(previewItem.storageKey) : "";
  const previewIsVideo = previewItem ? previewItem.mimeType.startsWith("video/") : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-[98vw] xl:max-w-[110rem]">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
          <DialogDescription>
            Upload, preview, and manage assets stored on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 flex-1 lg:min-w-[280px]">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
            />
          </div>
          {kind === "all" && (
            <div className="flex shrink-0 items-center gap-1 rounded-md border bg-background p-1">
              {([
                { value: "all", label: "All" },
                { value: "image", label: "Images" },
                { value: "video", label: "Videos" },
              ] as const).map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={typeFilter === option.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setTypeFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          )}
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="w-full lg:w-[190px] lg:shrink-0">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name">File name</SelectItem>
              <SelectItem value="size_desc">Largest</SelectItem>
              <SelectItem value="size_asc">Smallest</SelectItem>
            </SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            accept={kind === "video" ? "video/*" : kind === "image" ? "image/*" : "image/*,video/*"}
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              handleUpload(file);
              input.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:shrink-0"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </p>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
          <ScrollArea className="h-[440px] rounded-lg border">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No media found
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item) => {
                  const url = resolveAssetUrl(item.storageKey);
                  const isVideo = item.mimeType.startsWith("video/");
                  const isPreviewed = previewItem?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border bg-background p-2 transition-colors ${
                        isPreviewed ? "border-primary/50 ring-1 ring-primary/25" : "hover:border-primary/40"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex w-full flex-col gap-2 rounded-md text-left"
                        disabled={Boolean(deletingId)}
                        onClick={() => setPreviewItem(item)}
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                          {isVideo ? (
                            <video className="h-full w-full object-cover" src={url} muted />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt={item.originalFilename} className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium">{item.originalFilename}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {isVideo ? "Video" : "Image"}
                          </Badge>
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">{item.storageKey}</p>
                      </button>
                      <div className="mt-2 flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 flex-1 text-xs"
                          disabled={Boolean(deletingId)}
                          onClick={() => handleUseAsset(item)}
                        >
                          Use
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={Boolean(deletingId)}
                          onClick={() => setPreviewItem(item)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={Boolean(deletingId)}
                          onClick={() => {
                            void handleCopyStorageKey(item);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={Boolean(deletingId)}
                          onClick={() => {
                            if (!window.confirm("Delete this media file? This cannot be undone.")) return;
                            void handleDelete(item);
                          }}
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex h-[440px] flex-col rounded-lg border bg-background">
            {previewItem ? (
              <>
                <div className="m-3 overflow-hidden rounded-md bg-muted">
                  <div className="aspect-video">
                    {previewIsVideo ? (
                      <video className="h-full w-full object-cover" src={previewUrl} controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt={previewItem.originalFilename} className="h-full w-full object-cover" />
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto border-t px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{previewItem.originalFilename}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {previewIsVideo ? "Video" : "Image"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">Created {formatCreatedAt(previewItem.createdAt)}</p>
                  <p className="text-muted-foreground">Size {formatFileSize(previewItem.sizeBytes)}</p>
                  <div className="space-y-1">
                    <p className="font-medium">Asset key</p>
                    <p className="break-all rounded-md bg-muted px-2 py-1 font-mono text-[11px]">
                      {previewItem.storageKey}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t p-3">
                  <Button size="sm" onClick={() => handleUseAsset(previewItem)}>
                    Use asset
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleCopyStorageKey(previewItem);
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy key
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleOpenAsset(previewItem)}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open file
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Select an asset to preview it and manage actions.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
