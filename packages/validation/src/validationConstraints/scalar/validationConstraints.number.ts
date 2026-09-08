import type { ValidationConstraint } from "./validationConstraints.base.js";

import { createConstraint } from "./validationConstraints.base.js";

/**
 * Requires a numeric value to be greater than or equal to a minimum.
 */
export function min(minimum: number): ValidationConstraint<number> {
  if (!Number.isFinite(minimum)) {
    throw new RangeError("minimum must be a finite number.");
  }

  return createConstraint((value) => value >= minimum, {
    name: `min_${minimum}`,
    code: "min_value",
    message: `Value must be greater than or equal to ${minimum}.`,
  });
}

/**
 * Requires a numeric value to be less than or equal to a maximum.
 */
export function max(maximum: number): ValidationConstraint<number> {
  if (!Number.isFinite(maximum)) {
    throw new RangeError("maximum must be a finite number.");
  }

  return createConstraint((value) => value <= maximum, {
    name: `max_${maximum}`,
    code: "max_value",
    message: `Value must be less than or equal to ${maximum}.`,
  });
}

/**
 * Requires a numeric value to fall within a range.
 */
export function between(
  minimum: number,
  maximum: number,
): ValidationConstraint<number> {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new RangeError("minimum and maximum must be finite numbers.");
  }

  if (minimum > maximum) {
    throw new RangeError("minimum cannot be greater than maximum.");
  }

  return createConstraint((value) => value >= minimum && value <= maximum, {
    name: `between_${minimum}_${maximum}`,
    code: "value_out_of_range",
    message: `Value must be between ${minimum} and ${maximum}.`,
  });
}

/**
 * Requires a finite number.
 */
export const finiteNumber = createConstraint<number>(
  (value) => Number.isFinite(value),
  {
    name: "finite_number",
    code: "invalid_number",
    message: "Value must be a finite number.",
  },
);

/**
 * Requires an integer.
 */
export const integer = createConstraint<number>(
  (value) => Number.isInteger(value),
  {
    name: "integer",
    code: "invalid_integer",
    message: "Value must be an integer.",
  },
);

/**
 * Requires a positive number.
 */
export const positive = createConstraint<number>((value) => value > 0, {
  name: "positive",
  code: "invalid_positive",
  message: "Value must be greater than zero.",
});

/**
 * Requires a non-negative number.
 */
export const nonNegative = createConstraint<number>((value) => value >= 0, {
  name: "non_negative",
  code: "invalid_non_negative",
  message: "Value must be zero or greater.",
});

/**
 * Requires a number to be even.
 */
export const even = createConstraint<number>(
  (value) => Number.isInteger(value) && value % 2 === 0,
  {
    name: "even",
    code: "invalid_even",
    message: "Value must be an even integer.",
  },
);

/**
 * Requires a number to be odd.
 */
export const odd = createConstraint<number>(
  (value) => Number.isInteger(value) && Math.abs(value % 2) === 1,
  {
    name: "odd",
    code: "invalid_odd",
    message: "Value must be an odd integer.",
  },
);
