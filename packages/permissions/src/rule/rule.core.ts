/**
 * Rule matching and evaluation for permission decisions.
 *
 * @module rule/rule
 */

import type {
  PermissionRule,
  Permission,
  PermissionContext,
  RuleCombiningAlgorithm,
  RuleEvaluation,
} from "../permissionTypes/index.js";

/**
 * Check if a rule matches a target permission.
 *
 * Matching is about resource and action only. Whether the rule *applies* also
 * depends on its condition, which needs a context and is therefore evaluated
 * by {@link evaluateRules}.
 */
export function ruleMatches(rule: PermissionRule, target: Permission): boolean {
  return (
    patternListMatches(rule.resource, target.resource) &&
    patternListMatches(rule.action, target.action)
  );
}

/** Check if any pattern in a rule field matches a target segment. */
function patternListMatches(
  pattern: string | readonly string[],
  target: string,
): boolean {
  if (Array.isArray(pattern)) {
    return (pattern as readonly string[]).some((entry) =>
      patternStrMatches(entry, target),
    );
  }
  return patternStrMatches(pattern as string, target);
}

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
 * Evaluate a set of rules against a target permission.
 *
 * A rule with a condition applies only when that condition returns `true`,
 * which is what makes ABAC work: `{ effect: "allow", condition: isOwner() }`
 * has to mean "owners may", not "anyone may". Conditions are async, so this
 * function is too.
 *
 * A condition that throws is treated as unmet — an authorization check fails
 * closed. A rule that carries a condition when no context was supplied is
 * skipped for the same reason.
 *
 * Default combining algorithm: `deny-overrides`. Any applicable deny wins,
 * whatever its priority.
 */
export async function evaluateRules(
  rules: readonly PermissionRule[],
  target: Permission,
  context?: PermissionContext,
  options?: {
    readonly algorithm?: RuleCombiningAlgorithm;
    readonly onConditionError?: (rule: PermissionRule, error: unknown) => void;
  },
): Promise<RuleEvaluation> {
  const algorithm = options?.algorithm ?? "deny-overrides";
  const applicable: PermissionRule[] = [];

  for (const rule of rules) {
    if (!ruleMatches(rule, target)) continue;

    if (rule.condition) {
      if (!context) continue;
      let met = false;
      try {
        met = await rule.condition(context);
      } catch (error) {
        options?.onConditionError?.(rule, error);
        met = false;
      }
      if (!met) continue;
    }

    applicable.push(rule);
  }

  if (applicable.length === 0) {
    return { allowed: false, applicable: [] };
  }

  if (algorithm === "deny-overrides") {
    const deny = applicable.find((rule) => rule.effect === "deny");
    if (deny) return { allowed: false, matchedRule: deny, applicable };
    return { allowed: true, matchedRule: applicable[0], applicable };
  }

  const sorted = [...applicable].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    // Same priority: deny wins.
    if (a.effect === "deny" && b.effect !== "deny") return -1;
    if (b.effect === "deny" && a.effect !== "deny") return 1;
    return 0;
  });

  const top = sorted[0]!;
  return { allowed: top.effect === "allow", matchedRule: top, applicable };
}

/**
 * Evaluate rules that carry no conditions.
 *
 * Synchronous, for callers that build their own condition-free rule sets.
 * Any rule with a condition is skipped, because there is no way to evaluate
 * one without awaiting it — use {@link evaluateRules} for those.
 */
export function evaluateRulesSync(
  rules: readonly PermissionRule[],
  target: Permission,
  options?: { readonly algorithm?: RuleCombiningAlgorithm },
): RuleEvaluation {
  const algorithm = options?.algorithm ?? "deny-overrides";
  const applicable = rules.filter(
    (rule) => rule.condition === undefined && ruleMatches(rule, target),
  );

  if (applicable.length === 0) return { allowed: false, applicable: [] };

  if (algorithm === "deny-overrides") {
    const deny = applicable.find((rule) => rule.effect === "deny");
    if (deny) return { allowed: false, matchedRule: deny, applicable };
    return { allowed: true, matchedRule: applicable[0], applicable };
  }

  const sorted = [...applicable].sort((a, b) => {
    const priorityA = a.priority ?? 0;
    const priorityB = b.priority ?? 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    if (a.effect === "deny" && b.effect !== "deny") return -1;
    if (b.effect === "deny" && a.effect !== "deny") return 1;
    return 0;
  });

  const top = sorted[0]!;
  return { allowed: top.effect === "allow", matchedRule: top, applicable };
}
