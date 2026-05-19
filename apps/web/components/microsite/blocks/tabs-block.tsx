"use client";

import { Block } from "@event-platform/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";
import { MarkdownText } from "../markdown-text";

type TabsBlockProps = {
  block: Extract<Block, { type: 'TABS' }>;
};

export function TabsBlock({ block }: TabsBlockProps) {
  const { tabs = [] } = block.data || {};
  const [activeTab, setActiveTab] = useState(0);

  if (tabs.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: "lg",
        width: "normal",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {/* Tab Headers — editorial pill row with active-state shadow. */}
      <div
        role="tablist"
        className="mb-8 inline-flex max-w-full overflow-x-auto rounded-full border border-[var(--mm-border)] bg-[var(--mm-soft)] p-1"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === idx;
          return (
            <button
              key={idx}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(idx)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-[var(--mm-surface)] text-[var(--mm-text)] shadow-sm"
                  : "text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]",
              )}
            >
              <MarkdownText content={tab.label} mode="inline" as="span" />
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-surface)] p-6 prose prose-zinc dark:prose-invert max-w-none md:p-10 md:prose-lg">
        <MarkdownText content={tabs[activeTab].content} />
      </div>
    </BlockSection>
  );
}
