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
 *
 * The comparison is structural, not `JSON.stringify`: key order does not
 * matter, a key whose value is `undefined` is not the same as an absent key,
 * and a self-referencing value is compared instead of throwing. Arrays match
 * element-wise, `Date`s by instant, and `NaN` equals `NaN`. Any other class
 * instance (Map, Set, RegExp, …) matches only by reference.
 *
 * `@zudojs/types` owns the shared type guards but has no deep-equality helper,
 * so the walk lives here rather than pulling in a new dependency.
 */
export function valuesEqual(a: FeatureFlagValue, b: FeatureFlagValue): boolean {
  return deepEqual(a, b, new Map<object, Set<object>>());
}

function deepEqual(
  a: unknown,
  b: unknown,
  seen: Map<object, Set<object>>,
): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;

  // A pair already on the comparison stack is assumed equal: the cycle it
  // closes is only reached through positions that matched.
  const pending = seen.get(a);
  if (pending?.has(b) === true) return true;
  if (pending) pending.add(b);
  else seen.set(a, new Set([b]));

  try {
    return deepEqualObjects(a, b, seen);
  } finally {
    seen.get(a)?.delete(b);
  }
}

function deepEqualObjects(
  a: object,
  b: object,
  seen: Map<object, Set<object>>,
): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index], seen));
  }

  if (!isComparableObject(a) || !isComparableObject(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  const other = b as Record<string, unknown>;
  return aKeys.every(
    (key) =>
      Object.hasOwn(other, key) &&
      deepEqual((a as Record<string, unknown>)[key], other[key], seen),
  );
}

/** Plain objects and null-prototype records; anything else compares by reference. */
function isComparableObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}
