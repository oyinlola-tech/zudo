/**
 * @zudojs/openapi/openApiRouting
 *
 * Route metadata, conversion, and scanning for OpenAPI generation.
 */

export type {
  RouteMetadata,
  RouteOpenAPIMetadata,
  RouteParameterMetadata,
  RouteInfo,
  OpenAPIHttpMethod,
} from "./routeMetadata.type.js";

export {
  toOpenAPIPath,
  extractPathParameters,
  convertRouteToOpenAPI,
  buildResponses,
  isOpenAPIMethod,
  ZUDOLIB_TO_OPENAPI_METHODS,
} from "./routeConverter.core.js";

export { OpenAPIRouteScannerImpl } from "./routeScanner.core.js";
