export enum EmailFailureClass {
  RATE_LIMIT = 'RATE_LIMIT',
  RETRYABLE = 'RETRYABLE',
  PERMANENT = 'PERMANENT',
}

export interface ClassifiedEmailSendError {
  classification: EmailFailureClass;
  reason: string;
  retryAfterMs?: number;
  responseCode?: number;
  code?: string;
}

type UnknownRecord = Record<string, unknown>;

const RETRYABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNRESET',
  'EAI_AGAIN',
  'ESOCKET',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

const PERMANENT_ERROR_CODES = new Set(['EAUTH', 'EENVELOPE', 'EINVALIDLOGIN']);

const RATE_LIMIT_SIGNAL_PATTERN =
  /(rate[\s-]?limit|too many|throttl|slow down|quota|exceeded sending|try again later|temporarily deferred|4\.7\.\d)/i;

const PERMANENT_SIGNAL_PATTERN =
  /(invalid recipient|unknown user|mailbox unavailable|recipient address rejected|denied|blacklist|blocked)/i;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(Math.round(value), 24 * 60 * 60 * 1000);
}

function parseRetryAfterFromText(text: string): number | null {
  const patterns = [
    /retry(?:-after)?\s*[:=]?\s*(\d+)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?/i,
    /try again in\s+(\d+)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)?/i,
    /wait\s+(\d+)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\s+before/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const unit = (match[2] ?? 'seconds').toLowerCase();
    const multiplier =
      unit.startsWith('ms') || unit.startsWith('millisecond')
        ? 1
        : unit === 'm' || unit.startsWith('min')
          ? 60_000
          : unit === 'h' || unit.startsWith('hour')
            ? 3_600_000
            : 1_000;
    const maybe = clampMs(amount * multiplier);
    if (maybe) return maybe;
  }
  return null;
}

function parseRetryAfterHint(error: UnknownRecord | null, combinedText: string): number | null {
  if (!error) return parseRetryAfterFromText(combinedText);

  const directMs = asNumber(error.retryAfterMs);
  if (directMs && directMs > 0) {
    const maybe = clampMs(directMs);
    if (maybe) return maybe;
  }

  const directSeconds =
    asNumber(error.retryAfterSeconds) ??
    asNumber(error.retryAfter) ??
    asNumber(error.retry_after);
  if (directSeconds && directSeconds > 0) {
    const maybe = clampMs(directSeconds * 1_000);
    if (maybe) return maybe;
  }

  return parseRetryAfterFromText(combinedText);
}

function collectErrorText(error: UnknownRecord | null): string {
  if (!error) return '';
  const parts = [
    asString(error.message),
    asString(error.response),
    asString(error.command),
    asString(error.code),
    asString(error.name),
  ].filter((part): part is string => Boolean(part));
  return parts.join(' | ');
}

export function classifyEmailSendError(error: unknown): ClassifiedEmailSendError {
  const err = asRecord(error);
  const code = asString(err?.code)?.toUpperCase() ?? undefined;
  const responseCodeValue =
    asNumber(err?.responseCode) ?? asNumber(err?.statusCode) ?? undefined;
  const responseCode =
    typeof responseCodeValue === 'number' && Number.isFinite(responseCodeValue)
      ? Math.trunc(responseCodeValue)
      : undefined;

  const combinedText = collectErrorText(err);
  const reason =
    asString(err?.message) ??
    asString(err?.response) ??
    (error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : 'Email delivery failed');
  const retryAfterMs = parseRetryAfterHint(err, combinedText);

  const isSmtpTransient =
    typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500;
  const isExplicitRateLimited =
    responseCode === 429 ||
    responseCode === 421 ||
    responseCode === 450 ||
    responseCode === 451 ||
    responseCode === 452;
  const hasRateLimitSignal = RATE_LIMIT_SIGNAL_PATTERN.test(combinedText);

  if (hasRateLimitSignal || isExplicitRateLimited) {
    return {
      classification: EmailFailureClass.RATE_LIMIT,
      reason,
      retryAfterMs: retryAfterMs ?? undefined,
      responseCode,
      code,
    };
  }

  if (isSmtpTransient) {
    return {
      classification: EmailFailureClass.RETRYABLE,
      reason,
      retryAfterMs: retryAfterMs ?? undefined,
      responseCode,
      code,
    };
  }

  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return {
      classification: EmailFailureClass.RETRYABLE,
      reason,
      retryAfterMs: retryAfterMs ?? undefined,
      responseCode,
      code,
    };
  }

  if (
    code && PERMANENT_ERROR_CODES.has(code)
  ) {
    return {
      classification: EmailFailureClass.PERMANENT,
      reason,
      responseCode,
      code,
    };
  }

  if (
    typeof responseCode === 'number' &&
    responseCode >= 500 &&
    responseCode <= 599
  ) {
    return {
      classification: EmailFailureClass.PERMANENT,
      reason,
      responseCode,
      code,
    };
  }

  if (PERMANENT_SIGNAL_PATTERN.test(combinedText)) {
    return {
      classification: EmailFailureClass.PERMANENT,
      reason,
      responseCode,
      code,
    };
  }

  return {
    classification: EmailFailureClass.RETRYABLE,
    reason,
    retryAfterMs: retryAfterMs ?? undefined,
    responseCode,
    code,
  };
}
