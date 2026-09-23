/**
 * Merging of group-level and route-level OpenAPI documentation.
 */

import type { HttpRouteOpenAPI } from "../../httpRouter/core/types/httpRouter.type.js";

function union(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): readonly string[] | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return [...new Set([...left, ...right])];
}

/**
 * Combines a router group's `openapi` defaults with a route's own.
 *
 * The route wins field by field, except that `tags` are unioned and
 * `parameters` concatenated (a route parameter with the same name and
 * location still replaces the group's when the document is built). `false`
 * on the route hides it; `false` on the group hides every route that does
 * not document itself.
 */
export function mergeRouteOpenAPI(
  defaults: HttpRouteOpenAPI | undefined,
  route: HttpRouteOpenAPI | undefined,
): HttpRouteOpenAPI | undefined {
  if (route === undefined) return defaults;
  if (route === false || defaults === undefined || defaults === false) {
    return route;
  }
  const tags = union(defaults.tags, route.tags);
  const parameters =
    defaults.parameters === undefined && route.parameters === undefined
      ? undefined
      : [...(defaults.parameters ?? []), ...(route.parameters ?? [])];
  return {
    ...defaults,
    ...route,
    ...(tags === undefined ? {} : { tags }),
    ...(parameters === undefined ? {} : { parameters }),
  };
}
