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
 * Characters never allowed in `Path`: controls (CR and LF included), DEL,
 * `;` which would end the attribute, and `,` which some parsers split
 * `Set-Cookie` on.
 */
const PATH_UNSAFE = /[\x00-\x1F\x7F;,]/;

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
 * @throws {ValidationError} when it contains a control character, DEL, `;`
 *   or `,`.
 */
export function assertCookiePath(path: string): void {
  if (typeof path !== "string" || PATH_UNSAFE.test(path)) {
    throw new ValidationError(
      `Cookie Path contains invalid characters (injection risk): control ` +
        `characters, ";" and "," are not allowed, got ${JSON.stringify(path)}`,
    );
  }
}
