import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";

type GridItem = { title: string; text?: string; icon?: string };
type GridBlockData = Extract<Block, { type: "GRID" }>["data"] & { heading?: string };

const COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
};

export function GridBlock({ block }: { block: Extract<Block, { type: "GRID" }> }) {
  const data = (block.data || {}) as GridBlockData;
  const columns = typeof data.columns === "number" ? data.columns : 3;
  const items = Array.isArray(data.items) ? (data.items as GridItem[]) : [];
  const heading = typeof data.heading === "string" ? data.heading : "";

  if (items.length === 0) return null;

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
      {heading && (
        <h2 className="microsite-display mb-12 text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {heading}
        </h2>
      )}
      <div className={`grid gap-6 md:gap-8 ${COLS_CLASS[columns] ?? COLS_CLASS[3]}`}>
        {items.map((item, idx) => (
          <div
            key={idx}
            className="microsite-card p-6 transition-transform hover:-translate-y-1 md:p-7"
          >
            <h3 className="microsite-display mb-2 text-xl font-semibold text-[var(--mm-text)]">
              {item.title}
            </h3>
            {item.text && (
              <p className="text-sm leading-relaxed text-[var(--mm-text-muted)]">
                {item.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
