/**
 * @zudojs/validation — Parsing collections of values.
 *
 * @module validationParser/validationParser.collection
 */

import type {
  ParseOptions,
  ValidationSchema,
} from "../validationSchema/validationSchema.core.js";
import {
  validate,
  validateAsync,
} from "../validationSchema/validationSchema.core.js";
import type {
  ValidationIssue,
  ValidationResult,
} from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";

/** Property names that would mutate a prototype instead of adding a key. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Parses multiple values using the same schema. Succeeds only when every value is valid. */
export function parseMany<T>(
  schema: ValidationSchema<T>,
  values: readonly unknown[],
): ValidationResult<readonly T[]> {
  const parsed: T[] = [];
  const issues: ValidationIssue[] = [];

  for (let index = 0; index < values.length; index++) {
    const result = validate(schema, values[index], { pathPrefix: [index] });
    if (result.success) {
      parsed.push(result.data);
    } else {
      issues.push(...result.issues);
    }
  }

  return issues.length > 0 ? failure(issues) : success(parsed);
}

/** Parses multiple values asynchronously. */
export async function parseManyAsync<T>(
  schema: ValidationSchema<T>,
  values: readonly unknown[],
): Promise<ValidationResult<readonly T[]>> {
  const parsed: T[] = [];
  const issues: ValidationIssue[] = [];

  for (let index = 0; index < values.length; index++) {
    const result = await validateAsync(schema, values[index], {
      pathPrefix: [index],
    });
    if (result.success) {
      parsed.push(result.data);
    } else {
      issues.push(...result.issues);
    }
  }

  return issues.length > 0 ? failure(issues) : success(parsed);
}

/**
 * Parses a record of values using a schema.
 *
 * Results accumulate into a null-prototype object and are installed with
 * `defineProperty`. A plain literal would route a `__proto__` key — which
 * `JSON.parse` produces as a real own property — through the prototype setter,
 * so the returned "validated" object would silently inherit attacker-supplied
 * fields that `Object.keys` does not show.
 */
export function parseRecord<T>(
  schema: ValidationSchema<T>,
  values: Readonly<Record<string, unknown>>,
): ValidationResult<Readonly<Record<string, T>>> {
  const parsed = Object.create(null) as Record<string, T>;
  const issues: ValidationIssue[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (FORBIDDEN_KEYS.has(key)) {
      issues.push({
        path: [key],
        code: "forbidden_key",
        message: `Key "${key}" is not allowed.`,
      });
      continue;
    }

    const result = validate(schema, value, { pathPrefix: [key] });
    if (result.success) {
      Object.defineProperty(parsed, key, {
        value: result.data,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    } else {
      issues.push(...result.issues);
    }
  }

  return issues.length > 0
    ? failure(issues)
    : { success: true, data: Object.freeze(parsed), issues: [] };
}

/** Parses an optional value. Undefined is accepted and returned as undefined. */
export function parseOptional<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): ValidationResult<T | undefined> {
  if (value === undefined) return success(undefined);
  return validate(schema, value, options);
}

/** Parses a nullable value. Null is accepted and returned as null. */
export function parseNullable<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): ValidationResult<T | null> {
  if (value === null) return success(null);
  return validate(schema, value, options);
}

/** Parses an optional nullable value. */
export function parseOptionalNullable<T>(
  schema: ValidationSchema<T>,
  value: unknown,
  options: ParseOptions = {},
): ValidationResult<T | null | undefined> {
  if (value === undefined || value === null) return success(value);
  return validate(schema, value, options);
}
