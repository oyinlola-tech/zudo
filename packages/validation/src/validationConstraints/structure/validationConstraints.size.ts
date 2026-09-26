/**
 * @zudojs/validation — Size checking.
 *
 * Estimates serialized payload size to prevent memory exhaustion
 * from excessively large payloads.
 */

import { SerializationLimits } from "@zudojs/constants";
import { SerializationPayloadTooLargeError } from "@zudojs/errors";
import { jsonStringByteLength } from "@zudojs/types";
import { MAX_MEASURABLE_DEPTH } from "./validationConstraints.depth.js";
import {
  TraversalLimitError,
  traverse,
} from "./validationConstraints.traverse.js";

/**
 * Bytes charged for a single node, excluding its children.
 *
 * Strings are charged their UTF-8 size as JSON writes them (quotes and
 * escapes included). The previous `length * 2` was the UTF-16 size, which
 * undercounts every character above U+07FF: a thousand "₦" estimated at
 * 2,013 bytes against 3,002 on the wire, so `assertSizeWithinLimit` let
 * bodies half again larger than the limit through.
 */
function chargeFor(value: unknown): number {
  if (value === null || value === undefined) return 4;

  switch (typeof value) {
    case "string":
      return jsonStringByteLength(value);
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
    keys.reduce((total, key) => total + jsonStringByteLength(key) + 2, 0) +
    Math.max(0, keys.length - 1)
  );
}

/**
 * What `JSON.stringify` will actually write for a node: the result of its
 * `toJSON()` when it has one. Measuring the object's own keys instead let a
 * class whose `toJSON` returns megabytes estimate at a dozen bytes. Dates and
 * binary views keep their existing flat and byte-length charges.
 */
function resolveToJson(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    value instanceof Date ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  return typeof toJSON === "function"
    ? (toJSON as (key: string) => unknown).call(value, "")
    : value;
}

/**
 * Estimate the byte size of a value as JSON without allocating a string.
 *
 * The estimate is meant to sit at or above the real UTF-8 size: strings are
 * measured exactly, numbers are charged their worst case, and containers
 * their punctuation.
 *
 * A value referenced from several places is charged once per occurrence, the
 * way a serializer expands it. Counting it once let a compact payload built
 * from shared subtrees estimate at a few hundred bytes while serializing to
 * hundreds of megabytes.
 *
 * Charging every occurrence means the subtree memo that keeps the walk linear
 * has to be off, so the budget is the only thing that bounds the work: `n`
 * shared `{a:node,b:node}` pairs expand to `2^n` visits. The default budget is
 * therefore finite — {@link SerializationLimits.MAX_SIZE} — rather than
 * `Infinity`, which left an untrusted 1 KB payload able to burn minutes of CPU.
 * Pass an explicit `Infinity` only for input you trust.
 *
 * @param value - The value to measure.
 * @param maxBytes - Stop counting past this budget; the budget is returned.
 *   Defaults to {@link SerializationLimits.MAX_SIZE}.
 * @returns The estimated serialized size in bytes.
 */
export function estimateSerializedSize(
  value: unknown,
  maxBytes: number = SerializationLimits.MAX_SIZE,
): number {
  try {
    return traverse(value, {
      maxDepth: MAX_MEASURABLE_DEPTH,
      maxCost: maxBytes,
      charge: chargeFor,
      resolve: resolveToJson,
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
      resolve: resolveToJson,
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
