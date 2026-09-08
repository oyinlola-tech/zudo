import { createConstraint } from "../validationConstraints.base.js";

/** Narrows an unknown value to a valid Date. */
const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Requires a string to be a valid ISO date representation.
 */
export const isoDate = createConstraint<string>(
  (value) => {
    if (
      !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(
        value,
      )
    ) {
      return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    // Reject calendar-invalid dates such as 2024-02-31, which Date rolls over
    // into the following month rather than rejecting.
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const asUtc = new Date(Date.UTC(year!, month! - 1, day!));
    return (
      asUtc.getUTCFullYear() === year &&
      asUtc.getUTCMonth() === month! - 1 &&
      asUtc.getUTCDate() === day
    );
  },
  {
    name: "iso_date",
    code: "invalid_date",
    message: "Value must be a valid ISO 8601 date.",
    guard: (value): value is string => typeof value === "string",
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
    guard: isDate,
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
    guard: isDate,
  },
);
