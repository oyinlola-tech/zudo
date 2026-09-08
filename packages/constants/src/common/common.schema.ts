/**
 * @zudojs/constants/schema
 *
 * Schema-related constants, issue codes, and default limits.
 */

import { ImmutableSet } from "../internal/immutableSet.js";
import { ValidationPattern } from "../validation/validation.pattern.type.js";
import { Limits } from "./common.constant.js";

/**
 * Schema issue codes — machine-readable, stable identifiers.
 *
 * Declared as a frozen `as const` object (not a TS `enum`) to match the rest
 * of the package; `SchemaIssueCode` is also exported as the union type of its
 * values, so it can be used in both value and type positions.
 */
export const SchemaIssueCode = Object.freeze({
  INVALID_TYPE: "invalid_type",
  REQUIRED: "required",
  INVALID_LITERAL: "invalid_literal",
  INVALID_ENUM: "invalid_enum",
  INVALID_UNION: "invalid_union",
  INVALID_STRING: "invalid_string",
  INVALID_FORMAT: "invalid_format",
  INVALID_NUMBER: "invalid_number",
  TOO_SMALL: "too_small",
  TOO_LARGE: "too_large",
  INVALID_LENGTH: "invalid_length",
  INVALID_KEY: "invalid_key",
  INVALID_ELEMENT: "invalid_element",
  UNKNOWN_KEYS: "unknown_keys",
  CIRCULAR_REFERENCE: "circular_reference",
  MAX_DEPTH_EXCEEDED: "max_depth_exceeded",
  CUSTOM: "custom",
  PREPROCESS_FAILED: "preprocess_failed",
  TRANSFORM_FAILED: "transform_failed",
  REFINE_FAILED: "refine_failed",
  COERCION_FAILED: "coercion_failed",
} as const);

/** Type-safe schema issue code — the union of all {@link SchemaIssueCode} values. */
export type SchemaIssueCode =
  (typeof SchemaIssueCode)[keyof typeof SchemaIssueCode];

/**
 * Default maximum depth for schema validation (recursion guard).
 *
 * Intentionally distinct from `Limits.MAX_NESTING_DEPTH` (10 — bound on
 * acceptable user data shape) and `SerializationLimits.MAX_DEPTH` (128 —
 * serializer recursion guard).
 */
export const SCHEMA_DEFAULT_MAX_DEPTH = 100;

/**
 * Default maximum string length
 * (canonical: {@link Limits.MAX_DISPLAY_LENGTH}).
 */
export const SCHEMA_DEFAULT_MAX_STRING_LENGTH = Limits.MAX_DISPLAY_LENGTH;

/** Default maximum array length. */
export const SCHEMA_DEFAULT_MAX_ARRAY_LENGTH = 1000;

/** Default maximum object key count. */
export const SCHEMA_DEFAULT_MAX_OBJECT_KEYS = 100;

/**
 * Object keys that are forbidden for prototype pollution protection.
 *
 * Backed by an immutable Set: `add`/`delete`/`clear` throw at runtime, so
 * this security guard cannot be weakened by accident (or on purpose).
 */
export const SCHEMA_FORBIDDEN_KEYS: ReadonlySet<string> = new ImmutableSet([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Common string format regex patterns.
 *
 * These reference {@link ValidationPattern} — the single source of truth for
 * validation regexes — rather than redefining them.
 */
export const SCHEMA_STRING_FORMATS = Object.freeze({
  EMAIL: ValidationPattern.EMAIL,
  URL: ValidationPattern.URL,
  /** UUID — any version (use UUID_V4 for strict v4). */
  UUID: ValidationPattern.UUID,
  UUID_V4: ValidationPattern.UUID_V4,
  /** ISO 8601 date-time with optional fraction and Z/±hh:mm offset. */
  DATETIME: ValidationPattern.ISO_DATE_TIME,
  DATE: ValidationPattern.ISO_DATE,
  TIME: /^\d{2}:\d{2}(:\d{2})?$/,
  IPV4: ValidationPattern.IPV4,
  IPV6: ValidationPattern.IPV6,
  HEX_COLOR: ValidationPattern.HEX_COLOR,
  PHONE: ValidationPattern.PHONE,
} as const);
