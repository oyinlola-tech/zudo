/**
 * @zudojs/openapi/openApiErrors
 *
 * OpenAPI-specific error classes.
 */

export {
  OpenAPIError,
  createOpenAPIError,
  isOpenAPIError,
  type OpenAPIErrorOptions,
} from "./openApiError.base.js";

export {
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
  formatIssuePath,
  type OpenAPIValidationIssue,
} from "./openApiError.types.js";
