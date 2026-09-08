/**
 * @zudojs/http — Security module.
 *
 * Request validation, guard middleware, and security configuration
 * for the HTTP layer. Enforces body limits, header validation,
 * host validation, request smuggling protection, and request ID validation.
 */

export type { HTTPSecurityConfig } from "./httpSecurity.config.js";

export { DEFAULT_SECURITY_CONFIG } from "./httpSecurity.config.js";

export type { SecurityValidationResult } from "./httpSecurity.validator.js";

export {
  validateHeaders,
  validateHost,
  validateUrl,
  validateQuery,
  validateContentLength,
  validateRequestId,
  validateTransferEncoding,
} from "./httpSecurity.validator.js";

export type { GuardableRequest, GuardResult } from "./httpSecurity.guard.js";

export {
  guardRequest,
  createRequestGuard,
  assertRequestAllowed,
  HttpRequestGuardError,
} from "./httpSecurity.guard.js";
