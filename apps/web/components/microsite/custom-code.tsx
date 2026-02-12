import { stripUnsafeHtml } from "@/lib/sanitize";

interface CustomCodeProps {
  html?: string;
  css?: string;
  className?: string;
}

export function MicrositeCustomCode({ html, css, className }: CustomCodeProps) {
  if (!html && !css) return null;

  return (
    <div className={className}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {html && (
        <div
          dangerouslySetInnerHTML={{ __html: stripUnsafeHtml(html) }}
        />
      )}
    </div>
  );
}
