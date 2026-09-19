/**
 * Pattern matching shared by rules, grants, denies and policies.
 *
 * @module rule/rule.pattern
 */

import type { Permission, PermissionRule } from "../permissionTypes/index.js";

/**
 * Check if a single pattern string matches a target, supporting wildcards.
 *
 * Two forms are supported, and they are the same two the permission matcher
 * supports, so a pattern means the same thing wherever it is written:
 *   `*`           — matches anything
 *   `billing.*`   — matches `billing` and any `billing.…` namespace
 */
export function patternStrMatches(pattern: string, target: string): boolean {
  if (pattern === "*") return true;
  if (pattern === target) return true;

  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return target === prefix || target.startsWith(`${prefix}.`);
  }

  return false;
}

/**
 * Whether two segment patterns can name a common segment.
 *
 * For a concrete `target` this is exactly {@link patternStrMatches}. For a
 * wildcard target it is what a *deny* has to test: `can(actor, "post:*")`
 * asks about everything under `post`, so a deny of `post:delete` bears on it
 * although `post:delete` does not match `post:*` as a pattern.
 */
export function patternsOverlap(a: string, b: string): boolean {
  return patternStrMatches(a, b) || patternStrMatches(b, a);
}

function patternList(pattern: string | readonly string[]): readonly string[] {
  return Array.isArray(pattern)
    ? (pattern as readonly string[])
    : [pattern as string];
}

/**
 * Check if a rule matches a target permission.
 *
 * Matching is about resource and action only. Whether the rule *applies* also
 * depends on its condition, which needs a context and is therefore evaluated
 * by `evaluateRules`.
 */
export function ruleMatches(rule: PermissionRule, target: Permission): boolean {
  return (
    patternList(rule.resource).some((entry) =>
      patternStrMatches(entry, target.resource),
    ) &&
    patternList(rule.action).some((entry) =>
      patternStrMatches(entry, target.action),
    )
  );
}

/** Check if a rule's patterns overlap a (possibly wildcard) target. */
export function ruleOverlaps(
  rule: PermissionRule,
  target: Permission,
): boolean {
  return (
    patternList(rule.resource).some((entry) =>
      patternsOverlap(entry, target.resource),
    ) &&
    patternList(rule.action).some((entry) =>
      patternsOverlap(entry, target.action),
    )
  );
}

/**
 * Whether a rule bears on a target: allows by matching, denies by overlap.
 *
 * An allow must cover the whole target to grant it; a deny needs only to
 * touch it. For a concrete target the two are the same test.
 */
export function ruleBearsOn(
  rule: PermissionRule,
  target: Permission,
): boolean {
  return rule.effect === "deny"
    ? ruleOverlaps(rule, target)
    : ruleMatches(rule, target);
}

/** Whether a permission names more than one concrete permission. */
export function isWildcardTarget(target: Permission): boolean {
  return target.resource.includes("*") || target.action.includes("*");
}
