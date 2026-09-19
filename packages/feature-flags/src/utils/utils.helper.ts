/**
 * Utility helpers for feature flags.
 *
 * @module utils/utils
 */

import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";

/**
 * Check if a value is a plain object: created by `{}` / `Object.create(null)`,
 * not an array, a `Date`, a `Map` or any other class instance.
 *
 * Same semantics as `isPlainObject` in `@zudojs/types`, which owns it; this
 * copy used to answer `true` for a `Date` or a `Map`.
 *
 * @deprecated Import `isPlainObject` from `@zudojs/types`. This re-implementation
 *   is kept only so the public export does not disappear; it will become a
 *   re-export once `@zudojs/types` is a dependency of this package.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

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
