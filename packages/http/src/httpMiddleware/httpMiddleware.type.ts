/**
 * HTTP middleware type definitions.
 *
 * @module httpMiddleware/types
 */

import type { HttpRequestContext as RequestContext } from "../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../httpResponse/httpResponse.context.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HttpMiddlewareResult =
  | void
  | Response
  | RequestContext
  | ResponseContext
  | Promise<void | Response | RequestContext | ResponseContext>;

export type HttpNext = () => Promise<ResponseContext>;

export type HttpMiddleware = (
  context: HttpMiddlewareContext,
  next: HttpNext,
) => HttpMiddlewareResult;

export interface HttpMiddlewareContext {
  readonly request: RequestContext;

  readonly response: ResponseContext;

  readonly state: HttpMiddlewareState;

  readonly signal: AbortSignal;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface HttpMiddlewareState {
  get<T = unknown>(key: string): T | undefined;

  set<T = unknown>(key: string, value: T): void;

  has(key: string): boolean;

  delete(key: string): boolean;

  clear(): void;

  entries(): IterableIterator<readonly [string, unknown]>;
}

export interface HttpMiddlewareOptions {
  readonly name?: string;

  readonly priority?: number;

  readonly enabled?: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RegisteredMiddleware {
  readonly id: string;

  readonly name: string;

  readonly priority: number;

  readonly enabled: boolean;

  readonly middleware: HttpMiddleware;
}

export interface HttpMiddlewarePipelineOptions {
  readonly middlewares?: readonly (HttpMiddleware | RegisteredMiddleware)[];

  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly onError?: HttpMiddlewareErrorHandler;
}

export type HttpMiddlewareErrorHandler = (
  error: unknown,
  context: HttpMiddlewareContext,
) =>
  | void
  | Response
  | ResponseContext
  | Promise<void | Response | ResponseContext>;

export interface InternalMiddleware {
  readonly id: string;

  readonly middleware: HttpMiddleware;

  readonly name: string;

  readonly priority: number;

  readonly sequence?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;

  enabled: boolean;
}
