/**
 * Permission parsing, matching, and registry.
 *
 * @module permission
 */

export {
  parsePermission,
  parsePermissionSafe,
  isValidPermission,
  matches,
  matchesPermission,
  formatPermission,
} from "./permission.core.js";

export {
  createPermissionRegistry,
  type PermissionRegistry,
  type PermissionRegistryOptions,
  type RegisteredPermission,
} from "./permissionRegistry.js";
