/**
 * Upload rules for application / staff-patch form files (FileUpload):
 * the size limit, which failures are retried and how long to wait, and the
 * PUT to storage itself. Kept out of the component so it can be unit-tested.
 */

/* ---------- Size limit ---------- */

/** Hard cap per file; the API enforces the same 10 MiB. */
export const MAX_UPLOAD_FILE_SIZE_MB = 10;
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;

export interface UploadSizeLimit {
  maxBytes: number;
  maxMB: number;
}

/** The field's own `maxFileSizeMB` applies when it is smaller than the cap. */
export function resolveUploadSizeLimit(
  fieldMaxFileSizeMB?: number | null,
): UploadSizeLimit {
  if (
    typeof fieldMaxFileSizeMB === "number" &&
    Number.isFinite(fieldMaxFileSizeMB) &&
    fieldMaxFileSizeMB > 0
  ) {
    const fieldMaxBytes = Math.floor(fieldMaxFileSizeMB * 1024 * 1024);
    if (fieldMaxBytes < MAX_UPLOAD_FILE_SIZE_BYTES) {
      return { maxBytes: fieldMaxBytes, maxMB: fieldMaxFileSizeMB };
    }
  }
  return {
    maxBytes: MAX_UPLOAD_FILE_SIZE_BYTES,
    maxMB: MAX_UPLOAD_FILE_SIZE_MB,
  };
}

export function formatUploadLimitMB(limit: UploadSizeLimit): string {
  return String(Math.round(limit.maxMB * 100) / 100);
}

export function isFileTooLarge(sizeBytes: number, limit: UploadSizeLimit): boolean {
  return sizeBytes > limit.maxBytes;
}

export function fileTooLargeMessage(limit: UploadSizeLimit): string {
  return `File too large (max ${formatUploadLimitMB(limit)} MB).`;
}

/* ---------- Failures and retries ---------- */

export const UPLOAD_MAX_ATTEMPTS = 3;
/** Wait before attempt 2, then before attempt 3. */
export const UPLOAD_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];
/** No upload progress for this long aborts the attempt. */
export const UPLOAD_STALL_TIMEOUT_MS = 30_000;
/** Minimum wait for storage to answer once the browser has sent the body. */
export const STORAGE_RESPONSE_TIMEOUT_MS = 60_000;
/**
 * Browsers report the body as "sent" once it is in the OS buffers, so on a
 * slow link the last part can still be in transit. Large files get extra
 * time, assuming at least 50 KiB/s, so they are not aborted while uploading.
 */
const MIN_ASSUMED_UPLOAD_BYTES_PER_SECOND = 50 * 1024;

export function resolveStorageResponseTimeoutMs(sizeBytes: number): number {
  const transferAllowanceMs =
    Number.isFinite(sizeBytes) && sizeBytes > 0
      ? Math.ceil((sizeBytes / MIN_ASSUMED_UPLOAD_BYTES_PER_SECOND) * 1000)
      : 0;
  return Math.max(STORAGE_RESPONSE_TIMEOUT_MS, transferAllowanceMs);
}

export const UPLOAD_STALLED_MESSAGE =
  "Upload stalled — no data was sent for a while. Check your connection and try again.";
export const UPLOAD_NETWORK_ERROR_MESSAGE =
  "Network error during upload. Check your connection and try again.";
export const UPLOAD_NO_RESPONSE_MESSAGE =
  "Storage did not respond. Check your connection and try again.";
export const UPLOAD_CANCELLED_MESSAGE = "Upload cancelled.";

export type StorageUploadFailure =
  | "network"
  | "stall"
  | "response-timeout"
  | "http"
  | "cancelled";

export class StorageUploadError extends Error {
  constructor(
    public readonly failure: StorageUploadFailure,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "StorageUploadError";
  }
}

function cancelledError(): StorageUploadError {
  return new StorageUploadError("cancelled", UPLOAD_CANCELLED_MESSAGE);
}

/** 0 = no response; 408/429 and 5xx are transient. Other 4xx are final. */
export function isRetryableStorageStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function isRetryableStorageUploadError(error: unknown): boolean {
  if (!(error instanceof StorageUploadError)) return false;
  switch (error.failure) {
    case "network":
    case "stall":
    case "response-timeout":
      return true;
    case "http":
      return isRetryableStorageStatus(error.status ?? 0);
    default:
      return false;
  }
}

/**
 * Commit is idempotent server-side, so it is retried when the request never
 * got an answer (fetch throws a TypeError) or the server failed (5xx).
 */
export function isRetryableCommitError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const status =
    typeof error === "object" && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number" && status >= 500 && status <= 599;
}

/** Resolves after `ms`; rejects at once (cancelled) if `signal` aborts. */
export function sleepUnlessAborted(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RetryOptions {
  isRetryable: (error: unknown) => boolean;
  signal?: AbortSignal;
  maxAttempts?: number;
  delaysMs?: readonly number[];
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * Runs `task` up to `maxAttempts` times (default 3), waiting 1 s then 3 s
 * between attempts. Stops at the first non-retryable error, and never
 * retries once `signal` has aborted.
 */
export async function runWithRetries<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? UPLOAD_MAX_ATTEMPTS;
  const delaysMs = options.delaysMs ?? UPLOAD_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? sleepUnlessAborted;

  for (let attempt = 1; ; attempt += 1) {
    if (options.signal?.aborted) throw cancelledError();
    try {
      return await task(attempt);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (attempt >= maxAttempts || !options.isRetryable(error)) throw error;
      const delayMs =
        delaysMs.length > 0 ? delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] : 0;
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, options.signal);
    }
  }
}

/* ---------- PUT to storage ---------- */

export interface PutFileOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
  stallMs?: number;
  responseTimeoutMs?: number;
  createXhr?: () => XMLHttpRequest;
}

/**
 * One PUT of `file` to a presigned URL with real progress (XHR, since fetch
 * cannot report upload progress). Settles exactly once:
 * - no progress for `stallMs` aborts the attempt (stall);
 * - once the body is sent, no answer within `responseTimeoutMs` aborts it
 *   (response-timeout) instead of hanging at ~98% forever;
 * - `signal` aborting cancels it.
 * Rejects with a StorageUploadError; the caller decides whether to retry.
 */
export function putFileToStorage(
  url: string,
  file: Blob,
  contentType: string,
  options: PutFileOptions = {},
): Promise<void> {
  const {
    onProgress,
    signal,
    stallMs = UPLOAD_STALL_TIMEOUT_MS,
    responseTimeoutMs = resolveStorageResponseTimeoutMs(file.size),
    createXhr = () => new XMLHttpRequest(),
  } = options;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelledError());
      return;
    }

    const xhr = createXhr();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let responseTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (stallTimer !== undefined) clearTimeout(stallTimer);
      if (responseTimer !== undefined) clearTimeout(responseTimer);
      stallTimer = undefined;
      responseTimer = undefined;
    };
    const settle = (error?: StorageUploadError) => {
      if (settled) return;
      settled = true;
      clearTimers();
      signal?.removeEventListener("abort", onAbortSignal);
      if (error) reject(error);
      else resolve();
    };
    // Settle first so the abort event fired by xhr.abort() is a no-op.
    const abortWith = (error: StorageUploadError) => {
      if (settled) return;
      settle(error);
      try {
        xhr.abort();
      } catch {
        /* already finished */
      }
    };
    const armStall = () => {
      if (settled) return;
      if (stallTimer !== undefined) clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => abortWith(new StorageUploadError("stall", UPLOAD_STALLED_MESSAGE)),
        stallMs,
      );
    };
    const onAbortSignal = () => abortWith(cancelledError());

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onloadstart = armStall;
    xhr.upload.onprogress = (event) => {
      armStall();
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    // Body fully sent: the stall watchdog only guards the transfer of bytes,
    // so swap it for a response timer.
    xhr.upload.onload = () => {
      if (settled) return;
      if (stallTimer !== undefined) clearTimeout(stallTimer);
      stallTimer = undefined;
      if (responseTimer !== undefined) clearTimeout(responseTimer);
      responseTimer = setTimeout(
        () =>
          abortWith(
            new StorageUploadError("response-timeout", UPLOAD_NO_RESPONSE_MESSAGE),
          ),
        responseTimeoutMs,
      );
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        settle();
        return;
      }
      settle(
        new StorageUploadError(
          "http",
          `Upload to storage failed (${xhr.status}).`,
          xhr.status,
        ),
      );
    };
    xhr.onerror = () =>
      settle(new StorageUploadError("network", UPLOAD_NETWORK_ERROR_MESSAGE));
    xhr.onabort = () => settle(cancelledError());

    signal?.addEventListener("abort", onAbortSignal, { once: true });
    // Also guards a browser that never fires upload events.
    armStall();
    try {
      xhr.send(file);
    } catch {
      settle(new StorageUploadError("network", UPLOAD_NETWORK_ERROR_MESSAGE));
    }
  });
}

/* ---------- One file: register -> PUT -> commit ---------- */

export interface UploadOneFileSteps {
  register: () => Promise<{ id: string; uploadUrl: string }>;
  put: (uploadUrl: string) => Promise<void>;
  commit: (fileId: string) => Promise<unknown>;
  signal?: AbortSignal;
  sleep?: RetryOptions["sleep"];
  onRetry?: (
    stage: "put" | "commit",
    info: { attempt: number; delayMs: number; error: unknown },
  ) => void;
}

/**
 * Registers once, then retries the PUT on the SAME presigned URL (valid 1 h)
 * and the idempotent commit. A retry never registers again, so it never
 * leaves an extra STAGED row behind. Returns the registered file id.
 */
export async function uploadOneFile(steps: UploadOneFileSteps): Promise<string> {
  const { id, uploadUrl } = await steps.register();
  await runWithRetries(() => steps.put(uploadUrl), {
    isRetryable: isRetryableStorageUploadError,
    signal: steps.signal,
    sleep: steps.sleep,
    onRetry: (info) => steps.onRetry?.("put", info),
  });
  await runWithRetries(() => steps.commit(id), {
    isRetryable: isRetryableCommitError,
    signal: steps.signal,
    sleep: steps.sleep,
    onRetry: (info) => steps.onRetry?.("commit", info),
  });
  return id;
}

/* ---------- Multi-file batches ---------- */

/**
 * Field value after a batch: every file that committed is kept, even when
 * others in the same batch failed. Never drops an existing file.
 */
export function mergeUploadedFiles<T>(existing: T[], uploaded: T[], limit?: number): T[] {
  const merged = [...existing, ...uploaded];
  if (typeof limit !== "number") return merged;
  return merged.slice(0, Math.max(limit, existing.length));
}

export interface FailedUpload {
  fileName: string;
  message?: string;
}

function joinFileNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more files`;
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * "a.pdf could not be uploaded. <reason>": the reason when every failure
 * shares one, otherwise "Please try again."
 */
export function describeFailedUploads(failures: FailedUpload[]): string | null {
  if (failures.length === 0) return null;
  const names = failures.map((failure) => failure.fileName);
  const reasons = Array.from(
    new Set(
      failures
        .map((failure) => (failure.message ?? "").trim())
        .filter((message) => message.length > 0),
    ),
  );
  const reason =
    reasons.length === 1 && failures.every((failure) => (failure.message ?? "").trim())
      ? asSentence(reasons[0])
      : "Please try again.";
  return `${joinFileNames(names)} could not be uploaded. ${reason}`;
}
