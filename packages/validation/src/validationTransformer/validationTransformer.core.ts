import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import { ConstraintValidationError } from "../validationErrors/validationError.types.js";

/** A synchronous transformation function. */
export type ValidationTransform<T, U> = (value: T) => U;

/** An asynchronous transformation function. */
export type AsyncValidationTransform<T, U> = (value: T) => U | Promise<U>;

/** Options for transformation operations. */
export interface TransformerOptions {
  readonly name?: string;
  readonly transformErrorMessage?: string;
}

/** A reusable synchronous transformer. */
export interface ValidationTransformer<T, U> {
  readonly name: string;
  transform(value: T): U;
  safeTransform(value: T): ValidationResult<U>;
  validateAndTransform(value: unknown): ValidationResult<U>;
}

/** A reusable asynchronous transformer. */
export interface AsyncValidationTransformer<T, U> {
  readonly name: string;
  transform(value: T): Promise<U>;
  safeTransform(value: T): Promise<ValidationResult<U>>;
  validateAndTransform(value: unknown): Promise<ValidationResult<U>>;
}

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

/** Creates a synchronous transformer. */
export function createValidationTransformer<T, U>(
  transform: ValidationTransform<T, U>,
  options: TransformerOptions = {},
): ValidationTransformer<T, U> {
  const name = options.name ?? "ValidationTransformer";
  return Object.freeze({
    name,
    transform(value: T): U {
      try {
        return transform(value);
      } catch (error) {
        throw new ConstraintValidationError(
          options.transformErrorMessage ?? "Validation transformation failed.",
          [],
          { cause: error },
        );
      }
    },
    safeTransform(value: T): ValidationResult<U> {
      try {
        return success(transform(value));
      } catch {
        return transformFailure<U>(options);
      }
    },
    validateAndTransform(value: unknown): ValidationResult<U> {
      return this.safeTransform(value as T);
    },
  });
}

/** Creates an asynchronous transformer. */
export function createAsyncValidationTransformer<T, U>(
  transform: AsyncValidationTransform<T, U>,
  options: TransformerOptions = {},
): AsyncValidationTransformer<T, U> {
  const name = options.name ?? "AsyncValidationTransformer";
  return Object.freeze({
    name,
    async transform(value: T): Promise<U> {
      try {
        return await transform(value);
      } catch (error) {
        throw new ConstraintValidationError(
          options.transformErrorMessage ?? "Validation transformation failed.",
          [],
          { cause: error },
        );
      }
    },
    async safeTransform(value: T): Promise<ValidationResult<U>> {
      try {
        return success(await transform(value));
      } catch {
        return transformFailure<U>(options);
      }
    },
    async validateAndTransform(value: unknown): Promise<ValidationResult<U>> {
      return this.safeTransform(value as T);
    },
  });
}
