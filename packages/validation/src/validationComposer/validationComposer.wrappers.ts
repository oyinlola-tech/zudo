/**
 * @zudojs/validation — Wrappers that adapt a validation step.
 *
 * Optionality, conditionality and post-validation mapping, kept apart from the
 * combinators that fold several steps into one.
 *
 * @module validationComposer/validationComposer.wrappers
 */

import type { ValidationResult } from "../validationResult/validationResult.type.js";
import { success } from "../validationResult/validationResult.type.js";
import type {
  ValidationComposer,
  ValidationComposerOptions,
  ValidationStep,
} from "./validationComposer.core.js";
import { createValidationComposer } from "./validationComposer.core.js";

/** Makes a validation step optional. Undefined values bypass the validator. */
export function optional<T>(
  validator: ValidationStep<T>,
): ValidationStep<T | undefined> {
  return (value: T | undefined): ValidationResult<T | undefined> => {
    if (value === undefined) return success(undefined);
    return validator(value);
  };
}

/** Makes a validation step nullable. Null values bypass the validator. */
export function nullable<T>(
  validator: ValidationStep<T>,
): ValidationStep<T | null> {
  return (value: T | null): ValidationResult<T | null> => {
    if (value === null) return success(null);
    return validator(value);
  };
}

/** Makes a validation step optional and nullable. */
export function optionalNullable<T>(
  validator: ValidationStep<T>,
): ValidationStep<T | null | undefined> {
  return (
    value: T | null | undefined,
  ): ValidationResult<T | null | undefined> => {
    if (value === null || value === undefined) return success(value);
    return validator(value);
  };
}

/** Adds a custom validation step to an existing pipeline. */
export function append<T>(
  composer: ValidationComposer<T>,
  step: ValidationStep<T>,
  options: ValidationComposerOptions = {},
): ValidationComposer<T> {
  return createValidationComposer(
    [(value: T) => composer.validate(value), step],
    {
      ...options,
      name: options.name ?? composer.name,
      stopOnFirstError: options.stopOnFirstError ?? composer.stopOnFirstError,
    },
  );
}

/** Creates a pipeline that validates a value and returns the original value. */
export function tap<T>(validator: ValidationStep<T>): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    const result = validator(value);
    if (!result.success) return result;
    return success(value);
  };
}

/** Creates a validation step that only runs when a predicate matches. */
export function when<T>(
  predicate: (value: T) => boolean,
  validator: ValidationStep<T>,
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    if (!predicate(value)) return success(value);
    return validator(value);
  };
}

/** Creates a validation step that runs only when a predicate does not match. */
export function unless<T>(
  predicate: (value: T) => boolean,
  validator: ValidationStep<T>,
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    if (predicate(value)) return success(value);
    return validator(value);
  };
}

/**
 * Applies a mapping operation after successful validation.
 *
 * @returns A step producing the mapped value.
 */
export function mapValidated<T, U>(
  validator: ValidationStep<T>,
  mapper: (value: T) => U,
): (value: T) => ValidationResult<U> {
  return (value: T): ValidationResult<U> => {
    const result = validator(value);
    if (!result.success) return result;
    return success(mapper(result.data));
  };
}

/**
 * Applies a side effect after successful validation, keeping the value.
 *
 * The counterpart to {@link mapValidated} for callers that want to observe a
 * validated value without changing it.
 */
export function tapValidated<T>(
  validator: ValidationStep<T>,
  observe: (value: T) => void,
): ValidationStep<T> {
  return (value: T): ValidationResult<T> => {
    const result = validator(value);
    if (!result.success) return result;
    observe(result.data);
    return success(result.data);
  };
}
