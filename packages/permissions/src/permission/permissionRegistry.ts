/**
 * Central registry for defining and looking up permissions.
 *
 * @module permission/permissionRegistry
 */

import type { Permission } from "../permissionTypes/index.js";
import {
  DuplicatePermissionError,
  InvalidPermissionError,
  PermissionNotFoundError,
} from "../permissionErrors/index.js";
import {
  formatPermission,
  isValidPermission,
  matchesPermission,
  parsePermission,
} from "./permission.core.js";

/** A registered permission with optional metadata. */
export interface RegisteredPermission {
  readonly key: string;
  readonly parsed: Permission;
  readonly description?: string;
  readonly implies?: readonly string[];
}

/** Options for the permission registry. */
export interface PermissionRegistryOptions {
  /** Allow overwriting existing permissions. Defaults to false. */
  readonly allowOverride?: boolean;
}

/** A registry of the permissions an application defines. */
export interface PermissionRegistry {
  define(
    permission: string | Permission,
    options?: {
      readonly description?: string;
      readonly implies?: readonly string[];
    },
  ): void;
  get(permission: string): Permission | undefined;
  /** Like {@link PermissionRegistry.get}, but throws when unregistered. */
  require(permission: string): Permission;
  getEntry(permission: string): RegisteredPermission | undefined;
  has(permission: string): boolean;
  all(): readonly string[];
  match(pattern: string): readonly Permission[];
  getImplied(permission: string): readonly string[];
  /**
   * Every permission implied by `permission`, following chains and stopping
   * at cycles. This is what `createPermissionEngine({ expandImplied })`
   * wants: `post:admin implies post:read` only affects a decision if
   * something expands it.
   */
  expandImplied(permission: string): readonly string[];
  remove(permission: string): boolean;
  clear(): void;
}

/**
 * Create a permission registry.
 *
 * ```ts
 * const permissions = createPermissionRegistry();
 * permissions.define("post:admin", { implies: ["post:read", "post:write"] });
 *
 * const engine = createPermissionEngine({
 *   roles,
 *   expandImplied: (permission) => permissions.expandImplied(permission),
 * });
 * ```
 */
export function createPermissionRegistry(
  options?: PermissionRegistryOptions,
): PermissionRegistry {
  const permissions = new Map<string, RegisteredPermission>();
  const allowOverride = options?.allowOverride ?? false;

  function keyOf(permission: string | Permission): string {
    if (typeof permission === "string") {
      // Validate strings and structured values alike; a structured value
      // skipping validation let `{ resource: "a b", action: "" }` in.
      parsePermission(permission);
      return permission;
    }
    const key = formatPermission(permission.resource, permission.action);
    if (!isValidPermission(key)) throw new InvalidPermissionError(key);
    return key;
  }

  return {
    define(permission, defineOptions): void {
      const key = keyOf(permission);
      const parsed = parsePermission(key);

      if (permissions.has(key) && !allowOverride) {
        throw new DuplicatePermissionError(key);
      }

      for (const implied of defineOptions?.implies ?? []) {
        if (!isValidPermission(implied)) {
          throw new InvalidPermissionError(implied);
        }
      }

      permissions.set(key, {
        key,
        parsed,
        description: defineOptions?.description,
        implies: defineOptions?.implies
          ? Object.freeze([...defineOptions.implies])
          : undefined,
      });
    },

    get(permission: string): Permission | undefined {
      return permissions.get(permission)?.parsed;
    },

    require(permission: string): Permission {
      const entry = permissions.get(permission);
      if (!entry) throw new PermissionNotFoundError(permission);
      return entry.parsed;
    },

    getEntry(permission: string): RegisteredPermission | undefined {
      return permissions.get(permission);
    },

    has(permission: string): boolean {
      return permissions.has(permission);
    },

    all(): readonly string[] {
      return [...permissions.keys()];
    },

    match(pattern: string): readonly Permission[] {
      const results: Permission[] = [];
      for (const entry of permissions.values()) {
        if (matchesPermission(pattern, entry.parsed))
          results.push(entry.parsed);
      }
      return results;
    },

    getImplied(permission: string): readonly string[] {
      return permissions.get(permission)?.implies ?? [];
    },

    expandImplied(permission: string): readonly string[] {
      const expanded = new Set<string>();
      const queue = [...(permissions.get(permission)?.implies ?? [])];

      while (queue.length > 0) {
        const next = queue.shift()!;
        if (next === permission || expanded.has(next)) continue;
        expanded.add(next);
        queue.push(...(permissions.get(next)?.implies ?? []));
      }

      return [...expanded];
    },

    remove(permission: string): boolean {
      return permissions.delete(permission);
    },

    clear(): void {
      permissions.clear();
    },
  };
}
