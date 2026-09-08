import type { ValidationConstraint } from "../validationConstraints.base.js";

import {
  createConstraint,
  assertNonNegativeInteger,
} from "../validationConstraints.base.js";

/** Counts Unicode code points rather than UTF-16 code units. */
function characterLength(value: string): number {
  return [...value].length;
}

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
 *
 * Counts code points, so an emoji costs one character rather than two.
 */
export function minLength(minimum: number): ValidationConstraint<string> {
  assertNonNegativeInteger(minimum, "minimum");

  return createConstraint((value) => characterLength(value) >= minimum, {
    name: `min_length_${minimum}`,
    code: "min_length",
    message: `Value must contain at least ${minimum} characters.`,
    guard: (value): value is string => typeof value === "string",
  });
}

/**
 * Requires a string to contain no more than the specified number of characters.
 */
export function maxLength(maximum: number): ValidationConstraint<string> {
  assertNonNegativeInteger(maximum, "maximum");

  return createConstraint((value) => characterLength(value) <= maximum, {
    name: `max_length_${maximum}`,
    code: "max_length",
    message: `Value must contain at most ${maximum} characters.`,
    guard: (value): value is string => typeof value === "string",
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
    (value) => {
      const length = characterLength(value);
      return length >= minimum && length <= maximum;
    },
    {
      name: `length_between_${minimum}_${maximum}`,
      code: "length_between",
      message: `Value must contain between ${minimum} and ${maximum} characters.`,
      guard: (value): value is string => typeof value === "string",
    },
  );
}

/**
 * Requires a string to match a regular expression.
 *
 * The pattern is copied without the `g` and `y` flags. Those make `test()`
 * stateful through `lastIndex`, so a shared pattern would alternate between
 * accepting and rejecting the very same value.
 */
export function matches(
  pattern: RegExp,
  message = "Value has an invalid format.",
): ValidationConstraint<string> {
  const stateless = new RegExp(
    pattern.source,
    pattern.flags.replace(/[gy]/gu, ""),
  );

  return createConstraint((value) => stateless.test(value), {
    name: "matches",
    code: "invalid_format",
    message,
    guard: (value): value is string => typeof value === "string",
  });
}

/**
 * Requires a valid email-like format.
 *
 * Deliberately structural, not a full RFC 5322 parser: it rejects the shapes
 * that are certainly wrong and leaves deliverability to a verification step.
 */
export const email = createConstraint<string>(
  (value) =>
    /^[^\s@,;<>"[\]\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu.test(
      value,
    ) && !value.includes(".."),
  {
    name: "email",
    code: "invalid_email",
    message: "Value must be a valid email address.",
    guard: (value): value is string => typeof value === "string",
  },
);

/**
 * Requires a UUID-like format.
 *
 * Accepts versions 1 through 8, covering UUIDv7, plus the nil and max UUIDs.
 */
export const uuid = createConstraint<string>(
  (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    ) ||
    value === "00000000-0000-0000-0000-000000000000" ||
    value.toLowerCase() === "ffffffff-ffff-ffff-ffff-ffffffffffff",
  {
    name: "uuid",
    code: "invalid_uuid",
    message: "Value must be a valid UUID.",
    guard: (value): value is string => typeof value === "string",
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
    guard: (value): value is string => typeof value === "string",
  },
);

/**
 * Requires a string to contain only printable ASCII characters.
 *
 * Control characters are excluded. A value that passes this is safe to place
 * in a header or a single log line, which is what callers assume of a check
 * named "ascii".
 */
export const ascii = createConstraint<string>(
  (value) => /^[\x20-\x7E]*$/u.test(value),
  {
    name: "ascii",
    code: "invalid_ascii",
    message: "Value must contain only printable ASCII characters.",
    guard: (value): value is string => typeof value === "string",
  },
);

/**
 * Requires a string to contain only digits.
 */
export const digits = createConstraint<string>(
  (value) => /^[0-9]+$/u.test(value),
  {
    name: "digits",
    code: "invalid_digits",
    message: "Value must contain only digits.",
    guard: (value): value is string => typeof value === "string",
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
    guard: (value): value is string => typeof value === "string",
  },
);

/**
 * Requires a lowercase, hyphen-separated slug.
 */
export const slug = createConstraint<string>(
  (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value),
  {
    name: "slug",
    code: "invalid_slug",
    message:
      "Value must be a slug: lowercase letters and digits, separated by single hyphens.",
    guard: (value): value is string => typeof value === "string",
  },
);
