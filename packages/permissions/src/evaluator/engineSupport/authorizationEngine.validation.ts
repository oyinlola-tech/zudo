/**
 * Configuration validation for the authorization engine.
 *
 * A malformed pattern can never match. In a grant that is a silent no-op; in
 * a denying policy or a deny rule it is a restriction that fails open. The
 * same pattern therefore has to be rejected wherever it can be written, not
 * only in a role's grant list.
 *
 * @module evaluator/authorizationEngine.validation
 */

import type {
  PermissionPolicyDefinition,
  PermissionRule,
  RoleDefinition,
} from "../../permissionTypes/index.js";
import {
  InvalidPermissionError,
  InvalidRoleError,
} from "../../permissionErrors/index.js";
import { isValidPermission } from "../../permission/permission.core.js";

function patterns(value: string | readonly string[]): readonly string[] {
  return Array.isArray(value) ? (value as readonly string[]) : [value as string];
}

/**
 * The first `resource:action` pair a rule names that is not a valid
 * permission pattern, or `undefined` when every pair is valid.
 */
export function invalidRulePattern(rule: PermissionRule): string | undefined {
  const resources = patterns(rule.resource);
  const actions = patterns(rule.action);
  if (resources.length === 0 || actions.length === 0) {
    return `${resources.join(",")}:${actions.join(",")}`;
  }
  for (const resource of resources) {
    for (const action of actions) {
      const pair = `${String(resource)}:${String(action)}`;
      if (!isValidPermission(pair)) return pair;
    }
  }
  return undefined;
}

/**
 * Reject a rule whose resource or action could never match.
 *
 * @throws {InvalidPermissionError} naming the offending pair.
 */
export function validateRule(rule: PermissionRule): void {
  const invalid = invalidRulePattern(rule);
  if (invalid !== undefined) throw new InvalidPermissionError(invalid);
}

/**
 * Reject a policy scoped to a pattern that could never match.
 *
 * @throws {InvalidPermissionError} naming the offending pattern.
 */
export function validatePolicy(policy: PermissionPolicyDefinition): void {
  for (const pattern of policy.permissions) {
    if (!isValidPermission(pattern)) throw new InvalidPermissionError(pattern);
  }
}

/**
 * Reject a role whose grants or rules could never match.
 *
 * @throws {InvalidRoleError} naming the role and the offending pattern.
 */
export function validateRole(role: RoleDefinition): void {
  if (!role.name || role.name.trim() === "") {
    throw new InvalidRoleError("Role name cannot be empty");
  }
  for (const permission of role.permissions) {
    if (!isValidPermission(permission)) {
      throw new InvalidRoleError(
        `Role "${role.name}" grants "${permission}", which is not a valid ` +
          `"resource:action" permission`,
      );
    }
  }
  for (const rule of role.rules ?? []) {
    const invalid = invalidRulePattern(rule);
    if (invalid !== undefined) {
      throw new InvalidRoleError(
        `Role "${role.name}" has a rule on "${invalid}", which is not a valid ` +
          `"resource:action" pattern`,
      );
    }
  }
}

/** Validate a role list, rejecting duplicates as well. */
export function validateRoles(roles: readonly RoleDefinition[]): void {
  const seen = new Set<string>();
  for (const role of roles) {
    validateRole(role);
    if (seen.has(role.name)) {
      throw new InvalidRoleError(`Role "${role.name}" is defined more than once`);
    }
    seen.add(role.name);
  }
}
