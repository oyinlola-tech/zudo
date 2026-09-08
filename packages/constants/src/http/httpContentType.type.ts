/**
 * MIME content type constants.
 *
 * @module http/httpContentType
 */

import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";

/**
 * Common MIME content types.
 */
export const ContentTypes = Object.freeze({
  JSON: "application/json",
  XML: "application/xml",
  FORM_URLENCODED: "application/x-www-form-urlencoded",
  MULTIPART_FORM_DATA: "multipart/form-data",
  TEXT_PLAIN: "text/plain",
  TEXT_HTML: "text/html",
  TEXT_CSS: "text/css",
  TEXT_CSV: "text/csv",
  TEXT_JAVASCRIPT: "text/javascript",
  OCTET_STREAM: "application/octet-stream",
  PDF: "application/pdf",
  ZIP: "application/zip",
  GZIP: "application/gzip",
  IMAGE_PNG: "image/png",
  IMAGE_JPEG: "image/jpeg",
  IMAGE_GIF: "image/gif",
  IMAGE_SVG_XML: "image/svg+xml",
  IMAGE_WEBP: "image/webp",
  AUDIO_MPEG: "audio/mpeg",
  VIDEO_MP4: "video/mp4",
  WILDCARD: "*/*",
} as const);

/** Type-safe MIME content type — the union of all {@link ContentTypes} values. */
export type ContentType = (typeof ContentTypes)[keyof typeof ContentTypes];

/**
 * Any MIME content type string — use when handling types outside the
 * {@link ContentTypes} catalogue (still autocompletes the known types).
 */
export type AnyContentType = ContentType | (string & {});

/**
 * Common charset values.
 *
 * These are IANA/MIME charset labels for use in `Content-Type` headers
 * (e.g. `charset=us-ascii`) — they are NOT Node.js `Buffer` encoding names
 * (Node uses `"ascii"`, `"utf16le"`, `"latin1"`, etc.).
 */
export const Charset = Object.freeze({
  UTF_8: "utf-8",
  ASCII: "us-ascii",
  ISO_8859_1: "iso-8859-1",
  UTF_16: "utf-16",
} as const);

/**
 * Build a Content-Type header value with optional charset.
 *
 * The charset is omitted for `multipart/*` types, where a charset parameter
 * is not meaningful (multipart types take a `boundary` parameter instead).
 *
 * @param mimeType - The MIME type (e.g. ContentTypes.JSON)
 * @param charset - Optional charset (e.g. Charset.UTF_8)
 * @returns Full Content-Type string (e.g. "application/json; charset=utf-8")
 * @throws {InvalidConstantError} if `mimeType` is empty, or `charset` is
 * provided but empty/blank.
 */
export function buildContentType(
  mimeType: AnyContentType,
  charset?: string,
): string {
  if (mimeType.trim().length === 0) {
    throw new InvalidConstantError(
      "buildContentType: mimeType must not be empty",
    );
  }
  if (charset !== undefined && charset.trim().length === 0) {
    throw new InvalidConstantError(
      "buildContentType: charset must not be empty",
    );
  }
  if (
    charset === undefined ||
    mimeType.toLowerCase().startsWith("multipart/")
  ) {
    return mimeType;
  }
  return `${mimeType}; charset=${charset}`;
}
