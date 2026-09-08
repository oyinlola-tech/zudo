/**
 * HTTP compression utilities.
 *
 * Handles compression negotiation and response encoding decisions.
 * Actual compression/decompression is intentionally delegated to adapters.
 */

import { getHeader, setHeader } from "../httpProtocol/http.protocol.js";
import type { HTTPHeader } from "../httpProtocol/http.protocol.js";
import { parseAcceptEncoding } from "../httpNegotiation/httpNegotiation.core.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CompressionEncoding = "br" | "gzip" | "deflate" | "identity";

export interface CompressionPreference {
  readonly encoding: CompressionEncoding;
  readonly quality: number;
  readonly specificity: number;
  readonly order: number;
}

export interface CompressionOptions {
  readonly threshold?: number;
  readonly preferredEncodings?: readonly CompressionEncoding[];
  readonly minimumQuality?: number;
  readonly enabled?: boolean;
}

export interface CompressionDecision {
  readonly encoding: CompressionEncoding;
  readonly compress: boolean;
  readonly quality: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_COMPRESSION_THRESHOLD = 1024;

export const DEFAULT_MIN_COMPRESSION_QUALITY = 0.1;

export const DEFAULT_PREFERRED_ENCODINGS: readonly CompressionEncoding[] = [
  "br",
  "gzip",
  "deflate",
  "identity",
];

export const COMPRESSION_ENCODINGS: readonly CompressionEncoding[] = [
  "br",
  "gzip",
  "deflate",
  "identity",
];

/**
 * Upper bound on the number of `Accept-Encoding` entries considered.
 *
 * The header is attacker-controlled and free to send; without a cap a single
 * request can carry a thousand entries whose parsing and sorting cost is paid
 * on the request-serving thread.
 */
export const MAX_ACCEPT_ENCODING_ENTRIES = 64;

/* -------------------------------------------------------------------------- */
/* Encoding Validation                                                        */
/* -------------------------------------------------------------------------- */

export function isCompressionEncoding(
  value: string,
): value is CompressionEncoding {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "br" ||
    normalized === "gzip" ||
    normalized === "deflate" ||
    normalized === "identity"
  );
}

export function normalizeCompressionEncoding(
  value: string,
): CompressionEncoding | undefined {
  const normalized = value.trim().toLowerCase();

  return isCompressionEncoding(normalized) ? normalized : undefined;
}

/* -------------------------------------------------------------------------- */
/* Accept-Encoding                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The parsed form of one `Accept-Encoding` header.
 *
 * The header is parsed exactly once per response and this value is threaded
 * through negotiation, replacing the up-to-twelve re-parses of the same
 * attacker-controlled string that the previous shape required.
 */
interface ParsedCompressionHeader {
  readonly entries: readonly CompressionPreference[];
  readonly wildcard: number | undefined;

  /**
   * The header was present but empty.
   *
   * RFC 9110 §12.5.3: "An Accept-Encoding header field with a field value
   * that is empty implies that the client does not want any content coding in
   * response." That is the opposite of an absent header, which means anything
   * is acceptable — and the two must not be conflated, or an embedded client
   * that cannot decompress is handed brotli.
   */
  readonly empty: boolean;
}

function parseCompressionHeader(
  header: string | undefined | null,
): ParsedCompressionHeader {
  if (typeof header === "string" && header.trim().length === 0) {
    return { entries: [], wildcard: undefined, empty: true };
  }

  const parsed = parseAcceptEncoding(header).slice(
    0,
    MAX_ACCEPT_ENCODING_ENTRIES,
  );

  const entries: CompressionPreference[] = [];

  let wildcard: number | undefined;

  for (const preference of parsed) {
    const value = preference.value.trim().toLowerCase();

    if (value === "*") {
      if (wildcard === undefined || preference.quality > wildcard) {
        wildcard = preference.quality;
      }

      continue;
    }

    const encoding = normalizeCompressionEncoding(value);

    /*
     * An unknown coding is dropped, not relabelled. Aliasing `zstd;q=0.9` to
     * `identity` made a client that merely prefers zstd look like a client
     * that strongly prefers no compression at all, and beat its own explicit
     * `gzip` fallback.
     */
    if (encoding === undefined) {
      continue;
    }

    entries.push({
      encoding,
      quality: preference.quality,
      specificity: preference.specificity,
      order: preference.order,
    });
  }

  return { entries, wildcard, empty: false };
}

/**
 * Parses `Accept-Encoding` into the codings this package can emit.
 *
 * Codings outside `br | gzip | deflate | identity` — and the `*` wildcard —
 * are omitted rather than being relabelled as `identity`.
 */
export function parseCompressionPreferences(
  header: string | undefined | null,
): CompressionPreference[] {
  return [...parseCompressionHeader(header).entries];
}

/* -------------------------------------------------------------------------- */
/* Quality                                                                    */
/* -------------------------------------------------------------------------- */

function qualityFor(
  parsed: ParsedCompressionHeader,
  encoding: CompressionEncoding,
): number {
  if (parsed.empty) {
    return encoding === "identity" ? 1 : 0;
  }

  if (parsed.entries.length === 0 && parsed.wildcard === undefined) {
    return 1;
  }

  let best: CompressionPreference | undefined;

  for (const preference of parsed.entries) {
    if (preference.encoding !== encoding) {
      continue;
    }

    if (
      !best ||
      preference.quality > best.quality ||
      (preference.quality === best.quality &&
        preference.specificity > best.specificity)
    ) {
      best = preference;
    }
  }

  if (best) {
    return best.quality;
  }

  /*
   * A wildcard covers any coding that was not named explicitly — including
   * identity, whose implicit acceptability a wildcard overrides.
   */
  if (parsed.wildcard !== undefined) {
    return parsed.wildcard;
  }

  /*
   * RFC 9110 §12.5.3: identity is acceptable unless explicitly rejected.
   */
  return encoding === "identity" ? 1 : 0;
}

export function getCompressionQuality(
  acceptEncoding: string | undefined | null,
  encoding: CompressionEncoding,
): number {
  return qualityFor(parseCompressionHeader(acceptEncoding), encoding);
}

/* -------------------------------------------------------------------------- */
/* Negotiation                                                                */
/* -------------------------------------------------------------------------- */

export function negotiateCompression(
  acceptEncoding: string | undefined | null,
  available:
    readonly CompressionEncoding[] | undefined = DEFAULT_PREFERRED_ENCODINGS,
): CompressionEncoding {
  return negotiateParsed(parseCompressionHeader(acceptEncoding), available);
}

function negotiateParsed(
  parsed: ParsedCompressionHeader,
  available:
    readonly CompressionEncoding[] | undefined = DEFAULT_PREFERRED_ENCODINGS,
): CompressionEncoding {
  const candidates = [...available];

  if (candidates.length === 0) {
    return "identity";
  }

  let best:
    | {
        encoding: CompressionEncoding;
        quality: number;
        priority: number;
      }
    | undefined;

  for (let index = 0; index < candidates.length; index += 1) {
    const encoding = candidates[index];

    if (encoding === undefined) {
      continue;
    }

    const quality = qualityFor(parsed, encoding);

    if (quality <= 0) {
      continue;
    }

    const priority = candidates.length - index;

    if (
      !best ||
      quality > best.quality ||
      (quality === best.quality && priority > best.priority)
    ) {
      best = {
        encoding,
        quality,
        priority,
      };
    }
  }

  return best?.encoding ?? "identity";
}

/* -------------------------------------------------------------------------- */
/* Response Compression                                                       */
/* -------------------------------------------------------------------------- */

export function shouldCompress(
  contentLength: number | undefined,
  contentType: string | undefined,
  options: CompressionOptions | undefined = {},
): boolean {
  if (options.enabled === false) {
    return false;
  }

  if (
    contentLength !== undefined &&
    contentLength < (options.threshold ?? DEFAULT_COMPRESSION_THRESHOLD)
  ) {
    return false;
  }

  /*
   * An allowlist, not a denylist. Compressing an already-compressed or opaque
   * binary payload burns CPU for no gain, and compressing a response that
   * mixes attacker-controlled and secret content is the precondition for a
   * BREACH-class compression oracle.
   */
  return isCompressibleType(contentType);
}

export function chooseCompression(
  acceptEncoding: string | undefined | null,
  contentLength: number | undefined,
  contentType: string | undefined,
  options: CompressionOptions | undefined = {},
): CompressionDecision {
  const parsed = parseCompressionHeader(acceptEncoding);

  if (!shouldCompress(contentLength, contentType, options)) {
    return {
      encoding: "identity",
      compress: false,
      quality: qualityFor(parsed, "identity"),
    };
  }

  const available = options.preferredEncodings ?? DEFAULT_PREFERRED_ENCODINGS;

  const encoding = negotiateParsed(parsed, available);

  const quality = qualityFor(parsed, encoding);

  const minimumQuality =
    options.minimumQuality ?? DEFAULT_MIN_COMPRESSION_QUALITY;

  if (encoding === "identity" || quality < minimumQuality) {
    return {
      encoding: "identity",
      compress: false,
      quality: qualityFor(parsed, "identity"),
    };
  }

  return {
    encoding,
    compress: true,
    quality,
  };
}

/* -------------------------------------------------------------------------- */
/* Header Handling                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Applies the response headers implied by a chosen content coding.
 *
 * `Vary: Accept-Encoding` is set on **every** branch, identity included: the
 * coding was chosen per-request from the client's `Accept-Encoding`, so the
 * identity representation varies on it exactly as the compressed ones do.
 * Storing one representation with `Vary` and another without is a documented
 * cache-poisoning enabler. RFC 9110 §8.4.1 also says a sender should not emit
 * `Content-Encoding: identity`, so that branch now sets no coding at all.
 */
export function applyCompressionHeaders(
  headers: readonly HTTPHeader[],
  encoding: CompressionEncoding,
): HTTPHeader[] {
  const result =
    encoding === "identity"
      ? [...headers]
      : setHeader(headers, "content-encoding", encoding);

  /*
   * Content-Length refers to the encoded body. Compression adapters should
   * recalculate it after transforming the payload.
   */
  return addVaryValue(result, "Accept-Encoding");
}

export function removeCompressionHeaders(
  headers: readonly HTTPHeader[],
): HTTPHeader[] {
  return headers.filter((header) => {
    const name = header.name.toLowerCase();

    return name !== "content-encoding" && name !== "content-length";
  });
}

/* -------------------------------------------------------------------------- */
/* Content-Type Helpers                                                       */
/* -------------------------------------------------------------------------- */

export function isAlreadyCompressedType(contentType: string): boolean {
  const normalized = (contentType.split(";", 1)[0] ?? "").trim().toLowerCase();

  if (
    normalized === "application/zip" ||
    normalized === "application/gzip" ||
    normalized === "application/x-gzip" ||
    normalized === "application/x-7z-compressed" ||
    normalized === "application/x-rar-compressed" ||
    normalized === "application/zstd" ||
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/gif" ||
    normalized === "image/webp" ||
    normalized === "audio/mpeg" ||
    normalized === "audio/ogg" ||
    normalized === "video/mp4" ||
    normalized === "video/webm"
  ) {
    return true;
  }

  return false;
}

export function isCompressibleType(contentType: string | undefined): boolean {
  if (!contentType) {
    return true;
  }

  if (isAlreadyCompressedType(contentType)) {
    return false;
  }

  const normalized = (contentType.split(";", 1)[0] ?? "").trim().toLowerCase();

  return (
    normalized.startsWith("text/") ||
    normalized.startsWith("application/json") ||
    normalized.startsWith("application/javascript") ||
    normalized.startsWith("application/xml") ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml") ||
    normalized === "application/graphql" ||
    normalized === "application/wasm" ||
    normalized === "image/svg+xml"
  );
}

/* -------------------------------------------------------------------------- */
/* Vary Helpers                                                               */
/* -------------------------------------------------------------------------- */

export function hasVaryValue(vary: string | undefined, value: string): boolean {
  if (!vary) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return vary
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === normalized || item === "*");
}

export function addVaryValue(
  headers: readonly HTTPHeader[],
  value: string,
): HTTPHeader[] {
  const existing = getHeader(headers, "vary");

  if (!existing) {
    return setHeader(headers, "vary", value);
  }

  if (hasVaryValue(existing, value)) {
    return [...headers];
  }

  return setHeader(headers, "vary", `${existing}, ${value}`);
}

/* -------------------------------------------------------------------------- */
/* Compression Stream Metadata                                                */
/* -------------------------------------------------------------------------- */

export function getCompressionMimeType(
  encoding: CompressionEncoding,
): string | undefined {
  switch (encoding) {
    case "br":
      return "application/octet-stream";

    case "gzip":
      return "application/gzip";

    case "deflate":
      return "application/zlib";

    case "identity":
      return undefined;
  }
}

export function isCompressionSupported(
  encoding: string,
): encoding is CompressionEncoding {
  return isCompressionEncoding(encoding);
}

/* -------------------------------------------------------------------------- */
/* Cache Semantics                                                            */
/* -------------------------------------------------------------------------- */

export function requiresCompressionVary(
  encoding: CompressionEncoding,
): boolean {
  return encoding !== "identity";
}

export function isCacheableCompressedResponse(
  encoding: CompressionEncoding,
): boolean {
  /*
   * Compression itself does not make a response uncacheable. The response
   * must vary on Accept-Encoding when multiple representations are served.
   */
  return encoding === "br" || encoding === "gzip" || encoding === "deflate";
}
