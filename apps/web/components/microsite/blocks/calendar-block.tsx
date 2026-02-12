import { Block } from "@event-platform/shared";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { BlockSection } from "./block-section";

type CalendarItem = NonNullable<Extract<Block, { type: "CALENDAR" }>["data"]>["items"][number];
type CalendarData = Extract<Block, { type: "CALENDAR" }>["data"] & {
  heading?: string;
  description?: string;
  timezoneLabel?: string;
  layout?: "week" | "agenda" | "cards";
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const raw = value.trim();
  const plainDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDateMatch) {
    const year = Number(plainDateMatch[1]);
    const month = Number(plainDateMatch[2]);
    const day = Number(plainDateMatch[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const parsedLocal = new Date(year, month - 1, day);
    if (Number.isNaN(parsedLocal.getTime())) return null;
    return parsedLocal;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function dateKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateKey(value?: string): string | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  return dateKeyFromDate(parsed);
}

function parseTimeToMinutes(value?: string): number | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const period = match[3]?.toLowerCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (period === "pm") hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function formatMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const hour24 = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function resolveTimeRange(item: CalendarItem): string {
  const start = parseTimeToMinutes(item.startTime);
  const end = parseTimeToMinutes(item.endTime);
  if (start !== null && end !== null && end > start) {
    return `${formatMinutes(start)} - ${formatMinutes(end)}`;
  }
  if (start !== null) return formatMinutes(start);
  if (end !== null) return formatMinutes(end);
  return "All day";
}

function formatDayHeader(key: string): string {
  const parsed = parseDate(`${key}T00:00:00`);
  if (!parsed) return key;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function expandDayRange(startKey: string, endKey?: string): string[] {
  const start = parseDate(`${startKey}T00:00:00`);
  const end = endKey ? parseDate(`${endKey}T00:00:00`) : null;
  if (!start) return [startKey];
  if (!end || end.getTime() <= start.getTime()) return [startKey];

  const days: string[] = [];
  const cursor = new Date(start);
  const maxSpan = 31;
  for (let i = 0; i < maxSpan && cursor.getTime() <= end.getTime(); i += 1) {
    days.push(dateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length > 0 ? days : [startKey];
}

function sortByDate(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => {
    const aDate = parseDate(a.date ?? "");
    const bDate = parseDate(b.date ?? "");
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    if (aDate) return -1;
    if (bDate) return 1;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
}

export function CalendarBlock({
  block,
}: {
  block: Extract<Block, { type: "CALENDAR" }>;
}) {
  const data = (block.data || {}) as CalendarData;
  const heading = data.heading?.trim() || "Event Calendar";
  const description = data.description?.trim();
  const timezoneLabel = data.timezoneLabel?.trim();
  const items = sortByDate((data.items ?? []) as CalendarItem[]);

  if (items.length === 0) return null;

  const dayKeys = Array.from(
    new Set(
      items
        .map((item) => normalizeDateKey(item.date))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => {
    const aDate = parseDate(`${a}T00:00:00`);
    const bDate = parseDate(`${b}T00:00:00`);
    if (!aDate || !bDate) return a.localeCompare(b);
    return aDate.getTime() - bDate.getTime();
  });

  const days = dayKeys.length > 0 ? dayKeys : [dateKeyFromDate(new Date())];

  const timedMinutes = items
    .flatMap((item) => [parseTimeToMinutes(item.startTime), parseTimeToMinutes(item.endTime)])
    .filter((value): value is number => value !== null);
  const minMinute = timedMinutes.length > 0 ? Math.min(...timedMinutes) : 8 * 60;
  const maxMinute = timedMinutes.length > 0 ? Math.max(...timedMinutes) : 18 * 60;

  let startHour = Math.max(0, Math.floor(minMinute / 60) - 1);
  let endHour = Math.min(24, Math.ceil(maxMinute / 60) + 1);
  if (endHour - startHour < 8) {
    endHour = Math.min(24, startHour + 8);
  }
  if (endHour - startHour < 8) {
    startHour = Math.max(0, endHour - 8);
  }

  const totalHours = Math.max(1, endHour - startHour);
  const naturalTimelineHeight = totalHours * 68;
  const timelineHeight = `max(380px, min(${naturalTimelineHeight}px, calc(100svh - 16rem)))`;
  const totalTimelineMinutes = totalHours * 60;
  const gridTemplateColumns = `80px repeat(${days.length}, minmax(180px, 1fr))`;

  const allDayByDay = new Map<string, CalendarItem[]>();
  const timedByDay = new Map<string, CalendarItem[]>();
  for (const day of days) {
    allDayByDay.set(day, []);
    timedByDay.set(day, []);
  }

  for (const item of items) {
    const startKey = normalizeDateKey(item.date);
    if (!startKey) continue;
    const endKey = normalizeDateKey(item.endDate) ?? undefined;
    const targetDays = expandDayRange(startKey, endKey);
    const hasTimedRange =
      parseTimeToMinutes(item.startTime) !== null || parseTimeToMinutes(item.endTime) !== null;

    for (const day of targetDays) {
      if (!allDayByDay.has(day) && !timedByDay.has(day)) continue;
      if (hasTimedRange) {
        timedByDay.get(day)?.push(item);
      } else {
        allDayByDay.get(day)?.push(item);
      }
    }
  }

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      <div className="mb-9 space-y-3 text-center">
        <h2 className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">{heading}</h2>
        {description && <p className="mx-auto max-w-3xl text-base text-[var(--mm-text-muted)] md:text-lg">{description}</p>}
        {timezoneLabel && (
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">Timezone: {timezoneLabel}</p>
        )}
      </div>

      <div className="microsite-card overflow-hidden">
        <div className="overflow-x-auto overflow-y-hidden">
          <div style={{ minWidth: `${80 + days.length * 180}px` }}>
            <div className="grid border-b border-[var(--mm-border)] bg-[var(--mm-soft)]" style={{ gridTemplateColumns }}>
              <div className="px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                Time
              </div>
              {days.map((day) => (
                <div key={day} className="border-l border-[var(--mm-border)] px-3 py-3">
                  <p className="text-sm font-semibold text-[var(--mm-text)]">{formatDayHeader(day)}</p>
                </div>
              ))}
            </div>

            {days.some((day) => (allDayByDay.get(day) ?? []).length > 0) && (
              <div className="grid border-b border-[var(--mm-border)] bg-[var(--mm-surface)]" style={{ gridTemplateColumns }}>
                <div className="px-2 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                  All Day
                </div>
                {days.map((day) => (
                  <div key={`all-day-${day}`} className="border-l border-[var(--mm-border)] px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(allDayByDay.get(day) ?? []).map((item, idx) => (
                        <span
                          key={`${day}-all-day-item-${idx}`}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2 py-1 text-[11px] font-medium text-[var(--mm-text)]"
                          title={item.title ?? undefined}
                        >
                          <CalendarDays className="h-3 w-3 shrink-0 text-[var(--mm-accent)]" />
                          <span className="truncate">{item.title || "Untitled"}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid bg-[var(--mm-surface)]" style={{ gridTemplateColumns }}>
              <div className="relative overflow-hidden border-r border-[var(--mm-border)]" style={{ height: timelineHeight }}>
                {Array.from({ length: totalHours }).map((_, idx) => {
                  const minuteValue = (startHour + idx) * 60;
                  return (
                    <div
                      key={`time-marker-${idx}`}
                      className="absolute left-0 right-0 px-2 text-[11px] text-[var(--mm-text-muted)]"
                      style={{ top: `calc(${(idx / totalHours) * 100}% + 4px)` }}
                    >
                      {formatMinutes(minuteValue)}
                    </div>
                  );
                })}
              </div>

              {days.map((day) => (
                <div
                  key={`calendar-day-${day}`}
                  className="relative overflow-hidden border-l border-[var(--mm-border)]"
                  style={{ height: timelineHeight }}
                >
                  {Array.from({ length: totalHours + 1 }).map((_, lineIdx) => (
                    <div
                      key={`${day}-line-${lineIdx}`}
                      className="absolute left-0 right-0 border-t border-[color-mix(in_oklab,var(--mm-border)_85%,transparent)]"
                      style={{ top: `${(lineIdx / totalHours) * 100}%` }}
                    />
                  ))}

                  {(timedByDay.get(day) ?? []).map((item, itemIdx) => {
                    const parsedStart = parseTimeToMinutes(item.startTime) ?? startHour * 60;
                    const parsedEnd = parseTimeToMinutes(item.endTime) ?? parsedStart + 60;
                    const safeStart = Math.max(startHour * 60, Math.min(endHour * 60, parsedStart));
                    const safeEnd = Math.max(safeStart + 30, Math.min(endHour * 60, parsedEnd));
                    const top = ((safeStart - startHour * 60) / totalTimelineMinutes) * 100;
                    const height = ((safeEnd - safeStart) / totalTimelineMinutes) * 100;
                    const showMeta = safeEnd - safeStart >= 75;

                    return (
                      <article
                        key={`${day}-item-${itemIdx}`}
                        className="absolute left-1.5 right-1.5 overflow-hidden rounded-lg border px-2 py-1.5 text-[11px] shadow-sm"
                        style={{
                          top: `${top}%`,
                          height: `max(32px, ${height}%)`,
                          borderColor: "color-mix(in oklab, var(--mm-accent) 45%, var(--mm-border) 55%)",
                          background: "color-mix(in oklab, var(--mm-accent) 12%, var(--mm-surface) 88%)",
                        }}
                      >
                        <p className="truncate font-semibold text-[var(--mm-text)]">{item.title || "Untitled event"}</p>
                        <p className="truncate text-[var(--mm-text-muted)]">{resolveTimeRange(item)}</p>
                        {showMeta && item.location && (
                          <p className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[var(--mm-text-muted)]">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{item.location}</span>
                          </p>
                        )}
                        {showMeta && item.cta?.label && item.cta?.href && (
                          <Link
                            href={item.cta.href}
                            target={isExternalHref(item.cta.href) ? "_blank" : undefined}
                            rel={isExternalHref(item.cta.href) ? "noopener noreferrer" : undefined}
                            className="mt-1 inline-flex text-[11px] font-semibold text-[var(--mm-accent)] hover:underline"
                          >
                            {item.cta.label}
                          </Link>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </BlockSection>
  );
}
