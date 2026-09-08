/**
 * @zudojs/validation — Size checking.
 *
 * Estimates serialized payload size to prevent memory exhaustion
 * from excessively large payloads.
 */

import { SerializationPayloadTooLargeError } from "@zudojs/errors";

/**
 * Estimate the byte size of a value as JSON without allocating a string.
 *
 * Uses a recursive walk heuristic — accurate enough for limit checking
 * without the overhead of actual serialization.
 */
export function estimateSerializedSize(
  value: unknown,
  seen?: WeakSet<object>,
): number {
  if (value === null || value === undefined) return 4;

  switch (typeof value) {
    case "string":
      return value.length * 2 + 2;
    case "number":
      return 8;
    case "boolean":
      return 4;
    case "bigint":
      return value.toString().length + 2;
    case "symbol":
      return 0;
    case "function":
      return 0;
  }

  const tracker = seen ?? new WeakSet<object>();
  if (tracker.has(value as object)) return 0;
  tracker.add(value as object);

  if (ArrayBuffer.isView(value)) {
    return (value as ArrayBufferView).byteLength;
  }

  if (Array.isArray(value)) {
    let total = 2;
    for (const item of value) {
      total += estimateSerializedSize(item, tracker) + 1;
    }
    return total;
  }

  if (value instanceof Date) return 24;
  if (value instanceof RegExp) return 20;

  if (value instanceof Map) {
    let total = 0;
    for (const [k, v] of value) {
      total +=
        estimateSerializedSize(k, tracker) + estimateSerializedSize(v, tracker);
    }
    return total;
  }

  if (value instanceof Set) {
    let total = 0;
    for (const v of value) {
      total += estimateSerializedSize(v, tracker);
    }
    return total;
  }

  let total = 2;
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    total += key.length + 3 + estimateSerializedSize(obj[key], tracker);
  }
  return total;
}

/**
 * Assert that a value's estimated serialized size is within limits.
 *
 * @throws {SerializationPayloadTooLargeError} when the estimate exceeds maxSize.
 */
export function assertSizeWithinLimit(value: unknown, maxSize: number): void {
  const size = estimateSerializedSize(value);
  if (size > maxSize) {
    throw new SerializationPayloadTooLargeError(size, maxSize);
  }
}
