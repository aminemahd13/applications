import type { Block } from "@event-platform/shared";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";

const PADDING_Y = {
  none: "py-0",
  sm: "py-8 md:py-10",
  md: "py-10 md:py-14",
  lg: "py-14 md:py-16",
  xl: "py-16 md:py-20",
} as const;

const PADDING_X = {
  none: "px-0",
  sm: "px-4 md:px-5",
  md: "px-5 md:px-6",
  lg: "px-5 md:px-8",
  xl: "px-5 md:px-9",
} as const;

const WIDTH = {
  narrow: "max-w-3xl mx-auto",
  normal: "max-w-5xl mx-auto",
  wide: "microsite-shell",
  full: "w-full",
} as const;

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

type SectionBackground = {
  color?: string;
  gradient?: string;
  imageUrl?: string;
  videoUrl?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  position?: "center" | "top" | "bottom";
};

export type BlockSectionStyle = {
  anchorId?: string;
  backgroundType?: "default" | "none" | "color" | "gradient" | "image" | "video";
  background?: SectionBackground;
  paddingY?: keyof typeof PADDING_Y;
  paddingX?: keyof typeof PADDING_X;
  width?: keyof typeof WIDTH;
  align?: keyof typeof ALIGN;
  textColor?: string;
  className?: string;
  hideOnMobile?: boolean;
  hideOnDesktop?: boolean;
  animation?: "none" | "fade-up" | "rise" | "zoom";
  animationDelayMs?: number;
};

type SectionDefaults = {
  paddingY?: keyof typeof PADDING_Y;
  paddingX?: keyof typeof PADDING_X;
  width?: keyof typeof WIDTH;
  align?: keyof typeof ALIGN;
  backgroundClass?: string;
};

export function BlockSection({
  block,
  defaults,
  className,
  containerClassName,
  children,
}: {
  block: Block;
  defaults?: SectionDefaults;
  className?: string;
  containerClassName?: string;
  children: ReactNode;
}) {
  const sectionData = (block.data ?? {}) as { section?: BlockSectionStyle };
  const section = sectionData.section ?? {};
  const paddingY = section.paddingY ?? defaults?.paddingY ?? "xl";
  const paddingX = section.paddingX ?? defaults?.paddingX ?? "xl";
  const width = section.width ?? defaults?.width ?? "wide";
  const align = section.align ?? defaults?.align ?? "left";
  const background = section.background ?? {};

  const hasBackgroundValue = Boolean(
    background.color || background.gradient || background.imageUrl || background.videoUrl,
  );
  const backgroundType = section.backgroundType;
  const showBackground = backgroundType !== "none";
  const useDefaultBackground =
    showBackground &&
    (backgroundType === "default" || (!backgroundType && !hasBackgroundValue));

  const style: CSSProperties = {};
  const resolvedImageUrl = background.imageUrl ? resolveAssetUrl(background.imageUrl) : "";
  const resolvedVideoUrl = background.videoUrl ? resolveAssetUrl(background.videoUrl) : "";

  if (showBackground) {
    if (backgroundType === "gradient" && background.gradient) {
      style.backgroundImage = background.gradient;
    } else if ((backgroundType === "image" || (!backgroundType && background.imageUrl)) && resolvedImageUrl) {
      style.backgroundImage = `url(${resolvedImageUrl})`;
      style.backgroundSize = "cover";
      style.backgroundRepeat = "no-repeat";
      style.backgroundPosition = background.position ?? "center";
    } else if ((backgroundType === "color" || (!backgroundType && background.color)) && background.color) {
      style.backgroundColor = background.color;
    } else if (background.gradient) {
      style.backgroundImage = background.gradient;
    }
  }

  if (section.textColor) {
    style.color = section.textColor;
  }

  const overlayOpacity = Number.isFinite(background.overlayOpacity)
    ? Math.max(0, Math.min(100, Number(background.overlayOpacity)))
    : background.overlayColor
      ? 40
      : 0;

  const overlayStyle: CSSProperties | null = (background.overlayColor || overlayOpacity > 0) && showBackground
    ? {
        backgroundColor: background.overlayColor ?? "#000000",
        opacity: overlayOpacity / 100,
      }
    : null;

  const hideClasses = cn(
    section.hideOnMobile && "hidden md:block",
    section.hideOnDesktop && "md:hidden",
  );
  const animationType = section.animation ?? "none";
  const animationDelayMs = Number.isFinite(section.animationDelayMs)
    ? Math.max(0, Math.min(2000, Number(section.animationDelayMs)))
    : 0;
  const animationClass =
    animationType === "fade-up"
      ? "mm-fade-up"
      : animationType === "rise"
        ? "mm-rise-up"
        : animationType === "zoom"
          ? "mm-zoom-in"
          : null;
  const contentStyle: CSSProperties | undefined = animationClass
    ? {
        animationDelay: `${animationDelayMs}ms`,
        animationFillMode: "forwards",
      }
    : undefined;

  return (
    <section
      id={section.anchorId}
      className={cn(
        "relative w-full overflow-hidden scroll-mt-24",
        PADDING_Y[paddingY],
        PADDING_X[paddingX],
        useDefaultBackground ? defaults?.backgroundClass : null,
        hideClasses,
        section.className,
        className,
      )}
      style={style}
    >
      {showBackground && resolvedVideoUrl && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={resolvedVideoUrl}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {overlayStyle && (
        <div className="absolute inset-0" style={overlayStyle} />
      )}
      <div
        className={cn(
          "relative z-10 w-full",
          WIDTH[width],
          containerClassName,
          ALIGN[align],
          animationClass,
        )}
        style={contentStyle}
      >
        {children}
      </div>
    </section>
  );
}
