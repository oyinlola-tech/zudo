/**
 * HTTP router type definitions.
 *
 * Core types for routing, route definitions, and router context.
 */

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

export type RouterHandler = (
  context: HttpRouterContext,
) =>
  | ResponseContext
  | Response
  | void
  | Promise<ResponseContext | Response | void>;

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

export interface RouteDefinition {
  readonly method: HttpMethod | readonly HttpMethod[] | "*";
  readonly path: string;
  readonly handler: RouterHandler;
  readonly middleware?: readonly HttpMiddleware[];
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly strictTrailingSlash?: boolean;
}

export interface RouteOptions {
  readonly name?: string;
  readonly middleware?: readonly HttpMiddleware[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly strictTrailingSlash?: boolean;
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
}

export interface RouterOptions {
  readonly caseSensitive?: boolean;
  readonly strictTrailingSlash?: boolean;
  readonly automaticHead?: boolean;
  readonly automaticOptions?: boolean;
  readonly notFoundHandler?: RouterNotFoundHandler;
  readonly methodNotAllowedHandler?: RouterMethodNotAllowedHandler;
}

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
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export {
  HttpRouterError,
  RouteConflictError,
} from "../error/httpRouter.error.js";
