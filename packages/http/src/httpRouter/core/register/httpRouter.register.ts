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
  RouterHandler,
  RouterMatch,
  RouterMethodNotAllowedHandler,
  RouterNotFoundHandler,
  RouterOptions,
  RouterResult,
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
  isHttpMethod,
  normalizeMethod,
  normalizeMethods,
  normalizeResponse,
} from "../factory/httpRoute.factory.base.js";

import {
  getRequestMethod,
  getRequestSignal,
  getRequestUrl,
  normalizePath,
  parseQuery,
  parseUrl,
} from "../util/httpRoute.util.js";

import { matchCompiledRoute } from "../../matching/httpRoute.matcher.core.js";

import { compileRoute } from "../../pattern/httpRoute.pattern.parse.js";

import { createRouterMiddlewareContext } from "../../httpRouter.context.js";

export class HttpRouter {
  private readonly routes: CompiledRoute[] = [];

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
        route.definition.path === normalizePath(path),
    );

    if (index === -1) {
      return false;
    }

    this.routes.splice(index, 1);

    return true;
  }

  clear(): void {
    this.routes.length = 0;
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

    const candidates = this.sortedRoutes();

    const allowed = new Set<HttpMethod>();

    let pathMatched = false;

    for (const route of candidates) {
      const params = matchCompiledRoute(
        route,
        normalizedPath,
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
          allowedMethods: Object.freeze([
            ...collectAllowedMethods(candidates, normalizedPath),
          ]),
          path: normalizedPath,
          method: normalizedMethod,
        };
      }

      if (isHttpMethod(routeMethod)) {
        allowed.add(routeMethod);
      }
    }

    if (normalizedMethod === "HEAD" && this.routerOptions.automaticHead) {
      for (const route of candidates) {
        if (route.definition.method !== "GET") {
          continue;
        }

        const params = matchCompiledRoute(
          route,
          normalizedPath,
          this.routerOptions.caseSensitive,
        );

        if (params) {
          return {
            matched: true,
            route: route.definition,
            params,
            allowedMethods: Object.freeze([
              ...collectAllowedMethods(candidates, normalizedPath),
              "HEAD",
            ]),
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
        allowedMethods: Object.freeze([
          ...collectAllowedMethods(candidates, normalizedPath),
          "OPTIONS",
        ]),
        path: normalizedPath,
        method: normalizedMethod,
      };
    }

    return {
      matched: false,
      route: undefined,
      params: {},
      allowedMethods: Object.freeze([...allowed]),
      path: normalizedPath,
      method: normalizedMethod,
    };
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
      const response = await executeRoute(match.route, routerContext);

      return {
        response: await normalizeResponse(response),
        route: match.route,
      };
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

    const normalizedPath = normalizePath(path);

    if (typeof handler !== "function") {
      throw new HttpRouterError("Route handler must be a function.");
    }

    const compiled = compileRoute(
      normalizedPath,
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
      }),

      handler,

      middleware: Object.freeze([...(options.middleware ?? [])]),
    };

    this.routes.push({
      definition,
      segments: compiled.segments,
      score: compiled.score,
      strictTrailingSlash: compiled.strictTrailingSlash,
    });

    return () => {
      this.remove(normalizedMethod, normalizedPath);
    };
  }

  private sortedRoutes(): CompiledRoute[] {
    return [...this.routes].sort((left, right) => {
      const score = right.score - left.score;

      if (score !== 0) {
        return score;
      }

      return (
        extractRouteSequence(left.definition.id) -
        extractRouteSequence(right.definition.id)
      );
    });
  }
}
