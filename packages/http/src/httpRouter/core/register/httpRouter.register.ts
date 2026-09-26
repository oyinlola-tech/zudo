/**
 * HTTP router registration, matching, and dispatch.
 */

import type {
  HttpMethod,
  HttpRouterContext,
  MatchedRoute,
  CompiledRoute,
  RouteDefinition,
  RouteOptions,
  RouterErrorHandler,
  RouterHandler,
  RouterMatch,
  RouterMethodNotAllowedHandler,
  RouterNotFoundHandler,
  RouterOptions,
  RouterResult,
  RouterShadowedRoutePolicy,
} from "../types/httpRouter.type.js";

import type { HttpRequestContext as RequestContext } from "../../../httpRequest/httpRequest.context.js";

import {
  HttpRouterError,
  RouteConflictError,
} from "../error/httpRouter.error.js";

import { HttpRouterGroup } from "../group/httpRouterGroup.core.js";

import {
  collectAllowedMethods,
  createFallbackRoute,
  createOptionsResponse,
  defaultMethodNotAllowedHandler,
  defaultNotFoundHandler,
  executeRoute,
  extractRouteSequence,
  normalizeMethod,
  normalizeMethods,
  normalizeResponse,
} from "../factory/httpRoute.factory.base.js";

import {
  getRequestMethod,
  getRequestSignal,
  applyRouteParams,
  getRequestUrl,
  normalizeMatchPath,
  normalizePath,
  normalizeRoutePattern,
  parseQuery,
  parseUrl,
} from "../util/httpRoute.util.js";

import { matchCompiledRoute } from "../../matching/httpRoute.matcher.core.js";

import {
  compareSegmentSpecificity,
  compileRoute,
} from "../../pattern/httpRoute.pattern.parse.js";

import { createRouterMiddlewareContext } from "../../httpRouter.context.js";

import { shadowsRoute } from "./httpRouter.shadow.js";

export class HttpRouter {
  private readonly routes: CompiledRoute[] = [];

  /**
   * The routes in matching order. Rebuilt lazily after a registration or
   * removal; `match()` used to copy and sort every route on every request.
   */
  private sortedCache: CompiledRoute[] | undefined;

  private readonly shadowedRoutes: RouterShadowedRoutePolicy;

  private readonly errorHandler: RouterErrorHandler | undefined;

  private readonly routerOptions: Required<
    Pick<
      RouterOptions,
      | "caseSensitive"
      | "strictTrailingSlash"
      | "automaticHead"
      | "automaticOptions"
    >
  >;

  private readonly notFoundHandler: RouterNotFoundHandler;

  private readonly methodNotAllowedHandler: RouterMethodNotAllowedHandler;

  private sequence = 0;

  constructor(options: RouterOptions = {}) {
    this.routerOptions = {
      caseSensitive: options.caseSensitive ?? false,

      strictTrailingSlash: options.strictTrailingSlash ?? false,

      automaticHead: options.automaticHead ?? true,

      automaticOptions: options.automaticOptions ?? true,
    };

    this.notFoundHandler = options.notFoundHandler ?? defaultNotFoundHandler;

    this.methodNotAllowedHandler =
      options.methodNotAllowedHandler ?? defaultMethodNotAllowedHandler;

    this.shadowedRoutes = options.shadowedRoutes ?? "throw";

    this.errorHandler = options.onError;
  }

  /* ------------------------------------------------------------------------ */
  /* Route Registration                                                       */
  /* ------------------------------------------------------------------------ */

  add(definition: RouteDefinition): () => void {
    const methods = normalizeMethods(definition.method);

    for (const method of methods) {
      this.register(method, definition.path, definition.handler, {
        name: definition.name,
        middleware: definition.middleware,
        metadata: definition.metadata,
        strictTrailingSlash: definition.strictTrailingSlash,
        openapi: definition.openapi,
      });
    }

    return () => {
      for (const method of methods) {
        this.remove(method, definition.path);
      }
    };
  }

  on(
    method: HttpMethod | "*",
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.register(method, path, handler, options);
  }

  get(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("GET", path, handler, options);
  }

  head(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("HEAD", path, handler, options);
  }

  post(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("POST", path, handler, options);
  }

  put(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("PUT", path, handler, options);
  }

  patch(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("PATCH", path, handler, options);
  }

  delete(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("DELETE", path, handler, options);
  }

  options(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("OPTIONS", path, handler, options);
  }

  connect(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("CONNECT", path, handler, options);
  }

  trace(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("TRACE", path, handler, options);
  }

  all(
    path: string,
    handler: RouterHandler,
    options: RouteOptions = {},
  ): () => void {
    return this.on("*", path, handler, options);
  }

  /* ------------------------------------------------------------------------ */
  /* Route Groups                                                             */
  /* ------------------------------------------------------------------------ */

  group(
    prefix: string,
    configure: (group: HttpRouterGroup) => void,
    options: RouteOptions = {},
  ): void {
    const group = new HttpRouterGroup(this, prefix, options);

    configure(group);
  }

  /* ------------------------------------------------------------------------ */
  /* Route Management                                                         */
  /* ------------------------------------------------------------------------ */

  remove(method: HttpMethod | "*", path: string): boolean {
    const normalizedMethod = normalizeMethod(method);

    const index = this.routes.findIndex(
      (route) =>
        route.definition.method === normalizedMethod &&
        route.definition.path === normalizeRoutePattern(path),
    );

    if (index === -1) {
      return false;
    }

    this.routes.splice(index, 1);

    this.sortedCache = undefined;

    return true;
  }

  clear(): void {
    this.routes.length = 0;

    this.sortedCache = undefined;
  }

  count(): number {
    return this.routes.length;
  }

  list(): readonly MatchedRoute[] {
    return Object.freeze(this.sortedRoutes().map((route) => route.definition));
  }

  /**
   * Returns the registered routes with their compiled segments, most
   * specific first.
   */
  compiled(): readonly CompiledRoute[] {
    return Object.freeze(this.sortedRoutes());
  }

  find(id: string): MatchedRoute | undefined {
    return this.routes.find((route) => route.definition.id === id)?.definition;
  }

  /* ------------------------------------------------------------------------ */
  /* Matching                                                                 */
  /* ------------------------------------------------------------------------ */

  match(method: string, path: string): RouterMatch {
    const normalizedMethod = method.toUpperCase();

    const normalizedPath = normalizePath(path);

    const matchPath = normalizeMatchPath(path);

    const candidates = this.sortedRoutes();

    const allowedForPath = (): HttpMethod[] =>
      this.withAutomaticMethods(
        collectAllowedMethods(
          candidates,
          matchPath,
          this.routerOptions.caseSensitive,
        ),
      );

    let pathMatched = false;

    for (const route of candidates) {
      const params = matchCompiledRoute(
        route,
        matchPath,
        this.routerOptions.caseSensitive,
      );

      if (!params) {
        continue;
      }

      pathMatched = true;

      const routeMethod = route.definition.method;

      if (routeMethod === normalizedMethod || routeMethod === "*") {
        return {
          matched: true,
          route: route.definition,
          params,
          allowedMethods: Object.freeze(allowedForPath()),
          path: normalizedPath,
          method: normalizedMethod,
        };
      }
    }

    if (normalizedMethod === "HEAD" && this.routerOptions.automaticHead) {
      for (const route of candidates) {
        if (route.definition.method !== "GET") {
          continue;
        }

        const params = matchCompiledRoute(
          route,
          matchPath,
          this.routerOptions.caseSensitive,
        );

        if (params) {
          return {
            matched: true,
            route: route.definition,
            params,
            allowedMethods: Object.freeze(allowedForPath()),
            path: normalizedPath,
            method: normalizedMethod,
          };
        }
      }
    }

    if (
      this.routerOptions.automaticOptions &&
      normalizedMethod === "OPTIONS" &&
      pathMatched
    ) {
      return {
        matched: true,
        route: undefined,
        params: {},
        allowedMethods: Object.freeze(allowedForPath()),
        path: normalizedPath,
        method: normalizedMethod,
      };
    }

    /*
     * The methods a `405` advertises must be the ones the router actually
     * answers: the automatic `HEAD` (for a `GET` route) and `OPTIONS` were
     * left out, so `Allow: GET, PATCH` contradicted the `OPTIONS` response
     * for the same path.
     */
    return {
      matched: false,
      route: undefined,
      params: {},
      allowedMethods: Object.freeze(pathMatched ? allowedForPath() : []),
      path: normalizedPath,
      method: normalizedMethod,
    };
  }

  private withAutomaticMethods(methods: HttpMethod[]): HttpMethod[] {
    const result = new Set<HttpMethod>(methods);

    if (result.size === 0) {
      return [];
    }

    if (this.routerOptions.automaticHead && result.has("GET")) {
      result.add("HEAD");
    }

    if (this.routerOptions.automaticOptions) {
      result.add("OPTIONS");
    }

    return [...result];
  }

  /* ------------------------------------------------------------------------ */
  /* Dispatch                                                                 */
  /* ------------------------------------------------------------------------ */

  async dispatch(
    request: RequestContext,
    options: {
      readonly signal?: AbortSignal;

      readonly state?: Map<string, unknown>;
    } = {},
  ): Promise<RouterResult> {
    const method = getRequestMethod(request);

    const url = getRequestUrl(request);

    const parsed = parseUrl(url);

    const path = parsed.pathname;

    const match = this.match(method, path);

    const signal =
      options.signal ??
      getRequestSignal(request) ??
      new AbortController().signal;

    const state = options.state ?? new Map<string, unknown>();

    const route = match.route ?? createFallbackRoute(path, method);

    const routerContext: HttpRouterContext = {
      request,
      params: match.params,
      query: parseQuery(parsed.searchParams),
      route,
      state,
      middleware: createRouterMiddlewareContext(
        request,
        signal,
        state,
        route.metadata,
      ),
      signal,
    };

    if (match.matched && match.route) {
      applyRouteParams(request, match.params);

      try {
        const response = await executeRoute(match.route, routerContext);

        return {
          response: await normalizeResponse(response),
          route: match.route,
        };
      } catch (error) {
        if (!this.errorHandler) {
          throw error;
        }

        const handled = await this.errorHandler(error, {
          request,
          path,
          method,
          signal,
          state,
          route: match.route,
        });

        if (handled === undefined) {
          throw error;
        }

        return {
          response: await normalizeResponse(handled),
          route: match.route,
          error,
        };
      }
    }

    if (
      method.toUpperCase() === "OPTIONS" &&
      match.allowedMethods.length > 0 &&
      this.routerOptions.automaticOptions
    ) {
      return {
        response: createOptionsResponse(match.allowedMethods),
        route: undefined,
      };
    }

    if (match.allowedMethods.length > 0) {
      const response = await this.methodNotAllowedHandler(
        {
          request,
          path,
          method,
          signal,
          state,
        },
        match.allowedMethods,
      );

      return {
        response: await normalizeResponse(response),
        route: undefined,
      };
    }

    const response = await this.notFoundHandler({
      request,
      path,
      method,
      signal,
      state,
    });

    return {
      response: await normalizeResponse(response),
      route: undefined,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Internals                                                                */
  /* ------------------------------------------------------------------------ */

  private register(
    method: HttpMethod | "*",
    path: string,
    handler: RouterHandler,
    options: RouteOptions,
  ): () => void {
    const normalizedMethod = normalizeMethod(method);

    const normalizedPath = normalizeRoutePattern(path);

    if (typeof handler !== "function") {
      throw new HttpRouterError("Route handler must be a function.");
    }

    const compiled = compileRoute(
      path,
      this.routerOptions.strictTrailingSlash ||
        options.strictTrailingSlash === true,
    );

    const existing = this.routes.find(
      (route) =>
        route.definition.method === normalizedMethod &&
        route.definition.path === normalizedPath,
    );

    if (existing) {
      throw new RouteConflictError(normalizedPath, normalizedMethod);
    }

    this.sequence += 1;

    const definition: MatchedRoute = {
      id: `route:${this.sequence}`,

      method: normalizedMethod,

      path: normalizedPath,

      name: options.name,

      params: {},

      metadata: Object.freeze({
        ...(options.metadata ?? {}),
        ...(options.openapi === undefined ? {} : { openapi: options.openapi }),
      }),

      handler,

      middleware: Object.freeze([...(options.middleware ?? [])]),
    };

    const route: CompiledRoute = {
      definition,
      segments: compiled.segments,
      score: compiled.score,
      strictTrailingSlash: compiled.strictTrailingSlash,
      expectsTrailingSlash: compiled.expectsTrailingSlash,
    };

    if (this.shadowedRoutes === "throw") {
      this.assertReachable(route);
    }

    this.routes.push(route);

    this.sortedCache = undefined;

    return () => {
      this.remove(normalizedMethod, normalizedPath);
    };
  }

  /**
   * Refuses a registration that leaves a route unreachable: the new route
   * when an earlier-ranked route already matches everything it would, or an
   * existing route the new one would rank ahead of and fully cover.
   */
  private assertReachable(candidate: CompiledRoute): void {
    for (const existing of this.routes) {
      const existingFirst = this.compareRoutes(existing, candidate) < 0;

      const [first, second] = existingFirst
        ? [existing, candidate]
        : [candidate, existing];

      if (!shadowsRoute(first, second, this.routerOptions.caseSensitive)) {
        continue;
      }

      throw shadowedRouteError(second, first);
    }
  }

  private compareRoutes(left: CompiledRoute, right: CompiledRoute): number {
    const specificity = compareSegmentSpecificity(
      left.segments,
      right.segments,
    );

    if (specificity !== 0) {
      return specificity;
    }

    /*
     * At equal specificity a method-specific route is tried before an
     * `all()` route, so `all("/x/:id")` no longer swallows a later
     * `get("/x/:id")`.
     */
    const leftAny = left.definition.method === "*" ? 1 : 0;

    const rightAny = right.definition.method === "*" ? 1 : 0;

    if (leftAny !== rightAny) {
      return leftAny - rightAny;
    }

    return (
      extractRouteSequence(left.definition.id) -
      extractRouteSequence(right.definition.id)
    );
  }

  private sortedRoutes(): CompiledRoute[] {
    if (this.sortedCache === undefined) {
      this.sortedCache = [...this.routes].sort((left, right) =>
        this.compareRoutes(left, right),
      );
    }

    return this.sortedCache;
  }
}

/**
 * Builds the conflict error for a shadowed route, naming the route that
 * shadows it in both the message and `reason`.
 */
function shadowedRouteError(
  shadowed: CompiledRoute,
  by: CompiledRoute,
): RouteConflictError {
  return new RouteConflictError(
    shadowed.definition.path,
    shadowed.definition.method,
    {
      reason: `shadowed by ${by.definition.method} ${by.definition.path}`,
      message:
        `Route ${shadowed.definition.method} ${shadowed.definition.path} can ` +
        `never match: ${by.definition.method} ${by.definition.path} is tried ` +
        "first and matches every request it would. Pass " +
        '{ shadowedRoutes: "ignore" } to register it anyway.',
    },
  );
}
