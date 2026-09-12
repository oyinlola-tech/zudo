/**
 * Central registry for role definitions.
 *
 * @module role/roleRegistry
 */

import type { RoleDefinition } from "../permissionTypes/index.js";
import {
  DuplicateRoleError,
  InvalidRoleError,
  RoleNotFoundError,
} from "../permissionErrors/index.js";
import { isValidPermission } from "../permission/permission.core.js";

/** Options for the role registry. */
export interface RoleRegistryOptions {
  /** Allow overwriting existing roles. Defaults to false. */
  readonly allowOverride?: boolean;
  /**
   * Reject permission strings that are not `resource:action`. Defaults to
   * true — a malformed grant can never match, so accepting one registers a
   * permission that silently does nothing.
   */
  readonly validatePermissions?: boolean;
}

/** A role registry, usable directly as the engine's `roles` source. */
export interface RoleRegistry {
  define(definition: RoleDefinition): void;
  get(name: string): RoleDefinition | undefined;
  /** Like {@link RoleRegistry.get}, but throws when the role is unregistered. */
  require(name: string): RoleDefinition;
  has(name: string): boolean;
  names(): readonly string[];
  all(): readonly RoleDefinition[];
  remove(name: string): boolean;
  clear(): void;
}

/**
 * Copy a role definition so it no longer shares arrays with the caller.
 *
 * `Object.freeze({ ...definition })` froze the wrapper and kept the caller's
 * `permissions`, `inherits` and `rules` arrays by reference — so pushing
 * `"*:*"` onto an array *after* `define()` had validated it widened the role
 * in silence.
 */
export function freezeRoleDefinition(definition: RoleDefinition): RoleDefinition {
  return Object.freeze({
    ...definition,
    permissions: Object.freeze([...definition.permissions]),
    ...(definition.inherits
      ? { inherits: Object.freeze([...definition.inherits]) }
      : {}),
    ...(definition.rules ? { rules: Object.freeze([...definition.rules]) } : {}),
  });
}

/**
 * Create a role registry.
 *
 * Pass it straight to `createPermissionEngine({ roles: registry })`.
 */
export function createRoleRegistry(
  options?: RoleRegistryOptions,
): RoleRegistry {
  const roles = new Map<string, RoleDefinition>();
  const allowOverride = options?.allowOverride ?? false;
  const validatePermissions = options?.validatePermissions ?? true;

  return {
    /**
     * Register a role definition.
     *
     * A role with no permissions of its own is valid: a role that exists only
     * to combine others through `inherits` is the normal way to build a
     * hierarchy.
     */
    define(definition: RoleDefinition): void {
      if (!definition.name || definition.name.trim() === "") {
        throw new InvalidRoleError("Role name cannot be empty");
      }
      if (!Array.isArray(definition.permissions)) {
        throw new InvalidRoleError(
          `Role "${definition.name}" must declare a permissions array`,
        );
      }
      if (validatePermissions) {
        for (const permission of definition.permissions) {
          if (!isValidPermission(permission)) {
            throw new InvalidRoleError(
              `Role "${definition.name}" grants "${permission}", which is not a ` +
                `valid "resource:action" permission`,
            );
          }
        }
      }

      if (roles.has(definition.name) && !allowOverride) {
        throw new DuplicateRoleError(definition.name);
      }

      roles.set(definition.name, freezeRoleDefinition(definition));
    },

    get(name: string): RoleDefinition | undefined {
      return roles.get(name);
    },

    require(name: string): RoleDefinition {
      const role = roles.get(name);
      if (!role) throw new RoleNotFoundError(name);
      return role;
    },

    has(name: string): boolean {
      return roles.has(name);
    },

    names(): readonly string[] {
      return [...roles.keys()];
    },

    all(): readonly RoleDefinition[] {
      return [...roles.values()];
    },

    remove(name: string): boolean {
      return roles.delete(name);
    },

    clear(): void {
      roles.clear();
    },
  };
}
