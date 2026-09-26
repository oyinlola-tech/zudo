import { z, ZodError, type ZodType } from "zod";
import { ConfigurationError } from "@zudojs/errors";
import type {
  ValidationIssue,
  ValidationResult,
} from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import { SchemaValidationError } from "../validationErrors/validationError.types.js";

/** Generic schema type used throughout the validation package. */
export type ValidationSchema<T = unknown> = ZodType<T>;

/** Options for schema parsing. */
export interface ParseOptions {
  readonly pathPrefix?: readonly (string | number)[];
}

/** Maps a Zod error into the package's normalized issue format. */
export function mapZodIssues(
  error: ZodError,
  pathPrefix: readonly (string | number)[] = [],
): ValidationIssue[] {
  return error.issues.map((currentIssue) => ({
    path: [
      ...pathPrefix,
      ...currentIssue.path.filter(
        (p): p is string | number =>
          typeof p === "string" || typeof p === "number",
      ),
    ],
    code: currentIssue.code,
    message: currentIssue.message,
    ...(currentIssue.code === "invalid_type"
      ? { expected: currentIssue.expected }
      : {}),
  }));
}

/**
 * Runs a synchronous Zod parse, turning Zod's "async schema in a sync parse"
 * fault into a framework error.
 *
 * A schema with an async `refine`/`transform` cannot be parsed synchronously;
 * Zod throws a bare `Error`, which escaped `validate()` and `isValid()` as an
 * anonymous 500. It is a wiring mistake, not invalid input, so it is reported
 * as a `ConfigurationError` naming the fix rather than as a validation
 * failure (which would return a 400 for a bug in the service).
 *
 * @throws {ConfigurationError} when the schema needs `validateAsync()`.
 */
function safeParseSync<T>(schema: ValidationSchema<T>, value: unknown) {
  try {
    return schema.safeParse(value);
  } catch (error) {
    if (error instanceof z.core.$ZodAsyncError) {
      throw new ConfigurationError(
        "The schema contains an async refine() or transform() and cannot be parsed synchronously; use validateAsync(), parseAsync() or createAsyncValidator().",
        { component: "@zudojs/validation", cause: error },
      );
    }
    throw error;
  }
}

/**
 * Safely parses input using a Zod schema.
 *
 * Invalid input is always a `{ success: false }` result. The one throw is a
 * schema with async refinements (see `validateAsync`).
 *
 * @throws {ConfigurationError} when the schema needs `validateAsync()`.
 */
export function validate<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): ValidationResult<T> {
  const result = safeParseSync(schema, value);
  if (result.success) return success(result.data as T);
  return failure(mapZodIssues(result.error, options.pathPrefix));
}

/** Parses input using a schema and throws when validation fails. */
export function parse<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): T {
  const result = validate(schema, value, options);
  if (result.success) return result.data;
  throw new SchemaValidationError("Schema validation failed.", result.issues);
}

/** Safely parses input asynchronously. */
export async function validateAsync<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): Promise<ValidationResult<T>> {
  const result = await schema.safeParseAsync(value);
  if (result.success) return success(result.data as T);
  return failure(mapZodIssues(result.error, options.pathPrefix));
}

/** Parses input asynchronously and throws when validation fails. */
export async function parseAsync<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): Promise<T> {
  const result = await validateAsync(schema, value, options);
  if (result.success) return result.data;
  throw new SchemaValidationError("Schema validation failed.", result.issues);
}

/** Determines whether a value matches a schema. */
export function isValid<T>(
  schema: ValidationSchema<T>,
  value: unknown,
): value is T {
  return safeParseSync(schema, value).success;
}

/** Creates a validation function from a schema. */
export function createValidator<T>(schema: ValidationSchema<T>) {
  return (value: unknown): ValidationResult<T> => validate(schema, value);
}

/** Creates a throwing parser from a schema. */
export function createParser<T>(schema: ValidationSchema<T>) {
  return (value: unknown): T => parse(schema, value);
}

/** Creates an asynchronous validator from a schema. */
export function createAsyncValidator<T>(schema: ValidationSchema<T>) {
  return (value: unknown): Promise<ValidationResult<T>> =>
    validateAsync(schema, value);
}

/** Creates an asynchronous throwing parser from a schema. */
export function createAsyncParser<T>(schema: ValidationSchema<T>) {
  return (value: unknown): Promise<T> => parseAsync(schema, value);
}

/** Returns the underlying Zod schema. */
export function unwrapSchema<T>(
  schema: ValidationSchema<T>,
): ValidationSchema<T> {
  return schema;
}

/** Converts a validation result into a throwing operation. */
export function assertValid<T>(result: ValidationResult<T>): asserts result is {
  readonly success: true;
  readonly data: T;
  readonly issues: readonly [];
} {
  if (!result.success)
    throw new SchemaValidationError("Schema validation failed.", result.issues);
}

/** Re-exports Zod so consumers do not need to depend on a second version of Zod. */
export { z };
