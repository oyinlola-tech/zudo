import type {
  ConstraintOptions,
  ValidationConstraint,
} from "../validationConstraints/index.js";
import {
  checkConstraints,
  createConstraint,
} from "../validationConstraints/index.js";
import type { ValidationResult } from "../validationResult/validationResult.type.js";
import type { ValidationSchema } from "../validationSchema/validationSchema.core.js";
import {
  validate,
  validateAsync,
} from "../validationSchema/validationSchema.core.js";
import {
  createValidationParser,
  createAsyncValidationParser,
  type ValidationParser,
  type AsyncValidationParser,
} from "../validationParser/validationParser.core.js";
import {
  createValidationTransformer,
  createAsyncValidationTransformer,
  type ValidationTransformer,
  type AsyncValidationTransformer,
  type ValidationTransform,
  type AsyncValidationTransform,
} from "../validationTransformer/validationTransformer.core.js";
import {
  createNormalizer,
  createAsyncNormalizer,
  type ValidationNormalizer,
  type AsyncValidationNormalizer,
  type Normalizer,
  type AsyncNormalizer,
} from "../validationNormalizer/validationNormalizer.core.js";
import {
  createValidationComposer,
  type ValidationComposer,
  type ValidationStep,
  type ValidationComposerOptions,
} from "../validationComposer/validationComposer.core.js";
import { ValidationRegistry } from "../validationRegistry/validationRegistry.core.js";

/** Factory options shared by validation components. */
export interface ValidationFactoryOptions {
  readonly registry?: ValidationRegistry;
}

/** Central factory for creating validation components. */
export class ValidationFactory {
  public readonly registry: ValidationRegistry;

  constructor(options: ValidationFactoryOptions = {}) {
    this.registry = options.registry ?? new ValidationRegistry();
  }

  public parser<T>(schema: ValidationSchema<T>): ValidationParser<T> {
    return createValidationParser(schema);
  }

  public asyncParser<T>(schema: ValidationSchema<T>): AsyncValidationParser<T> {
    return createAsyncValidationParser(schema);
  }

  public transformer<T, U>(
    transform: ValidationTransform<T, U>,
  ): ValidationTransformer<T, U> {
    return createValidationTransformer(transform);
  }

  public asyncTransformer<T, U>(
    transform: AsyncValidationTransform<T, U>,
  ): AsyncValidationTransformer<T, U> {
    return createAsyncValidationTransformer(transform);
  }

  public normalizer<T>(normalizer: Normalizer<T>): ValidationNormalizer<T> {
    return createNormalizer(normalizer);
  }

  public asyncNormalizer<T>(
    normalizer: AsyncNormalizer<T>,
  ): AsyncValidationNormalizer<T> {
    return createAsyncNormalizer(normalizer);
  }

  public composer<T>(
    steps: readonly ValidationStep<T>[],
    options?: ValidationComposerOptions,
  ): ValidationComposer<T> {
    return createValidationComposer(steps, options);
  }

  public constraint<T>(
    validateValue: (value: T) => boolean,
    options: ConstraintOptions<T> = {},
  ): ValidationConstraint<T> {
    return createConstraint(validateValue, options);
  }

  public validate<T>(
    schema: ValidationSchema<T>,
    value: unknown,
  ): ValidationResult<T> {
    return validate(schema, value);
  }

  public validateAsync<T>(
    schema: ValidationSchema<T>,
    value: unknown,
  ): Promise<ValidationResult<T>> {
    return validateAsync(schema, value);
  }

  public check<T>(
    constraints: readonly ValidationConstraint<T>[],
    value: T,
  ): ValidationResult<T> {
    return checkConstraints(constraints, value);
  }

  public registerSchema<T>(
    name: string,
    schema: ValidationSchema<T>,
    description?: string,
  ): this {
    this.registry.registerSchema(name, schema, { description });
    return this;
  }

  public registerConstraints<T>(
    name: string,
    constraints: readonly ValidationConstraint<T>[],
    description?: string,
  ): this {
    this.registry.registerConstraints(name, constraints, { description });
    return this;
  }

  public validateRegistered<T>(
    name: string,
    value: unknown,
  ): ValidationResult<T> {
    return this.registry.validate<T>(name, value);
  }
}

/** Creates a new validation factory. */
export function createValidationFactory(
  options: ValidationFactoryOptions = {},
): ValidationFactory {
  return new ValidationFactory(options);
}

/**
 * Create a factory that shares a registry with an existing one.
 *
 * Prefer this to a process-wide singleton: a shared factory means one module
 * calling `registry.clear()` silently removes rules another module registered.
 */
export function createScopedValidationFactory(
  parent: ValidationFactory,
): ValidationFactory {
  return new ValidationFactory({ registry: parent.registry });
}
