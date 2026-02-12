import { Block } from "@event-platform/shared";
import { cn } from "@/lib/utils";
import { BlockSection } from "./block-section";
import { stripUnsafeHtml } from "@/lib/sanitize";

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
        <h2 className="microsite-display mb-6 text-3xl font-semibold text-[var(--mm-text)] md:text-5xl">
          {data.title}
        </h2>
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
