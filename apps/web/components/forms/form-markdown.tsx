import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";
import type { ElementType } from "react";

type FormMarkdownProps = {
  content?: string | null;
  className?: string;
  mode?: "block" | "inline";
  as?: ElementType;
};

export function FormMarkdown({
  content,
  className,
  mode = "block",
  as = "div",
}: FormMarkdownProps) {
  const safeContent = typeof content === "string" ? content : "";
  const html = markdownToHtml(safeContent, mode);
  if (!html) return null;

  const Component = as;
  return (
    <Component
      className={cn(
        "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic",
        mode === "block"
          ? "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-2"
          : "[&_p]:my-0",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
