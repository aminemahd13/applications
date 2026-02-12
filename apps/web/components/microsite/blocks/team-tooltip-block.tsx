"use client";

import { useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { Block } from "@event-platform/shared";
import Link from "next/link";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

type TeamTooltipData = Extract<Block, { type: "TEAM_TOOLTIP" }>["data"] & {
  heading?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  items?: Array<{
    name?: string;
    designation?: string;
    assetKey?: string;
    url?: string;
    imageUrl?: string;
  }>;
};

export function TeamTooltipBlock({
  block,
}: {
  block: Extract<Block, { type: "TEAM_TOOLTIP" }>;
}) {
  const data = (block.data || {}) as TeamTooltipData;
  const heading = data.heading || "Who are we?";
  const description = data.description || "";
  const ctaLabel = data.ctaLabel || "";
  const ctaHref = data.ctaHref || "";
  const items = (data.items ?? [])
    .map((item, index) => ({
      id: index,
      name: item.name || "Team member",
      designation: item.designation || "",
      image: resolveAssetUrl(item.url || item.imageUrl || item.assetKey || ""),
    }))
    .filter((item) => Boolean(item.image));

  if (items.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "normal",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="space-y-6 text-center"
    >
      <h2 className="microsite-display text-3xl font-bold text-[var(--mm-text)] md:text-5xl">
        {heading}
      </h2>
      {description && (
        <p className="mx-auto max-w-screen-md text-center text-[var(--mm-text-muted)]">{description}</p>
      )}
      <div className="mb-10 flex w-full flex-row items-center justify-center">
        <AnimatedTooltip items={items} />
      </div>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref}>
          <button className="relative p-[2px] text-sm">
            <div className="absolute inset-0 rounded-[var(--mm-button-radius)] bg-gradient-to-r from-[var(--mm-accent)] to-[var(--mm-ring-middle)]" />
            <div className="group relative rounded-[var(--mm-button-radius)] bg-[var(--mm-surface)] px-8 py-2 text-[var(--mm-text)] transition duration-200 hover:bg-transparent hover:text-white">
              {ctaLabel}
            </div>
          </button>
        </Link>
      )}
    </BlockSection>
  );
}

function AnimatedTooltip({
  items,
}: {
  items: Array<{
    id: number;
    name: string;
    designation?: string;
    image: string;
  }>;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const springConfig = { stiffness: 100, damping: 5 };
  const x = useMotionValue(0);
  const rotate = useSpring(useTransform(x, [-100, 100], [-45, 45]), springConfig);
  const translateX = useSpring(useTransform(x, [-100, 100], [-50, 50]), springConfig);

  return (
    <>
      {items.map((item) => (
        <div
          className="-mr-4 relative group"
          key={`${item.name}-${item.id}`}
          onMouseEnter={() => setHoveredIndex(item.id)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence mode="popLayout">
            {hoveredIndex === item.id && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    type: "spring",
                    stiffness: 260,
                    damping: 10,
                  },
                }}
                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                style={{
                  translateX,
                  rotate,
                  whiteSpace: "nowrap",
                }}
                className="absolute -left-1/2 -top-16 z-50 flex translate-x-1/2 flex-col items-center justify-center rounded-md bg-black px-4 py-2 text-xs shadow-xl"
              >
                <div className="absolute inset-x-10 z-30 -bottom-px h-px w-[20%] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
                <div className="absolute left-10 z-30 -bottom-px h-px w-[40%] bg-gradient-to-r from-transparent via-sky-500 to-transparent" />
                <div className="relative z-30 text-base font-bold text-white">
                  {item.name}
                </div>
                {item.designation && <div className="text-xs text-white">{item.designation}</div>}
              </motion.div>
            )}
          </AnimatePresence>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            onMouseMove={(event) => {
              const halfWidth = event.currentTarget.offsetWidth / 2;
              x.set(event.nativeEvent.offsetX - halfWidth);
            }}
            src={item.image}
            alt={item.name}
            className="relative h-14 w-14 rounded-full border-2 border-white object-cover object-top !m-0 !p-0 transition duration-500 group-hover:scale-105 group-hover:z-30"
          />
        </div>
      ))}
    </>
  );
}
