/**
 * @zudojs/http/httpOpenApi
 *
 * OpenAPI generated from the application: documents built from the routes a
 * router has actually registered (`generateOpenAPIDocument`), kept in step
 * with it (`createRouterOpenAPI`), and served with a documentation page
 * (`mountOpenAPI`). Route-level documentation is the `openapi` route option.
 */

export {
  generateOpenAPIDocument,
  createRouterOpenAPI,
  type HttpRouterOpenAPI,
} from "./httpOpenApi.document.js";

export { mountOpenAPI, type HttpOpenAPIMount } from "./httpOpenApi.mount.js";

export type {
  HttpOpenAPIOptions,
  HttpOpenAPIMountOptions,
  HttpOpenAPIRouteSelection,
  HttpOpenAPIRouteFilter,
  HttpOpenAPIRouteSource,
} from "./httpOpenApi.type.js";

export * from "./routeTable/index.js";
