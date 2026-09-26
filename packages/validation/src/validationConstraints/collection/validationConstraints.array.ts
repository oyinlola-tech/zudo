import { formatCount } from "@zudojs/types";

import type { ValidationConstraint } from "../validationConstraints.base.js";

import {
  createConstraint,
  assertNonNegativeInteger,
} from "../validationConstraints.base.js";

/** Narrows an unknown value to a readonly array. */
function isArrayOf<T>(value: unknown): value is readonly T[] {
  return Array.isArray(value);
}

/** Runs an item constraint without letting a type mismatch escape. */
function itemHolds<T>(
  constraint: ValidationConstraint<T>,
  value: unknown,
): boolean {
  if (constraint.guard && !constraint.guard(value)) return false;
  try {
    return constraint.validate(value as T);
  } catch {
    return false;
  }
}

/**
 * Whether any item's constraint result equals `want`, reading every index.
 * `Array.prototype.every`/`some` skip holes, so `new Array(3)` passed any
 * `everyItem` constraint.
 */
function scanItems<T>(
  values: readonly unknown[],
  constraint: ValidationConstraint<T>,
  want: boolean,
): boolean {
  for (let i = 0; i < values.length; i++) {
    if (itemHolds(constraint, values[i]) === want) return true;
  }
  return false;
}

/**
 * Requires an array to contain at least a given number of items.
 */
export function minItems<T>(
  minimum: number,
): ValidationConstraint<readonly T[]> {
  assertNonNegativeInteger(minimum, "minimum");

  return createConstraint((value) => value.length >= minimum, {
    name: `min_items_${minimum}`,
    code: "min_items",
    message: `Value must contain at least ${formatCount(minimum, "item")}.`,
    guard: isArrayOf,
  });
}

/**
 * Requires an array to contain no more than a given number of items.
 */
export function maxItems<T>(
  maximum: number,
): ValidationConstraint<readonly T[]> {
  assertNonNegativeInteger(maximum, "maximum");

  return createConstraint((value) => value.length <= maximum, {
    name: `max_items_${maximum}`,
    code: "max_items",
    message: `Value must contain at most ${formatCount(maximum, "item")}.`,
    guard: isArrayOf,
  });
}

/**
 * Requires an array to contain a specific number of items.
 */
export function exactItems<T>(
  length: number,
): ValidationConstraint<readonly T[]> {
  assertNonNegativeInteger(length, "length");

  return createConstraint((value) => value.length === length, {
    name: `exact_items_${length}`,
    code: "exact_items",
    message: `Value must contain exactly ${formatCount(length, "item")}.`,
    guard: isArrayOf,
  });
}

/**
 * Requires every array item to satisfy a constraint.
 *
 * The message says it is about the items ("Every item must satisfy: …").
 * Reusing the item constraint's message verbatim told a caller who sent a
 * number instead of an array that the "value must be a valid email address".
 * The issue is reported at the array's path: a constraint yields one issue,
 * so the failing index is not part of it.
 */
export function everyItem<T>(
  constraint: ValidationConstraint<T>,
): ValidationConstraint<readonly T[]> {
  return createConstraint<readonly T[]>(
    (values) => !scanItems(values, constraint, false),
    {
      name: `every_${constraint.name}`,
      code: "item_constraint_failed",
      message: `Every item must satisfy: ${constraint.message}`,
      guard: isArrayOf,
    },
  );
}

/**
 * Requires at least one array item to satisfy a constraint.
 */
export function someItem<T>(
  constraint: ValidationConstraint<T>,
): ValidationConstraint<readonly T[]> {
  return createConstraint<readonly T[]>(
    (values) => scanItems(values, constraint, true),
    {
      name: `some_${constraint.name}`,
      code: "some_item_constraint_failed",
      message: `At least one item must satisfy ${constraint.name}.`,
      guard: isArrayOf,
    },
  );
}
