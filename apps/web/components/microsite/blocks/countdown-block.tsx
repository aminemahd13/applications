"use client";

import { Block } from "@event-platform/shared";
import Link from "next/link";
import { Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BlockSection } from "./block-section";

type CountdownMilestone = {
  label?: string;
  value?: string;
};

type CountdownData = Extract<Block, { type: "COUNTDOWN" }>["data"] & {
  title?: string;
  subtitle?: string;
  targetDate?: string;
  timezoneLabel?: string;
  showSeconds?: boolean;
  endedLabel?: string;
  cta?: { label?: string; href?: string };
  secondaryCta?: { label?: string; href?: string };
  milestones?: CountdownMilestone[];
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function toParts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function formatUnit(value: number): string {
  return value.toString().padStart(2, "0");
}

export function CountdownBlock({
  block,
}: {
  block: Extract<Block, { type: "COUNTDOWN" }>;
}) {
  const data = (block.data || {}) as CountdownData;
  const [now, setNow] = useState<number | null>(null);
  const targetTs = useMemo(() => {
    if (!data.targetDate) return null;
    const parsed = Date.parse(data.targetDate);
    return Number.isFinite(parsed) ? parsed : null;
  }, [data.targetDate]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!targetTs) {
    return (
      <BlockSection
        block={block}
        defaults={{
          paddingY: "lg",
          paddingX: "lg",
          width: "normal",
          align: "center",
          backgroundClass: "bg-transparent",
        }}
      >
        <div className="microsite-card space-y-2 px-6 py-8 text-center">
          <p className="text-lg font-semibold text-[var(--mm-text)]">Countdown target date is missing</p>
          <p className="text-sm text-[var(--mm-text-muted)]">
            Set a valid ISO date like <code>2026-08-24T09:00:00Z</code> in this block.
          </p>
        </div>
      </BlockSection>
    );
  }

  const millisecondsLeft = Math.max(0, targetTs - (now ?? targetTs));
  const isEnded = now !== null && now >= targetTs;
  const parts = toParts(millisecondsLeft);
  const title = typeof data.title === "string" ? data.title.trim() : "Event starts in";
  const endedLabel = data.endedLabel?.trim() || "The event is live.";
  const subtitle = data.subtitle?.trim();
  const milestones = data.milestones ?? [];
  const showSeconds = Boolean(data.showSeconds);
  const timeUnits = [
    { key: "days", label: "Days", value: formatUnit(parts.days) },
    { key: "hours", label: "Hours", value: formatUnit(parts.hours) },
    { key: "minutes", label: "Minutes", value: formatUnit(parts.minutes) },
    ...(showSeconds ? [{ key: "seconds", label: "Seconds", value: formatUnit(parts.seconds) }] : []),
  ];

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "normal",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
    >
      <div className="microsite-card space-y-7 px-6 py-8 text-center md:px-10 md:py-10">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--mm-soft)] text-[var(--mm-accent)]">
          <Timer className="h-6 w-6" />
        </div>
        {(title || subtitle) && (
          <div className="space-y-2">
            {title && <h2 className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">{title}</h2>}
            {subtitle && <p className="text-base text-[var(--mm-text-muted)] md:text-lg">{subtitle}</p>}
          </div>
        )}

        {!isEnded ? (
          <div className={`grid gap-3 ${showSeconds ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            {timeUnits.map((unit) => (
              <div key={unit.key} className="rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-soft)] px-3 py-4">
                <p className="text-3xl font-semibold leading-none text-[var(--mm-text)] md:text-4xl">{unit.value}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mm-text-muted)]">{unit.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-soft)] px-4 py-5">
            <p className="text-lg font-semibold text-[var(--mm-text)]">{endedLabel}</p>
          </div>
        )}

        {data.timezoneLabel && (
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
            Timezone: {data.timezoneLabel}
          </p>
        )}

        {milestones.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {milestones.map((milestone, idx) => (
              <span key={idx} className="inline-flex rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-1.5 text-xs font-medium text-[var(--mm-text-muted)]">
                {milestone.label}
                {milestone.value ? `: ${milestone.value}` : ""}
              </span>
            ))}
          </div>
        )}

        {(data.cta?.label || data.secondaryCta?.label) && (
          <div className="flex flex-wrap justify-center gap-2">
            {data.cta?.label && (
              <Link
                href={data.cta.href ?? "#"}
                target={isExternalHref(data.cta.href ?? "") ? "_blank" : undefined}
                rel={isExternalHref(data.cta.href ?? "") ? "noopener noreferrer" : undefined}
                className="mm-primary-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                {data.cta.label}
              </Link>
            )}
            {data.secondaryCta?.label && (
              <Link
                href={data.secondaryCta.href ?? "#"}
                target={isExternalHref(data.secondaryCta.href ?? "") ? "_blank" : undefined}
                rel={isExternalHref(data.secondaryCta.href ?? "") ? "noopener noreferrer" : undefined}
                className="mm-outline-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                {data.secondaryCta.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </BlockSection>
  );
}
