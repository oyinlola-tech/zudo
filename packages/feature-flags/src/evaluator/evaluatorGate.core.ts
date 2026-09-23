/**
 * Gates that turn a flag off before any rule runs, and the value it serves
 * while it is off.
 *
 * @module evaluator/evaluatorGate.core
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";
import type { FeatureFlagEvaluationReason } from "../featureFlagTypes/featureFlagEvaluation.js";
import type { EvaluateFlagOptions } from "./evaluator.core.js";

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

/**
 * Why a flag is off before any rule runs, or `undefined` when it is live.
 *
 * Checked in order: the kill switch (`enabled: false`, `state: "disabled"`),
 * a draft, an archived or expired flag, then unsatisfied dependencies.
 */
export function gateReason(
  flag: FeatureFlag,
  options: EvaluateFlagOptions,
): FeatureFlagEvaluationReason | undefined {
  if (!flag.enabled || flag.state === "disabled" || flag.state === "draft") {
    return "disabled";
  }
  if (flag.state === "archived" || isExpired(flag.metadata?.expiresAt)) {
    return "expired";
  }
  const hasDependencies = !!flag.dependencies && flag.dependencies.length > 0;
  if (hasDependencies && options.dependenciesSatisfied !== true) {
    return "dependency_disabled";
  }
  return undefined;
}

/**
 * Resolve what a flag serves when it is off — killed (`enabled: false` or
 * `state: "disabled"`), a draft, archived, expired, or blocked by a
 * dependency.
 *
 * 1. `flag.offValue`, when the flag declares one.
 * 2. `false`, for a boolean flag. The kill switch must turn a feature off,
 *    and serving `defaultValue: true` from a killed flag left it on.
 * 3. `flag.defaultValue` otherwise. A string, number or object flag has no
 *    natural "off", so the declared default — the baseline experience — is
 *    the fallback. `isEnabled()` is `false` for these regardless, because it
 *    is `true` only for the boolean `true`.
 *
 * @param flag - The flag that is off.
 * @returns The value to serve.
 */
export function offValueOf(flag: FeatureFlag): FeatureFlagValue {
  if (flag.offValue !== undefined) return flag.offValue;
  if (typeof flag.defaultValue === "boolean") return false;
  return flag.defaultValue;
}
