/**
 * @zudojs/security — Body Validation
 *
 * Validates request body size and content type against configurable limits.
 */

import type {
  BodyLimitConfig,
  BodyLimitPresets,
} from "../types/security.type.js";

/** Default body limits for common use cases. */
export const DEFAULT_BODY_LIMITS: BodyLimitPresets = {
  /** JSON API: 1MB */
  json: 1_048_576,
  /** Authentication endpoints: 256KB */
  auth: 262_144,
  /** File upload: 100MB */
  upload: 104_857_600,
  /** Webhook payloads: 2MB */
  webhook: 2_097_152,
};

/** Default maximum body size (1MB). */
const DEFAULT_MAX_BODY_SIZE = 1_048_576;

/**
 * Validates the Content-Length header value.
 *
 * @param contentLength - The Content-Length header value.
 * @returns An error message if invalid, or undefined.
 */
export function validateContentLength(
  contentLength: string | undefined,
  maxSize?: number,
): string | undefined {
  if (contentLength === undefined) {
    return undefined; // No Content-Length is fine (chunked transfer)
  }

  // RFC 9110: Content-Length is 1*DIGIT and nothing else. `parseInt` would
  // accept "100abc" as 100 and "1e10" as 1 — a length the origin and any
  // intermediary could disagree about, which is how requests get smuggled.
  if (!/^\d+$/.test(contentLength)) {
    return `Content-Length is not a valid number: ${contentLength}`;
  }

  const parsed = Number(contentLength);

  if (!Number.isSafeInteger(parsed)) {
    return `Content-Length is not a safe integer: ${contentLength}`;
  }

  if (maxSize !== undefined && parsed > maxSize) {
    return `Content-Length ${parsed} exceeds maximum ${maxSize} bytes`;
  }

  return undefined;
}

/**
 * Validates the framing headers of a request.
 *
 * A message carrying both `Content-Length` and `Transfer-Encoding`, or more
 * than one distinct `Content-Length`, is ambiguous: two servers in a chain can
 * disagree about where the body ends. RFC 9112 requires rejecting it.
 *
 * @param headers - Request headers.
 * @param maxSize - Optional maximum allowed Content-Length in bytes.
 * @returns An error message if the framing is unsafe, or undefined.
 */
export function validateBodyFraming(
  headers: Record<string, string | string[] | undefined>,
  maxSize?: number,
): string | undefined {
  const lookup = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );

  const contentLength = lookup.get("content-length");
  const transferEncoding = lookup.get("transfer-encoding");

  if (contentLength !== undefined && transferEncoding !== undefined) {
    return "Request specifies both Content-Length and Transfer-Encoding (request smuggling risk)";
  }

  if (Array.isArray(contentLength)) {
    const distinct = new Set(contentLength.map((v) => v.trim()));
    if (distinct.size > 1) {
      return `Request specifies conflicting Content-Length values: ${[...distinct].join(", ")}`;
    }
    return validateContentLength(contentLength[0], maxSize);
  }

  if (typeof contentLength === "string") {
    // A single header field may still carry a comma-separated list.
    if (contentLength.includes(",")) {
      const distinct = new Set(contentLength.split(",").map((v) => v.trim()));
      if (distinct.size > 1) {
        return `Request specifies conflicting Content-Length values: ${[...distinct].join(", ")}`;
      }
      return validateContentLength([...distinct][0], maxSize);
    }
    return validateContentLength(contentLength, maxSize);
  }

  // A repeated Transfer-Encoding field is one comma-separated list (RFC 9110
  // s5.3), so an array is flattened before the final-coding check. It used to
  // be skipped entirely, so `["gzip"]` passed where `"gzip"` was rejected.
  const transferEncodingList = Array.isArray(transferEncoding)
    ? transferEncoding.join(",")
    : transferEncoding;

  if (typeof transferEncodingList === "string") {
    const encodings = transferEncodingList
      .toLowerCase()
      .split(",")
      .map((e) => e.trim());
    if (encodings.length > 0 && encodings[encodings.length - 1] !== "chunked") {
      return `Transfer-Encoding must end with "chunked", got: ${transferEncodingList}`;
    }
  }

  return undefined;
}

/**
 * Validates that a body size is within the allowed limit.
 *
 * @param actualSize - The actual body size in bytes.
 * @param maxSize - The maximum allowed size in bytes.
 * @param contentType - Optional content type for context in error messages.
 * @returns An error message if too large, or undefined.
 */
export function validateBodySize(
  actualSize: number,
  maxSize?: number,
  contentType?: string,
): string | undefined {
  const limit = maxSize ?? DEFAULT_MAX_BODY_SIZE;

  if (actualSize > limit) {
    const context = contentType ? ` for ${contentType}` : "";
    return `Body size ${actualSize} bytes exceeds maximum ${limit} bytes${context}`;
  }

  return undefined;
}

/**
 * Parses a Content-Type header into its bare media type.
 *
 * Strips parameters (`; charset=utf-8`, `; boundary=…`) and lowercases, so
 * routing decisions see `application/json` rather than the raw header.
 *
 * @param contentType - The Content-Type header value.
 * @returns The lowercased media type, or undefined when absent or malformed.
 */
export function parseMediaType(
  contentType: string | undefined,
): string | undefined {
  if (!contentType) return undefined;
  const bare = contentType.split(";")[0]?.trim().toLowerCase();
  return bare && bare.includes("/") ? bare : undefined;
}

/**
 * Gets the appropriate body limit for a given content type.
 *
 * Routing is on the parsed media type, not on substrings of the raw header:
 * a client that sends `application/x-notjson` does not get the JSON limit.
 *
 * Note that a form post cannot be recognised as an authentication request from
 * its Content-Type — auth endpoints send exactly the same media type as any
 * other form. Pass `purpose: "auth"` on those routes to select the tighter
 * limit; otherwise a login form is bounded only by the upload limit.
 *
 * @param contentType - The Content-Type header value.
 * @param presetLimits - Optional custom preset limits.
 * @param purpose - Optional explicit route purpose, overriding type-based routing.
 * @returns The maximum body size in bytes.
 */
export function getBodyLimitForContentType(
  contentType: string | undefined,
  presetLimits?: Partial<BodyLimitPresets>,
  purpose?: keyof BodyLimitPresets,
): number {
  const limits = { ...DEFAULT_BODY_LIMITS, ...presetLimits };

  if (purpose !== undefined) {
    return limits[purpose];
  }

  const type = parseMediaType(contentType);

  if (!type) {
    return limits.json;
  }

  const [group = "", subtype = ""] = type.split("/");

  // Structured-syntax suffixes: application/vnd.api+json, image/svg+xml, …
  const suffix = subtype.includes("+")
    ? subtype.slice(subtype.lastIndexOf("+") + 1)
    : undefined;

  if (subtype === "json" || suffix === "json") {
    return limits.json;
  }

  if (subtype === "xml" || suffix === "xml") {
    return limits.webhook;
  }

  if (type === "application/x-www-form-urlencoded") {
    // Urlencoded forms carry field data, not files — the JSON limit fits far
    // better than the 100 MB upload limit a login form used to receive.
    return limits.json;
  }

  if (group === "multipart") {
    return limits.upload;
  }

  if (
    type === "application/octet-stream" ||
    group === "image" ||
    group === "video" ||
    group === "audio"
  ) {
    return limits.upload;
  }

  return limits.json;
}

/**
 * Validates a body limit configuration.
 *
 * @param config - The body limit configuration to validate.
 * @returns An error message if invalid, or undefined.
 */
export function validateBodyLimitConfig(
  config: BodyLimitConfig,
): string | undefined {
  if (config.maxSize <= 0) {
    return `Body limit maxSize must be positive, got: ${config.maxSize}`;
  }

  if (config.maxSize > 1_073_741_824) {
    // 1GB
    return `Body limit maxSize ${config.maxSize} exceeds maximum allowed (1GB)`;
  }

  // `contentTypes` used to be declared and never looked at, here or anywhere.
  // An entry that is not a media type would silently never match, so it is
  // reported rather than ignored.
  if (config.contentTypes) {
    for (const entry of config.contentTypes) {
      if (parseMediaType(entry) === undefined) {
        return `Body limit contentTypes entry is not a media type: "${entry}" (expected e.g. "application/json")`;
      }
    }
  }

  return undefined;
}

/**
 * Resolves the body limit that applies to a content type from a rule list.
 *
 * This is the implementation of `BodyLimitConfig.contentTypes`, which was
 * declared as *"Content types that use this limit (if empty, applies to all)"*
 * and had no reader anywhere in the package — so the field could be filled in
 * and would never change a single decision.
 *
 * A rule naming the content type wins over a catch-all, whatever the order in
 * the array, so a general default can sit alongside specific overrides.
 *
 * @param contentType - The raw `Content-Type` header value.
 * @param rules - Limit rules, each optionally scoped to content types.
 * @param fallback - Limit to use when no rule applies.
 * @returns The maximum body size in bytes.
 */
export function resolveBodyLimit(
  contentType: string | undefined,
  rules: readonly BodyLimitConfig[],
  fallback: number = DEFAULT_MAX_BODY_SIZE,
): number {
  const type = parseMediaType(contentType);

  if (type !== undefined) {
    for (const rule of rules) {
      const scoped = rule.contentTypes;
      if (!scoped || scoped.length === 0) continue;
      if (scoped.some((entry) => parseMediaType(entry) === type)) {
        return rule.maxSize;
      }
    }
  }

  for (const rule of rules) {
    if (!rule.contentTypes || rule.contentTypes.length === 0) {
      return rule.maxSize;
    }
  }

  return fallback;
}

/**
 * Creates a body size checker function for use in middleware.
 *
 * @param maxSize - The maximum body size in bytes.
 * @param contentType - Optional content type to check against.
 * @returns A function that checks if a size is within limits.
 */
export function createBodySizeChecker(
  maxSize: number,
  contentType?: string,
): (size: number) => { allowed: boolean; error?: string } {
  return (size: number) => {
    const error = validateBodySize(size, maxSize, contentType);
    return {
      allowed: error === undefined,
      error,
    };
  };
}
