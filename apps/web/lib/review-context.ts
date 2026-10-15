import type {
  ReviewContextApplicant,
  ReviewContextEditedField,
  ReviewContextFile,
  ReviewContextStep,
} from "@event-platform/shared";
import { formatDateOnly, type FileAnswerRef } from "./answer-entries";

/**
 * Pure helpers for the review-queue "Applicant info" panel. Rendering lives in
 * app/(staff)/staff/[eventId]/reviews/applicant-context-panel.tsx.
 */

export const EMPTY_VALUE_PLACEHOLDER = "—";

/* ---------- Step status ---------- */

export const STEP_STATUS_LABELS: Record<string, string> = {
  LOCKED: "Locked",
  UNLOCKED: "Not submitted",
  SUBMITTED: "Submitted",
  NEEDS_REVISION: "Revision requested",
  APPROVED: "Approved",
  REJECTED_FINAL: "Rejected",
};

export const NOT_STARTED_LABEL = "Not started";

/** Badge variants from components/ui/badge.tsx used for step statuses. */
export type StepStatusBadgeVariant =
  | "success"
  | "warning"
  | "info"
  | "outline"
  | "destructive";

function humanizeStatus(status: string): string {
  const words = status.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return NOT_STARTED_LABEL;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Human label for a step state. `hasSubmission` disambiguates states that
 * can hold an earlier submission (a staff-reopened step is UNLOCKED again).
 */
export function getStepStatusLabel(
  status: string | null | undefined,
  hasSubmission: boolean,
): string {
  if (typeof status !== "string" || status.trim().length === 0) {
    return hasSubmission ? STEP_STATUS_LABELS.SUBMITTED : NOT_STARTED_LABEL;
  }
  const normalized = status.trim().toUpperCase();
  if (normalized === "UNLOCKED" && hasSubmission) return "Reopened";
  return STEP_STATUS_LABELS[normalized] ?? humanizeStatus(status);
}

export function getStepStatusBadgeVariant(
  status: string | null | undefined,
  hasSubmission: boolean,
): StepStatusBadgeVariant {
  const normalized =
    typeof status === "string" ? status.trim().toUpperCase() : "";
  switch (normalized) {
    case "APPROVED":
      return "success";
    case "SUBMITTED":
      return "info";
    case "NEEDS_REVISION":
      return "warning";
    case "REJECTED_FINAL":
      return "destructive";
    case "":
      return hasSubmission ? "info" : "outline";
    default:
      return "outline";
  }
}

export type ContextStepKind = "under-review" | "submitted" | "not-submitted";

export interface ContextStepRow {
  step: ReviewContextStep;
  /** 1-based position in the workflow list. */
  number: number;
  kind: ContextStepKind;
  statusLabel: string;
  statusVariant: StepStatusBadgeVariant;
}

/**
 * One row per workflow step, in the order the API returned them (workflow
 * order). The step under review is never expandable — its answers are in
 * the main card.
 */
export function buildContextStepRows(
  steps: ReviewContextStep[] | null | undefined,
): ContextStepRow[] {
  return (steps ?? []).map((step, index) => {
    const hasSubmission = Boolean(step.submission);
    const kind: ContextStepKind = step.isQueueItemStep
      ? "under-review"
      : hasSubmission
        ? "submitted"
        : "not-submitted";
    return {
      step,
      number: index + 1,
      kind,
      statusLabel: getStepStatusLabel(step.status, hasSubmission),
      statusVariant: getStepStatusBadgeVariant(step.status, hasSubmission),
    };
  });
}

/**
 * Edited-field key → value the applicant originally submitted (`undefined`
 * when staff added the field). JSON drops `originalValue: undefined`, so a
 * missing property means the same thing.
 */
export function buildEditedFieldMap(
  editedFields: ReviewContextEditedField[] | null | undefined,
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const field of editedFields ?? []) {
    if (!field || typeof field.key !== "string") continue;
    if (map.has(field.key)) continue;
    map.set(field.key, field.originalValue);
  }
  return map;
}

/* ---------- Applicant profile ---------- */

export interface ApplicantProfileRow {
  key:
    | "firstName"
    | "lastName"
    | "fullName"
    | "email"
    | "institution"
    | "city"
    | "country"
    | "dateOfBirth";
  label: string;
  value: string;
  isEmpty: boolean;
}

function profileValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Profile rows in display order. Only the fields reviewers are meant to see
 * (no phone, education or links). Empty values render as an em dash.
 */
export function buildApplicantProfileRows(
  applicant: ReviewContextApplicant | null | undefined,
): ApplicantProfileRow[] {
  const dateOfBirth = profileValue(applicant?.dateOfBirth);
  const firstName = profileValue(applicant?.firstName);
  const lastName = profileValue(applicant?.lastName);
  const fullName = profileValue(applicant?.fullName);
  // Older profiles only have the legacy full name: show it as one "Name" row
  // rather than two empty first/last-name rows.
  const nameRows: Array<[ApplicantProfileRow["key"], string, string | null]> =
    firstName === null && lastName === null && fullName !== null
      ? [["fullName", "Name", fullName]]
      : [
          ["firstName", "First name", firstName],
          ["lastName", "Last name", lastName],
        ];
  const rows: Array<[ApplicantProfileRow["key"], string, string | null]> = [
    ...nameRows,
    ["email", "Email", profileValue(applicant?.email)],
    ["institution", "Institution", profileValue(applicant?.institution)],
    ["city", "City", profileValue(applicant?.city)],
    ["country", "Country", profileValue(applicant?.country)],
    [
      "dateOfBirth",
      "Date of birth",
      dateOfBirth ? (formatDateOnly(dateOfBirth) ?? dateOfBirth) : null,
    ],
  ];
  return rows.map(([key, label, value]) => ({
    key,
    label,
    value: value ?? EMPTY_VALUE_PLACEHOLDER,
    isEmpty: value === null,
  }));
}

/* ---------- Files ---------- */

export const PREVIEWABLE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type PreviewKind = "image" | "pdf";

function normalizeMimeType(mimeType: unknown): string | null {
  if (typeof mimeType !== "string") return null;
  const normalized = mimeType.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Inline preview only for an exact allow-list of server-recorded MIME types.
 * Never SVG, HTML, XML, text or anything with parameters — those could run
 * script when rendered from the storage origin.
 */
export function getPreviewKind(
  mimeType: string | null | undefined,
): PreviewKind | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return null;
  if (!(PREVIEWABLE_MIME_TYPES as readonly string[]).includes(normalized)) {
    return null;
  }
  return normalized === "application/pdf" ? "pdf" : "image";
}

const MIME_TYPE_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
  "image/gif": "GIF image",
};

/** Short human label for a MIME type; unknown types are returned as-is. */
export function describeMimeType(
  mimeType: string | null | undefined,
): string | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return null;
  return MIME_TYPE_LABELS[normalized] ?? normalized;
}

export function formatFileSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export type ContextFileIndex = Map<string, ReviewContextFile>;

export function contextFileKey(stepId: string, fileObjectId: string): string {
  return `${stepId}:${fileObjectId}`;
}

/**
 * Indexes file metadata by `${stepId}:${fileObjectId}` and by bare
 * `fileObjectId` (first occurrence wins for both).
 */
export function indexContextFiles(
  files: ReviewContextFile[] | null | undefined,
): ContextFileIndex {
  const index: ContextFileIndex = new Map();
  for (const file of files ?? []) {
    if (!file || typeof file.fileObjectId !== "string") continue;
    const scopedKey = contextFileKey(file.stepId, file.fileObjectId);
    if (!index.has(scopedKey)) index.set(scopedKey, file);
    if (!index.has(file.fileObjectId)) index.set(file.fileObjectId, file);
  }
  return index;
}

export interface ContextFileMeta {
  fileObjectId: string;
  filename: string;
  sizeBytes: number | null;
  /** Server-recorded MIME type; null when the server returned no metadata. */
  mimeType: string | null;
  /** False when the context endpoint returned no metadata for this file. */
  isKnown: boolean;
}

/**
 * Metadata for one file answer: the server's record first (scoped to the
 * step, then by id), else what the answer value carries. The MIME type only
 * ever comes from the server — never from the answer or the file name.
 */
export function resolveContextFileMeta(
  index: ContextFileIndex,
  stepId: string,
  ref: FileAnswerRef,
): ContextFileMeta {
  const file =
    index.get(contextFileKey(stepId, ref.fileObjectId)) ??
    index.get(ref.fileObjectId) ??
    null;
  const filename =
    file?.originalFilename?.trim() ||
    ref.originalFilename?.trim() ||
    `file-${ref.fileObjectId}`;
  const sizeBytes =
    typeof file?.sizeBytes === "number"
      ? file.sizeBytes
      : typeof ref.sizeBytes === "number"
        ? ref.sizeBytes
        : null;
  return {
    fileObjectId: ref.fileObjectId,
    filename,
    sizeBytes,
    mimeType: file ? normalizeMimeType(file.mimeType) : null,
    isKnown: file !== null,
  };
}

/* ---------- Signed URL cache ---------- */

export interface SignedUrlEntry {
  url: string;
  expiresAt: string | number | Date;
}

/** Refetch a signed URL this long before it expires. */
export const SIGNED_URL_EXPIRY_SKEW_MS = 60_000;

function toTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    return Date.parse(value);
  }
  return Number.NaN;
}

/** True while `expiresAt` is more than `skewMs` in the future. */
export function isSignedUrlFresh(
  expiresAt: string | number | Date | null | undefined,
  now: number = Date.now(),
  skewMs: number = SIGNED_URL_EXPIRY_SKEW_MS,
): boolean {
  const expiresAtMs = toTimestamp(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - skewMs > now;
}

export function signedUrlCacheKey(eventId: string, fileObjectId: string): string {
  return `${eventId}:${fileObjectId}`;
}

/** Cached URL when still fresh; evicts and returns null otherwise. */
export function getFreshSignedUrl(
  cache: Map<string, SignedUrlEntry>,
  key: string,
  now: number = Date.now(),
): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (isSignedUrlFresh(entry.expiresAt, now)) return entry.url;
  cache.delete(key);
  return null;
}

/**
 * `GET /events/:eventId/files/:fileId/url` returns `{ url, expiresAt }`
 * (no `data` wrapper); a wrapped shape is accepted defensively.
 */
export function parseSignedUrlResponse(response: unknown): SignedUrlEntry | null {
  if (typeof response !== "object" || response === null) return null;
  const record = response as Record<string, unknown>;
  const payload =
    typeof record.url !== "string" &&
    typeof record.data === "object" &&
    record.data !== null
      ? (record.data as Record<string, unknown>)
      : record;
  if (typeof payload.url !== "string" || payload.url.length === 0) return null;
  const expiresAt =
    typeof payload.expiresAt === "string" || typeof payload.expiresAt === "number"
      ? payload.expiresAt
      : "";
  return { url: payload.url, expiresAt };
}

/* ---------- Notes ---------- */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Past timestamps as "just now" / "5m ago" / "3h ago" / "2d ago", then a
 * date ("12 May 2026") after a week. Future times (clock skew) → "just now".
 */
export function formatTimeAgo(
  target: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const time = toTimestamp(target);
  if (!Number.isFinite(time)) return "";
  const diff = now - time;
  if (diff < MINUTE_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const LEGACY_NOTE_AUTHOR = "Legacy note";

export function getNoteAuthorLabel(note: { authorName: string | null }): string {
  const name = typeof note.authorName === "string" ? note.authorName.trim() : "";
  return name.length > 0 ? name : LEGACY_NOTE_AUTHOR;
}
