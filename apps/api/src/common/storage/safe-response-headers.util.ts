/**
 * Serve-time hardening for user-uploaded objects.
 *
 * Signed GET URLs land on the app origin in production (the `/uploads` proxy),
 * so an uploaded file that a browser renders as a document (HTML, SVG, XML…)
 * would run script with the viewer's session. Every signed GET for a
 * user-supplied object therefore overrides the response type and disposition:
 * only a small allow-list of passive types is ever served inline, everything
 * else is downloaded as `application/octet-stream`.
 *
 * Pure helpers — no Nest/AWS dependencies — so they are easy to unit test.
 */

/** A bare `type/subtype` token (RFC 7231 token chars), lowercase. */
const MIME_ESSENCE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

const MIME_ESSENCE_ALIASES: Readonly<Record<string, string>> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

/**
 * Types served inline for private (applicant) files. Keep identical to
 * PREVIEWABLE_MIME_TYPES in apps/web/lib/review-context.ts.
 */
export const PRIVATE_INLINE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
];

/**
 * Types served inline for public assets (microsite media, certificate assets).
 * Videos are passive and `<video>` needs the real type.
 */
export const PUBLIC_ASSET_INLINE_MIME_TYPES: readonly string[] = [
  ...PRIVATE_INLINE_MIME_TYPES,
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];

/**
 * Types a browser renders as a document (and so can run script in), plus
 * script types. `+xml` suffixes are handled separately.
 */
const ACTIVE_CONTENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/xsl',
  'application/xslt+xml',
  'multipart/x-mixed-replace',
  // WHATWG "JavaScript MIME type essence matches"
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

const MAX_DISPOSITION_FILENAME_CODE_POINTS = 180;
const DEFAULT_DOWNLOAD_FILENAME = 'download';
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export type SafeResponseProfile = 'private' | 'public-asset';

export interface SafeResponseHeaders {
  contentType: string;
  contentDisposition: string;
  inline: boolean;
}

/**
 * Lowercases, trims, drops `;parameters` and maps legacy JPEG aliases.
 * Returns null unless the result is a bare `type/subtype` token.
 */
export function normalizeMimeEssence(raw: unknown): string | null {
  // Browsers split Content-Type on commas and use the LAST value, so
  // `application/pdf;x=1,text/html` renders as HTML: treat any comma as
  // unparseable (→ blocked at upload, octet-stream attachment when served).
  if (typeof raw !== 'string' || raw.includes(',')) return null;
  const essence = raw.split(';', 1)[0].trim().toLowerCase();
  if (!MIME_ESSENCE_PATTERN.test(essence)) return null;
  return MIME_ESSENCE_ALIASES[essence] ?? essence;
}

/**
 * True when the value is exactly a `type/subtype` token (after trim and
 * lowercase) — no parameters, no whitespace, no garbage.
 */
export function isBareMimeType(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  return MIME_ESSENCE_PATTERN.test(raw.trim().toLowerCase());
}

/**
 * True for types a browser may execute or render as an active document:
 * HTML, XHTML, SVG, XML (and any `+xml`), XSL, JavaScript/ECMAScript,
 * multipart/x-mixed-replace — and anything unparseable.
 */
export function isActiveContentMimeType(raw: unknown): boolean {
  const essence = normalizeMimeEssence(raw);
  if (!essence) return true;
  return ACTIVE_CONTENT_MIME_TYPES.has(essence) || essence.endsWith('+xml');
}

function replaceLoneSurrogates(value: string): string {
  return value.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    '\ufffd',
  );
}

function sanitizeDispositionFilename(filename: unknown): string {
  const raw = typeof filename === 'string' ? filename : '';
  // Drop control characters (incl. CR/LF) and normalize lone surrogates so
  // encodeURIComponent cannot throw.
  const cleaned = replaceLoneSurrogates(raw.replace(CONTROL_CHARACTERS, ''))
    .replace(/[\\/]/g, '_')
    .trim();
  if (!cleaned) return DEFAULT_DOWNLOAD_FILENAME;

  const codePoints = Array.from(cleaned);
  if (codePoints.length <= MAX_DISPOSITION_FILENAME_CODE_POINTS) {
    return cleaned;
  }

  // Keep a short extension so the downloaded file still opens correctly.
  const dotIndex = cleaned.lastIndexOf('.');
  const extension =
    dotIndex > 0 && cleaned.length - dotIndex <= 16
      ? cleaned.slice(dotIndex)
      : '';
  const extensionLength = Array.from(extension).length;
  return (
    codePoints
      .slice(0, MAX_DISPOSITION_FILENAME_CODE_POINTS - extensionLength)
      .join('') + extension
  );
}

function toAsciiFallbackFilename(filename: string): string {
  const ascii = filename
    .replace(/["\\]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .trim();
  return ascii || DEFAULT_DOWNLOAD_FILENAME;
}

/** RFC 5987 `ext-value` encoding (encodeURIComponent also leaves '()*! alone). */
function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*!]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `inline|attachment; filename="<ascii fallback>"; filename*=UTF-8''<encoded>`.
 * Header-injection safe: control characters are removed and the UTF-8 form is
 * percent-encoded.
 */
export function buildContentDisposition(
  kind: 'inline' | 'attachment',
  filename: unknown,
): string {
  const safeName = sanitizeDispositionFilename(filename);
  return `${kind}; filename="${toAsciiFallbackFilename(safeName)}"; filename*=UTF-8''${encodeRfc5987Value(safeName)}`;
}

/**
 * Decide the response type/disposition for a signed GET of an uploaded object.
 *
 * - allow-listed type → canonical type, `inline` (or `attachment` when
 *   `forceDownload`)
 * - SVG on the `public-asset` profile → keeps `image/svg+xml` (so `<img>` and
 *   canvas can render it) but `attachment`, so a top-level open downloads
 *   instead of executing
 * - anything else → `application/octet-stream` + `attachment`
 */
export function resolveSafeResponseHeaders(input: {
  mimeType: unknown;
  filename?: unknown;
  forceDownload?: boolean;
  profile: SafeResponseProfile;
}): SafeResponseHeaders {
  const essence = normalizeMimeEssence(input.mimeType);
  const inlineAllowList =
    input.profile === 'public-asset'
      ? PUBLIC_ASSET_INLINE_MIME_TYPES
      : PRIVATE_INLINE_MIME_TYPES;

  if (essence && inlineAllowList.includes(essence)) {
    const inline = !input.forceDownload;
    return {
      contentType: essence,
      contentDisposition: buildContentDisposition(
        inline ? 'inline' : 'attachment',
        input.filename,
      ),
      inline,
    };
  }

  // Other passive media (e.g. video/x-m4v, audio/mpeg) still needs its real
  // type for <video>/<audio>. `+xml` media types stay active (Blink renders
  // any */*+xml as an XML document).
  if (
    input.profile === 'public-asset' &&
    essence &&
    /^(video|audio)\//.test(essence) &&
    !isActiveContentMimeType(essence)
  ) {
    const inline = !input.forceDownload;
    return {
      contentType: essence,
      contentDisposition: buildContentDisposition(
        inline ? 'inline' : 'attachment',
        input.filename,
      ),
      inline,
    };
  }

  if (essence === 'image/svg+xml' && input.profile === 'public-asset') {
    return {
      contentType: essence,
      contentDisposition: buildContentDisposition('attachment', input.filename),
      inline: false,
    };
  }

  return {
    contentType: 'application/octet-stream',
    contentDisposition: buildContentDisposition('attachment', input.filename),
    inline: false,
  };
}
