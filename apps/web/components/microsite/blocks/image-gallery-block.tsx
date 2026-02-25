"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Block } from "@event-platform/shared";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type ImageGalleryItem = NonNullable<Extract<Block, { type: "IMAGE_GALLERY" }>["data"]>["items"][number];
type GalleryEditorItem = ImageGalleryItem & { url?: string };
type GalleryData = {
  layout?: "carousel" | "grid" | "masonry";
  heading?: string;
  title?: string;
  items?: GalleryEditorItem[];
  images?: GalleryEditorItem[];
  autoplay?: boolean;
  autoScrollSpeed?: number;
};

export function ImageGalleryBlock({ block }: { block: Extract<Block, { type: 'IMAGE_GALLERY' }> }) {
  const data = (block.data || {}) as GalleryData;
  const layout = data.layout ?? "grid";
  const title = data.heading ?? data.title;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const items = useMemo(
    () =>
      (data.images ?? data.items ?? [])
        .map((item, index) => {
          const src = resolveAssetUrl(item.url || item.assetKey);
          if (!src) return null;
          return {
            ...item,
            src,
            sourceIndex: index,
          };
        })
        .filter(
          (item): item is GalleryEditorItem & { src: string; sourceIndex: number } => Boolean(item?.src),
        ),
    [data.images, data.items],
  );

  const autoplay = data.autoplay ?? true;
  const autoScrollSpeedRaw = Number(data.autoScrollSpeed ?? 0.4);
  const autoScrollSpeed = Number.isFinite(autoScrollSpeedRaw)
    ? Math.max(0.15, Math.min(1.2, autoScrollSpeedRaw))
    : 0.4;
  const shouldAutoScroll = layout === "carousel" && autoplay && items.length > 1 && activeIndex === null;
  const carouselItems = shouldAutoScroll ? [...items, ...items] : items;
  const activeItem = activeIndex === null ? null : items[activeIndex] ?? null;

  const closeLightbox = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const goPrev = useCallback(() => {
    if (items.length === 0) return;
    setActiveIndex((prev) => {
      if (prev === null) return 0;
      return (prev - 1 + items.length) % items.length;
    });
  }, [items.length]);

  const goNext = useCallback(() => {
    if (items.length === 0) return;
    setActiveIndex((prev) => {
      if (prev === null) return 0;
      return (prev + 1) % items.length;
    });
  }, [items.length]);

  useEffect(() => {
    if (!shouldAutoScroll) return;
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    let rafId = 0;
    const tick = () => {
      const node = trackRef.current;
      if (!node) return;

      if (!isPausedRef.current && !document.hidden) {
        node.scrollLeft += autoScrollSpeed;
        const loopPoint = node.scrollWidth / 2;
        if (loopPoint > 0 && node.scrollLeft >= loopPoint) {
          node.scrollLeft -= loopPoint;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [autoScrollSpeed, shouldAutoScroll]);

  useEffect(() => {
    if (activeIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, closeLightbox, goNext, goPrev]);

  if (items.length === 0) return null;

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
      {title && (
        <MarkdownText
          content={title}
          mode="inline"
          as="h2"
          className="microsite-display mb-12 text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
        />
      )}
      {layout === "carousel" ? (
        <div
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-7"
          onMouseEnter={() => {
            isPausedRef.current = true;
          }}
          onMouseLeave={() => {
            isPausedRef.current = false;
          }}
          onTouchStart={() => {
            isPausedRef.current = true;
          }}
          onTouchEnd={() => {
            isPausedRef.current = false;
          }}
          onFocusCapture={() => {
            isPausedRef.current = true;
          }}
          onBlurCapture={() => {
            isPausedRef.current = false;
          }}
        >
          {carouselItems.map((item, idx: number) => (
            <div
              key={`${item.src}-${idx}`}
              className="microsite-card group relative min-w-[84vw] snap-center shrink-0 overflow-hidden sm:min-w-[70vw] md:min-w-[34rem] lg:min-w-[38rem]"
            >
              <button
                type="button"
                className="relative block aspect-[16/9] w-full overflow-hidden bg-[var(--mm-soft)] text-left"
                onClick={() => setActiveIndex(item.sourceIndex)}
                aria-label={`Open image ${item.sourceIndex + 1} in full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt={item.alt || ""}
                  className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  loading={idx < 2 ? "eager" : "lazy"}
                  decoding="async"
                />
                {item.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-sm font-medium text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <MarkdownText content={item.caption} mode="inline" as="span" />
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-4 md:gap-7",
            layout === "grid" && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
            layout === "masonry" && "block columns-1 space-y-4 md:columns-2 md:space-y-8 lg:columns-3",
          )}
        >
          {items.map((item, idx: number) => (
            <div
              key={`${item.src}-${idx}`}
              className={cn(
                "microsite-card group relative overflow-hidden",
                layout === "masonry" && "mb-4 break-inside-avoid md:mb-8",
              )}
            >
              <button
                type="button"
                className="relative block aspect-[16/9] w-full overflow-hidden bg-[var(--mm-soft)] text-left"
                onClick={() => setActiveIndex(item.sourceIndex)}
                aria-label={`Open image ${item.sourceIndex + 1} in full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.src}
                  alt={item.alt || ""}
                  className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                {item.caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-sm font-medium text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <MarkdownText content={item.caption} mode="inline" as="span" />
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={activeIndex !== null}
        onOpenChange={(open) => {
          if (!open) closeLightbox();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="h-[100dvh] w-screen max-h-none max-w-none rounded-none border-0 bg-black/95 p-0"
        >
          <DialogTitle className="sr-only">Gallery image viewer</DialogTitle>
          {activeItem && (
            <div className="relative h-full w-full">
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                aria-label="Close full screen image"
              >
                <X className="h-5 w-5" />
              </button>

              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-4 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-4 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}

              <div className="flex h-full w-full items-center justify-center p-6 sm:p-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeItem.src}
                  alt={activeItem.alt || ""}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-6 pb-6 pt-16 text-white">
                {activeItem.caption && (
                  <MarkdownText
                    content={activeItem.caption}
                    mode="inline"
                    as="p"
                    className="text-sm font-medium"
                  />
                )}
                <p className="text-xs text-white/75">{(activeIndex ?? 0) + 1} / {items.length}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BlockSection>
  );
}
