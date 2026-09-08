/**
 * Role definitions, registry, and inheritance hierarchy.
 *
 * @module role
 */

export {
  createRoleRegistry,
  type RoleRegistry,
  type RoleRegistryOptions,
} from "./roleRegistry.js";

export {
  resolveRolePermissions,
  memoizeRoleLookup,
  type RoleResolution,
  type RoleResolutionOptions,
} from "./roleHierarchy.js";
