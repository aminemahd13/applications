import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "a",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "code", "pre", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span", "hr",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "width", "height",
  "class", "style",
];

export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return stripUnsafeHtml(html);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const ON_EVENT_ATTR_RE =
  /\s+on[a-z0-9_-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;
const URL_ATTR_RE = /\s+(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function isUnsafeUrlValue(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u001F\u007F\s]+/g, "").toLowerCase();
  return normalized.startsWith("javascript:");
}

export function stripUnsafeHtml(html: string): string {
  if (!html) return "";
  const withoutScriptsAndHandlers = html
    .replace(SCRIPT_TAG_RE, "")
    .replace(ON_EVENT_ATTR_RE, "");

  return withoutScriptsAndHandlers.replace(
    URL_ATTR_RE,
    (
      original,
      attr: string,
      doubleQuotedValue: string | undefined,
      singleQuotedValue: string | undefined,
      unquotedValue: string | undefined,
    ) => {
      const value = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? "";
      if (!isUnsafeUrlValue(value)) {
        return original;
      }
      return ` ${attr}="#"`;
    },
  );
}
