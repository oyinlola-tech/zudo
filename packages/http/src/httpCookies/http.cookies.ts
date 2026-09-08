import {
  createHmac,
  timingSafeEqual as cryptoTimingSafeEqual,
} from "node:crypto";

import type { HTTPRequest, HTTPResponse } from "../httpTypes/http.types.js";

/* -------------------------------------------------------------------------- */
/* Cookie Types                                                               */
/* -------------------------------------------------------------------------- */

export interface CookieOptions {
  readonly maxAge?: number;
  readonly expires?: Date;
  readonly domain?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly sameSite?: CookieSameSite;
  readonly partitioned?: boolean;
  readonly priority?: CookiePriority;
}

export type CookieSameSite = "strict" | "lax" | "none";

export type CookiePriority = "low" | "medium" | "high";

export type CookieValue = string | number | boolean;

/* -------------------------------------------------------------------------- */
/* Cookie Collection                                                          */
/* -------------------------------------------------------------------------- */

export class CookieCollection {
  private readonly values = new Map<string, string>();

  public constructor(
    cookies: Record<string, string> | Map<string, string> = {},
  ) {
    if (cookies instanceof Map) {
      for (const [name, value] of cookies) {
        this.values.set(name, value);
      }

      return;
    }

    for (const [name, value] of Object.entries(cookies)) {
      this.values.set(name, value);
    }
  }

  public get(name: string): string | undefined {
    return this.values.get(name);
  }

  public has(name: string): boolean {
    return this.values.has(name);
  }

  public set(name: string, value: string): this {
    validateCookieName(name);

    this.values.set(name, value);

    return this;
  }

  public delete(name: string): boolean {
    return this.values.delete(name);
  }

  public clear(): void {
    this.values.clear();
  }

  public entries(): IterableIterator<[string, string]> {
    return this.values.entries();
  }

  public keys(): IterableIterator<string> {
    return this.values.keys();
  }

  public valuesIterator(): IterableIterator<string> {
    return this.values.values();
  }

  /**
   * Materialises the jar as a plain record.
   *
   * The record has a `null` prototype so that a cookie named `__proto__`,
   * `constructor` or `toString` can neither reach `Object.prototype` nor be
   * confused with an inherited member on lookup.
   *
   * @returns A null-prototype record of cookie name to value.
   */
  public toObject(): Record<string, string> {
    const result = Object.create(null) as Record<string, string>;

    for (const [name, value] of this.values) {
      result[name] = value;
    }

    return result;
  }

  public get size(): number {
    return this.values.size;
  }
}

/* -------------------------------------------------------------------------- */
/* Parse Cookie Header                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Maximum number of cookies parsed from one `Cookie` header.
 */
export const MAX_COOKIE_COUNT = 128;

/**
 * Maximum `Cookie` header length accepted, in characters.
 */
export const MAX_COOKIE_HEADER_LENGTH = 32 * 1024;

/**
 * RFC 6265 `cookie-name`, which is an RFC 9110 `token`.
 */
const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Parses a `Cookie` request header.
 *
 * This function never throws: the header is fully attacker-controlled, so a
 * malformed entry is skipped rather than allowed to abort the request. When
 * a name occurs more than once the **first** occurrence wins, matching
 * RFC 6265 section 5.4 ordering (most specific path first) and every browser
 * and mainstream server library.
 *
 * @param header - The raw `Cookie` header value.
 * @returns The parsed cookie jar.
 */
export function parseCookies(header: string | undefined): CookieCollection {
  const values = new Map<string, string>();

  if (!header) {
    return new CookieCollection(values);
  }

  const bounded = header.slice(0, MAX_COOKIE_HEADER_LENGTH);

  for (const part of splitCookieHeader(bounded)) {
    if (values.size >= MAX_COOKIE_COUNT) {
      break;
    }

    const separator = part.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();

    const rawValue = part.slice(separator + 1).trim();

    if (!COOKIE_NAME_TOKEN.test(name)) {
      continue;
    }

    /*
     * First occurrence wins. Taking the last would let an attacker who can
     * set a cookie on a parent domain or a less specific path override the
     * legitimate one, while the browser still considers the first
     * authoritative.
     */
    if (values.has(name)) {
      continue;
    }

    values.set(name, decodeCookieValue(rawValue));
  }

  return new CookieCollection(values);
}

/* -------------------------------------------------------------------------- */
/* Serialize Cookie                                                           */
/* -------------------------------------------------------------------------- */

export function serializeCookie(
  name: string,
  value: CookieValue,
  options: CookieOptions = {},
): string {
  validateCookieName(name);

  validateCookiePrefix(name, options);

  const encodedName = name;

  const encodedValue = encodeCookieValue(String(value));

  const parts: string[] = [`${encodedName}=${encodedValue}`];

  if (options.maxAge !== undefined) {
    if (!Number.isFinite(options.maxAge)) {
      throw new TypeError("Cookie maxAge must be a finite number.");
    }

    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.expires) {
    if (Number.isNaN(options.expires.getTime())) {
      throw new TypeError("Cookie expires must be a valid Date.");
    }

    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.domain) {
    validateCookieAttribute("domain", options.domain);

    parts.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    validateCookieAttribute("path", options.path);

    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    const sameSite = normalizeSameSite(options.sameSite);

    parts.push(`SameSite=${sameSite}`);
  }

  if (options.partitioned) {
    parts.push("Partitioned");
  }

  if (options.priority) {
    parts.push(`Priority=${normalizePriority(options.priority)}`);
  }

  return parts.join("; ");
}

/* -------------------------------------------------------------------------- */
/* Cookie Manager                                                             */
/* -------------------------------------------------------------------------- */

export interface CookieManager {
  get(name: string): string | undefined;

  has(name: string): boolean;

  set(name: string, value: CookieValue, options?: CookieOptions): void;

  delete(name: string, options?: CookieOptions): void;

  parse(): CookieCollection;
}

/* -------------------------------------------------------------------------- */
/* Request Cookies                                                            */
/* -------------------------------------------------------------------------- */

export function getRequestCookies(request: HTTPRequest): CookieCollection {
  const header = request.getHeader("cookie");

  return parseCookies(header);
}

export function getRequestCookie(
  request: HTTPRequest,
  name: string,
): string | undefined {
  return getRequestCookies(request).get(name);
}

/* -------------------------------------------------------------------------- */
/* Response Cookies                                                           */
/* -------------------------------------------------------------------------- */

export function setResponseCookie(
  response: HTTPResponse,
  name: string,
  value: CookieValue,
  options: CookieOptions = {},
): void {
  const serialized = serializeCookie(name, value, options);

  appendSetCookieHeader(response, serialized);
}

export function deleteResponseCookie(
  response: HTTPResponse,
  name: string,
  options: CookieOptions = {},
): void {
  setResponseCookie(response, name, "", {
    ...options,
    maxAge: 0,
    expires: new Date(0),
  });
}

/* -------------------------------------------------------------------------- */
/* Response Header Helpers                                                    */
/* -------------------------------------------------------------------------- */

export function appendSetCookieHeader(
  response: HTTPResponse,
  cookie: string,
): void {
  const existing = response.getHeader("Set-Cookie");

  if (existing === undefined) {
    response.setHeader("Set-Cookie", [cookie]);

    return;
  }

  const values = Array.isArray(existing)
    ? existing.map(String)
    : [String(existing)];

  values.push(cookie);

  response.setHeader("Set-Cookie", values);
}

/* -------------------------------------------------------------------------- */
/* Cookie Manager Factory                                                     */
/* -------------------------------------------------------------------------- */

export function createCookieManager(
  request: HTTPRequest,
  response: HTTPResponse,
): CookieManager {
  const parsed = getRequestCookies(request);

  return {
    get(name) {
      return parsed.get(name);
    },

    has(name) {
      return parsed.has(name);
    },

    set(name, value, options) {
      setResponseCookie(response, name, value, options);
    },

    delete(name, options) {
      deleteResponseCookie(response, name, options);
    },

    parse() {
      return parsed;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Signed Cookies                                                             */
/* -------------------------------------------------------------------------- */

export interface SignedCookieOptions extends CookieOptions {
  readonly secret: string;
}

export interface SignedCookie {
  readonly value: string;
  readonly signature: string;
}

export function serializeSignedCookie(
  name: string,
  value: string,
  options: SignedCookieOptions,
): string {
  const signature = signCookieValue(value, options.secret);

  return serializeCookie(name, `${value}.${signature}`, options);
}

export function parseSignedCookie(
  value: string | undefined,
  secret: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const separator = value.lastIndexOf(".");

  if (separator <= 0) {
    return undefined;
  }

  const originalValue = value.slice(0, separator);

  const signature = value.slice(separator + 1);

  const expected = signCookieValue(originalValue, secret);

  if (!timingSafeEqual(signature, expected)) {
    return undefined;
  }

  return originalValue;
}

/**
 * Signs a cookie value with HMAC-SHA256.
 *
 * @param value - The value to authenticate.
 * @param secret - The signing key.
 * @returns The base64url signature.
 * @throws {TypeError} If the secret is empty.
 */
export function signCookieValue(value: string, secret: string): string {
  if (!secret) {
    throw new TypeError("Cookie signing secret cannot be empty.");
  }

  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

/* -------------------------------------------------------------------------- */
/* Cookie Encoding                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Percent-encodes a cookie value.
 *
 * SP is deliberately left encoded: RFC 6265 `cookie-octet` excludes it, and
 * emitting a raw space breaks strict parsers and some proxies.
 *
 * @param value - The raw cookie value.
 * @returns The encoded value.
 */
function encodeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Percent-decodes a cookie value.
 *
 * DQUOTE is not stripped: it is an ordinary `cookie-octet`, and unwrapping it
 * makes the parse disagree with the browser about the value.
 *
 * @param value - The raw cookie value.
 * @returns The decoded value, or the raw value when decoding fails.
 */
function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Header Parsing                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Splits a `Cookie` header into its `name=value` pairs.
 *
 * The split is unconditional on `;` per RFC 6265 section 5.4. DQUOTE is an
 * ordinary `cookie-octet` there with no delimiting meaning, so tracking
 * quotes would let a single unbalanced `"` in one attacker-set cookie swallow
 * every cookie after it — a cookie-shadowing primitive.
 *
 * @param header - The raw header value.
 * @returns The unparsed pairs.
 */
function splitCookieHeader(header: string): string[] {
  return header.split(";");
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validates a cookie name against the RFC 6265 `cookie-name` production.
 *
 * @param name - The cookie name.
 * @throws {TypeError} If the name is empty or contains a non-token character
 *   — which includes NUL and DEL, whose acceptance would let an intermediary
 *   truncate the name and set a different cookie than the one requested.
 */
function validateCookieName(name: string): void {
  if (!name) {
    throw new TypeError("Cookie name cannot be empty.");
  }

  if (!COOKIE_NAME_TOKEN.test(name)) {
    throw new TypeError(`Invalid cookie name: ${JSON.stringify(name)}`);
  }
}

/**
 * Enforces the RFC 6265bis section 4.1.3 cookie name prefixes.
 *
 * A browser silently drops a `__Host-` or `__Secure-` cookie whose
 * attributes violate the prefix, and the failure is invisible server-side —
 * a login that quietly does nothing. Failing loudly here is the only way the
 * caller learns.
 *
 * @param name - The cookie name.
 * @param options - The cookie attributes.
 * @throws {TypeError} If a prefix constraint is violated.
 */
function validateCookiePrefix(name: string, options: CookieOptions): void {
  if (name.startsWith("__Host-")) {
    if (!options.secure) {
      throw new TypeError("A __Host- cookie requires the Secure attribute.");
    }

    if (options.domain) {
      throw new TypeError("A __Host- cookie must not set a Domain attribute.");
    }

    if ((options.path ?? "/") !== "/") {
      throw new TypeError("A __Host- cookie requires Path=/.");
    }

    return;
  }

  if (name.startsWith("__Secure-") && !options.secure) {
    throw new TypeError("A __Secure- cookie requires the Secure attribute.");
  }
}

/**
 * Validates a cookie attribute value.
 *
 * @param attribute - The attribute name, for the error message.
 * @param value - The attribute value.
 * @throws {TypeError} If the value contains `;` or any control character.
 */
function validateCookieAttribute(attribute: string, value: string): void {
  if (/[;\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`Invalid cookie ${attribute}.`);
  }
}

function normalizeSameSite(value: CookieSameSite): string {
  switch (value) {
    case "strict":
      return "Strict";

    case "lax":
      return "Lax";

    case "none":
      return "None";

    default:
      throw new TypeError(`Invalid SameSite value: ${String(value)}`);
  }
}

function normalizePriority(value: CookiePriority): string {
  switch (value) {
    case "low":
      return "Low";

    case "medium":
      return "Medium";

    case "high":
      return "High";

    default:
      throw new TypeError(`Invalid cookie priority: ${String(value)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Hash Helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Compares two signatures in constant time.
 *
 * @param left - The candidate signature.
 * @param right - The expected signature.
 * @returns `true` if the two are byte-identical.
 */
function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");

  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return cryptoTimingSafeEqual(leftBuffer, rightBuffer);
}
