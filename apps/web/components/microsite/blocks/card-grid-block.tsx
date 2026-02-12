import { Block } from "@event-platform/shared";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { BlockSection } from "./block-section";

type CardGridItem = NonNullable<Extract<Block, { type: "CARD_GRID" }>["data"]>["items"][number];
type CardGridRenderItem = CardGridItem & {
  description?: string;
};
type CardGridData = Extract<Block, { type: "CARD_GRID" }>["data"] & {
  columns?: number;
  cards?: CardGridRenderItem[];
  items?: CardGridRenderItem[];
  heading?: string;
};

const LUCIDE_ICON_MAP = Icons as unknown as Record<string, LucideIcon>;

export function CardGridBlock({ block }: { block: Extract<Block, { type: 'CARD_GRID' }> }) {
  const data = (block.data || {}) as CardGridData;
  const columns = data.columns ?? 3;
  const items: CardGridRenderItem[] = data.cards ?? data.items ?? [];
  const heading = data.heading;
  const columnCount = Math.max(1, Number(columns) || 3);
  const columnClass =
    columnCount === 1
      ? "lg:grid-cols-1"
      : columnCount === 2
        ? "lg:grid-cols-2"
        : columnCount === 4
          ? "lg:grid-cols-4"
          : "lg:grid-cols-3";

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
      {heading && (
        <h2 className="microsite-display mb-12 text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {heading}
        </h2>
      )}
      <div className={`grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 ${columnClass}`}>
        {items.map((item: CardGridRenderItem, idx: number) => {
          const IconComponent = item.icon ? LUCIDE_ICON_MAP[item.icon] : undefined;
          const description = item.description ?? item.text;

          return (
            <article
              key={idx}
              className="microsite-card relative overflow-hidden p-6 transition-transform duration-200 hover:-translate-y-1"
            >
              <span className="mm-grid-plus absolute left-2 top-2 text-[var(--mm-text-muted)] opacity-60" />
              <span className="mm-grid-plus absolute bottom-2 left-2 text-[var(--mm-text-muted)] opacity-60" />
              <span className="mm-grid-plus absolute right-2 top-2 text-[var(--mm-text-muted)] opacity-60" />
              <span className="mm-grid-plus absolute bottom-2 right-2 text-[var(--mm-text-muted)] opacity-60" />
              {IconComponent && (
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--mm-soft)] text-[var(--mm-accent)]">
                  <IconComponent className="h-5 w-5" />
                </div>
              )}

              <h3 className="microsite-display mb-2 text-2xl font-semibold text-[var(--mm-text)]">
                {item.title}
              </h3>

              {description && (
                <p className="flex-grow leading-relaxed text-[var(--mm-text-muted)]">
                  {description}
                </p>
              )}

              {item.cta?.label && item.cta?.href && (
                <Link
                  href={item.cta.href}
                  className="mt-5 inline-flex items-center text-sm font-semibold text-[var(--mm-accent)] transition-opacity hover:opacity-80"
                >
                  {item.cta.label}
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </BlockSection>
  );
}
