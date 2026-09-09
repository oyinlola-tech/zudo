/**
 * Permission error types.
 *
 * @module permissionErrors
 */

export { PermissionError } from "./permissionError.base.js";

export {
  PermissionDeniedError,
  PermissionNotFoundError,
  DuplicatePermissionError,
  RoleNotFoundError,
  DuplicateRoleError,
  DuplicatePolicyError,
  InvalidPermissionError,
  InvalidRoleError,
  CircularRoleInheritanceError,
  PolicyError,
  PolicyTimeoutError,
  PermissionResolverError,
  AuthorizationAbortedError,
} from "./permissionError.types.js";
