export type MessageEmailDeliveryState =
  | "NOT_REQUESTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "COMPLETED_WITH_ISSUES";

export interface MessageEmailDeliverySummary {
  state: MessageEmailDeliveryState;
  totalRecipients: number;
  requestedCount: number;
  sentCount: number;
  remainingCount: number;
  deferredCount: number;
  failedFinalCount: number;
  notRequestedCount: number;
  successRatePct: number | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
}

function asNonNegativeInt(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function asIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveState(
  raw: unknown,
  requestedCount: number,
  remainingCount: number,
  failedFinalCount: number,
): MessageEmailDeliveryState {
  const normalized = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (
    normalized === "NOT_REQUESTED" ||
    normalized === "IN_PROGRESS" ||
    normalized === "COMPLETED" ||
    normalized === "COMPLETED_WITH_ISSUES"
  ) {
    return normalized as MessageEmailDeliveryState;
  }
  if (requestedCount <= 0) return "NOT_REQUESTED";
  if (remainingCount > 0) return "IN_PROGRESS";
  if (failedFinalCount > 0) return "COMPLETED_WITH_ISSUES";
  return "COMPLETED";
}

export function normalizeMessageEmailDelivery(
  raw: unknown,
  fallbackTotalRecipients = 0,
): MessageEmailDeliverySummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const safeFallbackTotal = Math.max(0, Math.floor(fallbackTotalRecipients));
    return {
      state: "NOT_REQUESTED",
      totalRecipients: safeFallbackTotal,
      requestedCount: 0,
      sentCount: 0,
      remainingCount: 0,
      deferredCount: 0,
      failedFinalCount: 0,
      notRequestedCount: safeFallbackTotal,
      successRatePct: null,
      lastAttemptAt: null,
      nextRetryAt: null,
    };
  }

  const object = raw as Record<string, unknown>;
  const totalRecipients = asNonNegativeInt(
    object.totalRecipients ?? fallbackTotalRecipients,
  );
  const requestedCount = asNonNegativeInt(object.requestedCount);
  const sentCount = asNonNegativeInt(object.sentCount);
  const remainingCount = asNonNegativeInt(object.remainingCount);
  const deferredCount = asNonNegativeInt(object.deferredCount);
  const failedFinalCount = asNonNegativeInt(object.failedFinalCount);
  const notRequestedCount = asNonNegativeInt(object.notRequestedCount);
  const successRatePct = asOptionalNumber(object.successRatePct);

  return {
    state: resolveState(
      object.state,
      requestedCount,
      remainingCount,
      failedFinalCount,
    ),
    totalRecipients,
    requestedCount,
    sentCount,
    remainingCount,
    deferredCount,
    failedFinalCount,
    notRequestedCount,
    successRatePct,
    lastAttemptAt: asIsoDateOrNull(object.lastAttemptAt),
    nextRetryAt: asIsoDateOrNull(object.nextRetryAt),
  };
}

export function emailDeliveryProgressPercent(
  summary: MessageEmailDeliverySummary,
): number {
  if (summary.requestedCount <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((summary.sentCount / summary.requestedCount) * 100)),
  );
}

export function emailDeliveryStateLabel(
  state: MessageEmailDeliveryState,
): string {
  if (state === "NOT_REQUESTED") return "Not requested";
  if (state === "IN_PROGRESS") return "In progress";
  if (state === "COMPLETED_WITH_ISSUES") return "Completed with issues";
  return "Completed";
}

