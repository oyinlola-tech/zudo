/**
 * Zudojs HTTP route dispatcher.
 *
 * Responsible for taking a matched route and executing its middleware and
 * handler pipeline. Route registration and route matching remain separate
 * concerns.
 */

import type {
  HttpMethod,
  MatchedRoute,
  RouterHandler,
} from "../core/types/httpRouter.type.js";

import type { HttpMiddleware } from "../../httpMiddleware/httpMiddleware.type.js";

import { HttpResponseContext } from "../../httpResponse/httpResponse.context.js";

import { createRouterContext } from "../httpRouter.context.js";

import { RouterMiddlewareState } from "../httpRouter.state.js";

import { getRequestSignal } from "../core/util/httpRoute.util.js";

import type {
  RouteMatcher,
  RouteMatcherResult,
} from "../matching/httpRoute.matcher.js";

import type { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RouteDispatchNext = () => void | Promise<void>;

export type RouteMiddleware = (
  request: RequestContext,
  response: ResponseContext,
  next: RouteDispatchNext,
) => void | Promise<void>;

export type RouteDispatchHandler = (
  request: RequestContext,
  response: ResponseContext,
) => void | Promise<void>;

export interface RouteDispatchContext {
  readonly request: RequestContext;

  readonly response: ResponseContext;

  readonly route: MatchedRoute;

  readonly params: Readonly<Record<string, string>>;

  readonly method: HttpMethod | "*";

  readonly path: string;

  readonly match: RouteMatcherResult;
}

export interface RouteDispatchOptions {
  readonly onError?: RouteDispatchErrorHandler;

  readonly onComplete?: RouteDispatchCompleteHandler;

  readonly preserveResponse?: boolean;
}

export type RouteDispatchErrorHandler = (
  error: unknown,
  context: RouteDispatchContext,
) => void | Promise<void>;

export type RouteDispatchCompleteHandler = (
  context: RouteDispatchContext,
) => void | Promise<void>;

export interface RouteDispatchResult {
  readonly matched: boolean;

  readonly handled: boolean;

  readonly route: MatchedRoute | undefined;

  readonly error: unknown | undefined;

  readonly context: RouteDispatchContext | undefined;
}

export interface RouteDispatcherStats {
  readonly dispatches: number;

  readonly handled: number;

  readonly unmatched: number;

  readonly errors: number;
}

/* -------------------------------------------------------------------------- */
/* Route Dispatcher                                                           */
/* -------------------------------------------------------------------------- */

export class RouteDispatcher {
  private readonly matcher: RouteMatcher;

  private readonly options: RouteDispatchOptions;

  private dispatchCount = 0;

  private handledCount = 0;

  private unmatchedCount = 0;

  private errorCount = 0;

  constructor(matcher: RouteMatcher, options: RouteDispatchOptions = {}) {
    this.matcher = matcher;

    this.options = options;
  }

  /* ------------------------------------------------------------------------ */
  /* Dispatch                                                                  */
  /* ------------------------------------------------------------------------ */

  async dispatch(
    request: RequestContext,
    response: ResponseContext,
  ): Promise<RouteDispatchResult> {
    this.dispatchCount += 1;

    const match = this.matcher.match({
      method: getRequestMethod(request),

      path: getRequestPath(request),
    });

    if (!match) {
      this.unmatchedCount += 1;

      return Object.freeze({
        matched: false,

        handled: false,

        route: undefined,

        error: undefined,

        context: undefined,
      });
    }

    const context = createDispatchContext(request, response, match);

    try {
      await this.execute(context);

      this.handledCount += 1;

      await this.options.onComplete?.(context);

      return Object.freeze({
        matched: true,

        handled: true,

        route: match.route,

        error: undefined,

        context,
      });
    } catch (error) {
      this.errorCount += 1;

      if (this.options.onError) {
        await this.options.onError(error, context);
      }

      return Object.freeze({
        matched: true,

        handled: false,

        route: match.route,

        error,

        context,
      });
    }
  }

  async dispatchMatch(
    match: RouteMatcherResult,
    request: RequestContext,
    response: ResponseContext,
  ): Promise<RouteDispatchResult> {
    this.dispatchCount += 1;

    const context = createDispatchContext(request, response, match);

    try {
      await this.execute(context);

      this.handledCount += 1;

      await this.options.onComplete?.(context);

      return Object.freeze({
        matched: true,

        handled: true,

        route: match.route,

        error: undefined,

        context,
      });
    } catch (error) {
      this.errorCount += 1;

      if (this.options.onError) {
        await this.options.onError(error, context);
      }

      return Object.freeze({
        matched: true,

        handled: false,

        route: match.route,

        error,

        context,
      });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Execution                                                                 */
  /* ------------------------------------------------------------------------ */

  async execute(context: RouteDispatchContext): Promise<void> {
    const state = new RouterMiddlewareState();

    const middleware = context.route.middleware.map((layer) =>
      toRouteMiddleware(layer, context.route, state),
    );

    const handler = toDispatchHandler(context.route.handler, context);

    let index = -1;

    const dispatchNext = async (current: number): Promise<void> => {
      if (current <= index) {
        throw new Error("Route middleware called next() more than once.");
      }

      index = current;

      const layer = middleware[current];

      if (layer !== undefined) {
        await layer(context.request, context.response, () =>
          dispatchNext(current + 1),
        );

        return;
      }

      await handler(context.request, context.response);
    };

    await dispatchNext(0);
  }

  /* ------------------------------------------------------------------------ */
  /* Handler Execution                                                         */
  /* ------------------------------------------------------------------------ */

  async executeHandler(
    handler: RouteDispatchHandler,
    context: RouteDispatchContext,
  ): Promise<void> {
    const normalized = normalizeHandler(handler);

    await normalized(context.request, context.response);
  }

  async executeMiddleware(
    middleware: RouteMiddleware | readonly RouteMiddleware[],
    context: RouteDispatchContext,
  ): Promise<void> {
    const layers = normalizeMiddleware(middleware);

    let index = -1;

    const next = async (current: number): Promise<void> => {
      if (current <= index) {
        throw new Error("Route middleware called next() more than once.");
      }

      index = current;

      const layer = layers[current];

      if (layer === undefined) {
        return;
      }

      await layer(context.request, context.response, () => next(current + 1));
    };

    await next(0);
  }

  /* ------------------------------------------------------------------------ */
  /* Introspection                                                             */
  /* ------------------------------------------------------------------------ */

  stats(): RouteDispatcherStats {
    return Object.freeze({
      dispatches: this.dispatchCount,

      handled: this.handledCount,

      unmatched: this.unmatchedCount,

      errors: this.errorCount,
    });
  }

  resetStats(): void {
    this.dispatchCount = 0;

    this.handledCount = 0;

    this.unmatchedCount = 0;

    this.errorCount = 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createRouteDispatcher(
  matcher: RouteMatcher,
  options: RouteDispatchOptions = {},
): RouteDispatcher {
  return new RouteDispatcher(matcher, options);
}

/* -------------------------------------------------------------------------- */
/* Standalone Dispatch                                                        */
/* -------------------------------------------------------------------------- */

export async function dispatchRoute(
  dispatcher: RouteDispatcher,
  request: RequestContext,
  response: ResponseContext,
): Promise<RouteDispatchResult> {
  return dispatcher.dispatch(request, response);
}

/* -------------------------------------------------------------------------- */
/* Context Creation                                                           */
/* -------------------------------------------------------------------------- */

function createDispatchContext(
  request: RequestContext,
  response: ResponseContext,
  match: RouteMatcherResult,
): RouteDispatchContext {
  return Object.freeze({
    request,

    response,

    route: match.route,

    params: Object.freeze({
      ...match.params,
    }),

    method: match.method,

    path: match.path,

    match,
  });
}

/* -------------------------------------------------------------------------- */
/* Request Access                                                             */
/* -------------------------------------------------------------------------- */

function getRequestMethod(request: RequestContext): string {
  const candidate = request as unknown as {
    method?: string;

    request?: {
      method?: string;
    };
  };

  return candidate.method ?? candidate.request?.method ?? "GET";
}

function getRequestPath(request: RequestContext): string {
  const candidate = request as unknown as {
    path?: string;

    url?: string;

    request?: {
      path?: string;

      url?: string;
    };
  };

  return (
    candidate.path ??
    candidate.url ??
    candidate.request?.path ??
    candidate.request?.url ??
    "/"
  );
}

/* -------------------------------------------------------------------------- */
/* Handler Normalization                                                      */
/* -------------------------------------------------------------------------- */

function normalizeHandler(handler: RouteDispatchHandler): RouteDispatchHandler {
  if (typeof handler !== "function") {
    throw new TypeError("Route handler must be a function.");
  }

  return handler;
}

/**
 * Adapts a router handler, which receives a router context, to the
 * dispatcher's (request, response) calling convention.
 *
 * A response context returned by the handler is merged into the dispatch
 * response so the dispatcher's response object stays authoritative.
 */
function toDispatchHandler(
  handler: RouterHandler,
  context: RouteDispatchContext,
): RouteDispatchHandler {
  return async (request, response) => {
    const result = await handler(
      createRouterContext({
        request,
        route: context.route,
        params: context.params,
        signal: getRequestSignal(request),
      }),
    );

    if (result instanceof HttpResponseContext && result !== response) {
      response.status_code(result.status);

      response.headers_obj(result.headers);

      response.setBody(result.body);
    }
  };
}

/**
 * Adapts an `HttpMiddleware`, which receives a middleware context, to the
 * dispatcher's (request, response, next) calling convention.
 */
function toRouteMiddleware(
  middleware: HttpMiddleware,
  route: MatchedRoute,
  state: RouterMiddlewareState,
): RouteMiddleware {
  return async (request, response, next) => {
    await middleware(
      {
        request,
        response,
        state,
        signal: getRequestSignal(request) ?? new AbortController().signal,
        metadata: route.metadata,
      },
      async () => {
        await next();

        return response;
      },
    );
  };
}

function normalizeMiddleware(
  middleware: RouteMiddleware | readonly RouteMiddleware[] | undefined,
): readonly RouteMiddleware[] {
  if (!middleware) {
    return [];
  }

  const layers = Array.isArray(middleware) ? middleware : [middleware];

  for (const layer of layers) {
    if (typeof layer !== "function") {
      throw new TypeError("Route middleware must be functions.");
    }
  }

  return layers;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

export function composeRouteMiddleware(
  middleware: readonly RouteMiddleware[],
): RouteMiddleware {
  const layers = normalizeMiddleware(middleware);

  return async (request, response, next) => {
    let index = -1;

    const dispatch = async (current: number): Promise<void> => {
      if (current <= index) {
        throw new Error("Composed middleware called next() more than once.");
      }

      index = current;

      const layer = layers[current];

      if (layer === undefined) {
        await next();

        return;
      }

      await layer(request, response, () => dispatch(current + 1));
    };

    await dispatch(0);
  };
}

export function createRouteHandler(
  handler: RouteDispatchHandler,
): RouterHandler {
  return async (context) => {
    const response = new HttpResponseContext();

    await handler(context.request, response);

    return response;
  };
}

export function isRouteDispatcher(value: unknown): value is RouteDispatcher {
  return value instanceof RouteDispatcher;
}

export function isRouteDispatchResult(
  value: unknown,
): value is RouteDispatchResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "matched" in value && "handled" in value;
}
