/**
 * Tenancy error types.
 *
 * @module tenancyErrors
 */

export { TenantError } from "./tenancyError.base.js";

export {
  InvalidTenantIdError,
  TenantNotFoundError,
  TenantContextMissingError,
  TenantResolutionError,
  TenantResolutionConflictError,
  TenantUnavailableError,
  TenantAccessDeniedError,
  TenantTrustLevelError,
  TenantAlreadyExistsError,
  TenantIsolationError,
} from "./tenancyError.types.js";
