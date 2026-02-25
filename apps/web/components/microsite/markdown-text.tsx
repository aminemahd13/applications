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

  const Component = as;
  return (
    <Component
      className={cn(className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
