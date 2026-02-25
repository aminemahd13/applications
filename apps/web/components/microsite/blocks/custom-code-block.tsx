import { Block } from "@event-platform/shared";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";
import { stripUnsafeHtml } from "@/lib/sanitize";
import { MarkdownText } from "../markdown-text";

export function CustomCodeBlock({ block }: { block: Extract<Block, { type: "CUSTOM_CODE" }> }) {
  const data = (block.data || {}) as {
    title?: string;
    html?: string;
    css?: string;
    wrapperClass?: string;
    fullWidth?: boolean;
  };
  if (!data.html && !data.css) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: data.fullWidth ? "none" : "lg",
        width: data.fullWidth ? "full" : "wide",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
    >
      {data.title && (
        <MarkdownText
          content={data.title}
          mode="inline"
          as="h2"
          className="microsite-display mb-6 text-3xl font-semibold text-[var(--mm-text)] md:text-5xl"
        />
      )}
      <div className={cn("microsite-surface p-4 md:p-6", data.wrapperClass)}>
        {data.css && <style dangerouslySetInnerHTML={{ __html: data.css }} />}
        {data.html && (
          <div dangerouslySetInnerHTML={{ __html: stripUnsafeHtml(data.html) }} />
        )}
      </div>
    </BlockSection>
  );
}
