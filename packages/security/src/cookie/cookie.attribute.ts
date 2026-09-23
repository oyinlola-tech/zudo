/**
 * @zudojs/security — Cookie attribute validation
 *
 * `Domain` and `Path` end up verbatim inside a `Set-Cookie` header, so each is
 * held to a grammar rather than to a deny-list of a few characters. A
 * deny-list of real CR/LF let through the literal text `a\r\nX-Evil: 1`
 * (backslashes, spaces and a colon), which reaches any code that later
 * unescapes or re-emits the header.
 */

import { ValidationError } from "@zudojs/errors";

/** One hostname label: 1–63 letters, digits or hyphens. */
const LABEL = "[A-Za-z0-9-]{1,63}";

/** A hostname with an optional leading dot: `example.com`, `.example.com`. */
const DOMAIN_PATTERN = new RegExp(`^\\.?${LABEL}(?:\\.${LABEL})*$`);

/** Longest hostname DNS allows, excluding the optional leading dot. */
const MAX_DOMAIN_LENGTH = 253;

/**
 * Characters never allowed in `Path`: anything outside printable ASCII
 * (controls, CR and LF included, DEL, and every non-ASCII character), `;`
 * which would end the attribute, and `,` which some parsers split
 * `Set-Cookie` on.
 *
 * RFC 6265 §4.1.1 defines `path-value` as any CHAR (US-ASCII) except CTLs
 * or `;`, so non-ASCII such as `"/ä"` is outside the grammar — percent-encode
 * it (`"/%C3%A4"`). Space (0x20) is inside the grammar and stays allowed.
 */
const PATH_UNSAFE = /[^\x20-\x7E]|[;,]/;

/**
 * Validates a cookie `Domain` attribute as a hostname: labels of
 * `[A-Za-z0-9-]` separated by dots, with an optional leading dot.
 *
 * @param domain - The Domain value.
 * @throws {ValidationError} for anything else — spaces, colons, backslashes,
 *   control characters, empty labels, or an over-long name.
 */
export function assertCookieDomain(domain: string): void {
  const bare = typeof domain === "string" && domain.startsWith(".")
    ? domain.slice(1)
    : domain;
  if (
    typeof domain !== "string" ||
    !DOMAIN_PATTERN.test(domain) ||
    bare.length > MAX_DOMAIN_LENGTH
  ) {
    throw new ValidationError(
      `Cookie Domain contains invalid characters (injection risk): it must be ` +
        `a hostname (letters, digits, hyphens and dots, optionally with a ` +
        `leading dot), got ${JSON.stringify(domain)}`,
    );
  }
}

/**
 * Validates a cookie `Path` attribute.
 *
 * @param path - The Path value.
 * @throws {ValidationError} when it contains a character outside printable
 *   ASCII (0x20–0x7E: a control character, DEL or any non-ASCII character),
 *   `;` or `,`. Space is allowed, as RFC 6265 allows it.
 */
export function assertCookiePath(path: string): void {
  if (typeof path !== "string" || PATH_UNSAFE.test(path)) {
    throw new ValidationError(
      `Cookie Path contains invalid characters (injection risk): only ` +
        `printable ASCII is allowed (percent-encode anything else), and ";" ` +
        `and "," are not, got ${JSON.stringify(path)}`,
    );
  }
}
