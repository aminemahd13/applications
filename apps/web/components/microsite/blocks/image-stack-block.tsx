"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type ImageStackData = Extract<Block, { type: "IMAGE_STACK" }>["data"] & {
  heading?: string;
  caption?: string;
  autoplay?: boolean;
  intervalMs?: number;
  images?: Array<{
    name?: string;
    assetKey?: string;
    url?: string;
    href?: string;
    alt?: string;
  }>;
};

export function ImageStackBlock({
  block,
}: {
  block: Extract<Block, { type: "IMAGE_STACK" }>;
}) {
  const data = (block.data || {}) as ImageStackData;
  const heading = data.heading;
  const caption = data.caption;
  const autoplay = data.autoplay ?? true;
  const intervalMs = Math.max(1000, Math.min(10000, Number(data.intervalMs ?? 3500)));
  const items = (data.images ?? [])
    .map((item) => ({
      src: resolveAssetUrl(item.url || item.assetKey),
      alt: item.alt || item.name || "Image",
      name: item.name || "Photo",
      href: item.href || "",
    }))
    .filter((item) => Boolean(item.src));

  const [active, setActive] = useState(0);
  const rotations = useMemo(
    () => items.map((_, index) => ((index * 7) % 21) - 10),
    [items],
  );

  useEffect(() => {
    if (!autoplay || items.length < 2) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoplay, intervalMs, items.length]);

  if (items.length === 0) return null;

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
      containerClassName="space-y-6"
    >
      {heading && (
        <h2 className="microsite-display text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {heading}
        </h2>
      )}
      {caption && (
        <p className="mx-auto max-w-3xl text-center text-[var(--mm-text-muted)]">{caption}</p>
      )}

      <div className="relative mx-auto h-60 w-full max-w-sm antialiased md:h-80 md:max-w-lg">
        <AnimatePresence>
          {items.map((item, index) => (
            <motion.div
              key={`${item.src}-${index}`}
              initial={{
                opacity: 0,
                scale: 0.9,
                z: -100,
                rotate: rotations[index] ?? 0,
              }}
              animate={{
                opacity: index === active ? 1 : 0.7,
                scale: index === active ? 1 : 0.95,
                z: index === active ? 0 : -100,
                rotate: index === active ? 0 : rotations[index] ?? 0,
                zIndex: index === active ? 999 : items.length + 2 - index,
                y: index === active ? [0, -80, 0] : 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.9,
                z: 100,
                rotate: rotations[index] ?? 0,
              }}
              transition={{
                duration: 0.4,
                ease: "easeInOut",
              }}
              className="absolute inset-0 origin-bottom"
            >
              {item.href ? (
                <a href={item.href} className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt={item.alt}
                    draggable={false}
                    className="h-full w-full rounded-3xl object-cover object-center"
                  />
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.src}
                  alt={item.alt}
                  draggable={false}
                  className="h-full w-full rounded-3xl object-cover object-center"
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </BlockSection>
  );
}
