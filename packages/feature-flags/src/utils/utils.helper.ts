/**
 * Utility helpers for feature flags.
 *
 * @module utils/utils
 */

import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";

/**
 * `isPlainObject` is owned by `@zudojs/types` and re-exported here so the
 * existing public export keeps working (and is the same function).
 *
 * @deprecated Import `isPlainObject` from `@zudojs/types`.
 */
export { isPlainObject } from "@zudojs/types";

/**
 * Check if two feature flag values are equal.
 */
export function valuesEqual(a: FeatureFlagValue, b: FeatureFlagValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
