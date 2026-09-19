/**
 * Dependency satisfaction for feature flags.
 *
 * @module featureFlags/featureFlags.dependency
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagEvaluation } from "../featureFlagTypes/featureFlagEvaluation.js";
import type { FeatureFlagRegistry } from "../registry/registry.core.js";
import { evaluateFlag } from "../evaluator/evaluator.core.js";

/** Reasons that mean the prerequisite is off, whatever its value. */
const GATED = new Set<FeatureFlagEvaluation["reason"]>([
  "disabled",
  "expired",
  "dependency_disabled",
  "not_found",
  "error",
]);

/**
 * Whether a prerequisite's evaluation counts as "on" for this context.
 *
 * It must not be gated (disabled, archived, draft, expired, or blocked by its
 * own dependencies) and must not evaluate to `false`, `null` or `undefined`.
 * A percentage rollout the subject is outside of evaluates to the default,
 * typically `false`, so the dependent flag stays off for that subject too.
 */
export function isDependencyOn(evaluation: FeatureFlagEvaluation): boolean {
  if (GATED.has(evaluation.reason)) return false;
  return (
    evaluation.value !== false &&
    evaluation.value !== null &&
    evaluation.value !== undefined
  );
}

/**
 * Whether every dependency of a flag is on for a context.
 *
 * Each prerequisite is *evaluated* — state, expiry, rules and rollout — for
 * the same context, recursively. Checking only its kill switch let a flag
 * turn on for users who could not have the feature it needs: an archived or
 * expired prerequisite, or one rolled out to someone else.
 *
 * @param flag - The dependent flag.
 * @param registry - Where prerequisites are looked up.
 * @param context - The evaluation context.
 * @param chain - Keys on the current path, for cycle detection.
 * @param memo - Results for this context, so a diamond is walked once.
 */
export function dependenciesOn(
  flag: FeatureFlag,
  registry: FeatureFlagRegistry,
  context: FeatureFlagContext,
  chain: Set<string> = new Set([flag.key]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  for (const key of flag.dependencies ?? []) {
    const known = memo.get(key);
    if (known !== undefined) {
      if (!known) return false;
      continue;
    }
    if (chain.has(key)) return false;

    const dependency = registry.get(key);
    let on = false;
    if (dependency) {
      chain.add(key);
      try {
        const inner = dependenciesOn(dependency, registry, context, chain, memo);
        on = isDependencyOn(
          evaluateFlag(dependency, context, { dependenciesSatisfied: inner }),
        );
      } finally {
        chain.delete(key);
      }
    }
    memo.set(key, on);
    if (!on) return false;
  }
  return true;
}
