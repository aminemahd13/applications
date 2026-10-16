export const DATE_OF_BIRTH_MIN = "1900-01-01";
export const DATE_OF_BIRTH_INVALID_MESSAGE = "Please enter a valid date of birth.";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Today's date in the browser's time zone, as "YYYY-MM-DD" (for `max`). */
export function todayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isRealCalendarDate(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Error message for a date-of-birth input value, or null when it can be saved.
 * Empty is allowed (the field is left unchanged). Otherwise it must be a real
 * "YYYY-MM-DD" date between 1900-01-01 and today.
 */
export function validateDateOfBirthInput(
  value: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!isRealCalendarDate(trimmed)) return DATE_OF_BIRTH_INVALID_MESSAGE;
  // Same-length "YYYY-MM-DD" strings compare in date order.
  if (trimmed < DATE_OF_BIRTH_MIN || trimmed > todayIsoDate(now)) {
    return DATE_OF_BIRTH_INVALID_MESSAGE;
  }
  return null;
}
