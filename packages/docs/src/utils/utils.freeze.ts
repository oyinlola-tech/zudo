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
 * untouched. Falls back to a recursive copy of plain objects, arrays and
 * Dates when the value cannot be structurally cloned (e.g. contains
 * functions); those are kept by reference.
 */
export function deepFreezeClone<T>(value: T): T {
  let copy: T;

  try {
    copy = structuredClone(value);
  } catch {
    copy = deepCopy(value, new WeakMap<object, unknown>());
  }

  return deepFreeze(copy);
}

/**
 * Recursive fallback for values `structuredClone` rejects. A shallow copy
 * was not enough: `deepFreeze` then walked into the caller's nested
 * objects and froze them in place.
 */
function deepCopy<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return seen.get(value) as T;

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(deepCopy(item, seen));
    return copy as T;
  }

  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const [key, item] of Object.entries(value)) {
      copy[key] = deepCopy(item, seen);
    }
    return copy as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
