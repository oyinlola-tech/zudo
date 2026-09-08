/**
 * @zudojs/openapi
 *
 * API contract and documentation engine for the Zudojs framework.
 *
 * Generates OpenAPI specifications from application routes, schemas,
 * and metadata. Supports OpenAPI 3.0 and 3.1.
 *
 * @example
 * ```ts
 * import { OpenAPIManager } from "@zudojs/openapi";
 *
 * const manager = new OpenAPIManager({
 *   version: "3.1.0",
 *   info: { title: "Orders API", version: "1.2.0" },
 *   servers: [{ url: "https://api.example.com" }],
 * });
 *
 * manager.addRoute({
 *   method: "get",
 *   path: "/users/:id",
 *   metadata: {
 *     openapi: {
 *       operationId: "users.get",
 *       summary: "Get a user",
 *       parameters: [{ name: "id", in: "path", required: true }],
 *       responses: {
 *         "200": { description: "User found" },
 *         "404": { description: "No such user" },
 *       },
 *     },
 *   },
 * });
 *
 * const document = manager.generate(true); // validate while generating
 * const json = manager.toJSON();
 * const yaml = manager.toYAML();
 * ```
 */

/* ─── Documentation UI & branding ──────────────────────────────────────── */

export {
  renderOpenAPIUI,
  zudoLogo,
  svgToDataUri,
  ZUDO_MARK_SVG,
  ZUDO_MARK_DARK_SVG,
  ZUDO_WORDMARK_SVG,
  ZUDO_WORDMARK_DARK_SVG,
  ZUDO_FAVICON_SVG,
  ZUDO_MARK_DATA_URI,
  ZUDO_MARK_DARK_DATA_URI,
  ZUDO_WORDMARK_DATA_URI,
  ZUDO_WORDMARK_DARK_DATA_URI,
  ZUDO_FAVICON_DATA_URI,
  ZUDO_SITE_URL,
  type OpenAPIUIOptions,
  type OpenAPIUIRenderer,
} from "./openApiUi/index.js";

/* ─── Document builder ──────────────────────────────────────────────────── */

export {
  OpenAPIDocumentBuilder,
  createOpenAPIDocumentBuilder,
  type OpenAPIDocumentOptions,
} from "./openApiDocument/index.js";

/* ─── Registry ──────────────────────────────────────────────────────────── */

export { OpenAPIRegistryImpl } from "./openApiRegistry/index.js";
export type {
  OpenAPIRegistry,
  OpenAPIRoute,
  OpenAPIComponentRegistration,
} from "./openApiRegistry/index.js";

/* ─── Errors ────────────────────────────────────────────────────────────── */

export {
  OpenAPIError,
  OpenAPIValidationError,
  OpenAPIDocumentError,
  OpenAPIComponentError,
  OpenAPIComponentConflictError,
  OpenAPIReferenceError,
  OpenAPIRouteError,
  OpenAPISchemaError,
  OpenAPISerializationError,
  OpenAPIVersionError,
  OpenAPIOperationError,
  createOpenAPIError,
  isOpenAPIError,
  formatIssuePath,
  type OpenAPIErrorOptions,
  type OpenAPIValidationIssue,
} from "./openApiErrors/index.js";

/* ─── Constants ─────────────────────────────────────────────────────────── */

export {
  DEFAULT_OPENAPI_VERSION,
  SUPPORTED_OPENAPI_VERSIONS,
  MAX_OPERATION_ID_LENGTH,
  COMPONENT_REF_PREFIX,
  DEFAULT_MEDIA_TYPE,
  STATUS_CODE_CATEGORIES,
  RESPONSE_KEY_PATTERN,
  PATH_TEMPLATE_PARAMETER,
  DEFAULT_SERVER_URL,
  DOCUMENT_CACHE_TTL_MS,
} from "./openApiConstants/index.js";

/* ─── Routing ───────────────────────────────────────────────────────────── */

export {
  toOpenAPIPath,
  extractPathParameters,
  convertRouteToOpenAPI,
  buildResponses,
  isOpenAPIMethod,
  ZUDOLIB_TO_OPENAPI_METHODS,
  OpenAPIRouteScannerImpl,
} from "./openApiRouting/index.js";
export type {
  RouteMetadata,
  RouteOpenAPIMetadata,
  RouteParameterMetadata,
  RouteInfo,
  OpenAPIHttpMethod,
} from "./openApiRouting/index.js";

/* ─── Schema conversion ─────────────────────────────────────────────────── */

export {
  convertSchema,
  createSchemaConverter,
  isVersion31,
  SchemaRegistryImpl,
  createComponentReference,
  escapeJsonPointerSegment,
  unescapeJsonPointerSegment,
} from "./openApiSchema/index.js";
export type {
  SchemaConverter,
  SchemaConversionResult,
  SchemaConversionOptions,
  SchemaRegistry,
  SchemaRegistryOptions,
  ComponentSection,
} from "./openApiSchema/index.js";

/* ─── Validation ────────────────────────────────────────────────────────── */

export {
  OpenAPIValidatorImpl,
  createOpenAPIValidator,
} from "./openApiValidation/index.js";
export type {
  OpenAPIValidator,
  OpenAPIValidationResult,
} from "./openApiValidation/index.js";

/* ─── Serialization ─────────────────────────────────────────────────────── */

export {
  toOpenAPIJSON,
  toOpenAPIYAML,
} from "./openApiSerialization/openApiSerializer.core.js";

/* ─── Manager ───────────────────────────────────────────────────────────── */

export {
  OpenAPIManager,
  createOpenAPIManager,
  type OpenAPIManagerOptions,
  type OpenAPIDocumentResponse,
  type OpenAPIUIResponse,
} from "./openApiHttp/index.js";

/* ─── Specification types ───────────────────────────────────────────────── */

export type {
  OpenAPIVersion,
  OpenAPIDocument,
  OpenAPIComponents,
  OpenAPISecurityRequirement,
  OpenAPIParameterLocation,
  OpenAPIResponse,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIMediaType,
  OpenAPIEncoding,
  OpenAPIHeader,
  OpenAPILink,
  OpenAPIExample,
  OpenAPIPaths,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIResponses,
  OpenAPIServer,
  OpenAPIServerVariable,
  OpenAPIInfo,
  OpenAPILogo,
  OpenAPIContact,
  OpenAPILicense,
  OpenAPIExternalDocumentation,
  OpenAPISchema,
  OpenAPIDiscriminator,
  OpenAPIXml,
  OpenAPISecurityScheme,
  OpenAPIOAuthFlows,
  OpenAPIOAuthFlow,
  OpenAPITag,
  OpenAPIReference,
} from "./openApiTypes/openApiTypes.core.js";
