/**
 * @zudojs/testing — Structural equality for assertions.
 *
 * Assertions previously compared `JSON.stringify(actual) !== JSON.stringify(expected)`,
 * which is not equality in either direction. `Map`, `Set`, functions and
 * `undefined` values all stringify to nothing, so structurally different
 * values compared equal and an assertion could not fail; key order is
 * significant, so equal values compared different; and circular or `BigInt`
 * input threw a `TypeError` out of the assertion itself.
 *
 * @module assertions/deepEqual
 */

import type { Difference } from "./deepEqual.describe.js";
import { describeValue } from "./deepEqual.describe.js";

/** The constructor-level kind of a value, used to reject cross-type matches. */
function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (ArrayBuffer.isView(value)) return "typedarray";
  return typeof value;
}

/** Finds the first structural difference between two values. */
function diff(
  actual: unknown,
  expected: unknown,
  path: string,
  seen: Map<object, object>,
): Difference | undefined {
  if (Object.is(actual, expected)) return undefined;

  const actualKind = kindOf(actual);
  const expectedKind = kindOf(expected);

  if (actualKind !== expectedKind) {
    return {
      path,
      reason: `expected ${expectedKind}, received ${actualKind}`,
    };
  }

  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime()
      ? undefined
      : {
          path,
          reason: `expected ${describeValue(expected)}, received ${describeValue(actual)}`,
        };
  }

  if (actual instanceof RegExp && expected instanceof RegExp) {
    return String(actual) === String(expected)
      ? undefined
      : { path, reason: `expected ${expected}, received ${actual}` };
  }

  if (typeof actual !== "object" || actual === null) {
    return {
      path,
      reason: `expected ${describeValue(expected)}, received ${describeValue(actual)}`,
    };
  }

  // Guard against cycles: a pair already being compared is assumed equal
  // until proven otherwise elsewhere in the walk.
  const previous = seen.get(actual);
  if (previous === (expected as object)) return undefined;
  seen.set(actual, expected as object);

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return {
        path,
        reason: `expected length ${expected.length}, received ${actual.length}`,
      };
    }
    for (let index = 0; index < actual.length; index++) {
      const found = diff(
        actual[index],
        expected[index],
        `${path}[${index}]`,
        seen,
      );
      if (found) return found;
    }
    return undefined;
  }

  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) {
      return {
        path,
        reason: `expected ${expected.size} entries, received ${actual.size}`,
      };
    }
    // Keys are matched by identity first and structurally second, so a
    // Map keyed by objects compares by value like everything else here.
    const unmatched = [...actual.keys()];
    for (const [key, value] of expected) {
      const actualKey = actual.has(key)
        ? key
        : findStructuralMatch(unmatched, key, seen);
      if (actualKey === NO_MATCH) {
        return { path, reason: `missing key ${describeValue(key)}` };
      }
      unmatched.splice(unmatched.indexOf(actualKey), 1);
      const found = diff(
        actual.get(actualKey),
        value,
        `${path}[${describeValue(key)}]`,
        seen,
      );
      if (found) return found;
    }
    return undefined;
  }

  if (actual instanceof Set && expected instanceof Set) {
    if (actual.size !== expected.size) {
      return {
        path,
        reason: `expected ${expected.size} items, received ${actual.size}`,
      };
    }
    // `Set.has` is identity-based, so two Sets holding equal but distinct
    // objects compared unequal. Each expected entry is matched against a
    // still-unmatched actual entry structurally instead.
    const unmatched = [...actual];
    for (const entry of expected) {
      const match = actual.has(entry)
        ? entry
        : findStructuralMatch(unmatched, entry, seen);
      if (match === NO_MATCH) {
        return { path, reason: `missing item ${describeValue(entry)}` };
      }
      unmatched.splice(unmatched.indexOf(match), 1);
    }
    return undefined;
  }

  if (ArrayBuffer.isView(actual) && ArrayBuffer.isView(expected)) {
    const a = new Uint8Array(
      actual.buffer,
      actual.byteOffset,
      actual.byteLength,
    );
    const b = new Uint8Array(
      expected.buffer,
      expected.byteOffset,
      expected.byteLength,
    );
    if (a.length !== b.length) {
      return {
        path,
        reason: `expected ${b.length} bytes, received ${a.length}`,
      };
    }
    for (let index = 0; index < a.length; index++) {
      if (a[index] !== b[index]) {
        return { path, reason: `bytes differ at offset ${index}` };
      }
    }
    return undefined;
  }

  const actualKeys = Object.keys(actual as Record<string, unknown>).sort();
  const expectedKeys = Object.keys(expected as Record<string, unknown>).sort();

  for (const key of expectedKeys) {
    if (!actualKeys.includes(key)) {
      return { path: `${path}.${key}`, reason: "missing from received value" };
    }
  }
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      return { path: `${path}.${key}`, reason: "unexpected in received value" };
    }
  }
  for (const key of expectedKeys) {
    const found = diff(
      (actual as Record<string, unknown>)[key],
      (expected as Record<string, unknown>)[key],
      `${path}.${key}`,
      seen,
    );
    if (found) return found;
  }

  return undefined;
}

const NO_MATCH: unique symbol = Symbol("deepEqual.noMatch");

/**
 * Finds a candidate structurally equal to `expected`. Each probe walks a
 * copy of `seen`: the cycle guard records a pair as "assumed equal" before
 * comparing it, and a probe that fails must not leave that assumption
 * behind for the next candidate.
 */
function findStructuralMatch(
  candidates: readonly unknown[],
  expected: unknown,
  seen: Map<object, object>,
): unknown {
  for (const candidate of candidates) {
    if (diff(candidate, expected, "", new Map(seen)) === undefined) {
      return candidate;
    }
  }
  return NO_MATCH;
}

/**
 * Find the first structural difference between two values.
 *
 * @param actual - The observed value.
 * @param expected - The value it should equal.
 * @param rootPath - Label for the root in the reported path.
 * @returns The first difference, or undefined when the values are equal.
 */
export function findDifference(
  actual: unknown,
  expected: unknown,
  rootPath = "value",
): Difference | undefined {
  return diff(actual, expected, rootPath, new Map());
}

/** Whether two values are structurally equal. */
export function deepEqual(actual: unknown, expected: unknown): boolean {
  return findDifference(actual, expected) === undefined;
}
