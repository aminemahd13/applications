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
  const markdownBaseClassName =
    "[&_a]:font-medium [&_a]:text-[var(--mm-accent)] [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--mm-border)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[var(--mm-border)] [&_pre]:bg-[var(--mm-soft)] [&_pre]:p-4 [&_code]:rounded [&_code]:bg-[var(--mm-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_p]:my-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--mm-border)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-[var(--mm-border)] [&_td]:px-3 [&_td]:py-2";
  const markdownBlockClassName =
    mode === "block"
      ? "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1"
      : "";

  const Component = as;
  return (
    <Component
      className={cn(markdownBaseClassName, markdownBlockClassName, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
