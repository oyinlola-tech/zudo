/**
 * Policy registry — manages named authorization policies.
 *
 * @module policy/policyRegistry
 */

import type { PermissionPolicyDefinition } from "../permissionTypes/index.js";
import { matches } from "../permission/permission.core.js";

/** A policy registry, usable directly as the engine's `policies` source. */
export interface PolicyRegistry {
  define(definition: PermissionPolicyDefinition): void;
  get(name: string): PermissionPolicyDefinition | undefined;
  has(name: string): boolean;
  forPermission(permission: string): readonly PermissionPolicyDefinition[];
  names(): readonly string[];
  all(): readonly PermissionPolicyDefinition[];
  remove(name: string): boolean;
  clear(): void;
}

/**
 * Create a policy registry.
 *
 * Pass it straight to `createPermissionEngine({ policies: registry })`.
 */
export function createPolicyRegistry(): PolicyRegistry {
  const policies = new Map<string, PermissionPolicyDefinition>();

  return {
    define(definition: PermissionPolicyDefinition): void {
      policies.set(definition.name, Object.freeze({ ...definition }));
    },

    get(name: string): PermissionPolicyDefinition | undefined {
      return policies.get(name);
    },

    has(name: string): boolean {
      return policies.has(name);
    },

    /**
     * Policies that apply to a permission, highest priority first.
     *
     * Patterns are matched with the same wildcard rules as grants, so a
     * policy registered for `post:*` covers `post:update`.
     */
    forPermission(permission: string): readonly PermissionPolicyDefinition[] {
      return [...policies.values()]
        .filter((policy) =>
          policy.permissions.some((pattern) => matches(pattern, permission)),
        )
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    },

    names(): readonly string[] {
      return [...policies.keys()];
    },

    all(): readonly PermissionPolicyDefinition[] {
      return [...policies.values()];
    },

    remove(name: string): boolean {
      return policies.delete(name);
    },

    clear(): void {
      policies.clear();
    },
  };
}
