import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

import { HTTP_HEADERS } from "../httpConstants/http.constants.js";

import { InvalidJSONError } from "../httpErrors/httpError.helper.js";

import { parseQueryString as parseHardenedQueryString } from "../httpQuery/queryParse/index.js";

import {
  getClientIp,
  isTrustedPeer,
} from "../httpTrustProxy/httpTrustProxy.helper.js";

import type {
  ProxyRequest,
  TrustProxy,
} from "../httpTrustProxy/httpTrustProxy.type.js";

import type {
  HTTPHeaders,
  HTTPMethod,
  HTTPParams,
  HTTPQuery,
  HTTPRequest,
} from "../httpTypes/http.types.js";

/* -------------------------------------------------------------------------- */
/* Request Headers                                                            */
/* -------------------------------------------------------------------------- */

export class NodeHTTPHeaders implements HTTPHeaders {
  private readonly headers: Headers;

  constructor(source?: IncomingHttpHeaders | Headers) {
    this.headers = new Headers();

    if (source instanceof Headers) {
      source.forEach((value, name) => {
        this.headers.set(name, value);
      });

      return;
    }

    if (source) {
      for (const [name, value] of Object.entries(source)) {
        if (Array.isArray(value)) {
          this.headers.set(name, value.join(", "));
        } else if (value !== undefined) {
          this.headers.set(name, value);
        }
      }
    }
  }

  public get(name: string): string | null {
    return this.headers.get(name);
  }

  public set(name: string, value: string): void {
    this.headers.set(name, value);
  }

  public append(name: string, value: string): void {
    this.headers.append(name, value);
  }

  public has(name: string): boolean {
    return this.headers.has(name);
  }

  public delete(name: string): void {
    this.headers.delete(name);
  }

  public entries(): IterableIterator<[string, string]> {
    return this.headers.entries();
  }

  public keys(): IterableIterator<string> {
    return this.headers.keys();
  }

  public values(): IterableIterator<string> {
    return this.headers.values();
  }
}

/* -------------------------------------------------------------------------- */
/* Request Implementation                                                     */
/* -------------------------------------------------------------------------- */

export interface HTTPRequestOptions {
  readonly params?: HTTPParams;
  readonly query?: HTTPQuery;
  readonly rawBody?: Uint8Array;
  readonly body?: unknown;
  readonly ip?: string;
  readonly ips?: readonly string[];
  readonly signal?: AbortSignal;
  /**
   * Which socket peers may speak for a client through `X-Forwarded-*`.
   *
   * Defaults to `false`: every forwarded header is ignored and the socket
   * peer decides `ip`, `protocol` and `secure`. Set it to the address, CIDR
   * range, preset or predicate matching the proxy in front of this process
   * before `req.ip` may report a forwarded address.
   */
  readonly trustProxy?: TrustProxy;
}

/* -------------------------------------------------------------------------- */
/* Node Request                                                               */
/* -------------------------------------------------------------------------- */

export class NodeHTTPRequest implements HTTPRequest {
  public readonly method: HTTPMethod;

  public readonly url: string;

  public readonly path: string;

  public readonly originalUrl: string;

  public readonly headers: HTTPHeaders;

  public readonly query: HTTPQuery;

  public readonly params: HTTPParams;

  public readonly protocol: string;

  public readonly hostname: string;

  public readonly ip?: string;

  public readonly ips?: readonly string[];

  public readonly secure: boolean;

  public readonly rawBody?: Uint8Array;

  public readonly body: unknown;

  private readonly signal?: AbortSignal;

  private cachedText?: string;

  private cachedJSON?: unknown;

  private jsonParsed = false;

  constructor(request: IncomingMessage, options: HTTPRequestOptions = {}) {
    const trustProxy = options.trustProxy ?? false;

    const protocol = getRequestProtocol(request, trustProxy);

    const host = getRequestHost(request);

    const path = getRequestPath(request);

    this.method = normalizeHTTPMethod(request.method);

    this.url = request.url ?? path;

    this.path = path;

    this.originalUrl = this.url;

    this.headers = new NodeHTTPHeaders(request.headers);

    this.query = options.query ?? parseQueryString(this.url);

    this.params = options.params ?? {};

    this.protocol = protocol;

    this.hostname = getHostname(host);

    this.ip = options.ip ?? getRequestIP(request, trustProxy);

    this.ips = options.ips;

    this.secure = protocol === "https";

    this.rawBody = options.rawBody;

    this.body = options.body;

    this.signal = options.signal;
  }

  /* ------------------------------------------------------------------------ */
  /* Headers                                                                  */
  /* ------------------------------------------------------------------------ */

  public getHeader(name: string): string | undefined {
    return this.headers.get(name) ?? undefined;
  }

  public get(name: string): string | undefined {
    return this.getHeader(name);
  }

  /* ------------------------------------------------------------------------ */
  /* Content Negotiation                                                      */
  /* ------------------------------------------------------------------------ */

  public accepts(...types: readonly string[]): string | false {
    if (types.length === 0) {
      return false;
    }

    const accept = this.getHeader(HTTP_HEADERS.ACCEPT);

    if (!accept || accept.trim() === "*/*") {
      return types[0] ?? false;
    }

    const accepted = parseAcceptHeader(accept);

    for (const type of types) {
      if (
        accepted.some(
          (candidate) =>
            candidate === "*/*" ||
            candidate === type.toLowerCase() ||
            mediaTypeMatches(candidate, type),
        )
      ) {
        return type;
      }
    }

    return false;
  }

  public is(...types: readonly string[]): string | false {
    const contentType = this.getHeader(HTTP_HEADERS.CONTENT_TYPE);

    if (!contentType) {
      return false;
    }

    const normalized = (contentType.split(";", 1)[0] ?? "")
      .trim()
      .toLowerCase();

    for (const type of types) {
      const normalizedType = (type.split(";", 1)[0] ?? "").trim().toLowerCase();

      if (
        normalized === normalizedType ||
        mediaTypeMatches(normalized, normalizedType)
      ) {
        return type;
      }
    }

    return false;
  }

  /* ------------------------------------------------------------------------ */
  /* Body                                                                      */
  /* ------------------------------------------------------------------------ */

  public async json<T = unknown>(): Promise<T> {
    if (this.jsonParsed) {
      return this.cachedJSON as T;
    }

    const text = await this.text();

    try {
      const parsed = JSON.parse(text) as T;

      this.cachedJSON = parsed;

      this.jsonParsed = true;

      return parsed;
    } catch (error) {
      throw new InvalidJSONError("Request body contains invalid JSON.", {
        cause: error,
      });
    }
  }

  public async text(): Promise<string> {
    if (this.cachedText !== undefined) {
      return this.cachedText;
    }

    if (!this.rawBody) {
      this.cachedText = "";

      return "";
    }

    this.cachedText = Buffer.from(this.rawBody).toString("utf8");

    return this.cachedText;
  }

  public async buffer(): Promise<Uint8Array> {
    return this.rawBody ?? new Uint8Array();
  }

  /* ------------------------------------------------------------------------ */
  /* State                                                                     */
  /* ------------------------------------------------------------------------ */

  public get signalAborted(): boolean {
    return this.signal?.aborted ?? false;
  }

  public get abortedBySignal(): boolean {
    return this.signalAborted;
  }

  /**
   * Whether the request has been aborted.
   *
   * This was previously a declared-but-never-assigned field, so it read as
   * `undefined` on every instance and no abort check against it ever fired.
   */
  public get aborted(): boolean {
    return this.signalAborted;
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createHTTPRequest(
  request: IncomingMessage,
  options: HTTPRequestOptions = {},
): NodeHTTPRequest {
  return new NodeHTTPRequest(request, options);
}

/* -------------------------------------------------------------------------- */
/* Request URL                                                                */
/* -------------------------------------------------------------------------- */

export function getRequestPath(request: IncomingMessage): string {
  const raw = request.url ?? "/";

  const queryIndex = raw.indexOf("?");

  if (queryIndex < 0) {
    return raw || "/";
  }

  return raw.slice(0, queryIndex) || "/";
}

export function getRequestHost(request: IncomingMessage): string {
  const host = request.headers[HTTP_HEADERS.HOST];

  if (Array.isArray(host)) {
    return host[0] ?? "";
  }

  return host ?? "";
}

export function getHostname(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]", 1);

    return end >= 0 ? host.slice(1, end) : host;
  }

  const separator = host.lastIndexOf(":");

  if (separator > 0 && host.indexOf(":") === separator) {
    return host.slice(0, separator);
  }

  return host;
}

/* -------------------------------------------------------------------------- */
/* Protocol                                                                   */
/* -------------------------------------------------------------------------- */

/** The only schemes a forwarded proto may name. */
const FORWARDED_PROTOCOLS = Object.freeze(["http", "https"]);

/**
 * Presents an `IncomingMessage` in the shape `httpTrustProxy` works on, so
 * this path and the Node adapter share one implementation of the hop logic.
 */
function toProxyRequest(request: IncomingMessage): ProxyRequest {
  return {
    headers: request.headers,
    socket: { remoteAddress: request.socket?.remoteAddress },
  };
}

/**
 * Resolves the scheme the client used.
 *
 * `X-Forwarded-Proto` is written by whoever opened the socket, so it is read
 * only when that peer is a configured trusted proxy, and only when it names
 * `http` or `https` — a value such as `wss` is discarded rather than
 * propagated. With the default `trustProxy` of `false` the socket's own TLS
 * state is the only input.
 *
 * @param request - The incoming Node request.
 * @param trustProxy - Which peers may speak through `X-Forwarded-Proto`.
 * @returns `"https"` or `"http"`.
 */
export function getRequestProtocol(
  request: IncomingMessage,
  trustProxy: TrustProxy = false,
): string {
  if (isTrustedPeer(toProxyRequest(request), trustProxy)) {
    const forwarded = request.headers[HTTP_HEADERS.X_FORWARDED_PROTO];

    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;

    if (typeof value === "string") {
      const proto = (value.split(",", 1)[0] ?? "").trim().toLowerCase();

      if (FORWARDED_PROTOCOLS.includes(proto)) {
        return proto;
      }
    }
  }

  if (
    "encrypted" in request.socket &&
    (request.socket as { readonly encrypted?: boolean }).encrypted
  ) {
    return "https";
  }

  return "http";
}

/* -------------------------------------------------------------------------- */
/* IP                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the client address.
 *
 * The socket peer is authoritative. `X-Forwarded-For` is consulted only when
 * that peer is a configured trusted proxy, and the chain walk is delegated to
 * `getClientIp` so there is a single implementation of the hop logic. With
 * the default `trustProxy` of `false` the peer address is returned unchanged,
 * which is what an allowlist, per-IP rate limit or audit trail keyed on
 * `req.ip` needs.
 *
 * @param request - The incoming Node request.
 * @param trustProxy - Which peers may speak through `X-Forwarded-For`.
 * @returns The client address, or `undefined` when the socket has none.
 */
export function getRequestIP(
  request: IncomingMessage,
  trustProxy: TrustProxy = false,
): string | undefined {
  const proxyRequest = toProxyRequest(request);

  const peer = proxyRequest.socket?.remoteAddress;

  if (!isTrustedPeer(proxyRequest, trustProxy)) {
    return peer ?? undefined;
  }

  return getClientIp(proxyRequest, trustProxy) ?? peer ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* Query                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Parses the query component of a request-target into a flat record.
 *
 * Delegates to the hardened `httpQuery` parser, the same one behind the Node
 * adapter's `request.query` and the router's `ctx.query`. This function used
 * to carry its own loop that accumulated into an object literal and read
 * `result[key]` without an own-property check, which had two consequences on
 * fully attacker-controlled input:
 *
 * - `?__proto__=a&__proto__=b` assigned an array through the `__proto__`
 *   setter, so the returned query object's prototype became that array. The
 *   parameter vanished from its own keys while the object silently gained
 *   `length`, `map` and the rest of `Array.prototype`.
 * - `?constructor=x` read the inherited `Object` constructor as the "existing"
 *   value and stored it in the result, handing a handler
 *   `query.constructor === [Function: Object], "x"]`.
 *
 * It also applied none of the four documented query limits, so a request with
 * 50,000 parameters was parsed in full. Delegating fixes all three, and makes
 * a limit breach throw {@link HTTPQueryLimitError} (414) as it already did on
 * every other request path.
 */
export function parseQueryString(url: string): HTTPQuery {
  const queryIndex = url.indexOf("?");

  if (queryIndex < 0) {
    return parseHardenedQueryString(undefined);
  }

  const hashIndex = url.indexOf("#", queryIndex + 1);

  return parseHardenedQueryString(
    url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex),
  );
}

/* -------------------------------------------------------------------------- */
/* Method                                                                     */
/* -------------------------------------------------------------------------- */

export function normalizeHTTPMethod(method: string | undefined): HTTPMethod {
  const normalized = (method ?? "GET").toUpperCase();

  return normalized as HTTPMethod;
}

/* -------------------------------------------------------------------------- */
/* Accept Header                                                              */
/* -------------------------------------------------------------------------- */

export function parseAcceptHeader(value: string): string[] {
  return value
    .split(",")
    .map((part) => (part.split(";", 1)[0] ?? "").trim().toLowerCase())
    .filter(Boolean);
}

export function mediaTypeMatches(
  candidate: string,
  requested: string,
): boolean {
  const candidateParts = candidate.toLowerCase().split("/");

  const requestedParts = requested.toLowerCase().split("/");

  if (candidateParts.length !== 2 || requestedParts.length !== 2) {
    return false;
  }

  return (
    (candidateParts[0] === "*" ||
      requestedParts[0] === "*" ||
      candidateParts[0] === requestedParts[0]) &&
    (candidateParts[1] === "*" ||
      requestedParts[1] === "*" ||
      candidateParts[1] === requestedParts[1])
  );
}
