/**
 * @zudojs/validation — Circular reference detection.
 *
 * Detects circular references in object graphs before serialization
 * or validation to prevent stack overflows and provide clear error messages.
 */

import { CircularReferenceError } from "@zudojs/errors";
import { MAX_MEASURABLE_DEPTH } from "./validationConstraints.depth.js";
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
      throw new CircularReferenceError(
        `${error.path} (exceeded ${maxDepth} levels)`,
      );
    }
    throw error;
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
