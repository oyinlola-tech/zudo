/**
 * @zudojs/validation — Depth checking.
 *
 * Computes and validates the nesting depth of object graphs
 * to prevent stack overflows from deeply nested payloads.
 */

import { SerializationDepthError } from "@zudojs/errors";
import {
  TraversalLimitError,
  traverse,
} from "./validationConstraints.traverse.js";

/**
 * Hard ceiling on how deep {@link getSerializationDepth} will descend.
 *
 * The measurement itself is recursive, so it needs a bound of its own: a guard
 * that overflows the stack on the input it was checking protects nothing.
 */
export const MAX_MEASURABLE_DEPTH = 512;

/**
 * Compute the maximum nesting depth of a value.
 *
 * Primitives return 0. Arrays and objects return 1 + the maximum
 * depth of their children. Cycles are not followed.
 *
 * @param value - The value to measure.
 * @param limit - Stop measuring beyond this depth. Defaults to
 *   {@link MAX_MEASURABLE_DEPTH}; the limit itself is returned when reached.
 * @returns The observed depth, capped at `limit`.
 */
export function getSerializationDepth(
  value: unknown,
  limit: number = MAX_MEASURABLE_DEPTH,
): number {
  try {
    return traverse(value, { maxDepth: limit }).depth;
  } catch (error) {
    if (error instanceof TraversalLimitError) return limit;
    throw error;
  }
}

/**
 * Assert that a value does not exceed the maximum allowed depth.
 *
 * Stops descending the moment the limit is passed, so the cost of the check is
 * bounded by `maxDepth` rather than by the size of the input.
 *
 * @param value - The value to check.
 * @param maxDepth - Maximum permitted nesting depth.
 * @throws {SerializationDepthError} when depth exceeds the limit.
 */
export function assertDepthWithinLimit(value: unknown, maxDepth: number): void {
  try {
    traverse(value, { maxDepth });
  } catch (error) {
    if (error instanceof TraversalLimitError && error.halt === "depth") {
      throw new SerializationDepthError(error.observed, maxDepth);
    }
    throw error;
  }
}
