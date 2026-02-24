import type { Block } from "@event-platform/shared";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";

type ParticipationStep = NonNullable<Extract<Block, { type: "PARTICIPATION_STEPS" }>["data"]>["items"][number];
type ParticipationStepsData = Extract<Block, { type: "PARTICIPATION_STEPS" }>["data"] & {
  heading?: string;
  items?: ParticipationStep[];
};

const ICON_MAP = Icons as unknown as Record<string, LucideIcon>;

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function normalizeVariant(value: string): "pill" | "outline" | "ghost" {
  if (value === "outline") return "outline";
  if (value === "ghost") return "ghost";
  return "pill";
}

function resolveCtaClass(variant: "pill" | "outline" | "ghost"): string {
  if (variant === "outline") {
    return "rounded-lg border border-[var(--mm-border)] bg-[var(--mm-surface)] text-[var(--mm-text)] hover:border-[var(--mm-accent)]";
  }

  if (variant === "ghost") {
    return "rounded-lg border border-transparent bg-transparent text-[var(--mm-text)] hover:bg-[var(--mm-soft)]";
  }

  return "rounded-[var(--mm-button-radius)] border border-[color-mix(in_oklab,var(--mm-accent)_58%,var(--mm-border)_42%)] bg-[var(--mm-surface)] text-[var(--mm-text)] hover:border-[var(--mm-accent)]";
}

export function ParticipationStepsBlock({
  block,
}: {
  block: Extract<Block, { type: "PARTICIPATION_STEPS" }>;
}) {
  const data = (block.data || {}) as ParticipationStepsData;
  const heading = String(data.heading ?? "").trim();
  const items = (data.items ?? [])
    .map((item, index) => {
      const ctaLabel = String(item.ctaLabel ?? "").trim();
      const ctaHref = String(item.ctaHref ?? "").trim();
      return {
        number: String(item.number ?? `${index + 1}`).trim(),
        title: String(item.title ?? "").trim(),
        description: String(item.description ?? "").trim(),
        ctaLabel,
        ctaHref,
        ctaIcon: String(item.ctaIcon ?? "").trim(),
        ctaVariant: normalizeVariant(String(item.ctaVariant ?? "pill").trim().toLowerCase()),
      };
    })
    .filter((item) => Boolean(item.title || item.description || item.ctaLabel || item.ctaHref));

  if (!heading && items.length === 0) return null;

  const columnsClass =
    items.length <= 1
      ? "md:max-w-2xl md:mx-auto"
      : items.length === 2
        ? "md:grid-cols-2 md:max-w-6xl md:mx-auto"
        : "md:grid-cols-3";

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
    >
      {heading && (
        <h2 className="microsite-display text-center text-2xl font-semibold tracking-tight text-[var(--mm-text)] md:text-4xl">
          {heading}
        </h2>
      )}

      {items.length > 0 && (
        <div className={cn("mt-7 grid grid-cols-1 gap-6 md:gap-8", columnsClass)}>
          {items.map((item, index) => {
            const IconComponent = item.ctaIcon ? ICON_MAP[item.ctaIcon] : undefined;
            const hasCta = Boolean(item.ctaLabel && item.ctaHref);

            return (
              <article
                key={`${item.title || "step"}-${index}`}
                className="mx-auto flex h-full w-full flex-col items-center px-3 py-2 text-center md:px-4"
              >
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(145deg, color-mix(in oklab, var(--mm-accent) 70%, var(--mm-ring-middle) 30%) 0%, color-mix(in oklab, var(--mm-accent) 58%, var(--mm-dark) 42%) 100%)",
                  }}
                >
                  {item.number || index + 1}
                </span>

                {item.title && (
                  <h3 className="microsite-display mt-4 text-xl font-semibold leading-tight text-[var(--mm-text)] md:text-2xl">
                    {item.title}
                  </h3>
                )}

                {item.description && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--mm-text-muted)] md:text-base">
                    {item.description}
                  </p>
                )}

                {hasCta && (
                  <div className="mt-5">
                    <Link
                      href={item.ctaHref}
                      target={isExternalHref(item.ctaHref) ? "_blank" : undefined}
                      rel={isExternalHref(item.ctaHref) ? "noopener noreferrer" : undefined}
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-2 px-4 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5",
                        resolveCtaClass(item.ctaVariant),
                      )}
                    >
                      {IconComponent ? <IconComponent className="h-4 w-4" /> : null}
                      <span>{item.ctaLabel}</span>
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </BlockSection>
  );
}
