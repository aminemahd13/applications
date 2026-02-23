"use client";

import { useEffect, useRef, useState } from "react";
import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type LogoItem = NonNullable<Extract<Block, { type: "LOGO_CLOUD" }>["data"]>["logos"][number];
type LogoRenderItem = LogoItem & { imageUrl?: string };
type LogoCloudData = Extract<Block, { type: "LOGO_CLOUD" }>["data"] & {
  heading?: string;
  title?: string;
};

export function LogoCloudBlock({ block }: { block: Extract<Block, { type: 'LOGO_CLOUD' }> }) {
  const data = (block.data || {}) as LogoCloudData;
  const logos = data.logos ?? [];
  const title = data.heading ?? data.title;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const baseTrackRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = viewportRef.current;
    const baseTrack = baseTrackRef.current;
    if (!viewport || !baseTrack) return;

    const updateOverflowState = () => {
      const nextShouldAutoScroll = baseTrack.scrollWidth > viewport.clientWidth + 1;
      setShouldAutoScroll(nextShouldAutoScroll);
      if (!nextShouldAutoScroll) {
        viewport.scrollLeft = 0;
      }
    };

    updateOverflowState();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflowState);

    if (resizeObserver) {
      resizeObserver.observe(viewport);
      resizeObserver.observe(baseTrack);
    } else {
      window.addEventListener("resize", updateOverflowState);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", updateOverflowState);
      }
    };
  }, [logos.length]);

  useEffect(() => {
    if (!shouldAutoScroll) return;
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    let rafId = 0;
    const scrollSpeed = 0.38;

    const tick = () => {
      const viewport = viewportRef.current;
      const baseTrack = baseTrackRef.current;
      if (!viewport || !baseTrack) return;

      if (!isPausedRef.current && !document.hidden) {
        viewport.scrollLeft += scrollSpeed;
        const loopPoint = baseTrack.scrollWidth;
        if (loopPoint > 0 && viewport.scrollLeft >= loopPoint) {
          viewport.scrollLeft -= loopPoint;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [shouldAutoScroll, logos.length]);

  if (logos.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: "lg",
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
    >
      {title && (
        <h2 className="mb-10 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--mm-text-muted)]">
          {title}
        </h2>
      )}

      <div
        ref={viewportRef}
        className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <div
          className={`flex items-center gap-6 md:gap-10 ${shouldAutoScroll ? "w-max flex-nowrap" : "w-full justify-center"}`}
        >
          <div ref={baseTrackRef} className="flex shrink-0 items-center gap-6 md:gap-10">
            {logos.map((logo: LogoRenderItem, idx: number) => (
              <div
                key={`primary-${idx}`}
                className="mm-logo-shell group flex h-20 min-w-[9rem] items-center justify-center px-5 py-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveAssetUrl(logo.imageUrl || logo.url || logo.assetKey)}
                  alt={logo.name || "Partner logo"}
                  className="h-8 w-auto max-w-[10rem] object-contain opacity-85 saturate-[0.75] contrast-110 transition-all duration-200 group-hover:opacity-100 group-hover:saturate-125 md:h-11"
                />
              </div>
            ))}
          </div>

          {shouldAutoScroll && (
            <div aria-hidden="true" className="flex shrink-0 items-center gap-6 md:gap-10">
              {logos.map((logo: LogoRenderItem, idx: number) => (
                <div
                  key={`duplicate-${idx}`}
                  className="mm-logo-shell group flex h-20 min-w-[9rem] items-center justify-center px-5 py-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveAssetUrl(logo.imageUrl || logo.url || logo.assetKey)}
                    alt={logo.name || "Partner logo"}
                    className="h-8 w-auto max-w-[10rem] object-contain opacity-85 saturate-[0.75] contrast-110 transition-all duration-200 group-hover:opacity-100 group-hover:saturate-125 md:h-11"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BlockSection>
  );
}
