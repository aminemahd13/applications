import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type TestimonialItem = NonNullable<Extract<Block, { type: "TESTIMONIALS" }>["data"]>["items"][number];
type TestimonialRenderItem = TestimonialItem & {
  avatarUrl?: string;
  assetKey?: string;
  rating?: number | string;
};

export function TestimonialsBlock({ block }: { block: Extract<Block, { type: "TESTIMONIALS" }> }) {
  const { title, items = [] } = block.data || {};
  const renderItems = items as TestimonialRenderItem[];
  if (renderItems.length === 0) return null;

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
    >
      {title && (
        <MarkdownText
          content={title}
          mode="inline"
          as="h2"
          className="microsite-display mb-12 text-display-lg text-center text-[var(--mm-text)]"
        />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {renderItems.map((item, idx: number) => {
          const rating = Number(item.rating);
          const safeRating = Number.isFinite(rating)
            ? Math.max(1, Math.min(5, Math.round(rating)))
            : 0;

          return (
            <article
              key={idx}
              className="microsite-card relative overflow-hidden p-8 md:p-10"
            >
              {/* Editorial quote-mark ornament. Decorative only; aria-hidden. */}
              <span
                aria-hidden="true"
                className="font-display pointer-events-none absolute -top-6 left-6 select-none text-[7rem] leading-none text-[color-mix(in_oklab,var(--mm-accent)_18%,transparent)]"
              >
                &ldquo;
              </span>

              {safeRating > 0 && (
                <p
                  className="relative mb-4 text-sm tracking-[0.3em] text-[var(--mm-accent)]"
                  aria-label={`${safeRating} star rating`}
                >
                  {"★".repeat(safeRating)}
                </p>
              )}
              <blockquote className="relative mb-6 text-lg leading-relaxed text-[var(--mm-text)] md:text-xl md:leading-[1.6]">
                <MarkdownText content={item.quote} mode="inline" as="span" />
              </blockquote>

              <div className="relative flex items-center gap-3">
                {(item.avatarUrl || item.assetKey) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(item.avatarUrl || item.assetKey)}
                    alt={item.author}
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-[var(--mm-border)]"
                  />
                )}
                <div>
                  <p className="font-semibold text-[var(--mm-text)]">
                    <MarkdownText content={item.author} mode="inline" as="span" />
                  </p>
                  {item.role && (
                    <p className="text-sm text-[var(--mm-text-muted)]">
                      <MarkdownText content={item.role} mode="inline" as="span" />
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </BlockSection>
  );
}
