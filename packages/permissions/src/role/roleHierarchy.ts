/**
 * Role hierarchy resolver — resolves inherited permissions from role chains.
 *
 * @module role/roleHierarchy
 */

import type {
  PermissionRule,
  RoleDefinition,
} from "../permissionTypes/index.js";
import { CircularRoleInheritanceError } from "../permissionErrors/index.js";

/** What a set of roles grants, once inheritance is followed. */
export interface RoleResolution {
  readonly permissions: readonly string[];
  readonly rules: readonly PermissionRule[];
  /** Role names the lookup could not find. */
  readonly unknownRoles: readonly string[];
}

/** Options for {@link resolveRolePermissions}. */
export interface RoleResolutionOptions {
  /**
   * Called for each role the lookup cannot find.
   *
   * Reporting rather than throwing is deliberate: a stale role name in a
   * token is a data problem, and an authorization check that throws hands the
   * outcome to an outer error handler instead of denying.
   */
  readonly onUnknownRole?: (name: string) => void;
}

/**
 * Resolve everything a set of roles grants, following inheritance chains.
 *
 * @param roleNames - Direct role names assigned to the actor.
 * @param getRole - Function to look up a role definition by name.
 * @returns Deduplicated permissions and rules, plus any unresolved names.
 * @throws CircularRoleInheritanceError when the graph contains a cycle
 */
export function resolveRolePermissions(
  roleNames: readonly string[],
  getRole: (name: string) => RoleDefinition | undefined,
  options?: RoleResolutionOptions,
): RoleResolution {
  const permissions = new Set<string>();
  const rules: PermissionRule[] = [];
  const unknownRoles: string[] = [];
  const visited = new Set<string>();

  for (const name of roleNames) {
    collect(name, getRole, permissions, rules, unknownRoles, visited, []);
  }

  if (options?.onUnknownRole) {
    for (const name of unknownRoles) options.onUnknownRole(name);
  }

  return { permissions: [...permissions], rules, unknownRoles };
}

function collect(
  roleName: string,
  getRole: (name: string) => RoleDefinition | undefined,
  permissions: Set<string>,
  rules: PermissionRule[],
  unknownRoles: string[],
  visited: Set<string>,
  chain: string[],
): void {
  // Cycle detection comes first: a role that appears twice in the current
  // chain is a cycle even if it has already been visited on another branch.
  if (chain.includes(roleName)) {
    throw new CircularRoleInheritanceError([...chain, roleName]);
  }

  if (visited.has(roleName)) return;

  const role = getRole(roleName);
  if (!role) {
    if (!unknownRoles.includes(roleName)) unknownRoles.push(roleName);
    return;
  }

  visited.add(roleName);
  const newChain = [...chain, roleName];

  for (const permission of role.permissions) permissions.add(permission);
  if (role.rules) rules.push(...role.rules);

  for (const parent of role.inherits ?? []) {
    collect(
      parent,
      getRole,
      permissions,
      rules,
      unknownRoles,
      visited,
      newChain,
    );
  }
}

/**
 * Wrap a role lookup with a memo, so a deep hierarchy is walked once per
 * distinct role rather than on every authorization check.
 *
 * The cache is invalidated by `invalidate()`; a registry that changes at
 * runtime should call it.
 */
export function memoizeRoleLookup(
  getRole: (name: string) => RoleDefinition | undefined,
): {
  readonly lookup: (name: string) => RoleDefinition | undefined;
  readonly invalidate: () => void;
} {
  const cache = new Map<string, RoleDefinition | undefined>();
  return {
    lookup: (name: string) => {
      if (cache.has(name)) return cache.get(name);
      const role = getRole(name);
      cache.set(name, role);
      return role;
    },
    invalidate: () => cache.clear(),
  };
}
