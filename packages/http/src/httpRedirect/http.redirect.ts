/**
 * HTTP redirect utilities.
 *
 * Provides redirect status classification, Location header handling,
 * URL resolution, and redirect policy helpers for the HTTP package.
 */

import { assertSafeHeaderValue } from "../httpHeaders/security/index.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface RedirectOptions {
  readonly statusCode?: number;
  readonly preserveMethod?: boolean;
  readonly absolute?: boolean;
  readonly baseURL?: string | URL;
  /**
   * Origins an **absolute** destination is permitted to point at. Supply this
   * whenever the destination derives from user input (`?next=`, a form field,
   * a cookie): rejecting `javascript:` and `//evil.com` does not stop
   * `https://evil.com`, and only an allowlist can.
   */
  readonly allowedOrigins?: readonly (string | URL)[];
}

export interface RedirectResult {
  readonly statusCode: number;
  readonly location: string;
  readonly preserveMethod: boolean;
}

export interface RedirectPolicy {
  readonly maxRedirects: number;
  readonly preserveMethod: boolean;
  readonly allowCrossOrigin: boolean;
  readonly allowDowngrade: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_REDIRECT_STATUS = 302;

export const DEFAULT_MAX_REDIRECTS = 20;

export const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308] as const;

/* -------------------------------------------------------------------------- */
/* Redirect Classification                                                    */
/* -------------------------------------------------------------------------- */

export function isRedirectStatus(statusCode: number): boolean {
  return (
    REDIRECT_STATUS_CODES.includes(
      statusCode as (typeof REDIRECT_STATUS_CODES)[number],
    ) ||
    (statusCode >= 300 && statusCode < 400 && statusCode !== 304)
  );
}

export function isPermanentRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 308;
}

export function isTemporaryRedirect(statusCode: number): boolean {
  return statusCode === 302 || statusCode === 303 || statusCode === 307;
}

export function isMethodPreservingRedirect(statusCode: number): boolean {
  return statusCode === 307 || statusCode === 308;
}

export function isMethodChangingRedirect(statusCode: number): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303;
}

/* -------------------------------------------------------------------------- */
/* Redirect Status                                                            */
/* -------------------------------------------------------------------------- */

export function getRedirectStatus(statusCode: number | undefined): number {
  const status = statusCode ?? DEFAULT_REDIRECT_STATUS;

  if (!isRedirectStatus(status)) {
    throw new RangeError(`Invalid redirect status code: ${status}`);
  }

  return status;
}

/* -------------------------------------------------------------------------- */
/* Location Validation                                                       */
/* -------------------------------------------------------------------------- */

export function isValidLocation(
  location: string | URL | undefined | null,
): boolean {
  if (location === undefined || location === null) {
    return false;
  }

  const value = location instanceof URL ? location.href : location;

  if (value.length === 0 || /[\r\n]/.test(value)) {
    return false;
  }

  return true;
}

export function validateLocation(location: string | URL): string {
  if (!isValidLocation(location)) {
    throw new TypeError("Invalid redirect Location.");
  }

  return location instanceof URL ? location.href : location;
}

/* -------------------------------------------------------------------------- */
/* URL Resolution                                                             */
/* -------------------------------------------------------------------------- */

export function resolveRedirectURL(
  location: string | URL,
  currentURL: string | URL,
): URL {
  const locationValue = validateLocation(location);

  const base = currentURL instanceof URL ? currentURL : new URL(currentURL);

  return new URL(locationValue, base);
}

export function resolveRedirectLocation(
  location: string | URL,
  currentURL: string | URL,
): string {
  return resolveRedirectURL(location, currentURL).href;
}

/* -------------------------------------------------------------------------- */
/* Location Formatting                                                        */
/* -------------------------------------------------------------------------- */

export function formatLocation(
  location: string | URL,
  options: {
    readonly absolute?: boolean;
    readonly baseURL?: string | URL;
  } = {},
): string {
  const value = validateLocation(location);

  if (!options.absolute) {
    return value;
  }

  if (isAbsoluteURL(value)) {
    return value;
  }

  if (!options.baseURL) {
    throw new TypeError(
      "A baseURL is required to create an absolute redirect Location.",
    );
  }

  return resolveRedirectLocation(value, options.baseURL);
}

/* -------------------------------------------------------------------------- */
/* Redirect Creation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Creates a redirect result.
 *
 * The destination is checked against {@link isSafeRedirectProtocol} — this is
 * the boundary the safety helper was written for and previously never applied
 * to. When the destination is user-controlled, pass `allowedOrigins` so an
 * absolute off-site URL is rejected too; scheme filtering alone still permits
 * `https://evil.com`.
 */
export function createRedirect(
  location: string | URL,
  options: RedirectOptions = {},
): RedirectResult {
  const statusCode = getRedirectStatus(options.statusCode);

  const safeLocation = assertSafeRedirect(location);

  if (options.allowedOrigins && isAbsoluteURL(safeLocation.trim())) {
    const resolved = resolveSafeRedirectTarget(safeLocation, {
      allowedOrigins: options.allowedOrigins,
      fallback: "",
    });

    if (resolved.length === 0) {
      throw new TypeError(
        `Redirect Location is not in the configured allowlist: ${safeLocation}`,
      );
    }
  }

  const formattedLocation = formatLocation(safeLocation, {
    absolute: options.absolute ?? false,
    baseURL: options.baseURL,
  });

  return {
    statusCode,
    location: formattedLocation,
    preserveMethod:
      isMethodPreservingRedirect(statusCode) || options.preserveMethod === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Method Semantics                                                           */
/* -------------------------------------------------------------------------- */

export function shouldPreserveRedirectMethod(
  statusCode: number,
  method: string,
): boolean {
  const normalized = method.trim().toUpperCase();

  if (isMethodPreservingRedirect(statusCode)) {
    return true;
  }

  /*
   * Historically, 301/302 may rewrite POST to GET.
   * For methods other than POST, the original method is normally retained.
   */
  if ((statusCode === 301 || statusCode === 302) && normalized === "POST") {
    return false;
  }

  if (statusCode === 303) {
    return false;
  }

  return true;
}

export function getRedirectMethod(statusCode: number, method: string): string {
  const normalized = method.trim().toUpperCase();

  if (statusCode === 303) {
    return "GET";
  }

  if ((statusCode === 301 || statusCode === 302) && normalized === "POST") {
    return "GET";
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Redirect Policy                                                            */
/* -------------------------------------------------------------------------- */

export function createRedirectPolicy(
  options: Partial<RedirectPolicy> | undefined = {},
): RedirectPolicy {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) {
    throw new RangeError("maxRedirects must be a non-negative integer.");
  }

  return {
    maxRedirects,
    preserveMethod: options.preserveMethod ?? false,
    allowCrossOrigin: options.allowCrossOrigin ?? true,
    allowDowngrade: options.allowDowngrade ?? false,
  };
}

/* -------------------------------------------------------------------------- */
/* Redirect Policy Evaluation                                                 */
/* -------------------------------------------------------------------------- */

export function canFollowRedirect(
  fromURL: string | URL,
  toURL: string | URL,
  policy: RedirectPolicy,
): boolean {
  const from = normalizeURL(fromURL);

  const to = normalizeURL(toURL);

  if (!policy.allowCrossOrigin && !isSameOrigin(from, to)) {
    return false;
  }

  if (!policy.allowDowngrade && isHTTPS(from) && !isHTTPS(to)) {
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Redirect Chain                                                             */
/* -------------------------------------------------------------------------- */

export function resolveRedirectChain(
  initialURL: string | URL,
  locations: readonly (string | URL)[],
  policy: Partial<RedirectPolicy> | undefined = {},
): URL[] {
  const redirectPolicy = createRedirectPolicy(policy);

  if (locations.length > redirectPolicy.maxRedirects) {
    throw new RangeError(
      `Redirect chain exceeds the maximum of ${redirectPolicy.maxRedirects} redirects.`,
    );
  }

  const chain: URL[] = [];

  let current = normalizeURL(initialURL);

  for (const location of locations) {
    const next = resolveRedirectURL(location, current);

    if (!canFollowRedirect(current, next, redirectPolicy)) {
      throw new Error("Redirect is blocked by the configured redirect policy.");
    }

    chain.push(next);
    current = next;
  }

  return chain;
}

/* -------------------------------------------------------------------------- */
/* Redirect Loop Detection                                                    */
/* -------------------------------------------------------------------------- */

export function hasRedirectLoop(locations: readonly (string | URL)[]): boolean {
  const seen = new Set<string>();

  for (const location of locations) {
    const normalized = normalizeURL(location).href;

    if (seen.has(normalized)) {
      return true;
    }

    seen.add(normalized);
  }

  return false;
}

export function assertNoRedirectLoop(
  locations: readonly (string | URL)[],
): void {
  if (hasRedirectLoop(locations)) {
    throw new Error("Redirect loop detected.");
  }
}

/* -------------------------------------------------------------------------- */
/* Origin Helpers                                                             */
/* -------------------------------------------------------------------------- */

export function isSameOrigin(left: string | URL, right: string | URL): boolean {
  const leftURL = normalizeURL(left);

  const rightURL = normalizeURL(right);

  return (
    leftURL.protocol === rightURL.protocol &&
    leftURL.hostname === rightURL.hostname &&
    getEffectivePort(leftURL) === getEffectivePort(rightURL)
  );
}

export function isCrossOrigin(
  left: string | URL,
  right: string | URL,
): boolean {
  return !isSameOrigin(left, right);
}

export function isHTTPS(value: string | URL): boolean {
  return normalizeURL(value).protocol === "https:";
}

/* -------------------------------------------------------------------------- */
/* Relative Redirects                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Matches any RFC 3986 scheme prefix, including opaque ones (`javascript:`,
 * `data:`, `vbscript:`) that carry no hostname.
 */
const SCHEME_PREFIX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * True when the value carries its own scheme.
 *
 * This deliberately does **not** require a hostname. `new URL("javascript:x")`
 * parses with `protocol === "javascript:"` and `hostname === ""`, so the old
 * `hostname.length > 0` requirement classified every opaque scheme as
 * "relative", which is what made `isSafeRedirectProtocol("javascript:…")`
 * return true.
 */
export function isAbsoluteURL(value: string): boolean {
  return SCHEME_PREFIX.test(value.trim());
}

/**
 * True for a scheme-relative reference such as `//evil.com` or its backslash
 * and mixed variants (`\\evil.com`, `/\evil.com`, `\/evil.com`).
 *
 * `new URL("//evil.com")` throws, so these look "relative" to a naive check —
 * but a browser resolves `Location: //evil.com` against the current scheme and
 * navigates off-site. Browsers also normalise `\` to `/` in this position.
 */
export function isProtocolRelativeURL(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length < 2) {
    return false;
  }

  const first = trimmed.charAt(0);

  const second = trimmed.charAt(1);

  return (
    (first === "/" || first === "\\") && (second === "/" || second === "\\")
  );
}

export function isRelativeURL(value: string): boolean {
  if (/[\r\n]/.test(value)) {
    return false;
  }

  return !isAbsoluteURL(value);
}

export function toRelativeLocation(
  target: string | URL,
  base: string | URL,
): string {
  const targetURL = normalizeURL(target);

  const baseURL = normalizeURL(base);

  if (!isSameOrigin(targetURL, baseURL)) {
    return targetURL.href;
  }

  const targetPath = `${targetURL.pathname}${targetURL.search}${targetURL.hash}`;

  return targetPath || "/";
}

/* -------------------------------------------------------------------------- */
/* Security Helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * True when the destination cannot change the scheme to something dangerous
 * and cannot silently leave the current origin without an explicit scheme.
 *
 * Rejects, in order:
 * - anything with a scheme that is not `http` or `https` — `javascript:`,
 *   `data:`, `vbscript:`, `file:`, `blob:`;
 * - scheme-relative references (`//evil.com`, `\\evil.com`, `/\evil.com`),
 *   which a browser resolves off-site;
 * - values containing a control character, a raw newline, or an encoded one.
 *
 * A plain path reference (`/account`, `account?x=1`) is safe: the browser
 * resolves it against the current origin.
 */
export function isSafeRedirectProtocol(location: string | URL): boolean {
  try {
    const value = validateLocation(location);

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return false;
    }

    /*
     * A tab, newline or NUL anywhere in the scheme is stripped by browsers
     * before the scheme is resolved, so `java\tscript:` runs as `javascript:`.
     */
    if (/[\u0000-\u0020\u007f]/.test(trimmed)) {
      return false;
    }

    if (isProtocolRelativeURL(trimmed)) {
      return false;
    }

    if (!isAbsoluteURL(trimmed)) {
      return true;
    }

    const scheme = trimmed.slice(0, trimmed.indexOf(":")).toLowerCase();

    return scheme === "http" || scheme === "https";
  } catch {
    return false;
  }
}

export function isPotentiallyUnsafeRedirect(location: string | URL): boolean {
  return !isSafeRedirectProtocol(location);
}

/**
 * Throws unless the destination passes {@link isSafeRedirectProtocol}.
 */
export function assertSafeRedirect(location: string | URL): string {
  const value = validateLocation(location);

  if (!isSafeRedirectProtocol(value)) {
    throw new TypeError(
      `Unsafe redirect Location: ${value}. Only http(s) and same-origin path references are permitted.`,
    );
  }

  return value;
}

/**
 * Resolves a caller-supplied (i.e. potentially user-controlled) destination
 * against an allowlist and returns a safe `Location` value.
 *
 * A destination that arrives in a query parameter, a form field or a cookie is
 * attacker input. Scheme filtering alone is not enough — `https://evil.com` is
 * a perfectly well-formed https URL — so an absolute destination is accepted
 * only when its origin is in `allowedOrigins`. Relative path references are
 * accepted because they cannot leave the current origin, once the
 * scheme-relative forms above are excluded.
 *
 * Returns `fallback` (default `"/"`) when the destination is missing or fails
 * any check, so a caller can use the result unconditionally.
 */
export function resolveSafeRedirectTarget(
  destination: string | URL | undefined | null,
  options: {
    readonly allowedOrigins?: readonly (string | URL)[];
    readonly fallback?: string;
  } = {},
): string {
  const fallback = options.fallback ?? "/";

  if (destination === undefined || destination === null) {
    return fallback;
  }

  const raw = destination instanceof URL ? destination.href : destination;

  if (!isValidLocation(raw) || !isSafeRedirectProtocol(raw)) {
    return fallback;
  }

  const value = raw.trim();

  if (!isAbsoluteURL(value)) {
    return value;
  }

  const allowed = options.allowedOrigins ?? [];

  if (allowed.length === 0) {
    return fallback;
  }

  let target: URL;

  try {
    target = new URL(value);
  } catch {
    return fallback;
  }

  const permitted = allowed.some((origin) => {
    try {
      return isSameOrigin(target, origin);
    } catch {
      return false;
    }
  });

  return permitted ? target.href : fallback;
}

/* -------------------------------------------------------------------------- */
/* Redirect Header Helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds the `Location` header for a redirect.
 *
 * Enforces {@link isSafeRedirectProtocol} — a `javascript:` or `data:`
 * destination, or a scheme-relative `//evil.com`, throws rather than being
 * emitted — and runs the value through the package's single hardened header
 * validator.
 */
export function createLocationHeader(location: string | URL): {
  readonly name: "Location";
  readonly value: string;
} {
  const value = assertSafeRedirect(location);

  assertSafeHeaderValue(value);

  return {
    name: "Location",
    value,
  };
}

export function getLocationHeader(
  headers: Headers | Readonly<Record<string, string>>,
): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get("location") ?? undefined;
  }

  const record = headers as Readonly<Record<string, string>>;

  const key = Object.keys(record).find(
    (name) => name.toLowerCase() === "location",
  );

  return key ? record[key] : undefined;
}

/* -------------------------------------------------------------------------- */
/* URL Normalization                                                          */
/* -------------------------------------------------------------------------- */

function normalizeURL(value: string | URL): URL {
  if (value instanceof URL) {
    return new URL(value.href);
  }

  return new URL(value);
}

function getEffectivePort(url: URL): string {
  if (url.port) {
    return url.port;
  }

  if (url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "http:") {
    return "80";
  }

  return "";
}
