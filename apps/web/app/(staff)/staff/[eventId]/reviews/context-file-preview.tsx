"use client";

import { useId, useState } from "react";
import {
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileIcon,
  FileImage,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiClient } from "@/lib/api";
import {
  describeMimeType,
  formatFileSize,
  getFreshSignedUrl,
  getPreviewKind,
  parseSignedUrlResponse,
  signedUrlCacheKey,
  type SignedUrlEntry,
} from "@/lib/review-context";

/*
 * View-only file access for the applicant-info panel.
 *
 * - Never calls the `/verifications` endpoint: looking at a file here must not
 *   mark it verified (that only happens from the main review card).
 * - Every signed-URL fetch writes a FILE_ACCESS audit row server-side, so the
 *   inline (no-disposition) URL is cached per file until shortly before it
 *   expires; toggling a preview or re-opening the panel doesn't refetch.
 * - Inline rendering and "Open in new tab" are limited to an allow-list of
 *   server-recorded MIME types (images + PDF). Everything else is download-only
 *   (attachment disposition), so HTML/SVG uploads never render from storage.
 */

const inlineUrlCache = new Map<string, SignedUrlEntry>();
const inlineUrlRequests = new Map<string, Promise<string>>();

function getInlineSignedUrl(eventId: string, fileObjectId: string): Promise<string> {
  const key = signedUrlCacheKey(eventId, fileObjectId);
  const cached = getFreshSignedUrl(inlineUrlCache, key);
  if (cached) return Promise.resolve(cached);

  const pending = inlineUrlRequests.get(key);
  if (pending) return pending;

  const request = apiClient<unknown>(
    `/events/${eventId}/files/${fileObjectId}/url`,
  )
    .then((response) => {
      const entry = parseSignedUrlResponse(response);
      if (!entry) throw new Error("The server did not return a file URL.");
      inlineUrlCache.set(key, entry);
      return entry.url;
    })
    .finally(() => {
      inlineUrlRequests.delete(key);
    });
  inlineUrlRequests.set(key, request);
  return request;
}

async function getDownloadSignedUrl(
  eventId: string,
  fileObjectId: string,
): Promise<string> {
  const response = await apiClient<unknown>(
    `/events/${eventId}/files/${fileObjectId}/url?download=1`,
  );
  const entry = parseSignedUrlResponse(response);
  if (!entry) throw new Error("The server did not return a file URL.");
  return entry.url;
}

// Same popup-blocker-friendly pattern as FileAnswerLinks.
function openInNewTab(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

function toastUnlessAlreadyReported(error: unknown, message: string) {
  // apiClient already toasts HTTP errors; only report network/parse failures.
  if (!(error instanceof ApiError)) toast.error(message);
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" };

export interface ContextFilePreviewProps {
  eventId: string;
  fileObjectId: string;
  filename: string;
  sizeBytes: number | null;
  /** Server-recorded MIME type; null when unknown (download only). */
  mimeType: string | null;
}

export function ContextFilePreview({
  eventId,
  fileObjectId,
  filename,
  sizeBytes,
  mimeType,
}: ContextFilePreviewProps) {
  const previewKind = getPreviewKind(mimeType);
  const previewRegionId = useId();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [mediaFailed, setMediaFailed] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const meta = [describeMimeType(mimeType), formatFileSize(sizeBytes)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const Icon =
    previewKind === "image" ? FileImage : previewKind === "pdf" ? FileText : FileIcon;

  async function loadPreview() {
    setMediaFailed(false);
    const cached = getFreshSignedUrl(
      inlineUrlCache,
      signedUrlCacheKey(eventId, fileObjectId),
    );
    if (cached) {
      setPreview({ status: "ready", url: cached });
      return;
    }
    setPreview({ status: "loading" });
    try {
      const url = await getInlineSignedUrl(eventId, fileObjectId);
      setPreview({ status: "ready", url });
    } catch {
      setPreview({ status: "error" });
    }
  }

  function togglePreview() {
    if (isPreviewOpen) {
      setIsPreviewOpen(false);
      return;
    }
    setIsPreviewOpen(true);
    void loadPreview();
  }

  async function handleOpenInNewTab() {
    const cached = getFreshSignedUrl(
      inlineUrlCache,
      signedUrlCacheKey(eventId, fileObjectId),
    );
    if (cached) {
      openInNewTab(cached);
      return;
    }
    setIsOpening(true);
    try {
      openInNewTab(await getInlineSignedUrl(eventId, fileObjectId));
    } catch (error) {
      toastUnlessAlreadyReported(error, "Could not open file");
    } finally {
      setIsOpening(false);
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      openInNewTab(await getDownloadSignedUrl(eventId, fileObjectId));
    } catch (error) {
      toastUnlessAlreadyReported(error, "Could not download file");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2 whitespace-normal">
      <div className="flex items-start gap-2">
        <Icon
          className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-all">{filename}</p>
          {meta && <p className="text-muted-foreground text-xs">{meta}</p>}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {previewKind && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={togglePreview}
            aria-expanded={isPreviewOpen}
            aria-controls={isPreviewOpen ? previewRegionId : undefined}
          >
            {isPreviewOpen ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
            {isPreviewOpen ? "Hide preview" : "Preview"}
          </Button>
        )}
        {previewKind && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              void handleOpenInNewTab();
            }}
            disabled={isOpening}
          >
            {isOpening ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink aria-hidden="true" />
            )}
            Open in new tab
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            void handleDownload();
          }}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Download
        </Button>
      </div>

      {previewKind && isPreviewOpen && (
        <div id={previewRegionId} className="mt-2">
          {preview.status === "ready" ? (
            previewKind === "image" ? (
              mediaFailed ? (
                <p className="text-muted-foreground text-xs">
                  This image could not be displayed. Try downloading it instead.
                </p>
              ) : (
                // Signed storage URL: next/image would proxy and cache it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={filename}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  onError={() => setMediaFailed(true)}
                  className="bg-muted/40 max-h-80 w-full rounded-md border object-contain"
                />
              )
            ) : (
              <div className="space-y-1">
                <iframe
                  src={preview.url}
                  title={filename}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="bg-muted/40 aspect-[1/1.414] w-full rounded-md border"
                />
                <p className="text-muted-foreground text-xs">
                  PDF not showing?{" "}
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Open it in a new tab
                  </a>
                  .
                </p>
              </div>
            )
          ) : preview.status === "error" ? (
            <div className="text-xs" role="alert">
              <span className="text-destructive">Preview could not be loaded.</span>{" "}
              <button
                type="button"
                onClick={() => {
                  void loadPreview();
                }}
                className="text-primary underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <div
              className="bg-muted/40 text-muted-foreground flex h-24 items-center justify-center gap-2 rounded-md border text-xs"
              role="status"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Loading preview…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
