/**
 * Common regex patterns for validation.
 *
 * This module is the single source of truth for validation regexes in
 * `@zudojs/constants`. Other modules (e.g. `SCHEMA_STRING_FORMATS`) reference
 * these patterns rather than redefining them.
 *
 * @module validation/validationPattern
 */

/**
 * Pre-compiled regular expressions for common validation patterns.
 */
export const ValidationPattern = Object.freeze({
  /**
   * Simplified email pattern (pragmatic subset of RFC 5322).
   *
   * The domain part rejects consecutive dots, leading/trailing dots, and
   * labels that start or end with a hyphen. Combine with
   * `ValidationLength.EMAIL` (254) for a length bound.
   */
  EMAIL:
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
  /** UUID — any version/variant nibble (use UUID_V4 for strict v4). */
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** UUID v4 (strict: version nibble 4, RFC 4122 variant). */
  UUID_V4:
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** IPv4 address */
  IPV4: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
  /**
   * IPv6 address — full form, compressed forms (`::1`, `fe80::1`), and
   * IPv4-mapped/embedded forms (`::ffff:192.0.2.1`).
   */
  IPV6: /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::(?:[fF]{4}(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[0-9a-fA-F]{1,4}:){1,4}:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))$/,
  /**
   * ISO 8601 date-time, anchored: `YYYY-MM-DDTHH:mm:ss` with optional
   * fractional seconds and an optional `Z` or `±hh:mm` offset.
   */
  ISO_DATE_TIME:
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
  /** ISO 8601 date only */
  ISO_DATE: /^\d{4}-\d{2}-\d{2}$/,
  /** Alphanumeric string (no special chars) */
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  /** Alphanumeric with hyphens and underscores */
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /**
   * Strong password: 8+ chars, uppercase, lowercase, digit, special
   * (specials include space, backtick, and tilde).
   */
  STRONG_PASSWORD:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[ !@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,}$/,
  /** Hex colour code (3 or 6 digits) */
  HEX_COLOR: /^#(?:[0-9a-fA-F]{3}){1,2}$/,
  /** URL pattern (http/https) */
  URL: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  /**
   * Semantic version per semver.org (e.g. `1.2.3`, `1.0.0-alpha-1`,
   * `2.0.0-rc.1+build.5`). No leading `v` prefix; leading zeros are rejected.
   */
  SEMVER:
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  /** Phone number (E.164 international format with optional + prefix) */
  PHONE: /^\+?[1-9]\d{6,14}$/,
  /**
   * File name (no path separators). Rejects `.` and `..` (path traversal),
   * names ending with a dot or space, and Windows reserved device names
   * (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`, with or
   * without an extension, case-insensitively).
   */
  FILE_NAME:
    /^(?!\.{1,2}$)(?!(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$))(?!.*[. ]$)[^<>:"/\\|?*\x00-\x1f]+$/i,
} as const);
