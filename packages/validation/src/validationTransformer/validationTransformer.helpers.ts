/**
 * @zudojs/validation — Transformation helpers and pipelines.
 *
 * @module validationTransformer/validationTransformer.helpers
 */

import type { ValidationSchema } from "../validationSchema/validationSchema.core.js";
import {
  validate,
  validateAsync,
} from "../validationSchema/validationSchema.core.js";
import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import type {
  AsyncValidationTransform,
  TransformerOptions,
  ValidationTransform,
} from "./validationTransformer.core.js";

/** Builds the failure reported when a transformation throws. */
function transformFailure<U>(options: TransformerOptions): ValidationResult<U> {
  return failure([
    {
      path: [],
      code: "transform_failed",
      message:
        options.transformErrorMessage ?? "Validation transformation failed.",
    },
  ]);
}

/** Validates input and then transforms it. */
export function validateAndTransform<T, U>(
  schema: ValidationSchema<T>,
  value: unknown,
  transform: ValidationTransform<T, U>,
  options: TransformerOptions = {},
): ValidationResult<U> {
  const validation = validate(schema, value);
  if (!validation.success) return validation;
  try {
    return success(transform(validation.data));
  } catch (error) {
    return transformFailure<U>(options);
  }
}

/** Validates input and then transforms it asynchronously. */
export async function validateAndTransformAsync<T, U>(
  schema: ValidationSchema<T>,
  value: unknown,
  transform: AsyncValidationTransform<T, U>,
  options: TransformerOptions = {},
): Promise<ValidationResult<U>> {
  const validation = await validateAsync(schema, value);
  if (!validation.success) return validation;
  try {
    return success(await transform(validation.data));
  } catch (error) {
    return transformFailure<U>(options);
  }
}

/** Creates a transformation pipeline. */
export function composeTransforms<T, U, V>(
  first: ValidationTransform<T, U>,
  second: ValidationTransform<U, V>,
): ValidationTransform<T, V> {
  return (value: T): V => second(first(value));
}

/** Creates a transformation pipeline from multiple functions. */
export function composeManyTransforms<T>(
  ...transforms: readonly ValidationTransform<T, T>[]
): ValidationTransform<T, T> {
  return (value: T): T => {
    let current = value;
    for (const transform of transforms) current = transform(current);
    return current;
  };
}

/** Applies a transformation to every item in an array. */
export function transformArray<T, U>(
  values: readonly T[],
  transform: ValidationTransform<T, U>,
): U[] {
  return values.map((value) => transform(value));
}

/** Applies an asynchronous transformation to every item in an array. */
export async function transformArrayAsync<T, U>(
  values: readonly T[],
  transform: AsyncValidationTransform<T, U>,
): Promise<U[]> {
  return Promise.all(values.map((value) => transform(value)));
}

/** Creates a schema that transforms the validated value. */
export function withTransformer<T, U>(
  schema: ValidationSchema<T>,
  transform: ValidationTransform<T, U>,
): ValidationSchema<U> {
  return schema.transform(transform);
}
