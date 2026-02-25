/* eslint-disable @next/next/no-img-element */
import { Block } from "@event-platform/shared";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";
import { TextImageMediaFrame } from "./text-image-media-frame";

type TextImageLeftData = Extract<Block, { type: "TEXT_IMAGE_LEFT" }>["data"] & {
  heading?: string;
  text?: string;
  imageUrl?: string;
  assetKey?: string;
  alt?: string;
  caption?: string;
  directorMode?: boolean;
  frameIntervalMs?: number;
  imageFrames?: Array<{
    name?: string;
    assetKey?: string;
    url?: string;
    alt?: string;
    href?: string;
    caption?: string;
    animation?: string;
  }>;
  cta?: {
    label?: string;
    href?: string;
  };
};

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function TextImageLeftBlock({ block }: { block: Extract<Block, { type: "TEXT_IMAGE_LEFT" }> }) {
  const data = (block.data || {}) as TextImageLeftData;
  const heading = String(data.heading ?? "").trim();
  const text = String(data.text ?? "").trim();
  const imageSrc = resolveAssetUrl(String(data.imageUrl ?? data.assetKey ?? "").trim());
  const alt = String(data.alt ?? "").trim();
  const caption = String(data.caption ?? "").trim();
  const ctaLabel = String(data.cta?.label ?? "").trim();
  const ctaHref = String(data.cta?.href ?? "").trim();
  const imageFrames = (data.imageFrames ?? []).map((frame) => ({
    name: String(frame.name ?? "").trim(),
    src: resolveAssetUrl(String(frame.assetKey ?? frame.url ?? "").trim()),
    alt: String(frame.alt ?? "").trim(),
    href: String(frame.href ?? "").trim(),
    caption: String(frame.caption ?? "").trim(),
    animation: String(frame.animation ?? "").trim(),
  }));
  const hasImage = Boolean(imageSrc || imageFrames.some((frame) => frame.src));

  if (!heading && !text && !hasImage) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
        <div className={cn("grid items-center gap-6 md:gap-10", hasImage ? "lg:grid-cols-2" : "max-w-3xl")}>
        {hasImage && (
          <TextImageMediaFrame
            fallbackSrc={imageSrc}
            fallbackAlt={alt}
            fallbackCaption={caption}
            frames={imageFrames}
            directorMode={data.directorMode}
            frameIntervalMs={data.frameIntervalMs}
            heading={heading}
          />
        )}

        <div className="space-y-4 md:space-y-5">
          {heading && (
            <MarkdownText
              content={heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {text && (
            <MarkdownText
              content={text}
              className="text-base leading-relaxed text-[var(--mm-text-muted)] md:text-lg"
            />
          )}
          {ctaLabel && ctaHref && (
            <div className="pt-1">
              <Link
                href={ctaHref}
                target={isExternalHref(ctaHref) ? "_blank" : undefined}
                rel={isExternalHref(ctaHref) ? "noopener noreferrer" : undefined}
                className="mm-primary-button inline-flex h-10 items-center px-5 text-sm font-semibold"
              >
                <MarkdownText content={ctaLabel} mode="inline" as="span" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </BlockSection>
  );
}
