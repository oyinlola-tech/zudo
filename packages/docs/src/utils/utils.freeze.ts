/**
 * Deep-freeze helpers for immutable value objects.
 */

/**
 * Recursively freezes a value in place. Cycles are tolerated.
 * Only plain objects and arrays are traversed; class instances such
 * as `Date` are frozen but not walked.
 */
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) deepFreeze(item, seen);
  }

  return Object.freeze(value);
}

/**
 * Returns a deep-frozen copy of `value`, leaving the caller's object
 * untouched. Falls back to freezing a shallow copy when the value
 * cannot be structurally cloned (e.g. contains functions).
 */
export function deepFreezeClone<T>(value: T): T {
  let copy: T;

  try {
    copy = structuredClone(value);
  } catch {
    copy = shallowCopy(value);
  }

  return deepFreeze(copy);
}

function shallowCopy<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;
  if (isPlainObject(value)) return { ...value } as T;
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
