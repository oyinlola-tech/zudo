/**
 * Feature flag evaluator.
 *
 * Runs rules in order against a context and produces a structured evaluation result.
 *
 * @module evaluator/evaluator
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";
import type {
  FeatureFlagEvaluation,
  FeatureFlagEvaluationReason,
} from "../featureFlagTypes/featureFlagEvaluation.js";
import type { FeatureFlagRule } from "../featureFlagTypes/featureFlagRule/featureFlagRule.type.js";
import { evaluateRule } from "./evaluatorRule.core.js";
import { gateReason, offValueOf } from "./evaluatorGate.core.js";

/** Options for {@link evaluateFlag}. */
export interface EvaluateFlagOptions {
  /**
   * Whether the flag's declared dependencies have been resolved and are all
   * enabled.
   *
   * `evaluateFlag` has no registry and cannot resolve a dependency itself, so
   * it defaults to `false` and returns `dependency_disabled` — the safe
   * answer for a flag whose preconditions are unknown. The caller that *can*
   * resolve them (`createFeatureFlags`) passes `true` once it has.
   */
  readonly dependenciesSatisfied?: boolean;
}

/** The evaluation reason a matching rule of each type produces. */
function reasonFor(type: FeatureFlagRule["type"]): FeatureFlagEvaluationReason {
  switch (type) {
    case "percentage":
      return "percentage_rollout";
    case "variant":
      return "variant_assignment";
    case "static":
      return "static";
    case "user":
    case "tenant":
      // Explicit targeting, which is what `target_match` is for — it was a
      // declared reason nothing ever produced.
      return "target_match";
    default:
      return "rule_match";
  }
}

/**
 * Evaluate a feature flag against a context.
 *
 * A flag that is off — killed, draft, archived, expired, or blocked by a
 * dependency — serves its off value (see {@link offValueOf}): `offValue`
 * when declared, else `false` for a boolean flag, else `defaultValue`.
 *
 * @param flag - The feature flag definition.
 * @param context - The evaluation context.
 * @param options - Facts the caller resolved that this function cannot.
 * @returns A structured evaluation result.
 */
export function evaluateFlag<
  TValue extends FeatureFlagValue = FeatureFlagValue,
>(
  flag: FeatureFlag,
  context: FeatureFlagContext = {},
  options: EvaluateFlagOptions = {},
): FeatureFlagEvaluation<TValue> {
  const gate = gateReason(flag, options);
  if (gate) {
    return {
      key: flag.key,
      value: offValueOf(flag) as TValue,
      reason: gate,
      defaulted: true,
    };
  }

  if (!flag.rules || flag.rules.length === 0) {
    return {
      key: flag.key,
      value: flag.defaultValue as TValue,
      reason: "default",
      defaulted: true,
    };
  }

  for (let i = 0; i < flag.rules.length; i++) {
    const rule = flag.rules[i]!;
    // An attribute rule with no `result` serves `true`, which is only a
    // value of a boolean flag. On any other flag it is skipped, rather than
    // handing `get<string>()` a boolean.
    if (
      rule.type === "attribute" &&
      rule.result === undefined &&
      typeof flag.defaultValue !== "boolean"
    ) {
      continue;
    }
    const result = evaluateRule(rule, context, flag.key);

    if (result.matched) {
      const reason: FeatureFlagEvaluationReason = reasonFor(rule.type);

      return {
        key: flag.key,
        value: (result.value ?? flag.defaultValue) as TValue,
        reason,
        matchedRule: i,
        variant: result.variant,
        defaulted: false,
      };
    }
  }

  return {
    key: flag.key,
    value: flag.defaultValue as TValue,
    reason: "default",
    defaulted: true,
  };
}
