/**
 * Collection of a router's registered routes as OpenAPI route descriptors.
 */

import {
  isOpenAPIMethod,
  toOpenAPIPath,
  type OpenAPIRouteDescriptor,
  type RouteOpenAPIMetadata,
} from "@zudojs/openapi";

import type { CompiledRoute, MatchedRoute } from "../../httpRouter/core/types/httpRouter.type.js";
import type {
  HttpOpenAPIRouteFilter,
  HttpOpenAPIRouteSelection,
  HttpOpenAPIRouteSource,
} from "../httpOpenApi.type.js";
import { routePathVariants } from "./routeTable.template.js";

function sequenceOf(route: CompiledRoute): number {
  const sequence = Number(route.definition.id.split(":").pop());
  return Number.isFinite(sequence) ? sequence : Number.MAX_SAFE_INTEGER;
}

function matchesFilter(route: MatchedRoute, filter: HttpOpenAPIRouteFilter | undefined): boolean {
  if (filter === undefined) return false;
  if (typeof filter === "function") return filter(route);
  return filter.some((entry) => {
    if (entry instanceof RegExp) return entry.test(route.path);
    if (entry.endsWith("/*")) {
      const prefix = entry.slice(0, -2);
      return route.path === prefix || route.path.startsWith(`${prefix}/`);
    }
    return route.path === entry;
  });
}

/** The route's `openapi` metadata; `false` when it is hidden. */
function documentationOf(route: MatchedRoute): RouteOpenAPIMetadata | false | undefined {
  const value = route.metadata["openapi"];
  if (value === false) return false;
  if (typeof value !== "object" || value === null) return undefined;
  const metadata = value as RouteOpenAPIMetadata;
  return metadata.hidden === true ? false : metadata;
}

/**
 * Lists the operations a router actually serves, as descriptors for
 * `createOpenAPIDocumentFromRoutes`.
 *
 * Routes appear in registration order. Left out: `all()` / `"*"` routes
 * (they answer every method, so no single operation describes them),
 * methods OpenAPI cannot carry (`CONNECT`), hidden and excluded routes. The
 * router's automatic `HEAD` and `OPTIONS` answers are never registered
 * routes, so they never appear; an explicitly registered `HEAD` does.
 * When two patterns document the same operation (`/a/:id` and `/a/{id}`),
 * the one registered first is kept and the other reported.
 */
export function collectOpenAPIRoutes(
  source: HttpOpenAPIRouteSource,
  selection: HttpOpenAPIRouteSelection = {},
): readonly OpenAPIRouteDescriptor[] {
  const routes = [...source.compiled()].sort((a, b) => sequenceOf(a) - sequenceOf(b));
  const descriptors: OpenAPIRouteDescriptor[] = [];
  const seen = new Map<string, string>();

  for (const route of routes) {
    const definition = route.definition;
    if (definition.method === "*" || !isOpenAPIMethod(definition.method)) continue;
    const documentation = documentationOf(definition);
    if (documentation === false) continue;
    if (documentation === undefined && selection.undocumented === "exclude") continue;
    if (matchesFilter(definition, selection.exclude)) continue;

    const variants = routePathVariants(route, selection.wildcards);
    variants.forEach((variant, index) => {
      const key = `${definition.method} ${toOpenAPIPath(variant.path)}`;
      const owner = seen.get(key);
      if (owner !== undefined) {
        selection.onRouteWarning?.(
          `${definition.method} ${definition.path} documents the same operation as ` +
            `${owner} (${key}); only the first registered is documented.`,
        );
        return;
      }
      seen.set(key, `${definition.method} ${definition.path}`);
      const operationId = documentation?.operationId;
      descriptors.push({
        ...documentation,
        method: definition.method,
        path: variant.path,
        ...(operationId !== undefined && index > 0
          ? { operationId: `${operationId}_${index}` }
          : {}),
        inferredParameters: [
          ...variant.inferredParameters,
          ...(documentation?.inferredParameters ?? []),
        ],
      });
    });
  }

  return descriptors;
}
