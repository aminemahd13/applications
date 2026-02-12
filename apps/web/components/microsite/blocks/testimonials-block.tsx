import { Block } from "@event-platform/shared";
import { resolveAssetUrl } from "../asset-url";
import { BlockSection } from "./block-section";

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
        <h2 className="microsite-display mb-12 text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {title}
        </h2>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderItems.map((item, idx: number) => {
          const rating = Number(item.rating);
          const safeRating = Number.isFinite(rating)
            ? Math.max(1, Math.min(5, Math.round(rating)))
            : 0;

          return (
            <article
              key={idx}
              className="microsite-card p-6 md:p-7"
            >
              {safeRating > 0 && (
                <p className="mb-3 tracking-wide text-[var(--mm-accent)]" aria-label={`${safeRating} star rating`}>
                  {"*".repeat(safeRating)}
                </p>
              )}
              <blockquote className="mb-6 text-base leading-relaxed text-[var(--mm-text-muted)] md:text-lg">
                &quot;{item.quote}&quot;
              </blockquote>

              <div className="flex items-center gap-3">
                {(item.avatarUrl || item.assetKey) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAssetUrl(item.avatarUrl || item.assetKey)}
                    alt={item.author}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-[var(--mm-text)]">{item.author}</p>
                  {item.role && (
                    <p className="text-sm text-[var(--mm-text-muted)]">{item.role}</p>
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
