/**
 * Permission error types — re-exports from focused files.
 */

export {
  PermissionDeniedError,
  PermissionNotFoundError,
  DuplicatePermissionError,
  RoleNotFoundError,
  DuplicateRoleError,
  DuplicatePolicyError,
} from "./permissionError.access.js";

export {
  InvalidPermissionError,
  InvalidRoleError,
  CircularRoleInheritanceError,
  PolicyError,
  PolicyTimeoutError,
  PermissionResolverError,
  AuthorizationAbortedError,
} from "./permissionError.validation.js";
