import { Block } from "@event-platform/shared";
import Link from "next/link";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";
import { cn } from "@/lib/utils";

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
  const data = (block.data || {}) as {
    heading?: string;
    text?: string;
    cta?: { label?: string; href?: string };
    section?: { align?: "left" | "center" | "right" };
  };
  const heading = String(data.heading ?? "").trim();
  const text = String(data.text ?? "").trim();
  const ctaLabel = String(data.cta?.label ?? "").trim();
  const ctaHref = String(data.cta?.href ?? "").trim();
  const align = data.section?.align ?? "left";
  const wrapperAlignClass = align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : "";

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
      <div
        className={cn(
          "mm-measure-wide space-y-5 md:space-y-6",
          wrapperAlignClass,
        )}
      >
        {(heading || isPreview) && (
          <MarkdownText
            content={heading || "Text block heading"}
            mode="inline"
            as="h2"
            className="microsite-display text-display-md text-[var(--mm-text)]"
          />
        )}
        {(text || isPreview) && (
          <MarkdownText
            content={
              text ||
              "Add your narrative text from the block editor. This section renders without card styling."
            }
            className="text-base leading-relaxed text-[var(--mm-text-muted)] md:text-lg md:leading-[1.7] [&>p:first-of-type]:text-lg md:[&>p:first-of-type]:text-xl [&>p:first-of-type]:text-[var(--mm-text)]"
          />
        )}
        {ctaLabel && ctaHref && (
          <div className="pt-2">
            <Link
              href={ctaHref}
              target={isExternalHref(ctaHref) ? "_blank" : undefined}
              rel={isExternalHref(ctaHref) ? "noopener noreferrer" : undefined}
              className="mm-primary-button inline-flex h-11 items-center gap-2 px-6 text-sm font-semibold"
            >
              <MarkdownText content={ctaLabel} mode="inline" as="span" />
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </div>
    </BlockSection>
  );
}
