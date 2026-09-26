/**
 * HTTP router type definitions.
 *
 * Core types for routing, route definitions, and router context.
 */

import type { RouteOpenAPIMetadata } from "@zudojs/openapi";

import type { HttpRequestContext as RequestContext } from "../../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../../httpResponse/httpResponse.context.js";

import type {
  HttpMiddleware,
  HttpMiddlewareContext,
} from "../../../httpMiddleware/httpMiddleware.type.js";

export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "CONNECT"
  | "TRACE";

/**
 * A plain, JSON-serialisable value a route handler may return: an object,
 * array, string, number, boolean or `null`.
 */
export type RouterJsonValue = object | string | number | boolean | null;

/**
 * What a route handler may return, as server handlers do:
 * - an `HttpResponseContext` or a web `Response`: sent as built;
 * - a plain value: sent as `200` with a JSON body
 *   (`return { id }` is `ctx.middleware.response.json({ id })`);
 * - `undefined` / `null`: `204 No Content`.
 */
export type RouterHandlerResult =
  ResponseContext | Response | RouterJsonValue | void;

export type RouterHandler = (
  context: HttpRouterContext,
) => RouterHandlerResult | Promise<RouterHandlerResult>;

export type RouterHandlerLike = RouterHandler | HttpMiddleware;

export interface HttpRouterContext {
  readonly request: RequestContext;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string | string[]>>;
  readonly route: MatchedRoute;
  readonly state: Map<string, unknown>;
  readonly middleware: HttpMiddlewareContext;
  readonly signal: AbortSignal;
}

/**
 * OpenAPI documentation a route carries: summary, tags, operationId,
 * `params` / `query` / `headers` / `body` schemas, responses, security,
 * `deprecated`, `hidden`. It is `@zudojs/openapi`'s `RouteOpenAPIMetadata`,
 * so the schemas it names document the route in `generateOpenAPIDocument`.
 * `false` hides the route from the generated document.
 */
export type HttpRouteOpenAPI = RouteOpenAPIMetadata | false;

export interface RouteDefinition {
  readonly method: HttpMethod | readonly HttpMethod[] | "*";
  readonly path: string;
  readonly handler: RouterHandler;
  readonly middleware?: readonly HttpMiddleware[];
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly strictTrailingSlash?: boolean;
  /** OpenAPI documentation; stored as `metadata.openapi`. */
  readonly openapi?: HttpRouteOpenAPI;
}

export interface RouteOptions {
  readonly name?: string;
  readonly middleware?: readonly HttpMiddleware[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly strictTrailingSlash?: boolean;
  /**
   * OpenAPI documentation; stored as `metadata.openapi`, where
   * `generateOpenAPIDocument` reads it. Takes precedence over a
   * `metadata.openapi` passed alongside it.
   */
  readonly openapi?: HttpRouteOpenAPI;
}

export interface MatchedRoute {
  readonly id: string;
  readonly method: HttpMethod | "*";
  readonly path: string;
  readonly name: string | undefined;
  readonly params: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly handler: RouterHandler;
  readonly middleware: readonly HttpMiddleware[];
}

export interface RouterMatch {
  readonly matched: boolean;
  readonly route: MatchedRoute | undefined;
  readonly params: Readonly<Record<string, string>>;
  readonly allowedMethods: readonly HttpMethod[];
  readonly path: string;
  readonly method: string;
}

export interface RouterResult {
  readonly response: ResponseContext;
  readonly route: MatchedRoute | undefined;
  /**
   * The error a route handler threw, when {@link RouterOptions.onError}
   * turned it into `response`. Absent when the handler succeeded.
   */
  readonly error?: unknown;
}

/**
 * What to do when a route is registered that another route, for the same
 * method, makes unreachable: `"throw"` (default) refuses it with
 * `RouteConflictError`; `"ignore"` registers it anyway.
 */
export type RouterShadowedRoutePolicy = "throw" | "ignore";

export interface RouterOptions {
  readonly caseSensitive?: boolean;
  readonly strictTrailingSlash?: boolean;
  readonly automaticHead?: boolean;
  readonly automaticOptions?: boolean;
  readonly notFoundHandler?: RouterNotFoundHandler;
  readonly methodNotAllowedHandler?: RouterMethodNotAllowedHandler;
  /** See {@link RouterShadowedRoutePolicy}. Defaults to `"throw"`. */
  readonly shadowedRoutes?: RouterShadowedRoutePolicy;
  /**
   * Turns an error thrown by a route handler or route middleware into a
   * response. Without it (the default) `dispatch()` rethrows, which is what
   * lets an adapter map the error to a status. Returning `undefined`
   * rethrows as well, so a handler can decline.
   */
  readonly onError?: RouterErrorHandler;
}

/**
 * Context given to {@link RouterOptions.onError}.
 */
export interface HttpRouterErrorContext extends HttpRouterRequestContext {
  readonly route: MatchedRoute;
}

export type RouterErrorHandler = (
  error: unknown,
  context: HttpRouterErrorContext,
) =>
  | ResponseContext
  | Response
  | RouterJsonValue
  | undefined
  | Promise<ResponseContext | Response | RouterJsonValue | undefined>;

export type RouterNotFoundHandler = (
  context: HttpRouterRequestContext,
) => ResponseContext | Response | Promise<ResponseContext | Response>;

export type RouterMethodNotAllowedHandler = (
  context: HttpRouterRequestContext,
  allowedMethods: readonly HttpMethod[],
) => ResponseContext | Response | Promise<ResponseContext | Response>;

export interface HttpRouterRequestContext {
  readonly request: RequestContext;
  readonly path: string;
  readonly method: string;
  readonly signal: AbortSignal;
  readonly state: Map<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Compiled Routes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A literal path segment that must match verbatim.
 */
export interface CompiledSegmentLiteral {
  readonly type: "literal";
  readonly value: string;
}

/**
 * A named parameter segment, optionally constrained by a regular expression.
 */
export interface CompiledSegmentParameter {
  readonly type: "parameter";
  readonly name: string;
  readonly optional: boolean;
  readonly pattern: RegExp | undefined;
}

/**
 * A trailing wildcard segment that captures the remainder of the path.
 */
export interface CompiledSegmentWildcard {
  readonly type: "wildcard";
  readonly name: string;
}

export type CompiledSegment =
  CompiledSegmentLiteral | CompiledSegmentParameter | CompiledSegmentWildcard;

/**
 * A route definition paired with its compiled path segments.
 */
export interface CompiledRoute {
  readonly definition: MatchedRoute;
  readonly segments: readonly CompiledSegment[];
  readonly score: number;
  readonly strictTrailingSlash: boolean;

  /**
   * Whether the registered pattern ended with a slash.
   *
   * Only consulted when {@link CompiledRoute.strictTrailingSlash} is set.
   */
  readonly expectsTrailingSlash?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export {
  HttpRouterError,
  RouteConflictError,
} from "../error/httpRouter.error.js";
