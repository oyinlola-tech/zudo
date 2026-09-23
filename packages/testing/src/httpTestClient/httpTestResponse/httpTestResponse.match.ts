/**
 * @zudojs/testing — partial structural matching for response bodies.
 *
 * Plain objects match when every expected key matches (extra keys in the
 * actual value are ignored), arrays match element-wise with equal length,
 * and everything else is compared with the package's structural equality.
 */

import { isPlainObject } from "@zudojs/types";

import { describeValue, findDifference } from "../../assertions/index.js";
import type { Difference } from "../../assertions/index.js";

function matchArray(
  actual: unknown,
  expected: readonly unknown[],
  path: string,
): Difference | undefined {
  if (!Array.isArray(actual)) {
    return { path, reason: `expected an array, got ${describeValue(actual)}` };
  }
  if (actual.length !== expected.length) {
    return {
      path,
      reason: `expected ${expected.length} items, got ${actual.length}`,
    };
  }
  for (let index = 0; index < expected.length; index++) {
    const found = findPartialDifference(
      actual[index],
      expected[index],
      `${path}[${index}]`,
    );
    if (found) return found;
  }
  return undefined;
}

/**
 * Finds the first place `actual` fails to contain `expected`.
 *
 * @returns The mismatch, or `undefined` when `actual` matches.
 */
export function findPartialDifference(
  actual: unknown,
  expected: unknown,
  path = "body",
): Difference | undefined {
  if (Array.isArray(expected)) {
    return matchArray(actual, expected, path);
  }
  if (!isPlainObject(expected)) {
    return findDifference(actual, expected, path);
  }
  if (!isPlainObject(actual)) {
    return { path, reason: `expected an object, got ${describeValue(actual)}` };
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual) && value !== undefined) {
      return { path: `${path}.${key}`, reason: "missing" };
    }
    const found = findPartialDifference(actual[key], value, `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}
