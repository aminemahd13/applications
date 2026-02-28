import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";
import { stripUnsafeHtml } from "@/lib/sanitize";
import { looksLikeHtml, markdownToHtml } from "@/lib/markdown";

type RichTextData = Extract<Block, { type: "RICH_TEXT" }>["data"] & {
  content?: string;
};

export function RichTextBlock({ block }: { block: Extract<Block, { type: "RICH_TEXT" }> }) {
  const data = (block.data || {}) as RichTextData;
  // The page editor stores HTML in `content`, the schema uses `doc`
  const rawContent =
    typeof data.content === "string"
      ? data.content
      : typeof data.doc === "string"
        ? data.doc
        : "";
  const htmlContent = looksLikeHtml(rawContent)
    ? stripUnsafeHtml(rawContent)
    : markdownToHtml(rawContent, "block");

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
      containerClassName="microsite-surface p-6 md:p-8 prose prose-zinc prose-lg prose-headings:font-semibold prose-a:font-medium prose-a:text-[var(--mm-accent)] prose-a:underline prose-a:underline-offset-4 prose-img:rounded-xl"
    >
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </BlockSection>
  );
}
