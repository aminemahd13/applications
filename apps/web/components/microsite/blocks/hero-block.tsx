"use client";

/* eslint-disable @next/next/no-img-element */
import type { Block } from "@event-platform/shared";
import { Calendar, MapPin, Scroll, Timer, Users } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { BlockSection } from "./block-section";
import { resolveAssetUrl } from "../asset-url";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import { FeedbackLink } from "../feedback-link";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  calendar: Calendar,
  map: MapPin,
  users: Users,
};

const DIRECTOR_ANIMATION_ROTATION = [
  "pan-left",
  "zoom-in",
  "parallax",
  "split-reveal",
  "pan-right",
] as const;

type HeroFact = NonNullable<Extract<Block, { type: "HERO" }>["data"]["facts"]>[number];
type HeroFrameAnimation = (typeof DIRECTOR_ANIMATION_ROTATION)[number];

type HeroFrame = {
  name: string;
  src: string;
  alt: string;
  href: string;
  animation: HeroFrameAnimation;
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

function normalizeFrameAnimation(rawAnimation: string, index: number): HeroFrameAnimation {
  const normalized = rawAnimation.trim().toLowerCase();
  if (DIRECTOR_ANIMATION_ROTATION.includes(normalized as HeroFrameAnimation)) {
    return normalized as HeroFrameAnimation;
  }
  return DIRECTOR_ANIMATION_ROTATION[index % DIRECTOR_ANIMATION_ROTATION.length];
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
    valueProposition,
    deadlineLabel,
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
    directorMode,
    frameIntervalMs,
    heroFrames: heroFramesInput,
    trustLogos: trustLogosInput,
  } = (block.data || {}) as Extract<Block, { type: "HERO" }>["data"] & {
    valueProposition?: string;
    deadlineLabel?: string;
    logoAssetKey?: string;
    logoUrl?: string;
    logoAlt?: string;
    eyebrow?: string;
    secondaryCta?: { label?: string; href?: string };
    heroImage?: string;
    layout?: "centered" | "split";
    showFaqButton?: boolean;
    directorMode?: boolean;
    frameIntervalMs?: number;
    trustLogos?: Array<{ name?: string; assetKey?: string; url?: string; alt?: string; href?: string }>;
    heroFrames?: Array<{ name?: string; assetKey?: string; url?: string; alt?: string; href?: string; animation?: string }>;
  };

  const ctaHref = resolveHeroCtaHref(cta, eventSlug);
  const secondaryHref = resolveHeroCtaHref(secondaryCta, eventSlug);
  const faqHref = eventSlug ? `/events/${eventSlug}/faq` : "/faq";
  const primaryCtaLabel = String(cta?.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const customLogo = resolveAssetUrl(logoAssetKey || logoUrl || siteLogoAssetKey || "");
  const heroImageUrl = resolveAssetUrl(heroImage || "");
  const hasCustomLogo = customLogo !== "";
  const computedLogoAlt = logoAlt || "Microsite logo";
  const heading = typeof title === "string" ? title.trim() : "Welcome";
  const heroLayout = layout === "split" ? "split" : "centered";
  const shouldShowFaq = showFaqButton ?? true;
  const directorEnabled = directorMode ?? true;
  const intervalMs = Math.max(1800, Math.min(12000, Number(frameIntervalMs ?? 4200)));

  const trustLogos = useMemo(
    () =>
      (trustLogosInput ?? [])
        .map((logo, index) => ({
          name: String(logo.name ?? "").trim(),
          src: resolveAssetUrl(String(logo.assetKey ?? logo.url ?? "").trim()),
          alt: String(logo.alt ?? logo.name ?? `Partner ${index + 1}`),
          href: String(logo.href ?? "").trim(),
        }))
        .filter((logo) => Boolean(logo.src || logo.name)),
    [trustLogosInput],
  );

  const { frames, usesSingleFallback } = useMemo(() => {
    const mappedFrames = (heroFramesInput ?? [])
      .map((frame, index) => {
        const src = resolveAssetUrl(String(frame.assetKey ?? frame.url ?? "").trim());
        if (!src) return null;
        const name = String(frame.name ?? "").trim();
        const fallbackAlt = heading || `Slide ${index + 1}`;
        return {
          name,
          src,
          alt: String(frame.alt ?? frame.name ?? fallbackAlt),
          href: String(frame.href ?? "").trim(),
          animation: normalizeFrameAnimation(String(frame.animation ?? ""), index),
        };
      })
      .filter((frame): frame is HeroFrame => frame !== null);

    if (mappedFrames.length > 0) {
      return { frames: mappedFrames, usesSingleFallback: false };
    }

    if (heroImageUrl) {
      return {
        frames: [
          {
            name: heading || "Hero image",
            src: heroImageUrl,
            alt: heading || "Hero image",
            href: "",
            animation: "zoom-in",
          },
        ],
        usesSingleFallback: true,
      };
    }

    return { frames: [] as HeroFrame[], usesSingleFallback: false };
  }, [heading, heroFramesInput, heroImageUrl]);

  const [activeFrameIndex, setActiveFrameIndex] = useState(0);

  useEffect(() => {
    setActiveFrameIndex(0);
  }, [frames.length]);

  useEffect(() => {
    if (!directorEnabled || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveFrameIndex((previous) => (previous + 1) % frames.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [directorEnabled, frames.length, intervalMs]);

  const currentFrame = frames[activeFrameIndex] ?? null;

  const normalizedFacts = (facts ?? [])
    .map((fact) => ({
      label: String(fact.label ?? "").trim(),
      value: String(fact.value ?? "").trim(),
      icon: String(fact.icon ?? "").trim().toLowerCase(),
    }))
    .filter((fact) => Boolean(fact.label || fact.value));

  const hasTrustStrip = normalizedFacts.length > 0 || trustLogos.length > 0;
  const hasMediaFrame = frames.length > 0;
  const usePlainSingleImage = usesSingleFallback && frames.length === 1;

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
              heroLayout === "split" && hasMediaFrame
                ? "items-center lg:grid-cols-[1.08fr_0.92fr]"
                : "mx-auto w-full max-w-4xl place-items-center",
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
                  <MarkdownText content={eyebrow} mode="inline" as="span" />
                </p>
              )}

              <div
                className={cn(
                  "mm-fade-up opacity-0",
                  heroLayout === "split" ? "flex justify-start" : "flex justify-center",
                )}
                style={{ animationDelay: "0.2s", animationFillMode: "forwards" }}
              >
                <img
                  src={hasCustomLogo ? customLogo : "/microsite/presets/mm-light.png"}
                  alt={computedLogoAlt}
                  className={hasCustomLogo ? "h-14 w-auto md:h-[4.5rem]" : "h-[4.5rem] w-auto md:h-20"}
                />
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
                    <MarkdownText content={heading} mode="inline" as="span" />
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
                  <MarkdownText content={subtitle} mode="inline" as="span" />
                </p>
              )}

              {(valueProposition || deadlineLabel) && (
                <div
                  className={cn(
                    "mm-fade-up space-y-3 opacity-0",
                    heroLayout === "split" ? "mx-0 max-w-2xl" : "mx-auto max-w-3xl",
                  )}
                  style={{ animationDelay: "0.31s", animationFillMode: "forwards" }}
                >
                  {valueProposition && (
                    <div className="rounded-2xl border border-[var(--mm-border)]/80 bg-[var(--mm-soft)]/70 px-4 py-3 text-sm font-semibold text-[var(--mm-text)] md:text-base">
                      <MarkdownText content={valueProposition} mode="inline" as="span" />
                    </div>
                  )}
                  {deadlineLabel && (
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--mm-text-muted)] md:text-sm",
                        heroLayout === "split" ? "" : "mx-auto",
                      )}
                    >
                      <Timer className="h-4 w-4 text-[var(--mm-accent)]" />
                      <MarkdownText content={deadlineLabel} mode="inline" as="span" />
                    </div>
                  )}
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
                  {primaryCtaLabel && (
                    <FeedbackLink href={ctaHref} className="mm-ring-button">
                      <span className="mm-ring-button-inner">
                        <Scroll className="h-5 w-5" />
                        <MarkdownText content={primaryCtaLabel} mode="inline" as="span" />
                      </span>
                    </FeedbackLink>
                  )}
                  {secondaryCta?.label && (
                    <FeedbackLink
                      href={secondaryHref}
                      target={isExternalHref(secondaryHref) ? "_blank" : undefined}
                      rel={isExternalHref(secondaryHref) ? "noopener noreferrer" : undefined}
                      className="mm-outline-button inline-flex items-center px-4 py-2 text-sm font-semibold"
                    >
                      <MarkdownText content={secondaryCta.label} mode="inline" as="span" />
                    </FeedbackLink>
                  )}
                  {shouldShowFaq && (
                    <FeedbackLink href={faqHref} className="mm-faq-button px-4 py-2 text-sm">
                      FAQ
                    </FeedbackLink>
                  )}
                </div>
              )}
            </div>

            {hasMediaFrame && (
              <div
                className={cn(
                  "relative w-full",
                  heroLayout === "split" ? "order-last lg:order-none" : "mx-auto max-w-3xl",
                )}
              >
                {usePlainSingleImage && currentFrame ? (
                  currentFrame.href ? (
                    <Link
                      href={currentFrame.href}
                      target={isExternalHref(currentFrame.href) ? "_blank" : undefined}
                      rel={isExternalHref(currentFrame.href) ? "noopener noreferrer" : undefined}
                      className="block w-full"
                    >
                      <img
                        src={currentFrame.src}
                        alt={currentFrame.alt}
                        className="h-auto w-full object-contain"
                      />
                    </Link>
                  ) : (
                    <img
                      src={currentFrame.src}
                      alt={currentFrame.alt}
                      className="h-auto w-full object-contain"
                    />
                  )
                ) : (
                  <div className="mm-director-frame">
                    {frames.map((frame, frameIndex) => {
                      const isActive = frameIndex === activeFrameIndex;
                      const frameClass = `mm-hero-anim-${frame.animation}`;
                      const frameContent = (
                        <img
                          src={frame.src}
                          alt={frame.alt}
                          className={cn(
                            "h-full w-full object-cover",
                            isActive && directorEnabled ? frameClass : "",
                          )}
                        />
                      );

                      return (
                        <div
                          key={`${frame.src}-${frameIndex}`}
                          className={cn("mm-hero-slide", isActive ? "is-active" : "")}
                        >
                          {frame.href ? (
                            <Link
                              href={frame.href}
                              target={isExternalHref(frame.href) ? "_blank" : undefined}
                              rel={isExternalHref(frame.href) ? "noopener noreferrer" : undefined}
                              className="block h-full w-full"
                            >
                              {frameContent}
                            </Link>
                          ) : (
                            frameContent
                          )}
                        </div>
                      );
                    })}

                    {currentFrame?.name && (
                      <div className="mm-hero-frame-label">
                        <MarkdownText content={currentFrame.name} mode="inline" as="span" />
                      </div>
                    )}

                    {directorEnabled && frames.length > 1 && (
                      <div className="mm-hero-dots">
                        {frames.map((frame, frameIndex) => (
                          <button
                            key={`${frame.name || "frame"}-${frameIndex}`}
                            type="button"
                            className={cn(
                              "mm-hero-dot",
                              frameIndex === activeFrameIndex ? "is-active" : "",
                            )}
                            aria-label={`Go to frame ${frameIndex + 1}`}
                            onClick={() => setActiveFrameIndex(frameIndex)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {hasTrustStrip && (
            <div className="relative z-10 mt-7 grid gap-4 border-t border-[var(--mm-border)]/80 pt-4 lg:grid-cols-[1fr_auto] lg:items-center">
              {normalizedFacts.length > 0 && (
                <div className={cn("flex flex-wrap gap-2", heroLayout === "split" ? "justify-start" : "justify-center lg:justify-start")}>
                  {normalizedFacts.map((fact, idx: number) => {
                    const Icon = fact.icon ? ICONS[fact.icon.toLowerCase()] : null;
                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--mm-border)] bg-[var(--mm-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--mm-text)] shadow-sm"
                      >
                        {Icon ? <Icon className="h-4 w-4 text-[var(--mm-accent)]" /> : null}
                        <span>
                          <MarkdownText content={fact.value} mode="inline" as="span" />
                          {fact.label ? " - " : ""}
                          {fact.label ? <MarkdownText content={fact.label} mode="inline" as="span" /> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {trustLogos.length > 0 && (
                <div className={cn("flex flex-wrap gap-2", heroLayout === "split" ? "justify-start" : "justify-center lg:justify-end")}>
                  {trustLogos.map((logo, index) => {
                    const chip = (
                      <span className="mm-logo-shell inline-flex h-9 min-w-[6.5rem] items-center justify-center px-3">
                        {logo.src ? (
                          <img src={logo.src} alt={logo.alt || logo.name || `Partner ${index + 1}`} className="h-5 w-auto" />
                        ) : (
                          <span className="text-xs font-semibold text-[var(--mm-text-muted)]">
                            {logo.name || `Partner ${index + 1}`}
                          </span>
                        )}
                      </span>
                    );

                    if (!logo.href) {
                      return <span key={`${logo.name || "partner"}-${index}`}>{chip}</span>;
                    }

                    return (
                      <Link
                        key={`${logo.name || "partner"}-${index}`}
                        href={logo.href}
                        target={isExternalHref(logo.href) ? "_blank" : undefined}
                        rel={isExternalHref(logo.href) ? "noopener noreferrer" : undefined}
                      >
                        {chip}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </BlockSection>
  );
}
