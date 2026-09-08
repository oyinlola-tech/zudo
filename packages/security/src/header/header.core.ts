/**
 * @zudojs/security — Header Security
 *
 * Validates and sanitizes HTTP headers against injection attacks,
 * size limits, and blocked header names.
 */

import type {
  HeaderSecurityConfig,
  HeaderValidationResult,
} from "../types/security.type.js";

/** Default maximum header value size (8KB). */
const DEFAULT_MAX_VALUE_SIZE = 8192;

/** Default maximum number of headers. */
const DEFAULT_MAX_HEADERS = 50;

/** Default maximum total header size (64KB). */
const DEFAULT_MAX_TOTAL_SIZE = 65536;

/** Headers that are commonly blocked for security. */
const DEFAULT_BLOCKED_HEADERS = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
];

/**
 * CRLF injection pattern — matches carriage return or line feed.
 * These characters must never appear in header values.
 */
const CRLF_PATTERN = /[\r\n]/;

/**
 * Null byte patterns.
 *
 * The plain form is for {@link RegExp.test}; the `g` form is for
 * {@link String.replace}, which without the flag would strip only the first
 * occurrence.
 */
const NULL_BYTE_PATTERN = /\x00/;
const NULL_BYTE_PATTERN_GLOBAL = /\x00/g;

/**
 * Validates a single header name.
 *
 * @param name - The header name to validate.
 * @returns An error message if invalid, or undefined.
 */
export function validateHeaderName(name: string): string | undefined {
  if (name.length === 0) {
    return "Header name cannot be empty";
  }

  if (name.length > 256) {
    return `Header name exceeds maximum length of 256: ${name.length}`;
  }

  // RFC 7230: token = 1*tchar
  // tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." /
  //         "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    return `Header name contains invalid characters: ${name}`;
  }

  return undefined;
}

/**
 * Validates a single header value.
 *
 * @param name - The header name (for context in error messages).
 * @param value - The header value to validate.
 * @param config - Optional security configuration.
 * @returns An error message if invalid, or undefined.
 */
export function validateHeaderValue(
  name: string,
  value: string,
  config?: HeaderSecurityConfig,
): string | undefined {
  const maxValueSize = config?.maxValueSize ?? DEFAULT_MAX_VALUE_SIZE;

  // Check for CRLF injection
  if (CRLF_PATTERN.test(value)) {
    return `Header "${name}" contains CRLF characters (injection risk)`;
  }

  // Check for null bytes
  if (NULL_BYTE_PATTERN.test(value)) {
    return `Header "${name}" contains null bytes`;
  }

  // Check value size
  const byteSize = Buffer.byteLength(value, "utf8");
  if (byteSize > maxValueSize) {
    return `Header "${name}" value size ${byteSize} exceeds maximum ${maxValueSize}`;
  }

  return undefined;
}

/**
 * Validates all headers against security configuration.
 *
 * @param headers - Record of header name-value pairs.
 * @param config - Optional security configuration.
 * @returns Validation result with any errors found.
 */
export function validateHeaders(
  headers: Record<string, string | string[] | undefined>,
  config?: HeaderSecurityConfig,
): HeaderValidationResult {
  const errors: string[] = [];
  const maxHeaders = config?.maxHeaders ?? DEFAULT_MAX_HEADERS;
  const maxTotalSize = config?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const blockedHeaders = new Set(
    (config?.blockedHeaders ?? DEFAULT_BLOCKED_HEADERS).map((h) =>
      h.toLowerCase(),
    ),
  );

  const entries = Object.entries(headers).filter(
    ([, v]) => v !== undefined,
  ) as Array<[string, string | string[]]>;

  // Check header count
  if (entries.length > maxHeaders) {
    errors.push(
      `Too many headers: ${entries.length} exceeds maximum ${maxHeaders}`,
    );
  }

  let totalSize = 0;

  for (const [name, value] of entries) {
    // Check blocked headers
    if (blockedHeaders.has(name.toLowerCase())) {
      errors.push(`Header "${name}" is blocked by security policy`);
      continue;
    }

    // Validate name
    const nameError = validateHeaderName(name);
    if (nameError) {
      errors.push(nameError);
      continue;
    }

    // Validate values (may be array for Set-Cookie, etc.)
    const values = Array.isArray(value) ? value : [value];

    for (const v of values) {
      const valueError = validateHeaderValue(name, v, config);
      if (valueError) {
        errors.push(valueError);
        continue;
      }

      totalSize +=
        Buffer.byteLength(name, "utf8") + Buffer.byteLength(v, "utf8");
    }
  }

  // Check total size
  if (totalSize > maxTotalSize) {
    errors.push(
      `Total header size ${totalSize} exceeds maximum ${maxTotalSize}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitizes a header value by stripping dangerous characters.
 * Returns undefined if the value is completely empty after sanitization.
 *
 * @param value - The header value to sanitize.
 * @returns The sanitized value, or undefined if empty.
 */
export function sanitizeHeaderValue(value: string): string | undefined {
  // Strip null bytes
  let sanitized = value.replace(NULL_BYTE_PATTERN_GLOBAL, "");

  // Strip CRLF (strip both \r and \n)
  sanitized = sanitized.replace(/[\r\n]/g, "");

  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Checks if a header is a hop-by-hop header that should not be forwarded.
 *
 * @param name - The header name.
 * @returns True if the header is hop-by-hop.
 */
export function isHopByHopHeader(name: string): boolean {
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  return hopByHop.has(name.toLowerCase());
}
