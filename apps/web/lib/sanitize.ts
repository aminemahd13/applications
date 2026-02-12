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
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const ON_EVENT_ATTR_RE = /\son\w+=(\"[^\"]*\"|'[^']*')/gi;
const JS_URL_RE = /\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi;

export function stripUnsafeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(SCRIPT_TAG_RE, "")
    .replace(ON_EVENT_ATTR_RE, "")
    .replace(JS_URL_RE, ' $1="#"');
}
