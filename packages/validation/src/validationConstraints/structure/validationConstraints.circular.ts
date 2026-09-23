/**
 * @zudojs/validation — Circular reference detection.
 *
 * Detects circular references in object graphs before serialization
 * or validation to prevent stack overflows and provide clear error messages.
 */

import {
  CircularReferenceError,
  SerializationDepthError,
} from "@zudojs/errors";
import {
  MAX_MEASURABLE_DEPTH,
  UNTRUSTED_DEPTH_ERROR,
} from "./validationConstraints.depth.js";
import {
  TraversalLimitError,
  traverse,
} from "./validationConstraints.traverse.js";

/**
 * Detect circular references in a value graph.
 *
 * Only a value that references *itself* through the current path is a cycle.
 * The same object appearing twice in sibling positions is an ordinary shared
 * reference and is allowed: rejecting it turned away every valid payload that
 * reused a config object or a lookup record.
 *
 * @param value - The value to check for circular references.
 * @param path - Current traversal path for error reporting.
 * @param maxDepth - Depth ceiling, so a deep graph cannot exhaust the stack
 *   before a cycle is reported.
 * @throws {CircularReferenceError} on the first cycle found.
 * @throws {SerializationDepthError} when the graph is deeper than `maxDepth`
 *   (a 400 with `expose: true`, like `assertDepthWithinLimit`).
 *   Running out of depth is not evidence of a cycle, and reporting it as one
 *   told callers a payload referenced itself when it merely nested too far.
 */
export function assertNoCircularReference(
  value: unknown,
  path = "root",
  maxDepth: number = MAX_MEASURABLE_DEPTH,
): void {
  try {
    traverse(value, { maxDepth, failOnCycle: true }, path);
  } catch (error) {
    if (error instanceof TraversalLimitError && error.halt === "cycle") {
      throw new CircularReferenceError(error.path);
    }
    if (error instanceof TraversalLimitError && error.halt === "depth") {
      throw new SerializationDepthError(
        error.observed,
        maxDepth,
        UNTRUSTED_DEPTH_ERROR,
      );
    }
    throw error;
  }
}

/**
 * Check whether a value contains circular references.
 *
 * Returns true if a cycle is found, false otherwise. A graph too deep to walk
 * within the measurable ceiling reports false: no cycle was found, and the
 * depth is the caller's own `assertDepthWithinLimit` to report.
 *
 * Does not throw — use assertNoCircularReference for throwing behavior.
 */
export function hasCircularReference(value: unknown): boolean {
  try {
    assertNoCircularReference(value);
    return false;
  } catch (error) {
    if (error instanceof CircularReferenceError) return true;
    if (error instanceof SerializationDepthError) return false;
    throw error;
  }
}
