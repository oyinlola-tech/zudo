/**
 * Local HTTP type definitions for the middleware adapter.
 *
 * These mirror the types from @zudojs/http so the permissions package
 * can reference them without a hard dependency on the HTTP package.
 *
 * @module http/httpTypes
 */

/** HTTP middleware signature from @zudojs/http. */
export type HttpMiddleware = (
  context: HttpMiddlewareContext,
  next: () => Promise<HttpResponseContext>,
) =>
  | void
  | Response
  | HttpResponseContext
  | Promise<void | Response | HttpResponseContext>;

/** HTTP middleware context from @zudojs/http. */
export interface HttpMiddlewareContext {
  readonly request: HttpRequestContext;
  readonly response: HttpResponseContext;
  readonly state: HttpMiddlewareState;
  readonly signal: AbortSignal;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * A request's headers, params or query as either shape a caller may hold.
 *
 * The real `@zudojs/http` request exposes plain frozen objects
 * (`Readonly<Record<…>>`); this mirror used to say `ReadonlyMap`, so code
 * written against it called `.get()` on an object that has none. Both shapes
 * are accepted, and the accessor methods below are the portable way to read.
 */
export type HttpRequestBag<V> =
  | ReadonlyMap<string, V>
  | Readonly<Record<string, V | undefined>>;

/** HTTP request context from @zudojs/http. */
export interface HttpRequestContext {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headers: HttpRequestBag<string>;
  readonly params: HttpRequestBag<string>;
  readonly query: HttpRequestBag<string | readonly string[]>;
  /** Case-insensitive header lookup, as `@zudojs/http` provides it. */
  getHeader?(name: string): string | undefined;
  /** Route parameter lookup, as `@zudojs/http` provides it. */
  getParam?(name: string): string | undefined;
}

/** HTTP response context from @zudojs/http. */
export interface HttpResponseContext {
  readonly status: number;
  readonly headers:
    | Headers
    | Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body?: unknown;
}

/** HTTP middleware state from @zudojs/http. */
export interface HttpMiddlewareState {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
}
