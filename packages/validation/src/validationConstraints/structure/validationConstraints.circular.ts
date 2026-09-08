/**
 * @zudojs/validation — Circular reference detection.
 *
 * Detects circular references in object graphs before serialization
 * or validation to prevent stack overflows and provide clear error messages.
 */

import { CircularReferenceError } from "@zudojs/errors";

/**
 * Detect circular references in a value graph.
 *
 * Uses a WeakSet to track visited objects without preventing GC.
 * Throws CircularReferenceError on first cycle detected.
 *
 * @param value - The value to check for circular references.
 * @param path - Current traversal path for error reporting.
 * @param seen - WeakSet tracking visited objects (internal).
 */
export function assertNoCircularReference(
  value: unknown,
  path = "root",
  seen?: WeakSet<object>,
): void {
  if (typeof value !== "object" || value === null) return;

  const tracker = seen ?? new WeakSet<object>();

  if (tracker.has(value as object)) {
    throw new CircularReferenceError(path);
  }

  tracker.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoCircularReference(value[i], `${path}[${i}]`, tracker);
    }
    return;
  }

  if (value instanceof Map) {
    let i = 0;
    for (const [k, v] of value) {
      assertNoCircularReference(k, `${path}.key(${i})`, tracker);
      assertNoCircularReference(v, `${path}[${String(k)}]`, tracker);
      i++;
    }
    return;
  }

  if (value instanceof Set) {
    let i = 0;
    for (const v of value) {
      assertNoCircularReference(v, `${path}.item(${i})`, tracker);
      i++;
    }
    return;
  }

  if (ArrayBuffer.isView(value)) return;

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    assertNoCircularReference(obj[key], `${path}.${key}`, tracker);
  }
}

/**
 * Check whether a value contains circular references.
 *
 * Returns true if a cycle is found, false otherwise.
 * Does not throw — use assertNoCircularReference for throwing behavior.
 */
export function hasCircularReference(value: unknown): boolean {
  try {
    assertNoCircularReference(value);
    return false;
  } catch (error) {
    if (error instanceof CircularReferenceError) return true;
    throw error;
  }
}
