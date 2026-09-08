/**
 * Header security utilities for preventing header injection.
 *
 * This module is the single hardened definition of "safe" for HTTP field
 * names, field values and quoted-string parameter values in this package.
 * Every module that emits a header name, a header value, or a
 * `quoted-string` parameter must route through the helpers defined here so
 * that CR, LF, NUL and the remaining C0/DEL controls cannot reach the wire.
 *
 * @module httpHeaders/security
 */

/**
 * Characters forbidden in an RFC 9110 §5.5 `field-value`.
 *
 * `field-value = *( field-vchar / SP / HTAB )` with
 * `field-vchar = VCHAR / obs-text`, so every C0 control other than HTAB
 * (`\x09`) is forbidden, as is DEL (`\x7f`).
 */
const FORBIDDEN_FIELD_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f]/;

const FORBIDDEN_FIELD_CHARS_GLOBAL = /[\u0000-\u0008\u000a-\u001f\u007f]/g;

/**
 * RFC 9110 §5.6.2 `token`.
 */
const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Checks if a string contains CR or LF characters.
 *
 * @param value - The string to check.
 * @returns `true` if the string contains `\r` or `\n`.
 */
export function containsCRLF(value: string): boolean {
  return /[\r\n]/.test(value);
}

/**
 * Checks if a string contains any character forbidden in an HTTP field value.
 *
 * This covers CR, LF, NUL, every other C0 control except HTAB, and DEL.
 *
 * @param value - The string to check.
 * @returns `true` if the string contains a forbidden control character.
 */
export function containsForbiddenHeaderChars(value: string): boolean {
  return FORBIDDEN_FIELD_CHARS.test(value);
}

/**
 * Checks whether a string is a valid RFC 9110 §5.5 `field-value`.
 *
 * A valid field value contains no forbidden control characters and has no
 * leading or trailing SP/HTAB (which a recipient is required to strip, and
 * whose presence therefore makes the value ambiguous on the wire).
 *
 * @param value - The candidate field value.
 * @returns `true` if the value may be emitted verbatim.
 */
export function isValidHeaderFieldValue(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }

  if (containsForbiddenHeaderChars(value)) {
    return false;
  }

  return value.trim().length === value.length;
}

/**
 * Checks whether a string is a valid RFC 9110 §5.6.2 `token`, which is the
 * grammar for an HTTP field name.
 *
 * @param name - The candidate field name.
 * @returns `true` if the name is a valid token.
 */
export function isValidHeaderFieldName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }

  return TOKEN_PATTERN.test(name);
}

/**
 * Throws if a header value contains any character forbidden in a field value.
 *
 * @param value - The header value to validate.
 * @throws {TypeError} If the value contains CR, LF, NUL or another C0/DEL
 *   control character, or has leading/trailing whitespace.
 */
export function assertSafeHeaderValue(value: string): void {
  if (typeof value !== "string" || containsForbiddenHeaderChars(value)) {
    throw new TypeError(
      "HTTP header values must not contain CR, LF, NUL or other control characters.",
    );
  }

  if (value.trim().length !== value.length) {
    throw new TypeError(
      "HTTP header values must not have leading or trailing whitespace.",
    );
  }
}

/**
 * Throws if a header name is not a valid RFC 9110 `token`.
 *
 * @param name - The header name to validate.
 * @throws {TypeError} If the name is empty or contains a non-token character.
 */
export function assertSafeHeaderName(name: string): void {
  if (!isValidHeaderFieldName(name)) {
    throw new TypeError(`Invalid HTTP header name: ${JSON.stringify(name)}`);
  }
}

/**
 * Removes every character forbidden in an HTTP field value.
 *
 * CR, LF, NUL and the remaining C0/DEL controls are stripped; HTAB and
 * printable characters are preserved. Leading and trailing whitespace is
 * trimmed.
 *
 * @param value - The header value to sanitize.
 * @returns The sanitized value.
 */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(FORBIDDEN_FIELD_CHARS_GLOBAL, "").trim();
}

/**
 * Escapes a string for emission inside an RFC 9110 `quoted-string`.
 *
 * Control characters cannot be represented inside a `quoted-string` — a
 * `quoted-pair` may only escape a printable character — so any forbidden
 * control character is rejected rather than escaped. This prevents the
 * response-splitting class of defect in every module that emits a quoted
 * parameter value.
 *
 * @param value - The raw parameter value.
 * @returns The escaped value, without the surrounding quotes.
 * @throws {TypeError} If the value contains a forbidden control character.
 */
export function escapeHeaderQuotedString(value: string): string {
  if (containsForbiddenHeaderChars(value)) {
    throw new TypeError(
      "HTTP quoted-string values must not contain CR, LF, NUL or other control characters.",
    );
  }

  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
