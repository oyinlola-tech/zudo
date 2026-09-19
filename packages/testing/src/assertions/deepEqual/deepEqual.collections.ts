/**
 * @zudojs/testing — Map and Set comparison for the structural walk.
 *
 * `Map.has`/`Set.has` are identity-based, so collections holding equal but
 * distinct objects would compare unequal. Each expected entry is matched
 * against a still-unmatched actual entry: by identity when that entry is
 * still unmatched, structurally otherwise. The identity shortcut only applies
 * to entries not yet consumed; taking it for a consumed entry made
 * `indexOf` return -1 and `splice(-1, 1)` drop an unrelated entry.
 *
 * @module assertions/deepEqual.collections
 */

import type { Difference } from "./deepEqual.describe.js";
import { describeValue } from "./deepEqual.describe.js";

/** The recursive walker, passed in to avoid a module cycle. */
export type DiffWalker = (
  actual: unknown,
  expected: unknown,
  path: string,
  seen: Map<object, object>,
) => Difference | undefined;

const NO_MATCH: unique symbol = Symbol("deepEqual.noMatch");

/**
 * Finds a candidate structurally equal to `expected`. Each probe walks a
 * copy of `seen`: the cycle guard records a pair as "assumed equal" before
 * comparing it, and a probe that fails must not leave that assumption
 * behind for the next candidate.
 */
function findStructuralMatch(
  walk: DiffWalker,
  candidates: readonly unknown[],
  expected: unknown,
  seen: Map<object, object>,
  accept: (candidate: unknown) => boolean = () => true,
): unknown {
  for (const candidate of candidates) {
    if (walk(candidate, expected, "", new Map(seen)) === undefined && accept(candidate)) {
      return candidate;
    }
  }
  return NO_MATCH;
}

/**
 * Compares two Maps. A key matched structurally prefers the actual key whose
 * value also matches, and falls back to a key-only match so the value
 * difference is what gets reported.
 */
export function diffMap(
  actual: Map<unknown, unknown>,
  expected: Map<unknown, unknown>,
  path: string,
  seen: Map<object, object>,
  walk: DiffWalker,
): Difference | undefined {
  if (actual.size !== expected.size) {
    return { path, reason: `expected ${expected.size} entries, received ${actual.size}` };
  }
  const unmatched = [...actual.keys()];
  for (const [key, value] of expected) {
    let actualKey: unknown = key;
    if (!unmatched.includes(key)) {
      actualKey = findStructuralMatch(walk, unmatched, key, seen, (candidate) =>
        walk(actual.get(candidate), value, "", new Map(seen)) === undefined,
      );
      if (actualKey === NO_MATCH) {
        actualKey = findStructuralMatch(walk, unmatched, key, seen);
      }
    }
    if (actualKey === NO_MATCH) {
      return { path, reason: `missing key ${describeValue(key)}` };
    }
    unmatched.splice(unmatched.indexOf(actualKey), 1);
    const found = walk(actual.get(actualKey), value, `${path}[${describeValue(key)}]`, seen);
    if (found) return found;
  }
  return undefined;
}

/** Compares two Sets, matching each expected item to one unmatched actual item. */
export function diffSet(
  actual: Set<unknown>,
  expected: Set<unknown>,
  path: string,
  seen: Map<object, object>,
  walk: DiffWalker,
): Difference | undefined {
  if (actual.size !== expected.size) {
    return { path, reason: `expected ${expected.size} items, received ${actual.size}` };
  }
  const unmatched = [...actual];
  for (const entry of expected) {
    const match = unmatched.includes(entry)
      ? entry
      : findStructuralMatch(walk, unmatched, entry, seen);
    if (match === NO_MATCH) {
      return { path, reason: `missing item ${describeValue(entry)}` };
    }
    unmatched.splice(unmatched.indexOf(match), 1);
  }
  return undefined;
}
