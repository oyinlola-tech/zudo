/**
 * @zudojs/validation — Size checking.
 *
 * Estimates serialized payload size to prevent memory exhaustion
 * from excessively large payloads.
 */

import { SerializationPayloadTooLargeError } from "@zudojs/errors";
import { MAX_MEASURABLE_DEPTH } from "./validationConstraints.depth.js";
import {
  TraversalLimitError,
  traverse,
} from "./validationConstraints.traverse.js";

/** Bytes charged for a single node, excluding its children. */
function chargeFor(value: unknown): number {
  if (value === null || value === undefined) return 4;

  switch (typeof value) {
    case "string":
      return value.length * 2 + 2;
    case "number":
      // JSON emits up to 21 characters for a double; charge the worst case
      // rather than a flat 8, which under-counted every numeric field.
      return 21;
    case "boolean":
      return 5;
    case "bigint":
      return value.toString().length + 2;
    case "symbol":
    case "function":
      return 0;
  }

  if (ArrayBuffer.isView(value)) return (value as ArrayBufferView).byteLength;
  if (value instanceof Date) return 26;
  if (value instanceof RegExp) return value.source.length + 4;

  if (Array.isArray(value)) return 2 + Math.max(0, value.length - 1);
  if (value instanceof Map) return 2 + Math.max(0, value.size * 3 - 1);
  if (value instanceof Set) return 2 + Math.max(0, value.size - 1);

  const keys = Object.keys(value as Record<string, unknown>);
  return (
    2 +
    keys.reduce((total, key) => total + key.length + 4, 0) +
    Math.max(0, keys.length - 1)
  );
}

/**
 * Estimate the byte size of a value as JSON without allocating a string.
 *
 * A value referenced from several places is charged once per occurrence, the
 * way a serializer expands it. Counting it once let a compact payload built
 * from shared subtrees estimate at a few hundred bytes while serializing to
 * hundreds of megabytes.
 *
 * @param value - The value to measure.
 * @param maxBytes - Stop counting past this budget; the budget is returned.
 * @returns The estimated serialized size in bytes.
 */
export function estimateSerializedSize(
  value: unknown,
  maxBytes: number = Number.POSITIVE_INFINITY,
): number {
  try {
    return traverse(value, {
      maxDepth: MAX_MEASURABLE_DEPTH,
      maxCost: maxBytes,
      charge: chargeFor,
    }).cost;
  } catch (error) {
    if (error instanceof TraversalLimitError) {
      return error.halt === "budget" ? error.observed : maxBytes;
    }
    throw error;
  }
}

/**
 * Assert that a value's estimated serialized size is within limits.
 *
 * Aborts as soon as the budget is passed, so an oversized payload is rejected
 * without first being measured in full.
 *
 * @param value - The value to check.
 * @param maxSize - Maximum permitted size in bytes.
 * @throws {SerializationPayloadTooLargeError} when the estimate exceeds maxSize.
 */
export function assertSizeWithinLimit(value: unknown, maxSize: number): void {
  try {
    traverse(value, {
      maxDepth: MAX_MEASURABLE_DEPTH,
      maxCost: maxSize,
      charge: chargeFor,
    });
  } catch (error) {
    if (error instanceof TraversalLimitError && error.halt === "budget") {
      throw new SerializationPayloadTooLargeError(error.observed, maxSize);
    }
    if (error instanceof TraversalLimitError && error.halt === "depth") {
      throw new SerializationPayloadTooLargeError(error.observed, maxSize);
    }
    throw error;
  }
}
