"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

interface FileAnswerLinksProps {
  eventId: string;
  fileObjectId: string;
  originalFilename?: string;
  sizeBytes?: number;
  verification?: {
    applicationId: string;
    stepId: string;
    submissionVersionId: string;
    fieldKey: string;
  };
}

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function openInNewTab(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

export function FileAnswerLinks({
  eventId,
  fileObjectId,
  originalFilename,
  sizeBytes,
  verification,
}: FileAnswerLinksProps) {
  const { csrfToken } = useAuth();
  const [isOpening, setIsOpening] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const displayName = originalFilename?.trim() || `file-${fileObjectId}`;
  const displaySize = formatBytes(sizeBytes);

  async function fetchSignedUrl(download = false) {
    const query = download ? "?download=1" : "";
    const response = await apiClient<{ url: string }>(
      `/events/${eventId}/files/${fileObjectId}/url${query}`,
    );
    return response.url;
  }

  async function ensureVerified(): Promise<boolean> {
    if (!verification || isVerified) return true;

    setIsVerifying(true);
    try {
      await apiClient(
        `/events/${eventId}/applications/${verification.applicationId}/steps/${verification.stepId}/versions/${verification.submissionVersionId}/verifications`,
        {
          method: "POST",
          body: {
            fieldKey: verification.fieldKey,
            fileObjectId,
            status: "VERIFIED",
          },
          csrfToken: csrfToken ?? undefined,
        },
      );
      setIsVerified(true);
      return true;
    } catch {
      return false;
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleView() {
    setIsOpening(true);
    try {
      const verified = await ensureVerified();
      const url = await fetchSignedUrl(false);
      openInNewTab(url);
      if (!verified) {
        toast.error("Opened file, but verification could not be recorded.");
      }
    } catch {
      toast.error("Could not open file");
    } finally {
      setIsOpening(false);
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const verified = await ensureVerified();
      const url = await fetchSignedUrl(true);
      openInNewTab(url);
      if (!verified) {
        toast.error("Downloaded file, but verification could not be recorded.");
      }
    } catch {
      toast.error("Could not download file");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="rounded bg-muted/40 px-2 py-2">
      <p className="text-sm font-medium break-all">{displayName}</p>
      {displaySize && <p className="text-xs text-muted-foreground mt-0.5">{displaySize}</p>}
      <div className="mt-1 flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={handleView}
          disabled={isOpening || isDownloading || isVerifying}
          className="underline underline-offset-2 hover:text-primary disabled:opacity-60 disabled:no-underline"
        >
          {isOpening ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Opening...
            </span>
          ) : (
            "View file"
          )}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isOpening || isDownloading || isVerifying}
          className="underline underline-offset-2 hover:text-primary disabled:opacity-60 disabled:no-underline"
        >
          {isDownloading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Preparing...
            </span>
          ) : (
            "Download file"
          )}
        </button>
      </div>
    </div>
  );
}
