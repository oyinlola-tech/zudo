/**
 * Zudojs HTTP route matcher.
 *
 * Selects and matches registered routes against an incoming HTTP method and
 * pathname. Route registration lives in the router core; per-route segment
 * matching lives in `httpRoute.matcher.core.ts`.
 */

import type {
  CompiledRoute,
  HttpMethod,
  MatchedRoute,
} from "../core/types/httpRouter.type.js";

import type { HttpRouter } from "../core/register/httpRouter.register.js";

import { normalizeMethod } from "../core/factory/httpRoute.factory.base.js";

import { formatAllowHeader } from "../../httpMethods/http.methods.js";

import { matchCompiledRoute } from "./httpRoute.matcher.core.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface RouteMatcherOptions {
  readonly caseSensitive?: boolean;

  readonly allowHeadFallback?: boolean;

  readonly allowOptionsFallback?: boolean;
}

export interface RouteMatchRequest {
  readonly method: string;

  readonly path: string;
}

export interface RouteMatcherResult {
  readonly route: MatchedRoute;

  readonly params: Readonly<Record<string, string>>;

  readonly method: HttpMethod | "*";

  readonly path: string;

  readonly score: number;

  readonly matchedBy:
    "exact" | "head-fallback" | "options-fallback" | "wildcard";
}

export interface RouteMethodResult {
  readonly allowed: boolean;

  readonly methods: readonly (HttpMethod | "*")[];

  readonly allowHeader: string;
}

export interface RouteMatcherStats {
  readonly routes: number;

  readonly requests: number;

  readonly matches: number;

  readonly misses: number;
}

/* -------------------------------------------------------------------------- */
/* Route Matcher                                                              */
/* -------------------------------------------------------------------------- */

export class RouteMatcher {
  private readonly router: HttpRouter;

  private readonly matcherOptions: Required<RouteMatcherOptions>;

  private requests = 0;

  private matches = 0;

  private misses = 0;

  constructor(router: HttpRouter, options: RouteMatcherOptions = {}) {
    this.router = router;

    this.matcherOptions = {
      caseSensitive: options.caseSensitive ?? false,

      allowHeadFallback: options.allowHeadFallback ?? true,

      allowOptionsFallback: options.allowOptionsFallback ?? true,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Primary Matching                                                         */
  /* ------------------------------------------------------------------------ */

  match(request: RouteMatchRequest): RouteMatcherResult | undefined {
    this.requests += 1;

    const method = normalizeMethod(request.method);

    const path = normalizeRequestPath(request.path);

    const direct = this.matchMethod(method, path);

    if (direct) {
      this.matches += 1;

      return direct;
    }

    if (method === "HEAD" && this.matcherOptions.allowHeadFallback) {
      const fallback = this.matchMethod("GET", path);

      if (fallback) {
        this.matches += 1;

        return {
          ...fallback,

          matchedBy: "head-fallback",
        };
      }
    }

    if (method === "OPTIONS" && this.matcherOptions.allowOptionsFallback) {
      const first = this.matchFirstAllowed(
        this.allowedMethods(path).methods,
        path,
      );

      if (first) {
        this.matches += 1;

        return {
          ...first,

          matchedBy: "options-fallback",
        };
      }
    }

    this.misses += 1;

    return undefined;
  }

  matchMethod(
    method: string | HttpMethod | "*",
    path: string,
  ): RouteMatcherResult | undefined {
    const normalizedMethod = normalizeMethod(method);

    const normalizedPath = normalizeRequestPath(path);

    for (const route of this.router.compiled()) {
      if (!methodApplies(route.definition.method, normalizedMethod)) {
        continue;
      }

      const params = matchCompiledRoute(
        route,
        normalizedPath,
        this.matcherOptions.caseSensitive,
      );

      if (!params) {
        continue;
      }

      return createResult(route, params, normalizedMethod, normalizedPath);
    }

    return undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* All Matches                                                              */
  /* ------------------------------------------------------------------------ */

  matchAll(request: RouteMatchRequest): readonly RouteMatcherResult[] {
    const method = normalizeMethod(request.method);

    const path = normalizeRequestPath(request.path);

    return this.collect(method, path);
  }

  /* ------------------------------------------------------------------------ */
  /* Path Matching                                                            */
  /* ------------------------------------------------------------------------ */

  matchPath(path: string): readonly RouteMatcherResult[] {
    return this.collect("*", normalizeRequestPath(path));
  }

  /* ------------------------------------------------------------------------ */
  /* Allowed Methods                                                          */
  /* ------------------------------------------------------------------------ */

  allowedMethods(path: string): RouteMethodResult {
    const normalizedPath = normalizeRequestPath(path);

    const methods = new Set<HttpMethod | "*">();

    for (const route of this.router.compiled()) {
      const params = matchCompiledRoute(
        route,
        normalizedPath,
        this.matcherOptions.caseSensitive,
      );

      if (params) {
        methods.add(route.definition.method);
      }
    }

    const ordered = orderMethods(methods);

    return Object.freeze({
      allowed: ordered.length > 0,

      methods: Object.freeze(ordered),

      allowHeader: formatAllowHeader(ordered),
    });
  }

  isAllowed(method: string, path: string): boolean {
    const normalizedMethod = normalizeMethod(method);

    const allowed = this.allowedMethods(path);

    if (allowed.methods.includes("*")) {
      return true;
    }

    if (allowed.methods.includes(normalizedMethod)) {
      return true;
    }

    return normalizedMethod === "HEAD" && allowed.methods.includes("GET");
  }

  /* ------------------------------------------------------------------------ */
  /* Statistics                                                               */
  /* ------------------------------------------------------------------------ */

  stats(): RouteMatcherStats {
    return Object.freeze({
      routes: this.router.count(),

      requests: this.requests,

      matches: this.matches,

      misses: this.misses,
    });
  }

  resetStats(): void {
    this.requests = 0;

    this.matches = 0;

    this.misses = 0;
  }

  /* ------------------------------------------------------------------------ */
  /* Internals                                                                */
  /* ------------------------------------------------------------------------ */

  private collect(
    method: HttpMethod | "*",
    path: string,
  ): readonly RouteMatcherResult[] {
    const results: RouteMatcherResult[] = [];

    const seen = new Set<string>();

    for (const route of this.router.compiled()) {
      if (!methodApplies(route.definition.method, method)) {
        continue;
      }

      const params = matchCompiledRoute(
        route,
        path,
        this.matcherOptions.caseSensitive,
      );

      if (!params || seen.has(route.definition.id)) {
        continue;
      }

      seen.add(route.definition.id);

      results.push(createResult(route, params, method, path));
    }

    return Object.freeze(results);
  }

  private matchFirstAllowed(
    methods: readonly (HttpMethod | "*")[],
    path: string,
  ): RouteMatcherResult | undefined {
    for (const method of methods) {
      const result = this.matchMethod(method, path);

      if (result) {
        return result;
      }
    }

    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createRouteMatcher(
  router: HttpRouter,
  options: RouteMatcherOptions = {},
): RouteMatcher {
  return new RouteMatcher(router, options);
}

/* -------------------------------------------------------------------------- */
/* Standalone Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function matchRoute(
  matcher: RouteMatcher,
  method: string,
  path: string,
): RouteMatcherResult | undefined {
  return matcher.match({
    method,
    path,
  });
}

export function matchRoutePath(
  matcher: RouteMatcher,
  path: string,
): readonly RouteMatcherResult[] {
  return matcher.matchPath(path);
}

export function getAllowedMethods(
  matcher: RouteMatcher,
  path: string,
): RouteMethodResult {
  return matcher.allowedMethods(path);
}

/* -------------------------------------------------------------------------- */
/* Result Creation                                                            */
/* -------------------------------------------------------------------------- */

function createResult(
  route: CompiledRoute,
  params: Readonly<Record<string, string>>,
  method: HttpMethod | "*",
  path: string,
): RouteMatcherResult {
  return Object.freeze({
    route: route.definition,

    params: Object.freeze({
      ...params,
    }),

    method,

    path,

    score: route.score,

    matchedBy: route.definition.method === "*" ? "wildcard" : "exact",
  });
}

/* -------------------------------------------------------------------------- */
/* Method Utilities                                                           */
/* -------------------------------------------------------------------------- */

function methodApplies(
  routeMethod: HttpMethod | "*",
  requestMethod: HttpMethod | "*",
): boolean {
  return (
    routeMethod === "*" ||
    requestMethod === "*" ||
    routeMethod === requestMethod
  );
}

function orderMethods(
  methods: ReadonlySet<HttpMethod | "*">,
): (HttpMethod | "*")[] {
  const preferred: (HttpMethod | "*")[] = [
    "OPTIONS",
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "CONNECT",
    "TRACE",
    "*",
  ];

  return preferred.filter((method) => methods.has(method));
}

/* -------------------------------------------------------------------------- */
/* Path Utilities                                                             */
/* -------------------------------------------------------------------------- */

export function normalizeRequestPath(path: string): string {
  if (!path) {
    return "/";
  }

  let normalized = path.trim();

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      // Keep the original value if it is not a valid absolute URL.
    }
  }

  const queryIndex = normalized.indexOf("?");

  if (queryIndex !== -1) {
    normalized = normalized.slice(0, queryIndex);
  }

  const hashIndex = normalized.indexOf("#");

  if (hashIndex !== -1) {
    normalized = normalized.slice(0, hashIndex);
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/{2,}/g, "/");

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || "/";
}

/* -------------------------------------------------------------------------- */
/* Type Guards                                                                */
/* -------------------------------------------------------------------------- */

export function isRouteMatcher(value: unknown): value is RouteMatcher {
  return value instanceof RouteMatcher;
}

export function isRouteMatcherResult(
  value: unknown,
): value is RouteMatcherResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "route" in value &&
    "params" in value &&
    "method" in value &&
    "path" in value
  );
}
