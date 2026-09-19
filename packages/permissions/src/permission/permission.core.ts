/**
 * Permission string parsing and wildcard matching.
 *
 * @module permission/permission
 */

import type { Permission } from "../permissionTypes/index.js";
import { InvalidPermissionError } from "../permissionErrors/index.js";
import { patternStrMatches, patternsOverlap } from "../rule/rule.pattern.js";

/**
 * Valid permission format: `resource:action`.
 *
 * A segment is either a bare `*`, a namespace wildcard such as `billing.*`,
 * or a literal name. A partial wildcard like `post*` is rejected: the matcher
 * has no meaning for it, so accepting one produced a grant that silently
 * never matched anything.
 */
const SEGMENT = String.raw`(?:\*|[a-zA-Z0-9._-]+(?:\.\*)?)`;
const PERMISSION_REGEX = new RegExp(`^${SEGMENT}:${SEGMENT}$`);

/**
 * Parse a permission string into a structured Permission.
 *
 * @example parsePermission("post:update") → { resource: "post", action: "update" }
 * @example parsePermission("billing.invoice:refund") → { resource: "billing.invoice", action: "refund" }
 * @throws InvalidPermissionError if the string is not a valid permission
 */
export function parsePermission(permission: string): Permission {
  const parsed = parsePermissionSafe(permission);
  if (!parsed) throw new InvalidPermissionError(permission);
  return Object.freeze(parsed);
}

/**
 * Check if a permission string is valid without throwing.
 */
export function isValidPermission(permission: string): boolean {
  return PERMISSION_REGEX.test(permission);
}

/**
 * Check if a permission pattern matches a target permission.
 *
 * Uses the same wildcard rules as the rule engine, so `billing.*:read`
 * means the same thing whether it is written as a grant, a deny, or a rule.
 *
 * @example matches("post:*", "post:update") → true
 * @example matches("*:*", "anything:goes") → true
 * @example matches("billing.*:read", "billing.invoice:read") → true
 * @example matches("post:read", "post:update") → false
 */
export function matches(pattern: string, target: string): boolean {
  const patternParsed = parsePermissionSafe(pattern);
  const targetParsed = parsePermissionSafe(target);
  if (!patternParsed || !targetParsed) return false;
  return matchesPermission(pattern, targetParsed);
}

/**
 * Check if a permission pattern matches a structured Permission object.
 */
export function matchesPermission(
  pattern: string,
  permission: Permission,
): boolean {
  const parsed = parsePermissionSafe(pattern);
  if (!parsed) return false;

  return (
    patternStrMatches(parsed.resource, permission.resource) &&
    patternStrMatches(parsed.action, permission.action)
  );
}

/**
 * Check if two permission patterns can name a common permission.
 *
 * This is the test a *deny* needs. For a concrete target it is exactly
 * {@link matches}; for a wildcard target such as `post:*` it also holds when
 * the deny is narrower (`post:delete`), which `matches` does not see.
 *
 * @example permissionsOverlap("post:delete", "post:*") → true
 * @example permissionsOverlap("*:delete", "post:*") → true
 * @example permissionsOverlap("post:delete", "post:read") → false
 */
export function permissionsOverlap(a: string, b: string): boolean {
  const left = parsePermissionSafe(a);
  const right = parsePermissionSafe(b);
  if (!left || !right) return false;
  return (
    patternsOverlap(left.resource, right.resource) &&
    patternsOverlap(left.action, right.action)
  );
}

/**
 * Parse a permission string, returning null on invalid format instead of throwing.
 */
export function parsePermissionSafe(permission: string): Permission | null {
  if (!PERMISSION_REGEX.test(permission)) return null;
  const lastColon = permission.lastIndexOf(":");
  const resource = permission.slice(0, lastColon);
  const action = permission.slice(lastColon + 1);
  return { resource, action };
}

/** Build a permission string from a resource and an action. */
export function formatPermission(resource: string, action: string): string {
  return `${resource}:${action}`;
}
