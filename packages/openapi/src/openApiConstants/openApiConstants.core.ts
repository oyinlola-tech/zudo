/**
 * @zudojs/openapi/openApiConstants
 *
 * Shared constants for OpenAPI generation.
 */

/**
 * Default OpenAPI specification version.
 */
export const DEFAULT_OPENAPI_VERSION = "3.1.0" as const;

/**
 * Every specification version this package can emit and validate.
 */
export const SUPPORTED_OPENAPI_VERSIONS = [
  "3.0.0",
  "3.0.1",
  "3.0.2",
  "3.0.3",
  "3.1.0",
  "3.1.1",
] as const;

/**
 * Maximum operation ID length. Not a specification limit — a practical one:
 * operation IDs become function names in generated clients, and tooling
 * routinely truncates beyond this.
 */
export const MAX_OPERATION_ID_LENGTH = 128;

/**
 * Component reference prefix.
 */
export const COMPONENT_REF_PREFIX = "#/components";

/**
 * Default media type for request/response bodies.
 */
export const DEFAULT_MEDIA_TYPE = "application/json";

/**
 * Status code categories, usable as OpenAPI response keys.
 */
export const STATUS_CODE_CATEGORIES = {
  INFORMATIONAL: "1XX",
  SUCCESS: "2XX",
  REDIRECT: "3XX",
  CLIENT_ERROR: "4XX",
  SERVER_ERROR: "5XX",
} as const;

/** A response key is valid when it is `default`, `NXX`, or a status code. */
export const RESPONSE_KEY_PATTERN = /^(default|[1-5](XX|\d{2}))$/;

/** OpenAPI path template parameter, e.g. `{orderId}`. */
export const PATH_TEMPLATE_PARAMETER = /\{([^{}]+)\}/g;

/**
 * Default server URL.
 */
export const DEFAULT_SERVER_URL = "http://localhost";

/**
 * Default time a generated document stays cached before it is rebuilt.
 *
 * Applied by `OpenAPIManager`; pass `cacheTtlMs` to change or disable it.
 */
export const DOCUMENT_CACHE_TTL_MS = 5 * 60 * 1000;
