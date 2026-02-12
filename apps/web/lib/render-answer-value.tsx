import type { ReactNode } from "react";
import { FileAnswerLinks } from "@/components/files/FileAnswerLinks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderPrimitive(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function renderFileLike(value: Record<string, unknown>): ReactNode | null {
  const url =
    typeof value.url === "string"
      ? value.url
      : typeof value.publicUrl === "string"
      ? value.publicUrl
      : typeof value.href === "string"
      ? value.href
      : null;

  if (!url) return null;

  const label =
    (typeof value.name === "string" && value.name) ||
    (typeof value.fileName === "string" && value.fileName) ||
    "Open file";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline break-all"
    >
      {label}
    </a>
  );
}

interface FileAnswerRef {
  fileObjectId: string;
  originalFilename?: string;
  sizeBytes?: number;
}

interface RenderAnswerOptions {
  eventId?: string;
  verification?: {
    applicationId: string;
    stepId: string;
    submissionVersionId: string;
    fieldKey: string;
  };
}

function extractFileAnswerRef(value: Record<string, unknown>): FileAnswerRef | null {
  if (typeof value.fileObjectId !== "string" || value.fileObjectId.trim().length === 0) {
    return null;
  }

  return {
    fileObjectId: value.fileObjectId,
    originalFilename:
      typeof value.originalFilename === "string" ? value.originalFilename : undefined,
    sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : undefined,
  };
}

function renderFileAnswerRef(fileRef: FileAnswerRef, options?: RenderAnswerOptions): ReactNode {
  if (options?.eventId) {
    return (
      <FileAnswerLinks
        eventId={options.eventId}
        fileObjectId={fileRef.fileObjectId}
        originalFilename={fileRef.originalFilename}
        sizeBytes={fileRef.sizeBytes}
        verification={options.verification}
      />
    );
  }

  return (
    <div className="rounded bg-muted/40 px-2 py-2">
      <p className="text-sm font-medium break-all">
        {fileRef.originalFilename || `file-${fileRef.fileObjectId}`}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{fileRef.fileObjectId}</p>
    </div>
  );
}

export function renderAnswerValue(value: unknown, options?: RenderAnswerOptions): ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  const primitive = renderPrimitive(value);
  if (primitive) return <span className="whitespace-pre-wrap">{primitive}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
      <div className="space-y-1">
        {value.map((item, idx) => (
          <div key={idx} className="rounded bg-muted/40 px-2 py-1">
            {renderAnswerValue(item, options)}
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const fileRef = extractFileAnswerRef(value);
    if (fileRef) return renderFileAnswerRef(fileRef, options);

    const fileLike = renderFileLike(value);
    if (fileLike) return fileLike;

    return (
      <pre className="whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <span>{String(value)}</span>;
}
