/**
 * @zudojs/security — Sensitive cookie name matching.
 */

/**
 * Default names treated as credentials by `stripSensitiveCookies`.
 *
 * Covers the generic words (`session`, `token`, `auth`, `jwt`, `csrf`) and
 * the framework defaults that contain none of them: `connect.sid`
 * (express-session), `PHPSESSID`, `JSESSIONID`, `ASP.NET_SessionId`.
 */
export const DEFAULT_SENSITIVE_COOKIE_NAMES: readonly string[] = Object.freeze([
  "session",
  "sessionid",
  "sess",
  "sid",
  "phpsessid",
  "jsessionid",
  "token",
  "auth",
  "jwt",
  "csrf",
  "xsrf",
]);

/** Cookie-name prefixes that carry no meaning of their own. */
const COOKIE_PREFIX = /^__(host|secure)-/;

/**
 * Splits a cookie name into lower-case words: `__Secure-next-auth.session-token`
 * becomes `next auth session token`, `sessionId` becomes `session id`.
 */
export function cookieNameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(COOKIE_PREFIX, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * True when `sensitive` appears in the cookie name as a whole word or a
 * run of whole words.
 *
 * Matching whole words anywhere in the name — not just as a prefix — is
 * what catches `access_token`, `refresh_token` and `connect.sid`, and
 * dropping the `__Host-`/`__Secure-` prefix first is what catches
 * `__Host-session`. Word boundaries keep `theme` or `sidebar` from matching.
 */
export function isSensitiveCookieName(
  name: string,
  sensitiveNames: readonly string[] = DEFAULT_SENSITIVE_COOKIE_NAMES,
): boolean {
  const words = cookieNameWords(name);
  return sensitiveNames.some((sensitive) => {
    const needle = cookieNameWords(sensitive);
    if (needle.length === 0) return false;
    for (let start = 0; start + needle.length <= words.length; start++) {
      if (needle.every((word, offset) => words[start + offset] === word)) {
        return true;
      }
    }
    return false;
  });
}
