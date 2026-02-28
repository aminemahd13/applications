"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MarkdownText } from "../markdown-text";
import { resolveAdaptiveMediaFit } from "./text-image-media-frame-fit";

type FrameAnimation = "pan-left" | "pan-right" | "zoom-in" | "parallax" | "split-reveal";

type Frame = {
  name: string;
  src: string;
  alt: string;
  href: string;
  caption: string;
  animation: FrameAnimation;
};

const ANIMATION_ROTATION: FrameAnimation[] = [
  "pan-left",
  "zoom-in",
  "parallax",
  "split-reveal",
  "pan-right",
];

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function normalizeAnimation(value: string, index: number): FrameAnimation {
  const normalized = value.trim().toLowerCase();
  if (ANIMATION_ROTATION.includes(normalized as FrameAnimation)) {
    return normalized as FrameAnimation;
  }
  return ANIMATION_ROTATION[index % ANIMATION_ROTATION.length];
}

export function TextImageMediaFrame({
  fallbackSrc,
  fallbackAlt,
  fallbackCaption,
  frames,
  directorMode,
  frameIntervalMs,
  heading,
}: {
  fallbackSrc: string;
  fallbackAlt: string;
  fallbackCaption: string;
  frames: Array<{
    name?: string;
    src?: string;
    alt?: string;
    href?: string;
    caption?: string;
    animation?: string;
  }>;
  directorMode?: boolean;
  frameIntervalMs?: number;
  heading: string;
}) {
  const directorFrameRef = useRef<HTMLDivElement | null>(null);
  const { preparedFrames, usesSingleFallback } = useMemo(() => {
    const mapped = frames
      .map((frame, index) => {
        const src = String(frame.src ?? "").trim();
        if (!src) return null;
        const fallbackAltText = fallbackAlt || heading || `Slide ${index + 1}`;
        return {
          name: String(frame.name ?? "").trim(),
          src,
          alt: String(frame.alt ?? "").trim() || fallbackAltText,
          href: String(frame.href ?? "").trim(),
          caption: String(frame.caption ?? "").trim(),
          animation: normalizeAnimation(String(frame.animation ?? ""), index),
        };
      })
      .filter((frame): frame is Frame => frame !== null);

    if (mapped.length > 0) {
      return { preparedFrames: mapped, usesSingleFallback: false };
    }

    if (!fallbackSrc) {
      return { preparedFrames: [] as Frame[], usesSingleFallback: false };
    }

    return {
      preparedFrames: [
        {
          name: heading || "Section image",
          src: fallbackSrc,
          alt: fallbackAlt || heading || "Section visual",
          href: "",
          caption: fallbackCaption,
          animation: "zoom-in",
        },
      ],
      usesSingleFallback: true,
    };
  }, [fallbackAlt, fallbackCaption, fallbackSrc, frames, heading]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const activeFrame = preparedFrames[activeIndex] ?? null;
  const intervalMs = Math.max(1800, Math.min(12000, Number(frameIntervalMs ?? 4200)));
  const autoRotate = (directorMode ?? true) && preparedFrames.length > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [preparedFrames.length]);

  useEffect(() => {
    if (!autoRotate) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % preparedFrames.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoRotate, intervalMs, preparedFrames.length]);

  useEffect(() => {
    const element = directorFrameRef.current;
    if (!element) return;

    const updateFrameSize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width <= 0 || height <= 0) return;
      setFrameSize((previous) => {
        if (previous && previous.width === width && previous.height === height) {
          return previous;
        }
        return { width, height };
      });
    };

    updateFrameSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrameSize);
      return () => window.removeEventListener("resize", updateFrameSize);
    }

    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [preparedFrames.length]);

  if (preparedFrames.length === 0) return null;

  const usePlainSingleImage = usesSingleFallback && preparedFrames.length === 1;
  const caption = activeFrame?.caption || fallbackCaption;

  if (usePlainSingleImage && activeFrame) {
    const frameContent = (
      <img
        src={activeFrame.src}
        alt={activeFrame.alt}
        loading="lazy"
        className="h-auto w-full object-contain"
      />
    );

    return (
      <figure className="space-y-2.5">
        {activeFrame.href ? (
          <Link
            href={activeFrame.href}
            target={isExternalHref(activeFrame.href) ? "_blank" : undefined}
            rel={isExternalHref(activeFrame.href) ? "noopener noreferrer" : undefined}
            className="block w-full"
          >
            {frameContent}
          </Link>
        ) : (
          frameContent
        )}
        {caption && (
          <MarkdownText
            content={caption}
            as="figcaption"
            className="text-sm text-[var(--mm-text-muted)]"
          />
        )}
      </figure>
    );
  }

  return (
    <figure className="space-y-2.5">
      <div ref={directorFrameRef} className="mm-director-frame mm-text-image-director">
        {preparedFrames.map((frame, index) => {
          const isActive = index === activeIndex;
          const sizeKey = `${frame.src}-${index}`;
          const fitMode = resolveAdaptiveMediaFit(imageSizes[sizeKey], frameSize);
          const frameContent = (
            <img
              src={frame.src}
              alt={frame.alt}
              loading="lazy"
              className={cn(
                "h-full w-full object-center",
                fitMode === "cover" ? "object-cover" : "object-contain",
              )}
              onLoad={(event) => {
                const nextWidth = event.currentTarget.naturalWidth;
                const nextHeight = event.currentTarget.naturalHeight;
                if (!nextWidth || !nextHeight) return;
                setImageSizes((previous) => {
                  const current = previous[sizeKey];
                  if (current && current.width === nextWidth && current.height === nextHeight) {
                    return previous;
                  }
                  return {
                    ...previous,
                    [sizeKey]: { width: nextWidth, height: nextHeight },
                  };
                });
              }}
            />
          );
          return (
            <div
              key={`${frame.src}-${index}`}
              className={cn(
                "mm-hero-slide mm-text-image-slide",
                `mm-hero-card-motion-${frame.animation}`,
                isActive ? "is-active" : "",
              )}
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

        {activeFrame?.name && (
          <div className="mm-hero-frame-label">
            <MarkdownText content={activeFrame.name} mode="inline" as="span" />
          </div>
        )}

        {preparedFrames.length > 1 && (
          <div className="mm-hero-dots">
            {preparedFrames.map((frame, index) => (
              <button
                key={`${frame.name || "frame"}-${index}`}
                type="button"
                className={cn("mm-hero-dot", index === activeIndex ? "is-active" : "")}
                aria-label={`Go to image ${index + 1}`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
      {caption && (
        <MarkdownText
          content={caption}
          as="figcaption"
          className="text-sm text-[var(--mm-text-muted)]"
        />
      )}
    </figure>
  );
}
