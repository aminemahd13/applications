import { Block } from "@event-platform/shared";
import Link from "next/link";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function TextBlock({
  block,
  isPreview = false,
}: {
  block: Extract<Block, { type: "TEXT" }>;
  isPreview?: boolean;
}) {
  const data = (block.data || {}) as { heading?: string; text?: string; cta?: { label?: string; href?: string } };
  const heading = String(data.heading ?? "").trim();
  const text = String(data.text ?? "").trim();
  const ctaLabel = String(data.cta?.label ?? "").trim();
  const ctaHref = String(data.cta?.href ?? "").trim();

  if (!heading && !text && !isPreview) return null;

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
      <div className="max-w-3xl space-y-4 md:space-y-5">
        {(heading || isPreview) && (
          <MarkdownText
            content={heading || "Text block heading"}
            mode="inline"
            as="h2"
            className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
          />
        )}
        {(text || isPreview) && (
          <MarkdownText
            content={
              text ||
              "Add your narrative text from the block editor. This section renders without card styling."
            }
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
    </BlockSection>
  );
}
