"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Upload } from "lucide-react";
import { resolveAssetUrl } from "./asset-url";
import {
  deleteMicrositeAsset,
  listMicrositeMedia,
  uploadMicrositeAsset,
  type MicrositeMediaItem,
} from "@/lib/microsite-media";
import { toast } from "sonner";

type MediaKind = "all" | "image" | "video";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.originalFilename} ${item.storageKey}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    listMicrositeMedia(eventId, kind)
      .then(setItems)
      .catch(() => toast.error("Failed to load media library"))
      .finally(() => setIsLoading(false));
  }, [eventId, kind, open]);

  async function handleUpload(file: File) {
    setIsUploading(true);
    try {
      await uploadMicrositeAsset(eventId, file, csrfToken);
      const refreshed = await listMicrositeMedia(eventId, kind);
      setItems(refreshed);
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
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
          <DialogDescription>
            Upload and reuse assets stored on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
            />
          </div>
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
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload
          </Button>
        </div>

        <ScrollArea className="h-[420px] border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No media found
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
              {filtered.map((item) => {
                const url = resolveAssetUrl(item.storageKey);
                const isVideo = item.mimeType.startsWith("video/");
                return (
                  <div
                    key={item.id}
                    className="group relative rounded-lg border bg-background p-2 text-left hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      className="flex w-full flex-col gap-2 rounded-md text-left"
                      disabled={deletingId === item.id}
                      onClick={() => {
                        onSelect(item.storageKey);
                        onOpenChange(false);
                      }}
                    >
                      <div className="relative w-full rounded-md bg-muted overflow-hidden aspect-video">
                        {isVideo ? (
                          <video className="h-full w-full object-cover" src={url} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={item.originalFilename} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium truncate">{item.originalFilename}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {isVideo ? "Video" : "Image"}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{item.storageKey}</p>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-3 top-3 h-7 w-7 text-destructive hover:text-destructive"
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
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
