"use client";

import { Block } from "@event-platform/shared";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";

type FaqItem = NonNullable<Extract<Block, { type: "FAQ" }>["data"]>["items"][number];
type FaqRenderItem = FaqItem & { question?: string; answer?: string };

export function FaqBlock({ block }: { block: Extract<Block, { type: 'FAQ' }> }) {
  const data = (block.data || {}) as Extract<Block, { type: "FAQ" }>["data"] & {
    heading?: string;
  };
  const items = data.items ?? [];
  const heading = typeof data.heading === "string" ? data.heading.trim() : "Frequently Asked Questions";
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "lg",
        paddingX: "lg",
        width: "narrow",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {heading && (
        <h2 className="microsite-display mb-12 text-center text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {heading}
        </h2>
      )}
      <div className="space-y-4">
        {items.map((item: FaqRenderItem, idx: number) => {
          const isOpen = openIndex === idx;
          const question = item.question ?? item.q;
          const answer = item.answer ?? item.a;
          return (
            <div 
              key={idx} 
              className="overflow-hidden rounded-2xl border border-[var(--mm-border)] bg-[var(--mm-surface)] transition-all duration-300"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="flex w-full items-center justify-between p-6 text-left focus:outline-none"
              >
                <span className="text-lg font-medium text-[var(--mm-text)]">
                  {question}
                </span>
                {isOpen ? (
                  <ChevronUp className="h-5 w-5 text-[var(--mm-text-muted)]" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-[var(--mm-text-muted)]" />
                )}
              </button>
              <div 
                className={cn(
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className="border-t border-[var(--mm-border)] p-6 pt-0 leading-relaxed text-[var(--mm-text-muted)]">
                  {answer}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </BlockSection>
  );
}
