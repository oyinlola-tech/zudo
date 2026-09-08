import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import { ConstraintValidationError } from "../validationErrors/validationError.types.js";

/** A synchronous normalizer. */
export type Normalizer<T> = (value: T) => T;

/** An asynchronous normalizer. */
export type AsyncNormalizer<T> = (value: T) => T | Promise<T>;

/** Options used by normalization helpers. */
export interface NormalizerOptions {
  readonly name?: string;
  readonly errorMessage?: string;
}

/** A reusable normalizer. */
export interface ValidationNormalizer<T> {
  readonly name: string;
  normalize(value: T): T;
  safeNormalize(value: T): ValidationResult<T>;
}

/** A reusable asynchronous normalizer. */
export interface AsyncValidationNormalizer<T> {
  readonly name: string;
  normalize(value: T): Promise<T>;
  safeNormalize(value: T): Promise<ValidationResult<T>>;
}

/** Creates a reusable synchronous normalizer. */
export function createNormalizer<T>(
  normalizer: Normalizer<T>,
  options: NormalizerOptions = {},
): ValidationNormalizer<T> {
  const name = options.name ?? "ValidationNormalizer";

  return Object.freeze({
    name,
    normalize(value: T): T {
      try {
        return normalizer(value);
      } catch (error) {
        throw new ConstraintValidationError(
          options.errorMessage ?? "Value normalization failed.",
          [],
          { cause: error },
        );
      }
    },
    safeNormalize(value: T): ValidationResult<T> {
      try {
        return success(normalizer(value));
      } catch {
        return failure([
          {
            path: [],
            code: "normalization_failed",
            message: options.errorMessage ?? "Value normalization failed.",
          },
        ]);
      }
    },
  });
}

/** Creates a reusable asynchronous normalizer. */
export function createAsyncNormalizer<T>(
  normalizer: AsyncNormalizer<T>,
  options: NormalizerOptions = {},
): AsyncValidationNormalizer<T> {
  const name = options.name ?? "AsyncValidationNormalizer";

  return Object.freeze({
    name,
    async normalize(value: T): Promise<T> {
      try {
        return await normalizer(value);
      } catch (error) {
        throw new ConstraintValidationError(
          options.errorMessage ?? "Value normalization failed.",
          [],
          { cause: error },
        );
      }
    },
    async safeNormalize(value: T): Promise<ValidationResult<T>> {
      try {
        return success(await normalizer(value));
      } catch {
        return failure([
          {
            path: [],
            code: "normalization_failed",
            message: options.errorMessage ?? "Value normalization failed.",
          },
        ]);
      }
    },
  });
}
