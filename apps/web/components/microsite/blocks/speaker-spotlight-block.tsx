"use client";

import { useState } from "react";
import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { CalendarDays, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type SpotlightSpeaker = NonNullable<Extract<Block, { type: "SPEAKER_SPOTLIGHT" }>["data"]>["speakers"][number];
type SpotlightData = Extract<Block, { type: "SPEAKER_SPOTLIGHT" }>["data"] & {
  heading?: string;
  description?: string;
  speakers?: SpotlightSpeaker[];
};

type SpotlightSpeakerRender = SpotlightSpeaker & {
  name: string;
  role: string;
  organization: string;
  bio: string;
  sessionTitle: string;
  sessionHref: string;
  avatar: string;
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function getInitials(value: string): string {
  const initials = value
    .split(" ")
    .map((token) => token.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "??";
}

export function SpeakerSpotlightBlock({
  block,
}: {
  block: Extract<Block, { type: "SPEAKER_SPOTLIGHT" }>;
}) {
  const data = (block.data || {}) as SpotlightData;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const speakers: SpotlightSpeakerRender[] = (data.speakers ?? [])
    .map((speaker) => ({
      ...speaker,
      name: String(speaker.name ?? "").trim(),
      role: String(speaker.role ?? "").trim(),
      organization: String(speaker.organization ?? "").trim(),
      bio: String(speaker.bio ?? "").trim(),
      sessionTitle: String(speaker.sessionTitle ?? "").trim(),
      sessionHref: String(speaker.sessionHref ?? "").trim(),
      avatar: resolveAssetUrl(speaker.assetKey || speaker.imageUrl || ""),
    }))
    .filter((speaker) => Boolean(speaker.name || speaker.sessionTitle || speaker.bio));

  if (speakers.length === 0) return null;

  const activeSpeaker = activeIndex === null ? null : speakers[activeIndex] ?? null;

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
      {(data.heading || data.description) && (
        <div className="mb-10 max-w-3xl">
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
              className="mt-3 text-sm leading-relaxed text-[var(--mm-text-muted)] md:text-base"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {speakers.map((speaker, index) => {
          const showSessionLink = Boolean(speaker.sessionTitle && speaker.sessionHref);
          const showBioButton = Boolean(speaker.bio);

          return (
            <article key={`${speaker.name}-${index}`} className="microsite-card flex h-full flex-col p-5 md:p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)]">
                  {speaker.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={speaker.avatar} alt={speaker.name || "Speaker"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-[var(--mm-text-muted)]">
                      {getInitials(speaker.name || "Speaker")}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="microsite-display truncate text-xl font-semibold text-[var(--mm-text)]">
                    <MarkdownText content={speaker.name || "Speaker"} mode="inline" as="span" />
                  </h3>
                  {(speaker.role || speaker.organization) && (
                    <p className="truncate text-xs uppercase tracking-[0.14em] text-[var(--mm-accent)]">
                      <MarkdownText content={[speaker.role, speaker.organization].filter(Boolean).join(" | ")} mode="inline" as="span" />
                    </p>
                  )}
                </div>
              </div>

              {speaker.sessionTitle && (
                <p className="mb-4 text-sm leading-relaxed text-[var(--mm-text-muted)]">
                  Session:{" "}
                  <span className="font-semibold text-[var(--mm-text)]">
                    <MarkdownText content={speaker.sessionTitle} mode="inline" as="span" />
                  </span>
                </p>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-2">
                {showSessionLink && (
                  <Link
                    href={speaker.sessionHref}
                    target={isExternalHref(speaker.sessionHref) ? "_blank" : undefined}
                    rel={isExternalHref(speaker.sessionHref) ? "noopener noreferrer" : undefined}
                    className="mm-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold"
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    <MarkdownText content="Session" mode="inline" as="span" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  disabled={!showBioButton}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-[var(--mm-button-radius)] px-3 text-xs font-semibold transition-colors",
                    showBioButton
                      ? "bg-[var(--mm-accent)] text-white hover:opacity-90"
                      : "cursor-not-allowed bg-[var(--mm-soft)] text-[var(--mm-text-muted)]",
                  )}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  <MarkdownText content="Quick Bio" mode="inline" as="span" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog
        open={activeIndex !== null}
        onOpenChange={(open) => {
          if (!open) setActiveIndex(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {activeSpeaker && (
            <div className="space-y-4">
              <DialogTitle className="microsite-display text-2xl font-semibold text-[var(--mm-text)]">
                <MarkdownText content={activeSpeaker.name || "Speaker"} mode="inline" as="span" />
              </DialogTitle>
              {(activeSpeaker.role || activeSpeaker.organization) && (
                <DialogDescription className="text-xs uppercase tracking-[0.14em] text-[var(--mm-accent)]">
                  <MarkdownText content={[activeSpeaker.role, activeSpeaker.organization].filter(Boolean).join(" | ")} mode="inline" as="span" />
                </DialogDescription>
              )}
              {activeSpeaker.bio && (
                <MarkdownText
                  content={activeSpeaker.bio}
                  className="text-sm leading-relaxed text-[var(--mm-text-muted)]"
                />
              )}
              {activeSpeaker.sessionTitle && activeSpeaker.sessionHref && (
                <Link
                  href={activeSpeaker.sessionHref}
                  target={isExternalHref(activeSpeaker.sessionHref) ? "_blank" : undefined}
                  rel={isExternalHref(activeSpeaker.sessionHref) ? "noopener noreferrer" : undefined}
                  className="mm-primary-button inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
                >
                  <CalendarDays className="h-4 w-4" />
                  <MarkdownText content="View Session" mode="inline" as="span" />
                </Link>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BlockSection>
  );
}
