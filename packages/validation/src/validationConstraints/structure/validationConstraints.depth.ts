/**
 * @zudojs/validation — Depth checking.
 *
 * Computes and validates the nesting depth of object graphs
 * to prevent stack overflows from deeply nested payloads.
 */

import { SerializationDepthError } from "@zudojs/errors";

/**
 * Compute the maximum nesting depth of a value.
 *
 * Primitives return 0. Arrays and objects return 1 + the maximum
 * depth of their children.
 */
export function getSerializationDepth(
  value: unknown,
  currentDepth = 0,
): number {
  if (value === null || value === undefined) return currentDepth;

  if (typeof value !== "object") return currentDepth;

  if (ArrayBuffer.isView(value)) return currentDepth;

  if (Array.isArray(value)) {
    let maxChild = currentDepth;
    for (const item of value) {
      const childDepth = getSerializationDepth(item, currentDepth + 1);
      if (childDepth > maxChild) maxChild = childDepth;
    }
    return maxChild;
  }

  if (value instanceof Map) {
    let maxChild = currentDepth;
    for (const [k, v] of value) {
      const keyDepth = getSerializationDepth(k, currentDepth + 1);
      const valDepth = getSerializationDepth(v, currentDepth + 1);
      const localMax = keyDepth > valDepth ? keyDepth : valDepth;
      if (localMax > maxChild) maxChild = localMax;
    }
    return maxChild;
  }

  if (value instanceof Set) {
    let maxChild = currentDepth;
    for (const v of value) {
      const childDepth = getSerializationDepth(v, currentDepth + 1);
      if (childDepth > maxChild) maxChild = childDepth;
    }
    return maxChild;
  }

  let maxChild = currentDepth;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const childDepth = getSerializationDepth(obj[key], currentDepth + 1);
    if (childDepth > maxChild) maxChild = childDepth;
  }
  return maxChild;
}

/**
 * Assert that a value does not exceed the maximum allowed depth.
 *
 * @throws {SerializationDepthError} when depth exceeds the limit.
 */
export function assertDepthWithinLimit(value: unknown, maxDepth: number): void {
  const depth = getSerializationDepth(value);
  if (depth > maxDepth) {
    throw new SerializationDepthError(depth, maxDepth);
  }
}
