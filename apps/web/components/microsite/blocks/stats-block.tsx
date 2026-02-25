import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type StatItem = NonNullable<Extract<Block, { type: "STATS" }>["data"]>["items"][number];

export function StatsBlock({ block }: { block: Extract<Block, { type: 'STATS' }> }) {
  const data = (block.data || {}) as Extract<Block, { type: "STATS" }>["data"] & {
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
        width: "wide",
        align: "center",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="space-y-10 rounded-[1.9rem] border border-[var(--mm-border)] bg-[var(--mm-surface)] px-6 py-10 shadow-[0_22px_56px_rgba(15,23,42,0.12)] md:px-10 md:py-12"
    >
      {heading && (
        <MarkdownText
          content={heading as string}
          mode="inline"
          as="h2"
          className="microsite-display text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
        />
      )}
      <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4 md:divide-x md:divide-[var(--mm-border)]">
        {items.map((stat: StatItem, idx: number) => (
          <div key={idx} className="flex flex-col items-center px-4">
            <span className="mb-2 bg-gradient-to-br from-[var(--mm-accent)] to-[var(--mm-accent-2)] bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
              <MarkdownText content={`${stat.value ?? ""}${stat.suffix ?? ""}`} mode="inline" as="span" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--mm-text-muted)]">
              <MarkdownText content={stat.label} mode="inline" as="span" />
            </span>
          </div>
        ))}
      </div>
    </BlockSection>
  );
}
