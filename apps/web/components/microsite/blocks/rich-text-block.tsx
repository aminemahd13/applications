import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";
import { stripUnsafeHtml } from "@/lib/sanitize";

type RichTextData = Extract<Block, { type: "RICH_TEXT" }>["data"] & {
  content?: string;
};

export function RichTextBlock({ block }: { block: Extract<Block, { type: "RICH_TEXT" }> }) {
  const data = (block.data || {}) as RichTextData;
  // The page editor stores HTML in `content`, the schema uses `doc`
  const htmlContent =
    typeof data.content === "string"
      ? data.content
      : typeof data.doc === "string"
        ? data.doc
        : "";

  if (!htmlContent) return null;

  return (
    <BlockSection
      block={block}
      defaults={{
        paddingY: "md",
        paddingX: "lg",
        width: "narrow",
        align: "left",
        backgroundClass: "bg-transparent",
      }}
      containerClassName="microsite-surface p-6 md:p-8 prose prose-zinc prose-lg prose-headings:font-semibold prose-a:text-[var(--mm-accent)] prose-img:rounded-xl"
    >
      <div dangerouslySetInnerHTML={{ __html: stripUnsafeHtml(htmlContent) }} />
    </BlockSection>
  );
}
