/**
 * HTTP route matching.
 */

export { matchCompiledRoute } from "./httpRoute.matcher.core.js";

export {
  RouteMatcher,
  createRouteMatcher,
  matchRoute,
  matchRoutePath,
  getAllowedMethods,
  normalizeRequestPath,
  isRouteMatcher,
  isRouteMatcherResult,
} from "./httpRoute.matcher.js";

export type {
  RouteMatcherOptions,
  RouteMatchRequest,
  RouteMatcherResult,
  RouteMethodResult,
  RouteMatcherStats,
} from "./httpRoute.matcher.js";
