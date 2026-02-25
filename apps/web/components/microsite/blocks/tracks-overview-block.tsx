import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { BookOpen, Users } from "lucide-react";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type TrackItem = NonNullable<
  Extract<Block, { type: "TRACKS_OVERVIEW" }>["data"]
>["tracks"][number];

type TracksOverviewData = Extract<Block, { type: "TRACKS_OVERVIEW" }>["data"] & {
  heading?: string;
  description?: string;
  columns?: number;
  highlightFree?: boolean;
  tracks?: TrackItem[];
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function resolveColumns(columnsRaw: unknown): string {
  const columns = Number(columnsRaw);
  if (!Number.isFinite(columns)) return "md:grid-cols-2 xl:grid-cols-3";
  if (columns <= 1) return "md:grid-cols-1";
  if (columns >= 3) return "md:grid-cols-2 xl:grid-cols-3";
  return "md:grid-cols-2";
}

export function TracksOverviewBlock({
  block,
}: {
  block: Extract<Block, { type: "TRACKS_OVERVIEW" }>;
}) {
  const data = (block.data || {}) as TracksOverviewData;
  const tracks = (data.tracks ?? []).filter((track) => Boolean(track.title || track.focus || track.audience));

  if (!data.heading && !data.description && tracks.length === 0) return null;

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
      containerClassName="space-y-8"
    >
      {(data.heading || data.description) && (
        <div className="space-y-3 text-center">
          {data.heading && (
            <MarkdownText
              content={data.heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {data.description && (
            <MarkdownText
              content={data.description}
              className="mx-auto max-w-3xl text-base leading-relaxed text-[var(--mm-text-muted)] md:text-lg"
            />
          )}
        </div>
      )}

      {tracks.length > 0 && (
        <div className={`grid grid-cols-1 gap-5 ${resolveColumns(data.columns)}`}>
          {tracks.map((track, index) => (
            <article
              key={`${track.title ?? "track"}-${index}`}
              className="microsite-card flex h-full flex-col p-5 md:p-6"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--mm-soft)] text-[var(--mm-accent)]">
                  <BookOpen className="h-4 w-4" />
                </div>
                {data.highlightFree !== false && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mm-text-muted)]">
                    Free
                  </span>
                )}
              </div>

              <MarkdownText
                content={track.title || "Track"}
                mode="inline"
                as="h3"
                className="microsite-display text-2xl font-semibold text-[var(--mm-text)]"
              />

              <div className="mt-3 space-y-2">
                {track.audience && (
                  <p className="inline-flex items-start gap-1.5 text-sm text-[var(--mm-text-muted)]">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mm-accent)]" />
                    <MarkdownText content={track.audience} mode="inline" as="span" />
                  </p>
                )}
                {track.focus && (
                  <MarkdownText
                    content={track.focus}
                    className="text-sm leading-relaxed text-[var(--mm-text-muted)]"
                  />
                )}
                {track.seats && (
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--mm-accent)]">
                    Seats: <MarkdownText content={track.seats} mode="inline" as="span" />
                  </p>
                )}
              </div>

              {track.cta?.label && track.cta?.href && (
                <div className="mt-4">
                  <Link
                    href={track.cta.href}
                    target={isExternalHref(track.cta.href) ? "_blank" : undefined}
                    rel={isExternalHref(track.cta.href) ? "noopener noreferrer" : undefined}
                    className="mm-outline-button inline-flex h-9 items-center px-3 text-xs font-semibold"
                  >
                    <MarkdownText content={track.cta.label} mode="inline" as="span" />
                  </Link>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

