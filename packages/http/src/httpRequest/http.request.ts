import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

import { HTTP_HEADERS } from "../httpConstants/http.constants.js";

import { InvalidJSONError } from "../httpErrors/httpError.helper.js";

import type {
  HTTPHeaders,
  HTTPMethod,
  HTTPParams,
  HTTPQuery,
  HTTPQueryValue,
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
    const protocol = getRequestProtocol(request);

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

    this.ip = options.ip ?? getRequestIP(request);

    this.ips = options.ips;

    this.secure = protocol === "https" || protocol === "wss";

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

export function getRequestProtocol(request: IncomingMessage): string {
  const forwarded = request.headers[HTTP_HEADERS.X_FORWARDED_PROTO];

  if (typeof forwarded === "string") {
    return (forwarded.split(",", 1)[0] ?? "").trim().toLowerCase();
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

export function getRequestIP(request: IncomingMessage): string | undefined {
  const forwarded = request.headers[HTTP_HEADERS.X_FORWARDED_FOR];

  if (typeof forwarded === "string") {
    const first = forwarded.split(",", 1)[0]?.trim();

    if (first) {
      return first;
    }
  }

  return request.socket.remoteAddress ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* Query                                                                      */
/* -------------------------------------------------------------------------- */

export function parseQueryString(url: string): HTTPQuery {
  const queryIndex = url.indexOf("?");

  if (queryIndex < 0) {
    return {};
  }

  const queryString = url.slice(queryIndex + 1);

  if (!queryString) {
    return {};
  }

  const searchParams = new URLSearchParams(queryString);

  const result: HTTPQuery = {};

  for (const [key, value] of searchParams.entries()) {
    const existing = result[key];

    if (existing === undefined) {
      result[key] = value;

      continue;
    }

    if (Array.isArray(existing)) {
      result[key] = [...existing, value];

      continue;
    }

    result[key] = [existing as HTTPQueryValue, value];
  }

  return result;
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
