"use client";

import { Block } from "@event-platform/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";

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
      {/* Tab Headers */}
      <div className="mb-8 flex overflow-x-auto border-b border-[var(--mm-border)]">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            className={cn(
              "px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
              activeTab === idx
                ? "border-[var(--mm-accent)] text-[var(--mm-accent)]"
                : "border-transparent text-[var(--mm-text-muted)] hover:text-[var(--mm-text)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-surface)] p-6 prose prose-zinc max-w-none md:p-8">
        <div className="whitespace-pre-wrap">
           {tabs[activeTab].content}
        </div>
      </div>
    </BlockSection>
  );
}
