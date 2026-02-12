import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";

type TimelineItem = NonNullable<Extract<Block, { type: "TIMELINE" }>["data"]>["items"][number];
type TimelineRenderItem = TimelineItem & {
  title?: string;
  description?: string;
};

export function TimelineBlock({ block }: { block: Extract<Block, { type: 'TIMELINE' }> }) {
  const data = (block.data || {}) as Extract<Block, { type: "TIMELINE" }>["data"] & {
    heading?: string;
  };
  const items = data.items ?? [];
  const heading = data.heading;

  if (items.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "xl",
        paddingX: "lg",
        width: "normal",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      <h2 className="microsite-display mb-14 text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
        {(heading as string) || "Schedule"}
      </h2>
      <div className="relative ml-4 space-y-10 border-l-2 border-[var(--mm-border)] md:ml-6">
        {items.map((item: TimelineRenderItem, idx: number) => (
          <div key={idx} className="relative pl-7 md:pl-10">
            <div className="absolute -left-[10px] top-1.5 h-4 w-4 rounded-full bg-[var(--mm-accent)] ring-4 ring-[var(--mm-bg)] shadow-sm" />

            <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:gap-8">
              <div className="w-fit rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--mm-accent)] md:min-w-[7rem] md:text-center">
                {item.date}
              </div>
              <div className="microsite-card px-5 py-4">
                <h3 className="microsite-display mb-2 text-2xl font-semibold text-[var(--mm-text)]">
                  {item.title ?? item.label}
                </h3>
                {(item.description ?? item.details) && (
                  <p className="whitespace-pre-wrap leading-relaxed text-[var(--mm-text-muted)]">
                    {item.description ?? item.details}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
