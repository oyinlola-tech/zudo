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
import { ruleBearsOn } from "./rule.pattern.js";

export { ruleMatches, patternStrMatches } from "./rule.pattern.js";

/**
 * Sort key for `priority` combining: higher priority first, and at equal
 * priority a deny before an allow.
 */
function byPriority(a: PermissionRule, b: PermissionRule): number {
  const priorityA = a.priority ?? 0;
  const priorityB = b.priority ?? 0;
  if (priorityA !== priorityB) return priorityB - priorityA;
  if (a.effect === "deny" && b.effect !== "deny") return -1;
  if (b.effect === "deny" && a.effect !== "deny") return 1;
  return 0;
}

function combineApplicable(
  applicable: PermissionRule[],
  algorithm: RuleCombiningAlgorithm,
): RuleEvaluation {
  if (applicable.length === 0) return { allowed: false, applicable: [] };

  if (algorithm === "deny-overrides") {
    const deny = applicable.find((rule) => rule.effect === "deny");
    if (deny) return { allowed: false, matchedRule: deny, applicable };
    return { allowed: true, matchedRule: applicable[0], applicable };
  }

  const top = [...applicable].sort(byPriority)[0]!;
  return { allowed: top.effect === "allow", matchedRule: top, applicable };
}

/**
 * Evaluate a set of rules against a target permission.
 *
 * A rule with a condition applies only when that condition returns `true`,
 * which is what makes ABAC work: `{ effect: "allow", condition: isOwner() }`
 * has to mean "owners may", not "anyone may". Conditions are async, so this
 * function is too.
 *
 * A condition that cannot be evaluated fails closed, and what "closed" means
 * depends on the rule's effect. An allow whose condition throws, or that has
 * a condition but no context, does not apply. A *deny* in the same position
 * does apply: treating it as unmet dropped the deny and let the role's allow
 * win, so a missing resource or a blocklist service that was down granted
 * the very access the deny existed to refuse.
 *
 * A deny also applies when its patterns merely overlap a wildcard target —
 * `can(actor, "post:*")` is refused by a deny on `post:delete`.
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
    if (!ruleBearsOn(rule, target)) continue;

    if (rule.condition) {
      const failClosed = rule.effect === "deny";
      if (!context) {
        if (failClosed) applicable.push(rule);
        continue;
      }
      let met: boolean;
      try {
        met = await rule.condition(context);
      } catch (error) {
        options?.onConditionError?.(rule, error);
        met = failClosed;
      }
      if (!met) continue;
    }

    applicable.push(rule);
  }

  return combineApplicable(applicable, algorithm);
}

/**
 * Evaluate rules that carry no conditions.
 *
 * Synchronous, for callers that build their own condition-free rule sets.
 * A conditional rule cannot be evaluated without awaiting it — use
 * {@link evaluateRules} for those — so it fails closed the same way an
 * unevaluable condition does there: a conditional allow is skipped, and a
 * conditional deny applies.
 */
export function evaluateRulesSync(
  rules: readonly PermissionRule[],
  target: Permission,
  options?: { readonly algorithm?: RuleCombiningAlgorithm },
): RuleEvaluation {
  const algorithm = options?.algorithm ?? "deny-overrides";
  const applicable = rules.filter(
    (rule) =>
      ruleBearsOn(rule, target) &&
      (rule.condition === undefined || rule.effect === "deny"),
  );
  return combineApplicable(applicable, algorithm);
}
