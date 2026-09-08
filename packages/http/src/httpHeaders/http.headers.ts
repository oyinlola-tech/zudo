import type { IncomingHttpHeaders } from "node:http";

import {
  assertSafeHeaderName,
  assertSafeHeaderValue,
} from "./security/httpHeaders.security.js";
import { isIterableHeaders } from "./internal/httpHeaders.internal.typeGuards.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HTTPHeadersInit =
  | HTTPHeaders
  | Record<string, string | number | boolean | null | undefined>
  | Iterable<readonly [string, string | number | boolean]>;

export type HTTPHeaderValue = string | number | boolean;

export interface HTTPHeaderEntry {
  readonly name: string;
  readonly value: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const HEADER_CONTENT_TYPE = "content-type";

export const HEADER_CONTENT_LENGTH = "content-length";

export const HEADER_ACCEPT = "accept";

export const HEADER_AUTHORIZATION = "authorization";

export const HEADER_USER_AGENT = "user-agent";

export const HEADER_CACHE_CONTROL = "cache-control";

export const HEADER_COOKIE = "cookie";

export const HEADER_SET_COOKIE = "set-cookie";

export const HEADER_LOCATION = "location";

export const HEADER_HOST = "host";

export const HEADER_ORIGIN = "origin";

export const HEADER_REFERER = "referer";

export const HEADER_X_REQUEST_ID = "x-request-id";

export const HEADER_X_FORWARDED_FOR = "x-forwarded-for";

export const HEADER_X_FORWARDED_HOST = "x-forwarded-host";

export const HEADER_X_FORWARDED_PROTO = "x-forwarded-proto";

/* -------------------------------------------------------------------------- */
/* HTTPHeaders                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Header names that must never be folded into a single comma-joined value.
 *
 * RFC 6265 §3 forbids folding `Set-Cookie`: cookie `Expires` attributes
 * contain commas, so a comma-joined list cannot be split back apart.
 */
const NON_FOLDABLE_HEADERS = new Set(["set-cookie"]);

export class HTTPHeaders implements Iterable<[string, string]> {
  private readonly values = new Map<string, string[]>();

  public constructor(init?: HTTPHeadersInit) {
    if (init !== undefined) {
      this.init(init);
    }
  }

  public init(init: HTTPHeadersInit): this {
    if (init instanceof HTTPHeaders) {
      for (const name of init.keys()) {
        for (const value of init.getAll(name)) {
          this.append(name, value);
        }
      }

      return this;
    }

    if (isIterableHeaders(init)) {
      for (const entry of init) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          continue;
        }

        this.set(String(entry[0]), String(entry[1]));
      }

      return this;
    }

    for (const [name, value] of Object.entries(init)) {
      if (value === undefined || value === null) {
        continue;
      }

      this.set(name, String(value));
    }

    return this;
  }

  public set(name: string, value: HTTPHeaderValue): this {
    const normalized = normalizeHeaderName(name);

    assertSafeHeaderName(normalized);

    assertSafeHeaderValue(String(value));

    this.values.set(normalized, [String(value)]);

    return this;
  }

  public append(name: string, value: HTTPHeaderValue): this {
    const normalized = normalizeHeaderName(name);

    assertSafeHeaderName(normalized);

    const stringValue = String(value);

    assertSafeHeaderValue(stringValue);

    const existing = this.values.get(normalized);

    if (existing === undefined) {
      this.values.set(normalized, [stringValue]);
    } else {
      existing.push(stringValue);
    }

    return this;
  }

  public get(name: string): string | undefined {
    const normalized = normalizeHeaderName(name);

    const stored = this.values.get(normalized);

    if (stored === undefined || stored.length === 0) {
      return undefined;
    }

    if (stored.length === 1) {
      return stored[0];
    }

    if (NON_FOLDABLE_HEADERS.has(normalized)) {
      return stored[0];
    }

    return stored.join(", ");
  }

  /**
   * Returns every value stored for a header name.
   *
   * Unlike {@link HTTPHeaders.get} this never folds multiple values into a
   * single comma-joined string, so it is the correct accessor for
   * `Set-Cookie`.
   *
   * @param name - The header name.
   * @returns All stored values, in insertion order.
   */
  public getAll(name: string): string[] {
    return [...(this.values.get(normalizeHeaderName(name)) ?? [])];
  }

  /**
   * Returns every `Set-Cookie` value, never folded.
   *
   * @returns The stored `Set-Cookie` values in insertion order.
   */
  public getSetCookie(): string[] {
    return this.getAll(HEADER_SET_COOKIE);
  }

  public has(name: string): boolean {
    return this.values.has(normalizeHeaderName(name));
  }

  public delete(name: string): boolean {
    return this.values.delete(normalizeHeaderName(name));
  }

  public clear(): void {
    this.values.clear();
  }

  public keys(): IterableIterator<string> {
    return this.values.keys();
  }

  public valuesIterator(): IterableIterator<string> {
    return this.foldedEntries()
      .map(([, value]) => value)
      [Symbol.iterator]();
  }

  public entries(): IterableIterator<[string, string]> {
    return this.foldedEntries()[Symbol.iterator]();
  }

  /**
   * Materialises the header map as folded `[name, value]` pairs.
   *
   * @returns One entry per header name, with the folded value.
   */
  private foldedEntries(): [string, string][] {
    const entries: [string, string][] = [];

    for (const name of this.values.keys()) {
      entries.push([name, this.get(name) ?? ""]);
    }

    return entries;
  }

  public forEach(callback: (value: string, name: string) => void): void {
    for (const [name, value] of this.entries()) {
      callback(value, name);
    }
  }

  public get size(): number {
    return this.values.size;
  }

  public isEmpty(): boolean {
    return this.values.size === 0;
  }

  public clone(): HTTPHeaders {
    const copy = new HTTPHeaders();

    for (const [name, stored] of this.values) {
      copy.values.set(name, [...stored]);
    }

    return copy;
  }

  public toObject(): Record<string, string> {
    return Object.fromEntries(this.entries());
  }

  /**
   * Converts to a Node-style outgoing header record.
   *
   * Non-foldable headers (`Set-Cookie`) are emitted as arrays so that
   * multiple values survive the round trip.
   *
   * @returns A record suitable for `ServerResponse.writeHead`.
   */
  public toNodeHeaders(): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};

    for (const [name, stored] of this.values) {
      if (NON_FOLDABLE_HEADERS.has(name)) {
        result[name] = [...stored];

        continue;
      }

      result[name] = stored.join(", ");
    }

    return result;
  }

  public toJSON(): Record<string, string> {
    return this.toObject();
  }

  public [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

/* -------------------------------------------------------------------------- */
/* Factory Helpers                                                            */
/* -------------------------------------------------------------------------- */

export function createHeaders(init?: HTTPHeadersInit): HTTPHeaders {
  return new HTTPHeaders(init);
}

export function normalizeHeaders(
  headers: HTTPHeadersInit | IncomingHttpHeaders | undefined,
): HTTPHeaders {
  if (headers === undefined) {
    return new HTTPHeaders();
  }

  if (headers instanceof HTTPHeaders) {
    return headers.clone();
  }

  const result = new HTTPHeaders();

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(name, item);
      }

      continue;
    }

    result.set(name, value);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Header Name Helpers                                                        */
/* -------------------------------------------------------------------------- */

export function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Common Header Accessors                                                    */
/* -------------------------------------------------------------------------- */

export function setContentType(
  headers: HTTPHeaders,
  value: string,
): HTTPHeaders {
  headers.set(HEADER_CONTENT_TYPE, value);

  return headers;
}

export function setContentLength(
  headers: HTTPHeaders,
  length: number,
): HTTPHeaders {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError("Content-Length must be a non-negative safe integer.");
  }

  headers.set(HEADER_CONTENT_LENGTH, String(length));

  return headers;
}

export function getAuthorization(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_AUTHORIZATION);
}

export function setAuthorization(
  headers: HTTPHeaders,
  value: string,
): HTTPHeaders {
  headers.set(HEADER_AUTHORIZATION, value);

  return headers;
}

export function getUserAgent(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_USER_AGENT);
}

export function setUserAgent(headers: HTTPHeaders, value: string): HTTPHeaders {
  headers.set(HEADER_USER_AGENT, value);

  return headers;
}

export function getAccept(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_ACCEPT);
}

export function setAccept(headers: HTTPHeaders, value: string): HTTPHeaders {
  headers.set(HEADER_ACCEPT, value);

  return headers;
}

export function getCacheControl(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_CACHE_CONTROL);
}

export function setCacheControl(
  headers: HTTPHeaders,
  value: string,
): HTTPHeaders {
  headers.set(HEADER_CACHE_CONTROL, value);

  return headers;
}

export function getLocation(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_LOCATION);
}

export function setLocation(headers: HTTPHeaders, value: string): HTTPHeaders {
  headers.set(HEADER_LOCATION, value);

  return headers;
}

/* -------------------------------------------------------------------------- */
/* Cookie Header Helpers                                                      */
/* -------------------------------------------------------------------------- */

export function getCookieHeader(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_COOKIE);
}

export function setCookieHeader(
  headers: HTTPHeaders,
  value: string,
): HTTPHeaders {
  headers.set(HEADER_COOKIE, value);

  return headers;
}

/* -------------------------------------------------------------------------- */
/* Forwarded Header Helpers                                                   */
/* -------------------------------------------------------------------------- */

export function getForwardedFor(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_X_FORWARDED_FOR);
}

export function getForwardedHost(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_X_FORWARDED_HOST);
}

export function getForwardedProto(
  headers: HTTPHeadersInit,
): string | undefined {
  return normalizeHeaders(headers).get(HEADER_X_FORWARDED_PROTO);
}

/* -------------------------------------------------------------------------- */
/* Request ID                                                                 */
/* -------------------------------------------------------------------------- */

export function getRequestId(headers: HTTPHeadersInit): string | undefined {
  return normalizeHeaders(headers).get(HEADER_X_REQUEST_ID);
}

export function setRequestId(
  headers: HTTPHeaders,
  requestId: string,
): HTTPHeaders {
  headers.set(HEADER_X_REQUEST_ID, requestId);

  return headers;
}

/* -------------------------------------------------------------------------- */
/* Security Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function hasSecurityHeaders(headers: HTTPHeadersInit): boolean {
  const normalized = normalizeHeaders(headers);

  return (
    normalized.has("strict-transport-security") ||
    normalized.has("content-security-policy") ||
    normalized.has("x-content-type-options") ||
    normalized.has("x-frame-options")
  );
}
