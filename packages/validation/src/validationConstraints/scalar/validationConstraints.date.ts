import type { ValidationConstraint } from "./validationConstraints.base.js";

import { createConstraint } from "./validationConstraints.base.js";

/**
 * Requires a string to be a valid ISO date representation.
 */
export const isoDate = createConstraint<string>(
  (value) => {
    const date = new Date(value);
    return (
      !Number.isNaN(date.getTime()) &&
      /^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(value)
    );
  },
  {
    name: "iso_date",
    code: "invalid_date",
    message: "Value must be a valid ISO date.",
  },
);

/**
 * Requires a date to be in the future.
 */
export const futureDate = createConstraint<Date>(
  (value) => value.getTime() > Date.now(),
  {
    name: "future_date",
    code: "invalid_future_date",
    message: "Date must be in the future.",
  },
);

/**
 * Requires a date to be in the past.
 */
export const pastDate = createConstraint<Date>(
  (value) => value.getTime() < Date.now(),
  {
    name: "past_date",
    code: "invalid_past_date",
    message: "Date must be in the past.",
  },
);
