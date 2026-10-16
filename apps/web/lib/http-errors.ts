export const DEFAULT_RATE_LIMIT_MESSAGE =
  "Too many requests. Please wait a moment and try again.";

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const candidate = (data as { message?: unknown }).message;
  if (typeof candidate === "string") return candidate;
  if (Array.isArray(candidate)) {
    return candidate
      .filter((item): item is string => typeof item === "string")
      .join(" ");
  }
  return "";
}

function looksLikeRawThrottleMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("throttlerexception") || normalized === "too many requests"
  );
}

function extractRetryAfterSeconds(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : null;
}

/** "45 seconds", "1 minute", "15 minutes"; null when there is no wait. */
export function formatRetryWait(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const whole = Math.ceil(seconds);
  if (whole < 60) {
    return `${whole} second${whole === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(whole / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function resolveHttpErrorMessage(
  status: number,
  data: unknown,
  fallbackMessage?: string
): string {
  const extracted = extractErrorMessage(data).trim();
  if (status === 429) {
    const wait = formatRetryWait(extractRetryAfterSeconds(data));
    if (
      !extracted ||
      looksLikeRawThrottleMessage(extracted) ||
      extracted === DEFAULT_RATE_LIMIT_MESSAGE
    ) {
      return wait
        ? `Too many requests. Please try again in ${wait}.`
        : DEFAULT_RATE_LIMIT_MESSAGE;
    }
    if (!wait) return extracted;
    const sentence = /[.!?]$/.test(extracted) ? extracted : `${extracted}.`;
    return `${sentence} Try again in ${wait}.`;
  }

  if (extracted) return extracted;
  if (fallbackMessage) return fallbackMessage;
  return `Error ${status}`;
}
