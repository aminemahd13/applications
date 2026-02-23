/* eslint-disable @next/next/no-img-element */
import type { Block } from "@event-platform/shared";
import { Calendar, MapPin, Scroll, Users } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { BlockSection } from "./block-section";
import { resolveAssetUrl } from "../asset-url";
import { cn } from "@/lib/utils";

// Map icon strings to components if needed, or just use generic for now
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  map: MapPin,
  users: Users,
};

function resolveHeroCtaHref(
  cta: { label?: string; href?: string } | undefined,
  eventSlug?: string,
): string {
  if (!cta) return "#";
  const href = (cta.href || "").trim();
  if (!eventSlug) return href || "#";

  const isApplyShortcut =
    href === "#" ||
    href.toLowerCase() === "apply" ||
    href.toLowerCase() === "/apply" ||
    href.toLowerCase() === "/applications/me" ||
    href.toLowerCase() === "event-apply";

  if (isApplyShortcut) {
    return `/applications/event/${eventSlug}`;
  }

  if (!href && cta.label && /apply/i.test(cta.label)) {
    return `/applications/event/${eventSlug}`;
  }

  return href || "#";
}

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function HeroBlock({
  block,
  eventSlug,
  siteLogoAssetKey,
}: {
  block: Extract<Block, { type: "HERO" }>;
  eventSlug?: string;
  siteLogoAssetKey?: string;
}) {
  const {
    title,
    subtitle,
    cta,
    facts,
    logoAssetKey,
    logoUrl,
    logoAlt,
    eyebrow,
    secondaryCta,
    heroImage,
    layout,
    showFaqButton,
  } = (block.data || {}) as Extract<Block, { type: "HERO" }>["data"] & {
    logoAssetKey?: string;
    logoUrl?: string;
    logoAlt?: string;
    eyebrow?: string;
    secondaryCta?: { label?: string; href?: string };
    heroImage?: string;
    layout?: "centered" | "split";
    showFaqButton?: boolean;
  };
  const ctaHref = resolveHeroCtaHref(cta, eventSlug);
  const secondaryHref = resolveHeroCtaHref(secondaryCta, eventSlug);
  const faqHref = eventSlug ? `/events/${eventSlug}/faq` : "/faq";
  const customLogo = resolveAssetUrl(logoAssetKey || logoUrl || siteLogoAssetKey || "");
  const heroImageUrl = resolveAssetUrl(heroImage || "");
  const hasHeroImage = heroImageUrl !== "";
  const hasCustomLogo = customLogo !== "";
  const computedLogoAlt = logoAlt || "Microsite logo";
  const heading = typeof title === "string" ? title.trim() : "Welcome";
  const heroLayout = layout === "split" ? "split" : "centered";
  const shouldShowFaq = showFaqButton ?? true;

  // Derive the type for a single fact item from the Block schema
  type FactItem = NonNullable<typeof block.data.facts>[number];

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName={cn(
        "flex flex-col",
        heroLayout === "split" ? "items-start text-left" : "items-center text-center",
      )}
    >
      <div className="w-full">
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-[var(--mm-surface-radius)] border border-[var(--mm-border)] bg-[var(--mm-surface)]",
            heroLayout === "split" ? "px-5 py-8 md:px-8 md:py-10 lg:px-10" : "px-4 py-8 pt-20 md:pt-24",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_10%_-15%,color-mix(in_oklab,var(--mm-accent)_26%,transparent),transparent_70%),radial-gradient(30rem_18rem_at_100%_0%,color-mix(in_oklab,var(--mm-accent-2)_24%,transparent),transparent_72%)]" />

          <div
            className={cn(
              "relative z-10 grid gap-8",
              heroLayout === "split" ? "items-center lg:grid-cols-[1.1fr_0.9fr]" : "mx-auto w-full max-w-3xl place-items-center",
            )}
          >
            <div className={cn("space-y-7", heroLayout === "split" ? "text-left" : "text-center")}>
              {eyebrow && (
                <p
                  className={cn(
                    "mm-fade-up inline-flex rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mm-text-muted)] opacity-0",
                    heroLayout === "split" ? "" : "mx-auto",
                  )}
                  style={{ animationDelay: "0.18s", animationFillMode: "forwards" }}
                >
                  {eyebrow}
                </p>
              )}

              <div
                className={cn(
                  "mm-fade-up opacity-0",
                  heroLayout === "split" ? "flex justify-start" : "flex justify-center",
                )}
                style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}
              >
                <span className="mm-logo-shell min-h-16 max-w-[16rem] px-4 py-2 md:min-h-[4.75rem]">
                  <img
                    src={hasCustomLogo ? customLogo : "/microsite/presets/mm-light.png"}
                    alt={computedLogoAlt}
                    className={hasCustomLogo ? "h-12 w-auto max-w-full md:h-14" : "h-14 w-auto max-w-full md:h-16"}
                  />
                </span>
              </div>

              {heading && (
                <h1
                  className={cn(
                    "microsite-display mm-fade-up text-4xl font-bold tracking-[0.03em] opacity-0 md:text-5xl",
                    heroLayout === "split" ? "max-w-[18ch] md:leading-[1.05]" : "text-center md:leading-[3rem]",
                  )}
                  style={{ animationDelay: "0.25s", animationFillMode: "forwards" }}
                >
                  <span className="inline-block bg-gradient-to-br from-[var(--mm-accent)] via-[var(--mm-ring-middle)] to-[var(--mm-text)] bg-clip-text text-transparent">
                    {heading}
                  </span>
                </h1>
              )}

              {subtitle && (
                <p
                  className={cn(
                    "mm-fade-up max-w-3xl text-base text-[var(--mm-text-muted)] opacity-0 md:text-lg",
                    heroLayout === "split" ? "text-left" : "mx-auto text-center",
                  )}
                  style={{ animationDelay: "0.28s", animationFillMode: "forwards" }}
                >
                  {subtitle}
                </p>
              )}

              {facts && facts.length > 0 && (
                <div
                  className={cn(
                    "mm-fade-up flex flex-wrap gap-2 opacity-0",
                    heroLayout === "split" ? "justify-start" : "justify-center",
                  )}
                  style={{ animationDelay: "0.32s", animationFillMode: "forwards" }}
                >
                  {facts.map((fact: FactItem, idx: number) => {
                    const Icon = fact.icon ? ICONS[fact.icon.toLowerCase()] : null;
                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--mm-text)] shadow-sm"
                      >
                        {Icon ? <Icon className="h-4 w-4 text-[var(--mm-accent)]" /> : null}
                        <span>
                          {fact.value}
                          {fact.label ? ` • ${fact.label}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(cta?.label || secondaryCta?.label || shouldShowFaq) && (
                <div
                  className={cn(
                    "mm-fade-up mx-auto flex flex-wrap items-center gap-3 opacity-0",
                    heroLayout === "split" ? "mx-0 justify-start" : "justify-center",
                  )}
                  style={{ animationDelay: "0.35s", animationFillMode: "forwards" }}
                >
                  {cta?.label && (
                    <Link href={ctaHref} className="mm-ring-button">
                      <span>
                        <Scroll className="h-5 w-5" />
                        {cta.label}
                      </span>
                    </Link>
                  )}
                  {secondaryCta?.label && (
                    <Link
                      href={secondaryHref}
                      target={isExternalHref(secondaryHref) ? "_blank" : undefined}
                      rel={isExternalHref(secondaryHref) ? "noopener noreferrer" : undefined}
                      className="mm-outline-button inline-flex items-center px-4 py-2 text-sm font-semibold"
                    >
                      {secondaryCta.label}
                    </Link>
                  )}
                  {shouldShowFaq && (
                    <Link href={faqHref} className="mm-faq-button px-4 py-2 text-sm">
                      FAQ
                    </Link>
                  )}
                </div>
              )}
            </div>

            {heroLayout === "split" && hasHeroImage && (
              <div className="relative hidden lg:block">
                <div className="microsite-card overflow-hidden">
                  <img
                    src={heroImageUrl}
                    alt={heading || "Hero image"}
                    className="h-[22rem] w-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </BlockSection>
  );
}

