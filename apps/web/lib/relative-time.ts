// Tiny dependency-free relative-time formatter. Suited for queue-assignment
// expiry badges and similar short-fuse timestamps where seconds-level
// precision isn't required and human readability is.
//
// Examples:
//   formatRelative("2026-05-19T15:30:00Z", new Date("2026-05-19T14:00:00Z"))
//     → "in 1h 30m"
//   formatRelative("2026-05-19T13:30:00Z", new Date("2026-05-19T14:00:00Z"))
//     → "overdue by 30m"

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatChunk(diffMs: number): string {
  if (diffMs < MINUTE) return "<1m";
  if (diffMs < HOUR) {
    const minutes = Math.floor(diffMs / MINUTE);
    return `${minutes}m`;
  }
  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR);
    const minutes = Math.floor((diffMs % HOUR) / MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(diffMs / DAY);
  const hours = Math.floor((diffMs % DAY) / HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

export function formatRelative(
  target: Date | string | number,
  now: Date = new Date(),
): string {
  const targetTime =
    target instanceof Date
      ? target.getTime()
      : new Date(target).getTime();
  if (!Number.isFinite(targetTime)) return "";

  const diffMs = targetTime - now.getTime();
  if (diffMs >= 0) {
    return `in ${formatChunk(diffMs)}`;
  }
  return `overdue by ${formatChunk(-diffMs)}`;
}

export function formatExactTimestamp(target: Date | string | number): string {
  const date = target instanceof Date ? target : new Date(target);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB");
}
