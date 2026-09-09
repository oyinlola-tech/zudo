/**
 * Rule evaluator for feature flags.
 *
 * Evaluates a single rule against an evaluation context.
 *
 * @module evaluator/evaluatorRule
 */

import type { FeatureFlagRule } from "../featureFlagTypes/featureFlagRule/featureFlagRule.type.js";
import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";
import { getBucket, isInRollout } from "../rollout/rolloutBucketing.js";
import { matchAttribute, resolvePath } from "./evaluatorAttribute.js";

/** Bucket resolution for variant assignment — 0.01% precision. */
const VARIANT_BUCKETS = 10_000;

/** Result of evaluating a single rule. */
export interface RuleEvaluationResult {
  /** Whether the rule matched. */
  readonly matched: boolean;
  /** The value to return if matched. */
  readonly value?: FeatureFlagValue;
  /** The variant key if a variant rule matched. */
  readonly variant?: string;
}

/**
 * Evaluate a single feature flag rule against a context.
 *
 * @param rule - The rule to evaluate.
 * @param context - The evaluation context.
 * @param flagKey - The flag key (used for percentage bucketing).
 * @returns The evaluation result.
 */
export function evaluateRule(
  rule: FeatureFlagRule,
  context: FeatureFlagContext,
  flagKey: string,
): RuleEvaluationResult {
  switch (rule.type) {
    case "static":
      return { matched: true, value: rule.value };

    case "user": {
      if (!context.userId) return { matched: false };
      const matched = rule.users.includes(context.userId);
      return { matched, value: matched ? rule.value : undefined };
    }

    case "tenant": {
      if (!context.tenantId) return { matched: false };
      const matched = rule.tenants.includes(context.tenantId);
      return { matched, value: matched ? rule.value : undefined };
    }

    case "attribute": {
      let actual = resolvePath(context, rule.attribute);
      if (actual === undefined && context.attributes) {
        actual = resolvePath(context.attributes, rule.attribute);
      }
      const matched = matchAttribute(actual, rule.operator, rule.value);
      return { matched, value: matched ? true : undefined };
    }

    case "percentage": {
      const subject =
        context.userId ?? context.tenantId ?? context.sessionId ?? "anonymous";
      const matched = isInRollout(flagKey, subject, rule.percentage);
      return { matched, value: matched ? rule.value : undefined };
    }

    case "schedule": {
      const start = new Date(rule.startAt).getTime();
      const end = new Date(rule.endAt).getTime();
      // An unparseable date yields NaN, and every comparison against NaN is
      // false — which happens to fail closed, but only by accident. Say so.
      if (Number.isNaN(start) || Number.isNaN(end)) return { matched: false };
      const now = Date.now();
      const matched = now >= start && now <= end;
      return { matched, value: matched ? rule.value : undefined };
    }

    case "variant": {
      const subject =
        context.userId ?? context.tenantId ?? context.sessionId ?? "anonymous";

      // Negative or non-finite weights would make the cumulative walk
      // non-monotonic, shifting every downstream variant's band, so they are
      // treated as zero.
      const weighted = rule.variants.map((variant) => ({
        key: variant.key,
        weight:
          Number.isFinite(variant.weight) && variant.weight > 0
            ? variant.weight
            : 0,
      }));
      const totalWeight = weighted.reduce(
        (sum, entry) => sum + entry.weight,
        0,
      );
      if (totalWeight <= 0) return { matched: false };

      // The real bucket for this (flag, subject) pair. This used to be
      // `isInRollout(flagKey, subject, 100) ? 99 : 0`, which is always 99 —
      // so every subject landed in the last variant and the weights did
      // nothing at all.
      const bucket = getBucket(flagKey, subject, VARIANT_BUCKETS);
      let cumulative = 0;

      for (const entry of weighted) {
        cumulative += (entry.weight / totalWeight) * VARIANT_BUCKETS;
        if (bucket < cumulative) {
          return { matched: true, value: entry.key, variant: entry.key };
        }
      }

      // Floating-point rounding can leave the last bucket just past the
      // cumulative total; the final weighted variant owns it.
      const positive = weighted.filter((entry) => entry.weight > 0);
      const last = positive[positive.length - 1];
      if (last) return { matched: true, value: last.key, variant: last.key };

      return { matched: false };
    }

    default:
      return { matched: false };
  }
}
