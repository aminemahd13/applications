"use client";

import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type RanksData = Extract<Block, { type: "RANKS" }>["data"];

/* Map prize labels to Tailwind-friendly colours */
const PRIZE_STYLES: Record<string, { bg: string; text: string }> = {
  "first prize":   { bg: "bg-amber-500/20",   text: "text-amber-300" },
  "second prize":  { bg: "bg-slate-400/20",    text: "text-slate-300" },
  "third prize":   { bg: "bg-orange-600/20",   text: "text-orange-400" },
  "gold medal":    { bg: "bg-yellow-500/20",   text: "text-yellow-300" },
  "silver medal":  { bg: "bg-slate-400/20",    text: "text-slate-300" },
  "bronze medal":  { bg: "bg-amber-700/20",    text: "text-amber-500" },
  "honorable mention": { bg: "bg-sky-500/15",  text: "text-sky-300" },
};

function PrizeBadge({ value }: { value: string }) {
  const key = value.toLowerCase().trim();
  const style = PRIZE_STYLES[key];
  if (!style) {
    return <MarkdownText content={value} mode="inline" as="span" className="text-[var(--mm-text-muted)] text-xs" />;
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap ${style.bg} ${style.text}`}
    >
      <MarkdownText content={value} mode="inline" as="span" />
    </span>
  );
}

export function RanksBlock({ block }: { block: Extract<Block, { type: "RANKS" }> }) {
  const data = (block.data || {}) as RanksData & { heading?: string; description?: string };
  const columns = data.columns ?? [];
  const rows = data.rows ?? [];
  const highlightPrizes = data.highlightPrizes !== false;
  const heading = data.heading;
  const description = data.description;

  if (columns.length === 0 && rows.length === 0) return null;

  // Detect the prize column index (last column if its header contains "prize" or "award")
  const prizeColIdx = highlightPrizes
    ? columns.findIndex((c) => /prize|award|medal|mention/i.test(c))
    : -1;

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
      containerClassName="space-y-8"
    >
      {/* Header */}
      {(heading || description) && (
        <div className="text-center space-y-2">
          {heading && (
            <MarkdownText
              content={heading}
              mode="inline"
              as="h2"
              className="microsite-display text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
            />
          )}
          {description && (
            <MarkdownText
              content={description}
              className="text-base text-[var(--mm-text-muted)] max-w-2xl mx-auto"
            />
          )}
        </div>
      )}

      {/* Table wrapper */}
      <div className="w-full overflow-x-auto rounded-2xl border border-[var(--mm-border)] shadow-[0_22px_56px_rgba(15,23,42,0.12)]">
        <table className="w-full min-w-[640px] text-sm">
          {/* Column headers */}
          <thead>
            <tr
              className="text-left text-xs font-semibold uppercase tracking-wider"
              style={{
                background:
                  "linear-gradient(135deg, var(--mm-accent), color-mix(in oklab, var(--mm-accent) 70%, var(--mm-accent-2)))",
                color: "white",
              }}
            >
              {columns.map((col, ci) => (
                <th
                  key={ci}
                  className="px-4 py-3 first:rounded-tl-2xl last:rounded-tr-2xl whitespace-nowrap"
                >
                  <MarkdownText content={col} mode="inline" as="span" />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-[var(--mm-border)] transition-colors hover:bg-[var(--mm-surface-muted)] ${
                  ri % 2 === 0
                    ? "bg-[var(--mm-surface)]"
                    : "bg-[color-mix(in_oklab,var(--mm-surface)_94%,var(--mm-accent))]"
                }`}
              >
                {columns.map((_, ci) => {
                  const cell = row[ci] ?? "";
                  const isPrize = ci === prizeColIdx && highlightPrizes;
                  return (
                    <td
                      key={ci}
                      className="px-4 py-3 text-[var(--mm-text)] whitespace-nowrap"
                    >
                      {isPrize ? <PrizeBadge value={cell} /> : <MarkdownText content={cell} mode="inline" as="span" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      {rows.length > 0 && (
        <p className="text-center text-xs text-[var(--mm-text-muted)]">
          Showing {rows.length} result{rows.length !== 1 ? "s" : ""}
        </p>
      )}
    </BlockSection>
  );
}
