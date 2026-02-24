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

function resolveCtaClass(variant: string): string {
  if (variant === "outline") {
    return "rounded-xl border border-[#111827] px-7 text-[#111827]";
  }
  if (variant === "ghost") {
    return "rounded-xl border border-transparent px-7 text-[#111827]";
  }
  return "rounded-full border-2 border-[#e7a400] px-7 text-[#334155] shadow-[0_6px_16px_rgba(30,41,59,0.12)]";
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
        ctaVariant: String(item.ctaVariant ?? "pill").trim().toLowerCase(),
      };
    })
    .filter((item) => Boolean(item.title || item.description || item.ctaLabel || item.ctaHref));

  if (!heading && items.length === 0) return null;

  const columnsClass =
    items.length <= 1
      ? "md:max-w-xl md:mx-auto"
      : items.length === 2
        ? "md:grid-cols-2 md:max-w-4xl md:mx-auto"
        : "md:grid-cols-3";

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-[#ececec]",
      }}
    >
      {heading && (
        <h2 className="microsite-display text-center text-3xl font-semibold tracking-tight text-[#041a3d] md:text-5xl">
          {heading}
        </h2>
      )}

      {items.length > 0 && (
        <div className={cn("mt-12 grid grid-cols-1 gap-10 md:gap-8", columnsClass)}>
          {items.map((item, index) => {
            const IconComponent = item.ctaIcon ? ICON_MAP[item.ctaIcon] : undefined;
            const hasCta = Boolean(item.ctaLabel && item.ctaHref);

            return (
              <article key={`${item.title || "step"}-${index}`} className="mx-auto flex w-full max-w-md flex-col items-center text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#205b4a] text-4xl leading-none text-white">
                  {item.number || index + 1}
                </span>

                {item.title && (
                  <h3 className="microsite-display mt-7 text-2xl font-semibold leading-tight text-[#184b41] md:text-[2rem]">
                    {item.title}
                  </h3>
                )}

                {item.description && (
                  <p className="mt-8 whitespace-pre-line text-base leading-relaxed text-[#0f172a] md:text-[1.5rem]">
                    {item.description}
                  </p>
                )}

                {hasCta && (
                  <div className="mt-10">
                    <Link
                      href={item.ctaHref}
                      target={isExternalHref(item.ctaHref) ? "_blank" : undefined}
                      rel={isExternalHref(item.ctaHref) ? "noopener noreferrer" : undefined}
                      className={cn(
                        "inline-flex min-h-12 items-center justify-center gap-2 bg-white text-base font-medium transition-transform duration-150 hover:-translate-y-0.5 md:text-[1.3rem]",
                        resolveCtaClass(item.ctaVariant),
                      )}
                    >
                      {IconComponent ? <IconComponent className="h-5 w-5" /> : null}
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
