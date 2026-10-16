const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a strict calendar date "YYYY-MM-DD" to UTC midnight.
 *
 * Returns null for anything else: other formats, expanded years ("20009-01-30"),
 * dates that don't exist ("2009-02-30") and years before 0100 (Date.UTC maps
 * 0-99 to 1900-1999, which the round-trip check rejects).
 */
export function parseDateOnlyStrict(value: string): Date | null {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
