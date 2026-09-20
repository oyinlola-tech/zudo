/**
 * HTTP request context.
 *
 * Provides a request-scoped container for HTTP metadata, headers, body,
 * parameters, state, and lifecycle information.
 *
 * The context is intentionally framework-agnostic so adapters can populate it
 * from Node.js, Bun, Deno, or another HTTP runtime.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { parseRequestTarget } from "./target/httpRequest.target.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE"
  | string;

export type RequestHeaders = Readonly<Record<string, string>>;

export type RequestQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type RequestParams = Readonly<Record<string, string | undefined>>;

export type RequestBody = unknown;

export type RequestState = Record<string | symbol, unknown>;

export interface RequestContextInit {
  readonly id?: string;

  readonly method: HttpMethod;

  readonly url: string;

  readonly headers?: RequestHeaders;

  readonly query?: RequestQuery;

  readonly params?: RequestParams;

  readonly body?: RequestBody;

  readonly remoteAddress?: string;

  readonly protocol?: string;

  readonly hostname?: string;

  readonly port?: number;

  readonly path?: string;

  readonly signal?: AbortSignal;

  readonly state?: RequestState;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RequestContextSnapshot {
  readonly id: string;

  readonly method: HttpMethod;

  readonly url: string;

  readonly path: string;

  readonly headers: RequestHeaders;

  readonly query: RequestQuery;

  readonly params: RequestParams;

  readonly body: RequestBody;

  readonly remoteAddress: string | undefined;

  readonly protocol: string | undefined;

  readonly hostname: string | undefined;

  readonly port: number | undefined;

  readonly state: Readonly<RequestState>;

  readonly metadata: Readonly<Record<string, unknown>>;

  readonly createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const REQUEST_CONTEXT = Symbol.for("zudojs.http.request-context");

export const REQUEST_ID_HEADER = "x-request-id";

/* -------------------------------------------------------------------------- */
/* ID Generation                                                              */
/* -------------------------------------------------------------------------- */

export function generateRequestId(): string {
  const cryptoObject = globalThis.crypto;

  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

/* -------------------------------------------------------------------------- */
/* Request Context                                                            */
/* -------------------------------------------------------------------------- */

export class HttpRequestContext {
  readonly id: string;

  readonly method: HttpMethod;

  readonly url: string;

  readonly path: string;

  readonly createdAt: number;

  private readonly headersMap: Map<string, string>;

  private readonly queryMap: Map<
    string,
    string | readonly string[] | undefined
  >;

  private readonly paramsMap: Map<string, string | undefined>;

  private readonly stateMap: Map<string | symbol, unknown>;

  private readonly metadataMap: Map<string, unknown>;

  private requestBody: unknown;

  private remoteAddressValue: string | undefined;

  private protocolValue: string | undefined;

  private hostnameValue: string | undefined;

  private portValue: number | undefined;

  constructor(init: RequestContextInit) {
    this.id = init.id ?? generateRequestId();

    this.method = normalizeMethod(init.method);

    this.url = init.url;

    this.path = getPathname(init.url);

    this.createdAt = Date.now();

    this.headersMap = createHeaderMap(init.headers);

    this.queryMap = createMap(init.query);

    this.paramsMap = createMap(init.params);

    this.stateMap = new Map(Object.entries(init.state ?? {}));

    this.metadataMap = new Map(Object.entries(init.metadata ?? {}));

    this.requestBody = init.body;

    this.remoteAddressValue = init.remoteAddress;

    this.protocolValue = init.protocol;

    this.hostnameValue = init.hostname;

    this.portValue = init.port;
  }

  /* ------------------------------------------------------------------------ */
  /* Headers                                                                  */
  /* ------------------------------------------------------------------------ */

  get headers(): RequestHeaders {
    return Object.freeze(Object.fromEntries(this.headersMap));
  }

  hasHeader(name: string): boolean {
    return this.headersMap.has(normalizeHeaderName(name));
  }

  getHeader(name: string): string | undefined {
    return this.headersMap.get(normalizeHeaderName(name));
  }

  setHeader(name: string, value: string): this {
    validateHeaderName(name);

    validateHeaderValue(value);

    this.headersMap.set(normalizeHeaderName(name), value);

    return this;
  }

  appendHeader(name: string, value: string): this {
    validateHeaderName(name);

    validateHeaderValue(value);

    const normalized = normalizeHeaderName(name);

    const existing = this.headersMap.get(normalized);

    if (existing === undefined) {
      this.headersMap.set(normalized, value);
    } else {
      this.headersMap.set(normalized, `${existing}, ${value}`);
    }

    return this;
  }

  removeHeader(name: string): boolean {
    return this.headersMap.delete(normalizeHeaderName(name));
  }

  /* ------------------------------------------------------------------------ */
  /* Query                                                                    */
  /* ------------------------------------------------------------------------ */

  get query(): RequestQuery {
    const query = Object.create(null) as Record<
      string,
      string | readonly string[] | undefined
    >;

    for (const [name, value] of this.queryMap) {
      query[name] = value;
    }

    return Object.freeze(query);
  }

  hasQuery(name: string): boolean {
    return this.queryMap.has(name);
  }

  getQuery(name: string): string | readonly string[] | undefined {
    return this.queryMap.get(name);
  }

  setQuery(name: string, value: string | readonly string[] | undefined): this {
    this.queryMap.set(name, value);

    return this;
  }

  removeQuery(name: string): boolean {
    return this.queryMap.delete(name);
  }

  /* ------------------------------------------------------------------------ */
  /* Route Parameters                                                          */
  /* ------------------------------------------------------------------------ */

  get params(): RequestParams {
    return Object.freeze(Object.fromEntries(this.paramsMap));
  }

  hasParam(name: string): boolean {
    return this.paramsMap.has(name);
  }

  getParam(name: string): string | undefined {
    return this.paramsMap.get(name);
  }

  setParam(name: string, value: string | undefined): this {
    this.paramsMap.set(name, value);

    return this;
  }

  removeParam(name: string): boolean {
    return this.paramsMap.delete(name);
  }

  /* ------------------------------------------------------------------------ */
  /* Body                                                                     */
  /* ------------------------------------------------------------------------ */

  get body(): unknown {
    return this.requestBody;
  }

  setBody(body: unknown): this {
    this.requestBody = body;

    return this;
  }

  /* ------------------------------------------------------------------------ */
  /* Network Metadata                                                         */
  /* ------------------------------------------------------------------------ */

  get remoteAddress(): string | undefined {
    return this.remoteAddressValue;
  }

  setRemoteAddress(address: string | undefined): this {
    this.remoteAddressValue = address;

    return this;
  }

  get protocol(): string | undefined {
    return this.protocolValue;
  }

  setProtocol(protocol: string | undefined): this {
    this.protocolValue = protocol;

    return this;
  }

  get hostname(): string | undefined {
    return this.hostnameValue;
  }

  setHostname(hostname: string | undefined): this {
    this.hostnameValue = hostname;

    return this;
  }

  get port(): number | undefined {
    return this.portValue;
  }

  setPort(port: number | undefined): this {
    if (
      port !== undefined &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      throw new RangeError(
        "Request port must be an integer between 1 and 65535.",
      );
    }

    this.portValue = port;

    return this;
  }

  get secure(): boolean {
    return this.protocolValue?.toLowerCase() === "https";
  }

  /* ------------------------------------------------------------------------ */
  /* State                                                                    */
  /* ------------------------------------------------------------------------ */

  get state(): Readonly<RequestState> {
    return Object.freeze(Object.fromEntries(this.stateMap));
  }

  hasState(key: string | symbol): boolean {
    return this.stateMap.has(key);
  }

  getState<T = unknown>(key: string | symbol): T | undefined {
    return this.stateMap.get(key) as T | undefined;
  }

  setState<T>(key: string | symbol, value: T): this {
    this.stateMap.set(key, value);

    return this;
  }

  removeState(key: string | symbol): boolean {
    return this.stateMap.delete(key);
  }

  /* ------------------------------------------------------------------------ */
  /* Metadata                                                                 */
  /* ------------------------------------------------------------------------ */

  get metadata(): Readonly<Record<string, unknown>> {
    return Object.freeze(Object.fromEntries(this.metadataMap));
  }

  hasMetadata(key: string): boolean {
    return this.metadataMap.has(key);
  }

  getMetadata<T = unknown>(key: string): T | undefined {
    return this.metadataMap.get(key) as T | undefined;
  }

  setMetadata<T>(key: string, value: T): this {
    this.metadataMap.set(key, value);

    return this;
  }

  removeMetadata(key: string): boolean {
    return this.metadataMap.delete(key);
  }

  /* ------------------------------------------------------------------------ */
  /* Convenience                                                              */
  /* ------------------------------------------------------------------------ */

  get origin(): string | undefined {
    const protocol = this.protocolValue;

    const hostname = this.hostnameValue;

    if (!protocol || !hostname) {
      return undefined;
    }

    const port = this.portValue;

    const defaultPort =
      protocol === "http" ? 80 : protocol === "https" ? 443 : undefined;

    const portSuffix =
      port !== undefined && port !== defaultPort ? `:${port}` : "";

    return `${protocol}://${hostname}${portSuffix}`;
  }

  get userAgent(): string | undefined {
    return this.getHeader("user-agent");
  }

  get contentType(): string | undefined {
    return this.getHeader("content-type");
  }

  get contentLength(): number | undefined {
    const value = this.getHeader("content-length");

    if (value === undefined) {
      return undefined;
    }

    const length = Number(value);

    return Number.isFinite(length) ? length : undefined;
  }

  get requestId(): string {
    return this.id;
  }

  /* ------------------------------------------------------------------------ */
  /* Snapshot                                                                 */
  /* ------------------------------------------------------------------------ */

  snapshot(): RequestContextSnapshot {
    return Object.freeze({
      id: this.id,
      method: this.method,
      url: this.url,
      path: this.path,
      headers: this.headers,
      query: this.query,
      params: this.params,
      body: this.requestBody,
      remoteAddress: this.remoteAddressValue,
      protocol: this.protocolValue,
      hostname: this.hostnameValue,
      port: this.portValue,
      state: this.state,
      metadata: this.metadata,
      createdAt: this.createdAt,
    });
  }

  clone(): HttpRequestContext {
    return new HttpRequestContext({
      id: this.id,
      method: this.method,
      url: this.url,
      headers: this.headers,
      query: this.query,
      params: this.params,
      body: this.requestBody,
      remoteAddress: this.remoteAddressValue,
      protocol: this.protocolValue,
      hostname: this.hostnameValue,
      port: this.portValue,
      state: {
        ...Object.fromEntries(this.stateMap),
      },
      metadata: {
        ...Object.fromEntries(this.metadataMap),
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createRequestContext(
  init: RequestContextInit,
): HttpRequestContext {
  return new HttpRequestContext(init);
}

/* -------------------------------------------------------------------------- */
/* Context Storage                                                            */
/* -------------------------------------------------------------------------- */

const asyncContextStorage:
  | {
      getStore(): HttpRequestContext | undefined;
      run<T>(context: HttpRequestContext, callback: () => T): T;
    }
  | undefined = createAsyncContextStorage();

export function runWithRequestContext<T>(
  context: HttpRequestContext,
  callback: () => T,
): T {
  if (asyncContextStorage) {
    return asyncContextStorage.run(context, callback);
  }

  return callback();
}

export function getCurrentRequestContext(): HttpRequestContext | undefined {
  return asyncContextStorage?.getStore();
}

/* -------------------------------------------------------------------------- */
/* Context Validation                                                         */
/* -------------------------------------------------------------------------- */

export function assertRequestContext(
  context: HttpRequestContext | undefined | null,
): asserts context is HttpRequestContext {
  if (!context) {
    throw new Error("HTTP request context is not available.");
  }
}

export function isRequestContext(value: unknown): value is HttpRequestContext {
  return value instanceof HttpRequestContext;
}

/* -------------------------------------------------------------------------- */
/* URL Helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns the canonical path of a request-target. An origin-form target such
 * as `//host/admin` stays a path; it is never parsed as an authority.
 */
export function getPathname(url: string): string {
  return parseRequestTarget(url).pathname || "/";
}

/**
 * Returns the search parameters of a request-target.
 */
export function getSearchParams(url: string): URLSearchParams {
  return parseRequestTarget(url).searchParams;
}

/* -------------------------------------------------------------------------- */
/* Internal Helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeMethod(method: HttpMethod): HttpMethod {
  return method.trim().toUpperCase();
}

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase();
}

function createHeaderMap(
  headers: RequestHeaders | undefined,
): Map<string, string> {
  const result = new Map<string, string>();

  if (!headers) {
    return result;
  }

  for (const [name, value] of Object.entries(headers)) {
    validateHeaderName(name);

    validateHeaderValue(value);

    result.set(normalizeHeaderName(name), value);
  }

  return result;
}

function createMap<T>(
  value: Readonly<Record<string, T>> | undefined,
): Map<string, T> {
  return new Map(Object.entries(value ?? {}));
}

function validateHeaderName(name: string): void {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new TypeError(`Invalid HTTP header name: ${name}`);
  }
}

function validateHeaderValue(value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new TypeError(
      "HTTP header value cannot contain CR or LF characters.",
    );
  }
}

/**
 * Builds the request-context store.
 *
 * `AsyncLocalStorage` used to be reached through `globalThis.require`, which
 * does not exist in ESM under Node. The `typeof` guard turned that into a
 * silent `undefined`, so `runWithRequestContext` merely called its callback
 * and `getCurrentRequestContext` always returned `undefined`. It is imported
 * statically now, as the rest of the package imports its Node built-ins.
 */
function createAsyncContextStorage():
  | {
      getStore(): HttpRequestContext | undefined;
      run<T>(context: HttpRequestContext, callback: () => T): T;
    }
  | undefined {
  return new AsyncLocalStorage<HttpRequestContext>();
}
