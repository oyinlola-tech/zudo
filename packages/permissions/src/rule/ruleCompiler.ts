/**
 * Rule compiler — indexes rules for fast lookup during authorization.
 *
 * @module rule/ruleCompiler
 */

import type { PermissionRule, Permission } from "../permissionTypes/index.js";
import { ruleMatches } from "./rule.core.js";

/** Compiled rule index for fast lookup by resource:action. */
export interface RuleIndex {
  /** Exact matches: "post:update" → rules. */
  readonly exact: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Resource wildcards: "post:*" → rules, keyed by resource. */
  readonly resourceWildcard: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Action wildcards: "*:read" → rules, keyed by action. */
  readonly actionWildcard: ReadonlyMap<string, readonly PermissionRule[]>;
  /** Global wildcards: "*:*" → rules. */
  readonly globalWildcard: readonly PermissionRule[];
  /**
   * Rules using a namespace wildcard (`billing.*`), which no exact key can
   * index. Scanned linearly — small in practice, and leaving them out of the
   * index entirely is what made them silently unmatchable.
   */
  readonly patterned: readonly PermissionRule[];
}

/** True when a pattern needs a linear scan rather than a map lookup. */
function isPatterned(pattern: string): boolean {
  return pattern !== "*" && pattern.endsWith(".*");
}

/**
 * Compile a set of rules into an optimized index.
 */
export function compileRules(rules: readonly PermissionRule[]): RuleIndex {
  const exact = new Map<string, PermissionRule[]>();
  const resourceWildcard = new Map<string, PermissionRule[]>();
  const actionWildcard = new Map<string, PermissionRule[]>();
  const globalWildcard: PermissionRule[] = [];
  const patterned: PermissionRule[] = [];

  const push = (
    map: Map<string, PermissionRule[]>,
    key: string,
    rule: PermissionRule,
  ): void => {
    const bucket = map.get(key);
    if (bucket) bucket.push(rule);
    else map.set(key, [rule]);
  };

  for (const rule of rules) {
    const resources = normalizeToArray(rule.resource);
    const actions = normalizeToArray(rule.action);
    let indexed = false;

    for (const resource of resources) {
      for (const action of actions) {
        if (isPatterned(resource) || isPatterned(action)) {
          if (!indexed) {
            patterned.push(rule);
            indexed = true;
          }
          continue;
        }
        if (resource === "*" && action === "*") {
          globalWildcard.push(rule);
        } else if (resource === "*") {
          push(actionWildcard, action, rule);
        } else if (action === "*") {
          push(resourceWildcard, resource, rule);
        } else {
          push(exact, `${resource}:${action}`, rule);
        }
      }
    }
  }

  return { exact, resourceWildcard, actionWildcard, globalWildcard, patterned };
}

/**
 * Find all rules from the compiled index that match a target permission.
 *
 * The result is de-duplicated: a rule listing several resources or actions is
 * indexed under each, and returning it more than once would let one rule
 * count twice when the decision is combined.
 */
export function findMatchingRules(
  index: RuleIndex,
  target: Permission,
): readonly PermissionRule[] {
  const results: PermissionRule[] = [];
  const seen = new Set<PermissionRule>();

  const add = (rules: readonly PermissionRule[] | undefined): void => {
    if (!rules) return;
    for (const rule of rules) {
      if (seen.has(rule)) continue;
      seen.add(rule);
      results.push(rule);
    }
  };

  // 1. Exact matches
  add(index.exact.get(`${target.resource}:${target.action}`));
  // 2. Resource wildcard: "post:*" matches "post:update"
  add(index.resourceWildcard.get(target.resource));
  // 3. Action wildcard: "*:read" matches "post:read"
  add(index.actionWildcard.get(target.action));
  // 4. Global wildcard: "*:*"
  add(index.globalWildcard);
  // 5. Namespace wildcards, which need a real match test
  add(index.patterned.filter((rule) => ruleMatches(rule, target)));

  return results;
}

function normalizeToArray(value: string | readonly string[]): string[] {
  return Array.isArray(value) ? [...value] : [value as string];
}
