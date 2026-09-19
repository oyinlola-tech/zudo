/**
 * Secure cookie defaults.
 *
 * Both cookie serializers (`serializeCookie` in this module and the
 * `serializeResponseCookie` the adapters use for `response.cookie()`) start
 * from these defaults, so a cookie set "the obvious way" is `HttpOnly`,
 * `Secure`, `SameSite=Lax` and `Path=/`, matching the defaults of
 * `@zudojs/security`'s `serializeCookie` and the AGENTS.md secure-defaults
 * rule. Every default can be overridden explicitly (`httpOnly: false`,
 * `secure: false`, `sameSite: "none"`, `path: "/app"`); an option left
 * `undefined` keeps the default.
 *
 * @module httpCookies/defaults
 */

/**
 * The attributes every cookie gets unless the caller overrides them.
 */
export const DEFAULT_COOKIE_ATTRIBUTES = Object.freeze({
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
} as const);

interface DefaultableCookieOptions<S extends string> {
  readonly path?: string;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: S;
}

/**
 * Returns `options` with the secure defaults filled in for every attribute
 * the caller left `undefined`.
 *
 * @param options - The caller's cookie options.
 * @param sameSite - The default `SameSite` value in the option type's own
 *   spelling (`"lax"` or `"Lax"`).
 */
export function withSecureCookieDefaults<
  S extends string,
  T extends DefaultableCookieOptions<S>,
>(options: T | undefined, sameSite: S): T {
  const source = (options ?? {}) as T;

  return {
    ...source,
    path: source.path ?? DEFAULT_COOKIE_ATTRIBUTES.path,
    httpOnly: source.httpOnly ?? DEFAULT_COOKIE_ATTRIBUTES.httpOnly,
    secure: source.secure ?? DEFAULT_COOKIE_ATTRIBUTES.secure,
    sameSite: source.sameSite ?? sameSite,
  };
}
