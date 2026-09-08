/**
 * HTTP URL utilities.
 *
 * Provides URL normalization, query parameter handling, path joining and
 * origin helpers for the HTTP package.
 *
 * @remarks
 * These helpers perform **no scheme validation**. `parseURL`, `toURL`,
 * `resolveURL` and `resolveURLString` accept `javascript:`, `data:`, `file:`
 * and any custom scheme, and `new URL(path, base)` discards the base entirely
 * when `path` carries its own scheme. Any caller that builds a link, a
 * redirect target or a fetch target from untrusted input must gate the result
 * with {@link isHTTPOrHTTPSURL} first.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type URLInput = string | URL;

export type QueryValue = string | number | boolean | bigint | null | undefined;

export type QueryInput =
  URLSearchParams | Record<string, QueryValue | readonly QueryValue[]>;

export interface ParsedURL {
  readonly url: URL;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly origin: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const HTTP_PROTOCOL = "http:";

export const HTTPS_PROTOCOL = "https:";

export const DEFAULT_HTTP_PORT = 80;

export const DEFAULT_HTTPS_PORT = 443;

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export function parseURL(input: URLInput, base?: URLInput): URL {
  if (input instanceof URL) {
    return new URL(input.href);
  }

  if (base !== undefined) {
    return new URL(input, toURL(base));
  }

  return new URL(input);
}

export function tryParseURL(
  input: URLInput | undefined | null,
  base?: URLInput,
): URL | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  try {
    return parseURL(input, base);
  } catch {
    return undefined;
  }
}

export function toURL(input: URLInput, base?: URLInput): URL {
  return parseURL(input, base);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function stringifyURL(input: URLInput): string {
  return toURL(input).href;
}

export function getOrigin(input: URLInput): string {
  return toURL(input).origin;
}

export function getProtocol(input: URLInput): string {
  return toURL(input).protocol;
}

export function getHostname(input: URLInput): string {
  return toURL(input).hostname;
}

export function getPort(input: URLInput): number | undefined {
  const url = toURL(input);

  if (url.port.length > 0) {
    return Number(url.port);
  }

  if (url.protocol === HTTP_PROTOCOL) {
    return DEFAULT_HTTP_PORT;
  }

  if (url.protocol === HTTPS_PROTOCOL) {
    return DEFAULT_HTTPS_PORT;
  }

  return undefined;
}

export function getPathname(input: URLInput): string {
  return toURL(input).pathname;
}

export function getSearch(input: URLInput): string {
  return toURL(input).search;
}

export function getHash(input: URLInput): string {
  return toURL(input).hash;
}

/* -------------------------------------------------------------------------- */
/* Protocol Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function isHTTPURL(input: URLInput): boolean {
  return getProtocol(input) === HTTP_PROTOCOL;
}

export function isHTTPSURL(input: URLInput): boolean {
  return getProtocol(input) === HTTPS_PROTOCOL;
}

export function isHTTPOrHTTPSURL(input: URLInput): boolean {
  const protocol = getProtocol(input);

  return protocol === HTTP_PROTOCOL || protocol === HTTPS_PROTOCOL;
}

export function isSecureURL(input: URLInput): boolean {
  return isHTTPSURL(input);
}

/* -------------------------------------------------------------------------- */
/* Origin Helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reports whether two URLs share a tuple origin.
 *
 * The WHATWG `origin` getter returns the literal string `"null"` for every
 * non-special scheme (`data:`, `file:`, opaque `blob:`, custom schemes). That
 * value means "opaque origin, equal to nothing, not even itself", so two
 * `"null"` origins are reported as **not** same-origin rather than as a
 * universal match.
 */
export function sameOrigin(left: URLInput, right: URLInput): boolean {
  const first = getOrigin(left);

  const second = getOrigin(right);

  if (first === "null" || second === "null") {
    return false;
  }

  return first === second;
}

export function sameHost(left: URLInput, right: URLInput): boolean {
  const first = toURL(left);

  const second = toURL(right);

  return (
    first.hostname === second.hostname &&
    first.port === second.port &&
    first.protocol === second.protocol
  );
}

/**
 * Reports whether two URLs have the identical hostname.
 *
 * @remarks
 * This is host equality, **not** the web platform's "same site". Same-site
 * compares registrable domains (eTLD+1), so `a.example.com` and
 * `b.example.com` are same-site while this function reports `false`; and
 * schemeful same-site also compares the scheme, which this function ignores.
 * Do not use it for `SameSite` cookie, CSRF or cross-site navigation
 * decisions.
 */
export function sameHostname(left: URLInput, right: URLInput): boolean {
  return getHostname(left) === getHostname(right);
}

/* -------------------------------------------------------------------------- */
/* Path Helpers                                                               */
/* -------------------------------------------------------------------------- */

export function joinURLPath(...parts: string[]): string {
  const filtered = parts.filter((part) => part !== "");

  if (filtered.length === 0) {
    return "/";
  }

  const joined = filtered.join("/");

  return normalizePath(joined);
}

/**
 * Collapses `.` and `..` segments, clamping at the root.
 *
 * Each segment is percent-decoded before it is compared, so the encoded forms
 * of a traversal (`%2e%2e`, `%2E%2e`) are collapsed exactly like the literal
 * `..` instead of surviving normalisation for a later decoding stage to
 * re-expand. A backslash is treated as a separator so Windows-style
 * traversals normalise too. The emitted segments are the original, still
 * encoded ones.
 */
export function normalizePath(path: string): string {
  if (path.length === 0) {
    return "/";
  }

  const hasLeadingSlash = path.startsWith("/") || path.startsWith("\\");

  const hasTrailingSlash =
    path.length > 1 && (path.endsWith("/") || path.endsWith("\\"));

  const segments = path.split(/[/\\]/);

  const normalized: string[] = [];

  for (const segment of segments) {
    const decoded = decodePathSegment(segment);

    if (decoded === "" || decoded === ".") {
      continue;
    }

    if (decoded === "..") {
      if (normalized.length > 0) {
        normalized.pop();
      }

      continue;
    }

    normalized.push(segment);
  }

  let result = normalized.join("/");

  if (hasLeadingSlash) {
    result = `/${result}`;
  }

  if (result.length === 0) {
    result = "/";
  }

  if (hasTrailingSlash && result !== "/") {
    result += "/";
  }

  return result;
}

export function ensureLeadingSlash(path: string): string {
  if (path.length === 0) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export function ensureTrailingSlash(path: string): string {
  if (path.length === 0) {
    return "/";
  }

  return path.endsWith("/") ? path : `${path}/`;
}

export function removeTrailingSlash(path: string): string {
  if (path === "/") {
    return path;
  }

  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) {
    end--;
  }
  return path.slice(0, end);
}

export function removeLeadingSlash(path: string): string {
  let start = 0;
  while (start < path.length && path.charCodeAt(start) === 47) {
    start++;
  }
  return path.slice(start);
}

/* -------------------------------------------------------------------------- */
/* URL Joining                                                                */
/* -------------------------------------------------------------------------- */

export function resolveURL(base: URLInput, path: string): URL {
  return new URL(path, toURL(base));
}

export function resolveURLString(base: URLInput, path: string): string {
  return resolveURL(base, path).href;
}

export function appendPath(base: URLInput, ...paths: string[]): URL {
  const url = toURL(base);

  const basePath = removeTrailingSlash(url.pathname);

  const appended = paths.map(removeLeadingSlash).filter(Boolean).join("/");

  url.pathname = normalizePath(appended ? `${basePath}/${appended}` : basePath);

  return url;
}

/* -------------------------------------------------------------------------- */
/* Query Parameters                                                           */
/* -------------------------------------------------------------------------- */

export function getQuery(input: URLInput): URLSearchParams {
  return new URLSearchParams(toURL(input).searchParams);
}

export function getQueryParam(input: URLInput, name: string): string | null {
  return toURL(input).searchParams.get(name);
}

export function getQueryParams(input: URLInput, name: string): string[] {
  return toURL(input).searchParams.getAll(name);
}

export function hasQueryParam(input: URLInput, name: string): boolean {
  return toURL(input).searchParams.has(name);
}

export function setQueryParam(
  input: URLInput,
  name: string,
  value: QueryValue,
): URL {
  const url = toURL(input);

  if (value === undefined || value === null) {
    url.searchParams.delete(name);

    return url;
  }

  url.searchParams.set(name, String(value));

  return url;
}

export function appendQueryParam(
  input: URLInput,
  name: string,
  value: QueryValue,
): URL {
  const url = toURL(input);

  if (value === undefined || value === null) {
    return url;
  }

  url.searchParams.append(name, String(value));

  return url;
}

export function deleteQueryParam(input: URLInput, name: string): URL {
  const url = toURL(input);

  url.searchParams.delete(name);

  return url;
}

export function setQueryParams(input: URLInput, query: QueryInput): URL {
  const url = toURL(input);

  applyQueryParams(url.searchParams, query);

  return url;
}

export function appendQueryParams(input: URLInput, query: QueryInput): URL {
  const url = toURL(input);

  appendQueryValues(url.searchParams, query);

  return url;
}

export function clearQuery(input: URLInput): URL {
  const url = toURL(input);

  url.search = "";

  return url;
}

export function queryToString(query: QueryInput): string {
  const params = new URLSearchParams();

  appendQueryValues(params, query);

  return params.toString();
}

/* -------------------------------------------------------------------------- */
/* Query Object Conversion                                                    */
/* -------------------------------------------------------------------------- */

export function queryToObject(
  input: URLInput | URLSearchParams,
): Record<string, string | string[]> {
  const params = input instanceof URLSearchParams ? input : getQuery(input);

  /*
   * A null-prototype container: a query parameter named `__proto__` cannot
   * replace the returned object's prototype, and reads cannot surface an
   * inherited member such as `constructor` as if it were a parsed value.
   */
  const result = Object.create(null) as Record<string, string | string[]>;

  for (const [key, value] of params) {
    const existing = Object.prototype.hasOwnProperty.call(result, key)
      ? result[key]
      : undefined;

    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* URL Construction                                                           */
/* -------------------------------------------------------------------------- */

export function createURL(
  base: URLInput,
  options: {
    readonly path?: string;
    readonly query?: QueryInput;
    readonly hash?: string;
  } = {},
): URL {
  let url = toURL(base);

  if (options.path !== undefined) {
    url = appendPath(url, options.path);
  }

  if (options.query !== undefined) {
    setQueryParams(url, options.query);
  }

  if (options.hash !== undefined) {
    url.hash = options.hash.startsWith("#") ? options.hash : `#${options.hash}`;
  }

  return url;
}

/* -------------------------------------------------------------------------- */
/* URL Sanitization                                                           */
/* -------------------------------------------------------------------------- */

export function stripHash(input: URLInput): URL {
  const url = toURL(input);

  url.hash = "";

  return url;
}

export function stripQuery(input: URLInput): URL {
  const url = toURL(input);

  url.search = "";

  return url;
}

export function stripCredentials(input: URLInput): URL {
  const url = toURL(input);

  url.username = "";
  url.password = "";

  return url;
}

export function stripQueryAndHash(input: URLInput): URL {
  const url = toURL(input);

  url.search = "";
  url.hash = "";

  return url;
}

/* -------------------------------------------------------------------------- */
/* Credentials                                                                */
/* -------------------------------------------------------------------------- */

export function getURLUsername(input: URLInput): string {
  return toURL(input).username;
}

export function getURLPassword(input: URLInput): string {
  return toURL(input).password;
}

export function hasURLCredentials(input: URLInput): boolean {
  const url = toURL(input);

  return url.username.length > 0 || url.password.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Network Helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Reports whether a URL's host resolves to the local machine by literal form.
 *
 * Covers the whole `127.0.0.0/8` block, `0.0.0.0`, the IPv6 loopback in both
 * bracketed and bare form, IPv4-mapped loopback, the non-canonical numeric
 * forms (`2130706433`, `0177.0.0.1`, `0x7f.0.0.1`, `127.1`) and the
 * trailing-dot FQDN.
 *
 * @remarks
 * This inspects the literal host only. It cannot see a DNS name that
 * *resolves* to loopback, and it does not cover the other private ranges. It
 * is therefore **not** a complete SSRF control on its own — use
 * {@link isPrivateHostLiteral} for the private ranges and resolve the name
 * before connecting.
 */
export function isLocalhost(input: URLInput): boolean {
  const hostname = normalizeHostLiteral(getHostname(input));

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }

  const ipv6 = parseIPv6(hostname);

  if (ipv6 !== undefined) {
    return isLoopbackIPv6(ipv6);
  }

  const ipv4 = parseIPv4(hostname);

  if (ipv4 === undefined) {
    return false;
  }

  /* 127.0.0.0/8 and the "this host" address 0.0.0.0. */
  return ipv4 >>> 24 === 127 || ipv4 === 0;
}

/**
 * Reports whether a URL's host literal is in a loopback, link-local or
 * private range, including the non-canonical numeric IPv4 forms.
 */
export function isPrivateHostLiteral(input: URLInput): boolean {
  const hostname = normalizeHostLiteral(getHostname(input));

  const ipv6 = parseIPv6(hostname);

  if (ipv6 !== undefined) {
    return isPrivateIPv6(ipv6);
  }

  const ipv4 = parseIPv4(hostname);

  if (ipv4 === undefined) {
    return hostname === "localhost" || hostname.endsWith(".localhost");
  }

  const first = ipv4 >>> 24;

  const second = (ipv4 >>> 16) & 0xff;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

/**
 * Reports whether a URL's host is an IP literal rather than a DNS name.
 *
 * Validates the address rather than pattern-matching it, so `999.999.999.999`
 * and a bare hostname containing a colon are correctly rejected.
 */
export function isIPLiteral(input: URLInput): boolean {
  const hostname = normalizeHostLiteral(getHostname(input));

  return parseIPv4(hostname) !== undefined || parseIPv6(hostname) !== undefined;
}

/* -------------------------------------------------------------------------- */
/* URL Comparison                                                             */
/* -------------------------------------------------------------------------- */

export function urlsEqual(left: URLInput, right: URLInput): boolean {
  return toURL(left).href === toURL(right).href;
}

export function urlsEquivalent(left: URLInput, right: URLInput): boolean {
  const first = toURL(left);

  const second = toURL(right);

  first.hash = "";
  second.hash = "";

  return first.href === second.href;
}

/* -------------------------------------------------------------------------- */
/* Internal Query Helpers                                                     */
/* -------------------------------------------------------------------------- */

/*
 * `URLSearchParams.prototype.forEach` walks the live entry list by index, so
 * deleting during iteration shifts the remaining entries down and skips them
 * (verified: forEach+delete over "a=1&b=2&c=3&d=4" leaves "b=2&d=4"). The key
 * list is therefore snapshotted before anything is removed.
 */
function applyQueryParams(target: URLSearchParams, query: QueryInput): void {
  for (const key of new Set(target.keys())) {
    target.delete(key);
  }

  appendQueryValues(target, query);
}

function appendQueryValues(target: URLSearchParams, query: QueryInput): void {
  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) {
      target.append(key, value);
    }

    return;
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value === undefined || value === null) {
          continue;
        }

        target.append(key, String(value));
      }

      continue;
    }

    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    target.append(key, String(rawValue));
  }
}

/* -------------------------------------------------------------------------- */
/* Internal Path Helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Percent-decodes one path segment for comparison purposes.
 *
 * A malformed sequence cannot be decoded and is returned unchanged; it is
 * then compared as-is, which is safe because it is not a traversal token.
 */
function decodePathSegment(segment: string): string {
  if (!segment.includes("%")) {
    return segment;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/* -------------------------------------------------------------------------- */
/* Internal Host Helpers                                                      */
/* -------------------------------------------------------------------------- */

function normalizeHostLiteral(hostname: string): string {
  let value = hostname.trim().toLowerCase();

  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }

  /* A trailing dot makes an FQDN absolute; it does not change the host. */
  while (value.endsWith(".") && value.length > 1) {
    value = value.slice(0, -1);
  }

  return value;
}

/**
 * Parses every numeric IPv4 form `inet_aton` accepts into a 32-bit address.
 *
 * That includes the dotted quad, the shorthand forms (`127.1`, `10.1.2`), and
 * octal or hexadecimal parts — all of which reach the same host as the
 * canonical form and all of which a naive dotted-quad regex misses.
 */
function parseIPv4(hostname: string): number | undefined {
  if (hostname.length === 0 || /[^0-9a-fx.]/.test(hostname)) {
    return undefined;
  }

  const parts = hostname.split(".");

  if (parts.length > 4) {
    return undefined;
  }

  const numbers: number[] = [];

  for (const part of parts) {
    const parsed = parseIPv4Part(part);

    if (parsed === undefined) {
      return undefined;
    }

    numbers.push(parsed);
  }

  const last = numbers[numbers.length - 1];

  if (last === undefined) {
    /* `split` always yields at least one part, so this cannot be reached. */
    return undefined;
  }

  /* The final part absorbs every octet the earlier parts did not supply. */
  const maxLast = 256 ** (4 - numbers.length + 1);

  if (last >= maxLast) {
    return undefined;
  }

  let address = last;

  for (const [index, value] of numbers.slice(0, -1).entries()) {
    if (value > 255) {
      return undefined;
    }

    address += value * 256 ** (3 - index);
  }

  if (!Number.isSafeInteger(address) || address < 0 || address > 0xffffffff) {
    return undefined;
  }

  return address >>> 0;
}

function parseIPv4Part(part: string): number | undefined {
  if (part.length === 0) {
    return undefined;
  }

  if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
    return Number.parseInt(part.slice(2), 16);
  }

  if (/^0[0-7]+$/.test(part)) {
    return Number.parseInt(part.slice(1), 8);
  }

  if (/^\d+$/.test(part)) {
    return Number.parseInt(part, 10);
  }

  return undefined;
}

/** The eight 16-bit groups of a fully expanded IPv6 address. */
type IPv6Groups = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Parses an IPv6 literal into its eight 16-bit groups.
 *
 * Supports `::` compression and a trailing embedded IPv4 address.
 */
function parseIPv6(hostname: string): IPv6Groups | undefined {
  if (!hostname.includes(":")) {
    return undefined;
  }

  const doubleColon = hostname.indexOf("::");

  if (doubleColon !== hostname.lastIndexOf("::")) {
    return undefined;
  }

  const head = doubleColon === -1 ? hostname : hostname.slice(0, doubleColon);

  const tail = doubleColon === -1 ? "" : hostname.slice(doubleColon + 2);

  const headGroups = expandIPv6Groups(head);

  const tailGroups = expandIPv6Groups(tail);

  if (headGroups === undefined || tailGroups === undefined) {
    return undefined;
  }

  if (doubleColon === -1) {
    return toIPv6Groups(headGroups);
  }

  const missing = 8 - headGroups.length - tailGroups.length;

  if (missing < 1) {
    return undefined;
  }

  return toIPv6Groups([
    ...headGroups,
    ...new Array<number>(missing).fill(0),
    ...tailGroups,
  ]);
}

/**
 * Narrows a variable-length group list to the eight-group tuple the address
 * predicates require, so every later index is statically known to exist.
 */
function toIPv6Groups(groups: readonly number[]): IPv6Groups | undefined {
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = groups;

  if (
    groups.length !== 8 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined ||
    seventh === undefined ||
    eighth === undefined
  ) {
    return undefined;
  }

  return [first, second, third, fourth, fifth, sixth, seventh, eighth];
}

function expandIPv6Groups(section: string): number[] | undefined {
  if (section.length === 0) {
    return [];
  }

  const parts = section.split(":");

  const groups: number[] = [];

  for (const [index, part] of parts.entries()) {
    if (part.includes(".")) {
      if (index !== parts.length - 1) {
        return undefined;
      }

      const embedded = parseIPv4(part);

      if (embedded === undefined) {
        return undefined;
      }

      groups.push((embedded >>> 16) & 0xffff, embedded & 0xffff);

      continue;
    }

    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) {
      return undefined;
    }

    groups.push(Number.parseInt(part, 16));
  }

  return groups.length > 8 ? undefined : groups;
}

function isLoopbackIPv6(groups: IPv6Groups): boolean {
  const embedded = getMappedIPv4(groups);

  if (embedded !== undefined) {
    return embedded >>> 24 === 127 || embedded === 0;
  }

  return groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
}

function isPrivateIPv6(groups: IPv6Groups): boolean {
  const embedded = getMappedIPv4(groups);

  if (embedded !== undefined) {
    const first = embedded >>> 24;

    const second = (embedded >>> 16) & 0xff;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (isLoopbackIPv6(groups)) {
    return true;
  }

  /* The unspecified address ::, unique-local fc00::/7 and link-local fe80::/10. */
  return (
    groups.every((group) => group === 0) ||
    (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xffc0) === 0xfe80
  );
}

function getMappedIPv4(groups: IPv6Groups): number | undefined {
  const prefixIsZero = groups.slice(0, 5).every((group) => group === 0);

  if (!prefixIsZero) {
    return undefined;
  }

  if (groups[5] !== 0xffff && groups[5] !== 0) {
    return undefined;
  }

  const address = ((groups[6] << 16) | groups[7]) >>> 0;

  if (groups[5] === 0 && address <= 1) {
    /* :: and ::1 are the unspecified and loopback addresses, not mapped IPv4. */
    return undefined;
  }

  return address;
}
