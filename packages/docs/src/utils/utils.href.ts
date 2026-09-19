/**
 * Link-target and inline-text safety for generated markdown.
 *
 * Markdown renderers turn `[x](javascript:…)` into a live link and pass raw
 * `<tag>` text through as HTML. Structured documents can come from untrusted
 * JSON, so generated hrefs are limited to an allow-list of schemes and text
 * is HTML-escaped.
 *
 * @module utils/utils.href
 */

/** Schemes a generated or validated link may use. Relative and `#` links need none. */
export const SAFE_LINK_SCHEMES: ReadonlySet<string> = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "ftp",
  "ftps",
]);

/**
 * The scheme of a link target, lower-cased, or undefined for a relative,
 * protocol-relative or fragment link. Whitespace and control characters are
 * ignored first, as browsers do (`java\tscript:`, ` JavaScript:`).
 */
export function linkScheme(href: string): string | undefined {
  const compact = href.replace(/[\u0000- \u007f]/g, "");
  const match = /^([^/?#]*?):/.exec(compact);
  return match ? (match[1] ?? "").toLowerCase() : undefined;
}

/** Whether a link target is relative, a fragment, or uses an allow-listed scheme. */
export function isSafeLinkHref(href: string): boolean {
  const scheme = linkScheme(href);
  return scheme === undefined || SAFE_LINK_SCHEMES.has(scheme);
}

/**
 * Escapes `&`, `<` and `>` so text renders literally instead of as HTML or
 * as a character reference.
 */
export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
