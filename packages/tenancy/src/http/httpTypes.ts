/**
 * Local HTTP type definitions for the middleware adapter.
 *
 * Mirrors @zudojs/http types structurally. http sits in a higher architecture
 * tier, so tenancy may not depend on it, even as a peer. A test runs the
 * middleware inside the real `HttpMiddlewarePipeline` to keep the two in step.
 *
 * @module http/httpTypes
 */

import type { GuardResponse } from "@zudojs/middleware";

/**
 * What a tenancy middleware returns: nothing, a web `Response`, a
 * `GuardResponse` refusing the request, or whatever `next()` produced.
 */
export type HttpMiddlewareOutcome<Downstream> =
  | void
  | Response
  | GuardResponse
  | Downstream;

/**
 * HTTP middleware signature, structurally assignable to `@zudojs/http`'s
 * `HttpMiddleware` without a cast.
 *
 * Generic over what `next()` resolves to, so a middleware hands back the
 * real pipeline's response unchanged. A refusal is a `GuardResponse`
 * (`createGuardResponse` from `@zudojs/middleware`), which `@zudojs/http`
 * sends with its own status; a plain `{ status, body, headers }` object is
 * not a response.
 */
export type HttpMiddleware = <Downstream extends HttpResponseContext>(
  context: HttpMiddlewareContext,
  next: () => Promise<Downstream>,
) => HttpMiddlewareOutcome<Downstream> | Promise<HttpMiddlewareOutcome<Downstream>>;

/** HTTP middleware context from @zudojs/http. */
export interface HttpMiddlewareContext {
  readonly request: HttpRequestContext;
  readonly response: HttpResponseContext;
  readonly state: HttpMiddlewareState;
  readonly signal: AbortSignal;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * A request's headers, params or query in either shape a caller may hold.
 *
 * The real `@zudojs/http` request exposes plain frozen objects
 * (`Readonly<Record<…>>`). This mirror used to say `ReadonlyMap`, so the
 * middleware called `.get()` on an object that has none and threw on every
 * real request. Both shapes are accepted; read headers through
 * `readRequestHeader`.
 */
export type HttpRequestBag<V> =
  | ReadonlyMap<string, V>
  | Readonly<Record<string, V | undefined>>;

/** HTTP request context from @zudojs/http. */
export interface HttpRequestContext {
  readonly id?: string;
  readonly method?: string;
  readonly url?: string;
  readonly path: string;
  readonly headers: HttpRequestBag<string>;
  readonly params?: HttpRequestBag<string>;
  readonly query?: HttpRequestBag<string | readonly string[]>;
  /** Case-insensitive header lookup, as `@zudojs/http` provides it. */
  getHeader?(name: string): string | undefined;
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
