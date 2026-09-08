import type { ValidationConstraint } from "./validationConstraints.base.js";

import {
  createConstraint,
  assertNonNegativeInteger,
} from "./validationConstraints.base.js";

/**
 * Requires a string to be non-empty after trimming.
 */
export const nonEmptyString = createConstraint<string>(
  (value) => typeof value === "string" && value.trim().length > 0,
  {
    name: "non_empty_string",
    code: "required",
    message: "Value must not be empty.",
  },
);

/**
 * Requires a string to contain at least the specified number of characters.
 */
export function minLength(minimum: number): ValidationConstraint<string> {
  assertNonNegativeInteger(minimum, "minimum");

  return createConstraint((value) => value.length >= minimum, {
    name: `min_length_${minimum}`,
    code: "min_length",
    message: `Value must contain at least ${minimum} characters.`,
  });
}

/**
 * Requires a string to contain no more than the specified number of characters.
 */
export function maxLength(maximum: number): ValidationConstraint<string> {
  assertNonNegativeInteger(maximum, "maximum");

  return createConstraint((value) => value.length <= maximum, {
    name: `max_length_${maximum}`,
    code: "max_length",
    message: `Value must contain at most ${maximum} characters.`,
  });
}

/**
 * Requires a string length to fall within a range.
 */
export function lengthBetween(
  minimum: number,
  maximum: number,
): ValidationConstraint<string> {
  assertNonNegativeInteger(minimum, "minimum");
  assertNonNegativeInteger(maximum, "maximum");

  if (minimum > maximum) {
    throw new RangeError("minimum cannot be greater than maximum.");
  }

  return createConstraint(
    (value) => value.length >= minimum && value.length <= maximum,
    {
      name: `length_between_${minimum}_${maximum}`,
      code: "length_between",
      message: `Value must contain between ${minimum} and ${maximum} characters.`,
    },
  );
}

/**
 * Requires a string to match a regular expression.
 */
export function matches(
  pattern: RegExp,
  message = "Value has an invalid format.",
): ValidationConstraint<string> {
  return createConstraint((value) => pattern.test(value), {
    name: "matches",
    code: "invalid_format",
    message,
  });
}

/**
 * Requires a valid email-like format.
 */
export const email = createConstraint<string>(
  (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value),
  {
    name: "email",
    code: "invalid_email",
    message: "Value must be a valid email address.",
  },
);

/**
 * Requires a UUID-like format.
 */
export const uuid = createConstraint<string>(
  (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    ),
  {
    name: "uuid",
    code: "invalid_uuid",
    message: "Value must be a valid UUID.",
  },
);

/**
 * Requires an HTTP or HTTPS URL.
 */
export const httpUrl = createConstraint<string>(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  {
    name: "http_url",
    code: "invalid_url",
    message: "Value must be a valid HTTP or HTTPS URL.",
  },
);

/**
 * Requires a string to contain only ASCII characters.
 */
export const ascii = createConstraint<string>(
  (value) => /^[\x00-\x7F]*$/u.test(value),
  {
    name: "ascii",
    code: "invalid_ascii",
    message: "Value must contain only ASCII characters.",
  },
);

/**
 * Requires a string to contain only digits.
 */
export const digits = createConstraint<string>(
  (value) => /^\d+$/u.test(value),
  {
    name: "digits",
    code: "invalid_digits",
    message: "Value must contain only digits.",
  },
);

/**
 * Requires a string to contain only letters.
 */
export const letters = createConstraint<string>(
  (value) => /^\p{L}+$/u.test(value),
  {
    name: "letters",
    code: "invalid_letters",
    message: "Value must contain only letters.",
  },
);

/**
 * Requires a string to contain only letters, numbers, underscores, or hyphens.
 */
export const slug = createConstraint<string>(
  (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value),
  {
    name: "slug",
    code: "invalid_slug",
    message: "Value must be a valid slug.",
  },
);
