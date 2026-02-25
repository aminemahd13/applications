import { Block } from "@event-platform/shared";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, UserRound } from "lucide-react";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type AgendaSession = {
  time?: string;
  endTime?: string;
  title?: string;
  speaker?: string;
  track?: string;
  location?: string;
  description?: string;
  cta?: { label?: string; href?: string };
};

type AgendaDay = {
  label?: string;
  date?: string;
  title?: string;
  sessions?: AgendaSession[];
};

type AgendaData = Extract<Block, { type: "AGENDA" }>["data"] & {
  heading?: string;
  description?: string;
  layout?: "stacked" | "split";
  days?: AgendaDay[];
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function resolveSessionTime(session: AgendaSession): string {
  if (session.time && session.endTime) return `${session.time} - ${session.endTime}`;
  return session.time || session.endTime || "TBD";
}

export function AgendaBlock({
  block,
}: {
  block: Extract<Block, { type: "AGENDA" }>;
}) {
  const data = (block.data || {}) as AgendaData;
  const heading = typeof data.heading === "string" ? data.heading.trim() : "Event Agenda";
  const description = data.description?.trim();
  const days = data.days ?? [];
  const layout = data.layout ?? "stacked";

  if (days.length === 0) return null;

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
      {(heading || description) && (
        <div className="mb-10 space-y-3 text-center">
          {heading && (
            <MarkdownText
              content={heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {description && (
            <MarkdownText
              content={description}
              className="mx-auto max-w-3xl text-base text-[var(--mm-text-muted)] md:text-lg"
            />
          )}
        </div>
      )}

      <div className={layout === "split" ? "grid gap-6 xl:grid-cols-2" : "space-y-6"}>
        {days.map((day, dayIdx) => {
          const sessions = day.sessions ?? [];
          if (sessions.length === 0) return null;

          return (
            <article key={dayIdx} className="microsite-card overflow-hidden">
              <header className="border-b border-[var(--mm-border)] bg-[var(--mm-soft)] px-5 py-4 md:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <MarkdownText content={day.label || `Day ${dayIdx + 1}`} mode="inline" as="span" />
                  </span>
                  {day.date && (
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--mm-accent)]">
                      <MarkdownText content={day.date} mode="inline" as="span" />
                    </span>
                  )}
                </div>
                {day.title && (
                  <MarkdownText
                    content={day.title}
                    mode="inline"
                    as="h3"
                    className="microsite-display mt-3 text-2xl font-semibold text-[var(--mm-text)]"
                  />
                )}
              </header>

              <div className="divide-y divide-[var(--mm-border)]">
                {sessions.map((session, sessionIdx) => (
                  <div key={sessionIdx} className="grid gap-3 px-5 py-4 md:grid-cols-[9rem_minmax(0,1fr)] md:px-6">
                    <div className="space-y-2">
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--mm-text)]">
                        <Clock3 className="h-3.5 w-3.5 text-[var(--mm-accent)]" />
                        {resolveSessionTime(session)}
                      </p>
                      {session.track && (
                        <p className="w-fit rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-2 py-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--mm-text-muted)]">
                          <MarkdownText content={session.track} mode="inline" as="span" />
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <MarkdownText
                        content={session.title || "Session"}
                        mode="inline"
                        as="h4"
                        className="text-lg font-semibold text-[var(--mm-text)]"
                      />
                      {session.description && (
                        <MarkdownText
                          content={session.description}
                          className="text-sm leading-relaxed text-[var(--mm-text-muted)]"
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--mm-text-muted)]">
                        {session.speaker && (
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5" />
                            <MarkdownText content={session.speaker} mode="inline" as="span" />
                          </span>
                        )}
                        {session.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <MarkdownText content={session.location} mode="inline" as="span" />
                          </span>
                        )}
                      </div>
                      {session.cta?.label && session.cta?.href && (
                        <Link
                          href={session.cta.href}
                          target={isExternalHref(session.cta.href) ? "_blank" : undefined}
                          rel={isExternalHref(session.cta.href) ? "noopener noreferrer" : undefined}
                          className="mm-outline-button inline-flex h-9 items-center rounded-[var(--mm-button-radius)] px-3 text-xs font-semibold"
                        >
                          <MarkdownText content={session.cta.label} mode="inline" as="span" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </BlockSection>
  );
}
