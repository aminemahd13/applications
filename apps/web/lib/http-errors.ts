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

export function resolveHttpErrorMessage(
  status: number,
  data: unknown,
  fallbackMessage?: string
): string {
  const extracted = extractErrorMessage(data).trim();
  if (status === 429) {
    if (!extracted || looksLikeRawThrottleMessage(extracted)) {
      return DEFAULT_RATE_LIMIT_MESSAGE;
    }
    return extracted;
  }

  if (extracted) return extracted;
  if (fallbackMessage) return fallbackMessage;
  return `Error ${status}`;
}
