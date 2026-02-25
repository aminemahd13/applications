import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Megaphone } from "lucide-react";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type AlertTone = "info" | "success" | "warning" | "urgent";
type AlertData = Extract<Block, { type: "STICKY_ALERT_BAR" }>["data"] & {
  badge?: string;
  message?: string;
  tone?: AlertTone;
  cta?: { label?: string; href?: string };
  showIcon?: boolean;
};

const TONE_STYLES: Record<AlertTone, { color: string; Icon: typeof Info }> = {
  info: { color: "#3b82f6", Icon: Info },
  success: { color: "#10b981", Icon: CheckCircle2 },
  warning: { color: "#f59e0b", Icon: AlertTriangle },
  urgent: { color: "#ef4444", Icon: Megaphone },
};

function isExternalHref(href: string): boolean {
  return href.startsWith("https://") || href.startsWith("http://");
}

function AlertBar({ data }: { data: AlertData }) {
  const tone = data.tone ?? "urgent";
  const theme = TONE_STYLES[tone];
  const hasCta = Boolean(data.cta?.label && data.cta?.href);
  const showIcon = data.showIcon !== false;

  return (
    <div
      className="microsite-card flex min-h-12 items-center justify-between gap-3 border-l-4 px-3 py-2 md:px-4"
      style={{
        borderLeftColor: theme.color,
        background: `color-mix(in oklab, var(--mm-surface) 90%, ${theme.color} 10%)`,
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {showIcon && (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `color-mix(in oklab, ${theme.color} 22%, transparent)` }}
          >
            <theme.Icon className="h-4 w-4" style={{ color: theme.color }} />
          </span>
        )}
        <div className="min-w-0">
          {data.badge && (
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
              <MarkdownText content={data.badge} mode="inline" as="span" />
            </p>
          )}
          {data.message && (
            <p className="line-clamp-2 text-sm font-medium leading-relaxed text-[var(--mm-text)]">
              <MarkdownText content={data.message} mode="inline" as="span" />
            </p>
          )}
        </div>
      </div>
      {hasCta && (
        <Link
          href={data.cta?.href ?? "#"}
          target={isExternalHref(data.cta?.href ?? "") ? "_blank" : undefined}
          rel={isExternalHref(data.cta?.href ?? "") ? "noopener noreferrer" : undefined}
          className="mm-primary-button inline-flex h-8 shrink-0 items-center px-3 text-xs font-semibold"
        >
          <MarkdownText content={data.cta?.label} mode="inline" as="span" />
        </Link>
      )}
    </div>
  );
}

export function StickyAlertBarBlock({
  block,
  isPreview = false,
}: {
  block: Extract<Block, { type: "STICKY_ALERT_BAR" }>;
  isPreview?: boolean;
}) {
  const data = (block.data || {}) as AlertData;
  const message = (data.message ?? "").trim();
  const hasCta = Boolean(data.cta?.label && data.cta?.href);
  if (!message && !hasCta) return null;

  if (isPreview) {
    return (
      <BlockSection
        block={block}
        defaults={{
          paddingY: "sm",
          paddingX: "none",
          width: "full",
          align: "left",
          backgroundClass: "bg-transparent",
        }}
        containerClassName="px-3 md:px-4"
      >
        <AlertBar data={data} />
      </BlockSection>
    );
  }

  return (
    <div className="fixed inset-x-0 top-16 z-40 px-3 md:px-4">
      <div className="microsite-shell">
        <AlertBar data={data} />
      </div>
    </div>
  );
}
