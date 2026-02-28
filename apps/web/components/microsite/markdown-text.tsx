import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";
import type { ElementType } from "react";

type MarkdownTextProps = {
  content?: string | null;
  className?: string;
  mode?: "block" | "inline";
  as?: ElementType;
};

export function MarkdownText({
  content,
  className,
  mode = "block",
  as = "div",
}: MarkdownTextProps) {
  const safeContent = typeof content === "string" ? content : "";
  const html = markdownToHtml(safeContent, mode);
  if (!html) return null;
  const markdownBlockClassName =
    mode === "block"
      ? "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1"
      : "";

  const Component = as;
  return (
    <Component
      className={cn(markdownBlockClassName, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
