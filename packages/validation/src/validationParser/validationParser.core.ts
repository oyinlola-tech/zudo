import type { ValidationSchema } from "../validationSchema/validationSchema.core.js";
import {
  parse,
  parseAsync,
  validate,
  validateAsync,
} from "../validationSchema/validationSchema.core.js";
import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { SchemaValidationError } from "../validationErrors/validationError.types.js";

/** Options for parser creation. */
export interface ParserOptions {
  readonly name?: string;
}

/** A synchronous parser created from a validation schema. */
export interface ValidationParser<T> {
  readonly name: string;
  parse(value: unknown): T;
  safeParse(value: unknown): ValidationResult<T>;
  isValid(value: unknown): value is T;
}

/** An asynchronous parser created from a validation schema. */
export interface AsyncValidationParser<T> {
  readonly name: string;
  parse(value: unknown): Promise<T>;
  safeParse(value: unknown): Promise<ValidationResult<T>>;
  isValid(value: unknown): Promise<boolean>;
}

/** Creates a reusable synchronous parser from a schema. */
export function createValidationParser<T>(
  schema: ValidationSchema<T>,
  options: ParserOptions = {},
): ValidationParser<T> {
  const name = options.name ?? "ValidationParser";
  return Object.freeze({
    name,
    parse(value: unknown): T {
      return parse(schema, value);
    },
    safeParse(value: unknown): ValidationResult<T> {
      return validate(schema, value);
    },
    isValid(value: unknown): value is T {
      return schema.safeParse(value).success;
    },
  });
}

/** Creates a reusable asynchronous parser from a schema. */
export function createAsyncValidationParser<T>(
  schema: ValidationSchema<T>,
  options: ParserOptions = {},
): AsyncValidationParser<T> {
  const name = options.name ?? "AsyncValidationParser";
  return Object.freeze({
    name,
    async parse(value: unknown): Promise<T> {
      return parseAsync(schema, value);
    },
    async safeParse(value: unknown): Promise<ValidationResult<T>> {
      return validateAsync(schema, value);
    },
    async isValid(value: unknown): Promise<boolean> {
      return (await schema.safeParseAsync(value)).success;
    },
  });
}

/** Parses a value and returns a fallback when validation fails. */
export function parseOr<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  fallback: T,
): T {
  const result = validate(schema, value);
  return result.success ? result.data : fallback;
}

/** Parses a value and returns a fallback produced by a function when validation fails. */
export function parseOrElse<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  fallback: (error: SchemaValidationError) => T,
): T {
  const result = validate(schema, value);
  if (result.success) return result.data;
  return fallback(
    new SchemaValidationError("Schema validation failed.", result.issues),
  );
}
