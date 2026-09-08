import type { HttpRequestContext as RequestContext } from "../httpRequest/httpRequest.context.js";

import {
  HttpResponseContext,
  type HttpResponseContext as ResponseContext,
} from "../httpResponse/httpResponse.context.js";

import { RouterMiddlewareState } from "./httpRouter.state.js";

import type {
  MatchedRoute,
  HttpRouterContext,
} from "./core/types/httpRouter.type.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RouterContextState = Map<string, unknown>;

export interface RouterContextInit {
  readonly request: RequestContext;

  readonly route: MatchedRoute;

  readonly params?: Readonly<Record<string, string>>;

  readonly query?: Readonly<Record<string, string | string[]>>;

  readonly state?: RouterContextState;

  readonly signal?: AbortSignal;
}

export interface RouterContextOptions {
  readonly state?: RouterContextState;

  readonly signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/* Router Context                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Runtime context passed through the Zudojs HTTP router.
 *
 * The context is intentionally small and request-scoped.
 * It provides handlers with access to the request, route parameters,
 * query values, shared state, and cancellation signal.
 */
export class RouterContext implements HttpRouterContext {
  readonly request: RequestContext;

  readonly params: Readonly<Record<string, string>>;

  readonly query: Readonly<Record<string, string | string[]>>;

  readonly route: MatchedRoute;

  readonly state: RouterContextState;

  readonly middleware: HttpRouterContext["middleware"];

  readonly signal: AbortSignal;

  constructor(init: RouterContextInit) {
    this.request = init.request;

    this.params = Object.freeze({
      ...(init.params ?? {}),
    });

    this.query = Object.freeze({
      ...(init.query ?? {}),
    });

    this.route = init.route;

    this.state = init.state ?? new Map<string, unknown>();

    this.signal =
      init.signal ??
      getRequestSignal(init.request) ??
      new AbortController().signal;

    this.middleware = createRouterMiddlewareContext(
      this.request,
      this.signal,
      this.state,
      this.route.metadata,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* State                                                                     */
  /* ------------------------------------------------------------------------ */

  get<T = unknown>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  set<T = unknown>(key: string, value: T): this {
    this.state.set(key, value);

    return this;
  }

  has(key: string): boolean {
    return this.state.has(key);
  }

  delete(key: string): boolean {
    return this.state.delete(key);
  }

  clear(): void {
    this.state.clear();
  }

  /* ------------------------------------------------------------------------ */
  /* Request Information                                                       */
  /* ------------------------------------------------------------------------ */

  method(): string {
    return getRequestMethod(this.request);
  }

  url(): string {
    return getRequestUrl(this.request);
  }

  path(): string {
    return this.route.path;
  }

  routeName(): string | undefined {
    return this.route.name;
  }

  routeId(): string {
    return this.route.id;
  }

  metadata<T = unknown>(key: string): T | undefined {
    return this.route.metadata[key] as T | undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* Parameters                                                                */
  /* ------------------------------------------------------------------------ */

  param(name: string): string | undefined {
    return this.params[name];
  }

  requiredParam(name: string): string {
    const value = this.param(name);

    if (value === undefined) {
      throw new Error(`Missing required route parameter "${name}".`);
    }

    return value;
  }

  allParams(): Readonly<Record<string, string>> {
    return this.params;
  }

  /* ------------------------------------------------------------------------ */
  /* Query                                                                     */
  /* ------------------------------------------------------------------------ */

  queryParam(name: string): string | string[] | undefined {
    return this.query[name];
  }

  queryString(name: string): string | undefined {
    const value = this.queryParam(name);

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  queryArray(name: string): readonly string[] {
    const value = this.queryParam(name);

    if (value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }

  allQuery(): Readonly<Record<string, string | string[]>> {
    return this.query;
  }

  /* ------------------------------------------------------------------------ */
  /* Cancellation                                                              */
  /* ------------------------------------------------------------------------ */

  aborted(): boolean {
    return this.signal.aborted;
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw createAbortError(this.signal.reason);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Conversion                                                                */
  /* ------------------------------------------------------------------------ */

  toJSON(): Record<string, unknown> {
    return {
      method: this.method(),

      url: this.url(),

      path: this.path(),

      route: this.routeName(),

      params: {
        ...this.params,
      },

      query: {
        ...this.query,
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createRouterContext(init: RouterContextInit): RouterContext {
  return new RouterContext(init);
}

/* -------------------------------------------------------------------------- */
/* Context Conversion                                                         */
/* -------------------------------------------------------------------------- */

export function isRouterContext(value: unknown): value is RouterContext {
  return value instanceof RouterContext;
}

export function toRouterContext(context: HttpRouterContext): RouterContext {
  if (context instanceof RouterContext) {
    return context;
  }

  return new RouterContext({
    request: context.request,

    route: context.route,

    params: context.params,

    query: context.query,

    state: context.state,

    signal: context.signal,
  });
}

/* -------------------------------------------------------------------------- */
/* Context Cloning                                                            */
/* -------------------------------------------------------------------------- */

export function cloneRouterContext(
  context: HttpRouterContext,
  options: RouterContextOptions = {},
): RouterContext {
  const source = toRouterContext(context);

  return new RouterContext({
    request: source.request,

    route: source.route,

    params: source.params,

    query: source.query,

    state: options.state ?? new Map(source.state),

    signal: options.signal ?? source.signal,
  });
}

/* -------------------------------------------------------------------------- */
/* Middleware Context                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Builds the middleware context handed to route middleware.
 *
 * The middleware state is backed by the router context's own state map so
 * middleware and handlers observe the same values.
 */
export function createRouterMiddlewareContext(
  request: RequestContext,
  signal: AbortSignal,
  state: RouterContextState = new Map<string, unknown>(),
  metadata: Readonly<Record<string, unknown>> = {},
): HttpRouterContext["middleware"] {
  return {
    request,
    response: new HttpResponseContext(),
    state: new RouterMiddlewareState(state),
    signal,
    metadata,
  };
}

/* -------------------------------------------------------------------------- */
/* Request Helpers                                                            */
/* -------------------------------------------------------------------------- */

function getRequestMethod(request: RequestContext): string {
  const value = (
    request as unknown as {
      method?: string;
    }
  ).method;

  return (value ?? "GET").toUpperCase();
}

function getRequestUrl(request: RequestContext): string {
  const value = (
    request as unknown as {
      url?: string | URL;
    }
  ).url;

  if (value instanceof URL) {
    return value.toString();
  }

  return value ?? "/";
}

function getRequestSignal(request: RequestContext): AbortSignal | undefined {
  return (
    request as unknown as {
      signal?: AbortSignal;
    }
  ).signal;
}

/* -------------------------------------------------------------------------- */
/* Abort Helpers                                                              */
/* -------------------------------------------------------------------------- */

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  if (typeof DOMException !== "undefined") {
    return new DOMException(
      reason ? String(reason) : "The operation was aborted.",
      "AbortError",
    );
  }

  const error = new Error(
    reason ? String(reason) : "The operation was aborted.",
  );

  error.name = "AbortError";

  return error;
}

/* -------------------------------------------------------------------------- */
/* Response Helpers                                                           */
/* -------------------------------------------------------------------------- */

export function isResponseContext(value: unknown): value is ResponseContext {
  return value instanceof HttpResponseContext;
}
