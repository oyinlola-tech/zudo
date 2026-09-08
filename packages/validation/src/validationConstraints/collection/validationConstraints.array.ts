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
 * Requires an array to contain at least a given number of items.
 */
export function minItems<T>(
  minimum: number,
): ValidationConstraint<readonly T[]> {
  assertNonNegativeInteger(minimum, "minimum");

  return createConstraint((value) => value.length >= minimum, {
    name: `min_items_${minimum}`,
    code: "min_items",
    message: `Value must contain at least ${minimum} items.`,
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
    message: `Value must contain at most ${maximum} items.`,
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
    message: `Value must contain exactly ${length} items.`,
    guard: isArrayOf,
  });
}

/**
 * Requires every array item to satisfy a constraint.
 */
export function everyItem<T>(
  constraint: ValidationConstraint<T>,
): ValidationConstraint<readonly T[]> {
  return createConstraint<readonly T[]>(
    (values) => values.every((value) => itemHolds(constraint, value)),
    {
      name: `every_${constraint.name}`,
      code: "item_constraint_failed",
      message: constraint.message,
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
    (values) => values.some((value) => itemHolds(constraint, value)),
    {
      name: `some_${constraint.name}`,
      code: "some_item_constraint_failed",
      message: `At least one item must satisfy ${constraint.name}.`,
      guard: isArrayOf,
    },
  );
}
