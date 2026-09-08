import type { ValidationConstraint } from "./validationConstraints.base.js";

import { createConstraint, not } from "./validationConstraints.base.js";

/**
 * Requires a value to belong to a provided collection.
 */
export function oneOf<T>(values: readonly T[]): ValidationConstraint<T> {
  return createConstraint(
    (value) => values.some((candidate) => Object.is(candidate, value)),
    {
      name: "one_of",
      code: "not_allowed",
      message: "Value is not an allowed value.",
    },
  );
}

/**
 * Requires a value not to belong to a provided collection.
 */
export function noneOf<T>(values: readonly T[]): ValidationConstraint<T> {
  return not(oneOf(values), {
    name: "none_of",
    code: "disallowed_value",
    message: "Value is not allowed.",
  });
}
