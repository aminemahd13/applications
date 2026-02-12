import { Block } from "@event-platform/shared";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Megaphone } from "lucide-react";
import { BlockSection } from "./block-section";

type AnnouncementTone = "info" | "success" | "warning" | "urgent";
type AnnouncementData = Extract<Block, { type: "ANNOUNCEMENT" }>["data"] & {
  badge?: string;
  message?: string;
  tone?: AnnouncementTone;
  cta?: { label?: string; href?: string };
  secondaryCta?: { label?: string; href?: string };
};

const TONE_STYLES: Record<AnnouncementTone, { color: string; Icon: typeof Info }> = {
  info: { color: "#3b82f6", Icon: Info },
  success: { color: "#10b981", Icon: CheckCircle2 },
  warning: { color: "#f59e0b", Icon: AlertTriangle },
  urgent: { color: "#ef4444", Icon: Megaphone },
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

export function AnnouncementBlock({
  block,
}: {
  block: Extract<Block, { type: "ANNOUNCEMENT" }>;
}) {
  const data = (block.data || {}) as AnnouncementData;
  const tone = data.tone ?? "info";
  const theme = TONE_STYLES[tone];
  const message = data.message?.trim() ?? "";
  const hasPrimary = Boolean(data.cta?.label && data.cta?.href);
  const hasSecondary = Boolean(data.secondaryCta?.label && data.secondaryCta?.href);

  if (!message && !hasPrimary && !hasSecondary) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "sm",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      <div
        className="microsite-card flex flex-col gap-4 border-l-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5"
        style={{
          borderLeftColor: theme.color,
          background: `color-mix(in oklab, var(--mm-surface) 92%, ${theme.color} 8%)`,
        }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `color-mix(in oklab, ${theme.color} 22%, transparent)` }}
          >
            <theme.Icon className="h-4 w-4" style={{ color: theme.color }} />
          </div>
          <div className="min-w-0 space-y-1">
            {data.badge && (
              <span className="inline-flex rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
                {data.badge}
              </span>
            )}
            {message && <p className="text-sm leading-relaxed text-[var(--mm-text)] md:text-base">{message}</p>}
          </div>
        </div>

        {(hasPrimary || hasSecondary) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {hasPrimary && (
              <Link
                href={data.cta?.href ?? "#"}
                target={isExternalHref(data.cta?.href ?? "") ? "_blank" : undefined}
                rel={isExternalHref(data.cta?.href ?? "") ? "noopener noreferrer" : undefined}
                className="mm-primary-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                {data.cta?.label}
              </Link>
            )}
            {hasSecondary && (
              <Link
                href={data.secondaryCta?.href ?? "#"}
                target={isExternalHref(data.secondaryCta?.href ?? "") ? "_blank" : undefined}
                rel={isExternalHref(data.secondaryCta?.href ?? "") ? "noopener noreferrer" : undefined}
                className="mm-outline-button inline-flex h-10 items-center rounded-[var(--mm-button-radius)] px-4 text-sm font-semibold"
              >
                {data.secondaryCta?.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </BlockSection>
  );
}
