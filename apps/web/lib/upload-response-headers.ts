/**
 * Response hardening for the same-origin `/uploads/*` storage proxy.
 *
 * Signed storage URLs are served from the app origin, so anything a browser
 * renders as a document there runs with the viewer's session. The API already
 * signs safe `response-content-type` / `response-content-disposition`
 * overrides; this is the second layer, which also covers URLs signed before
 * that change, cached resolver redirects, and storage backends that don't send
 * `nosniff` (AWS S3).
 */

/** Sandboxed, script-less document: passive images/media still display. */
export const UPLOAD_SANDBOX_CSP =
  "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

const MIME_ESSENCE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

// Keep in sync with isActiveContentMimeType in
// apps/api/src/common/storage/safe-response-headers.util.ts.
const ACTIVE_CONTENT_MIME_TYPES: ReadonlySet<string> = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/xsl",
  "application/xslt+xml",
  "multipart/x-mixed-replace",
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

/** Lowercase `type/subtype` without parameters, or null when unparseable. */
export function getMimeEssence(contentType: string | null | undefined): string | null {
  // Browsers split Content-Type on commas and use the LAST value
  // (`application/pdf;x=1,text/html` renders as HTML): any comma → unparseable,
  // which counts as active (sandbox + forced download).
  if (typeof contentType !== "string" || contentType.includes(",")) return null;
  const essence = contentType.split(";", 1)[0].trim().toLowerCase();
  return MIME_ESSENCE_PATTERN.test(essence) ? essence : null;
}

/** HTML, SVG, XML (incl. any `+xml`), XSL, JS, x-mixed-replace or unparseable. */
export function isActiveUploadContentType(contentType: string | null | undefined): boolean {
  const essence = getMimeEssence(contentType);
  if (!essence) return true;
  return ACTIVE_CONTENT_MIME_TYPES.has(essence) || essence.endsWith("+xml");
}

/**
 * Mutates the proxied response headers:
 * - always `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`
 * - a sandbox CSP for everything except PDFs (the browser PDF viewer does not
 *   run in sandboxed documents; subresource loads ignore the response CSP)
 * - `Content-Disposition: attachment` for successful responses of active
 *   types, keeping an upstream attachment (and its filename) when present
 */
export function hardenUploadResponseHeaders(headers: Headers, status: number): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  const contentType = headers.get("content-type");
  if (getMimeEssence(contentType) !== "application/pdf") {
    headers.set("Content-Security-Policy", UPLOAD_SANDBOX_CSP);
  }

  const isSuccess = status >= 200 && status < 300;
  if (isSuccess && isActiveUploadContentType(contentType)) {
    const existingDisposition = (headers.get("content-disposition") ?? "")
      .trim()
      .toLowerCase();
    if (!existingDisposition.startsWith("attachment")) {
      headers.set("Content-Disposition", "attachment");
    }
  }
}
