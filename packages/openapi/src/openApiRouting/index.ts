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
  OpenAPISchemaInput,
  OpenAPIRouteBody,
  OpenAPIRouteResponse,
  RouteConversionOptions,
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

export { buildOperationParameters } from "./routeSchema.core.js";

export {
  buildOperationRequestBody,
  buildOperationResponses,
  describeResponseKey,
} from "./routeContent.core.js";
