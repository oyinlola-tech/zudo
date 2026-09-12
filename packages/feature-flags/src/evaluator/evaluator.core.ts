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

/**
 * Whether an `expiresAt` lies in the past.
 *
 * The type says `Date`, but a flag loaded from JSON — which is what every
 * remote provider hands over — carries an ISO string, and `"2020-01-01" <
 * new Date()` is always `false`. A flag that had expired at the source
 * therefore never expired here. Anything `Date` can parse is honoured; a
 * value it cannot parse is treated as no expiry.
 */
function isExpired(expiresAt: unknown): boolean {
  if (expiresAt === undefined || expiresAt === null) return false;
  const time =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === "string" || typeof expiresAt === "number"
        ? new Date(expiresAt).getTime()
        : Number.NaN;
  return !Number.isNaN(time) && time < Date.now();
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
  if (!flag.enabled) {
    return {
      key: flag.key,
      value: flag.defaultValue as TValue,
      reason: "disabled",
      defaulted: true,
    };
  }

  if (flag.state === "archived" || flag.state === "draft") {
    return {
      key: flag.key,
      value: flag.defaultValue as TValue,
      reason: flag.state === "archived" ? "expired" : "disabled",
      defaulted: true,
    };
  }

  if (isExpired(flag.metadata?.expiresAt)) {
    return {
      key: flag.key,
      value: flag.defaultValue as TValue,
      reason: "expired",
      defaulted: true,
    };
  }

  if (
    flag.dependencies &&
    flag.dependencies.length > 0 &&
    options.dependenciesSatisfied !== true
  ) {
    // Previously this returned `dependency_disabled` for *every* flag that
    // declared a dependency, satisfied or not — so a flag with dependencies
    // could never turn on, and the caller's own dependency resolution was
    // computed and then discarded.
    return {
      key: flag.key,
      value: flag.defaultValue as TValue,
      reason: "dependency_disabled",
      matchedRule: undefined,
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
