/**
 * OpenAPI document generation from a router's registered routes.
 */

import {
  createOpenAPIDocumentFromRoutes,
  createOpenAPIManagerFromRoutes,
  routeDescriptorToRouteInfo,
  type OpenAPIDocument,
  type OpenAPIManager,
} from "@zudojs/openapi";

import type {
  HttpOpenAPIOptions,
  HttpOpenAPIRouteSource,
} from "./httpOpenApi.type.js";
import { collectOpenAPIRoutes } from "./routeTable/routeTable.collect.js";

/**
 * Generates an OpenAPI document from the routes a router has registered.
 *
 * Nothing is added by hand: every route's method and path come from the
 * router, and its summary, tags, schemas and responses from the `openapi`
 * option it was registered with. Call it again after adding routes and the
 * new routes are in the result.
 *
 * ```ts
 * const router = createRouter();
 * router.get("/users/:id", getUser, {
 *   openapi: { summary: "Get a user", tags: ["users"],
 *              responses: { "200": { schema: userSchema } } },
 * });
 * const document = generateOpenAPIDocument(router, {
 *   info: { title: "Users API", version: "1.0.0" },
 *   exclude: ["/health"],
 * });
 * ```
 *
 * @throws {OpenAPIRouteError} When a documented route cannot be expressed.
 * @throws {OpenAPIValidationError} When `validate` is set and the document
 *   is invalid.
 */
export function generateOpenAPIDocument(
  router: HttpOpenAPIRouteSource,
  options: HttpOpenAPIOptions,
): OpenAPIDocument {
  return createOpenAPIDocumentFromRoutes(
    collectOpenAPIRoutes(router, options),
    options,
  );
}

/** A manager that follows a router's route table. */
export interface HttpRouterOpenAPI {
  /** The manager, refreshed from the router. */
  manager(): OpenAPIManager;
  /** The current document, regenerated only when the route table changed. */
  document(): OpenAPIDocument;
}

function fingerprint(router: HttpOpenAPIRouteSource): string {
  return router
    .compiled()
    .map((route) => route.definition.id)
    .sort()
    .join(",");
}

/**
 * Creates an `OpenAPIManager` kept in step with `router`: each access checks
 * the route table and re-reads it only when a route was added or removed,
 * so serving the document stays cheap while never going stale.
 */
export function createRouterOpenAPI(
  router: HttpOpenAPIRouteSource,
  options: HttpOpenAPIOptions,
): HttpRouterOpenAPI {
  const manager = createOpenAPIManagerFromRoutes([], options);
  let seen: string | undefined;

  const refresh = (): OpenAPIManager => {
    const current = fingerprint(router);
    if (current !== seen) {
      manager.setRoutes(
        collectOpenAPIRoutes(router, options).map(routeDescriptorToRouteInfo),
      );
      seen = current;
    }
    return manager;
  };

  return Object.freeze({
    manager: refresh,
    document: () => refresh().getDocument(options.validate ?? false),
  });
}
