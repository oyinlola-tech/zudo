/**
 * Document generation from a route table.
 */

import type { OpenAPIDocument, OpenAPISchema } from "../openApiTypes/openApiTypes.core.js";
import type { RouteInfo } from "../openApiRouting/routeMetadata.type.js";
import { isOpenAPIMethod } from "../openApiRouting/routeConverter.core.js";
import { isSchemaDefinition } from "../openApiSchema/schemaInput.core.js";
import { OpenAPIManager } from "../openApiHttp/openApiHttpAdapter.core.js";
import { OpenAPIRouteError } from "../openApiErrors/openApiError.types.js";
import type {
  OpenAPIDocumentFromRoutesOptions,
  OpenAPIRouteDescriptor,
} from "./openApiFromRoutes.type.js";

/**
 * Splits a descriptor into the manager's `{ method, path, metadata }` shape.
 *
 * @throws {OpenAPIRouteError} When the method has no OpenAPI path item field.
 */
export function routeDescriptorToRouteInfo(
  descriptor: OpenAPIRouteDescriptor,
): RouteInfo {
  const { method, path, ...openapi } = descriptor;
  if (typeof method !== "string" || !isOpenAPIMethod(method)) {
    throw new OpenAPIRouteError(
      `HTTP method "${String(method)}" of route ${String(path)} has no OpenAPI path item field.`,
      { metadata: { method, path } },
    );
  }
  return { method: method.toLowerCase() as RouteInfo["method"], path, metadata: { openapi } };
}

/**
 * Creates an {@link OpenAPIManager} holding `routes`, ready to generate,
 * serialize and serve (`toResponse`, `toUIResponse`). Refresh it later with
 * `manager.setRoutes(descriptors.map(routeDescriptorToRouteInfo))`.
 *
 * @throws {OpenAPIRouteError} On an unsupported method or a duplicate route.
 */
export function createOpenAPIManagerFromRoutes(
  routes: readonly OpenAPIRouteDescriptor[],
  options: OpenAPIDocumentFromRoutesOptions,
): OpenAPIManager {
  const { validate: _validate, securitySchemes, schemas, ...managerOptions } = options;
  const manager = new OpenAPIManager({ ...managerOptions, cacheTtlMs: 0 });
  for (const [name, scheme] of Object.entries(securitySchemes ?? {})) {
    manager.addSecurityScheme(name, scheme);
  }
  for (const [name, schema] of Object.entries(schemas ?? {})) {
    if (isSchemaDefinition(schema)) manager.addSchema(name, schema);
    else manager.addRawSchema(name, schema as OpenAPISchema);
  }
  return manager.setRoutes(routes.map(routeDescriptorToRouteInfo));
}

/**
 * Generates an OpenAPI document from a list of route descriptors.
 *
 * This is the transport-neutral entry point: `@zudojs/http` feeds it the
 * routes a router actually has registered, and any other source can feed it
 * the same structural {@link OpenAPIRouteDescriptor}s.
 *
 * ```ts
 * const document = createOpenAPIDocumentFromRoutes(
 *   [{ method: "GET", path: "/users/:id", summary: "Get a user",
 *      responses: { "200": { schema: userSchema } } }],
 *   { info: { title: "Users", version: "1.0.0" }, validate: true },
 * );
 * ```
 *
 * @throws {OpenAPIRouteError} On an unsupported method, an inexpressible
 *   path or a duplicate route.
 * @throws {OpenAPIValidationError} When `validate` is set and the document
 *   is invalid.
 */
export function createOpenAPIDocumentFromRoutes(
  routes: readonly OpenAPIRouteDescriptor[],
  options: OpenAPIDocumentFromRoutesOptions,
): OpenAPIDocument {
  return createOpenAPIManagerFromRoutes(routes, options).generate(
    options.validate ?? false,
  );
}
