import type { ValidationConstraint } from "../validationConstraints/index.js";
import type {
  ValidationIssue,
  ValidationResult,
} from "../validationResult/validationResult.type.js";
import { failure, success } from "../validationResult/validationResult.type.js";
import type { ValidationSchema } from "../validationSchema/validationSchema.core.js";
import { validate } from "../validationSchema/validationSchema.core.js";
import { checkConstraints } from "../validationConstraints/index.js";
import { ConstraintValidationError } from "../validationErrors/validationError.types.js";

/** A validation operation that receives unknown input. */
export type ValidationStep<T> = (value: T) => ValidationResult<T>;

/** Options for composing validation operations. */
export interface ValidationComposerOptions {
  readonly name?: string;
  /**
   * Stop after the first failing step. Defaults to true.
   *
   * Steps in a pipeline normally build on each other: a later step validating
   * the shape an earlier coercion was supposed to produce will see the raw
   * value instead if the pipeline runs on. Set to false only for pipelines of
   * independent checks, where collecting every issue is the point.
   */
  readonly stopOnFirstError?: boolean;
}

/** Reusable composed validator. */
export interface ValidationComposer<T> {
  readonly name: string;
  /** Whether the pipeline halts at the first failing step. */
  readonly stopOnFirstError: boolean;
  validate(value: T): ValidationResult<T>;
  assert(value: T): T;
}

/** Creates a reusable validator from validation steps. */
export function createValidationComposer<T>(
  steps: readonly ValidationStep<T>[],
  options: ValidationComposerOptions = {},
): ValidationComposer<T> {
  const name = options.name ?? "ValidationComposer";
  const stopOnFirstError = options.stopOnFirstError ?? true;

  return Object.freeze({
    name,
    stopOnFirstError,
    validate(value: T): ValidationResult<T> {
      let current = value;
      const issues: ValidationIssue[] = [];

      for (const step of steps) {
        const result = step(current);
        if (result.success) {
          current = result.data;
          continue;
        }
        issues.push(...result.issues);
        if (stopOnFirstError) break;
      }

      return issues.length > 0 ? failure(issues) : success(current);
    },
    assert(value: T): T {
      const result = this.validate(value);
      if (!result.success)
        throw new ConstraintValidationError(
          `${name} validation failed.`,
          result.issues,
        );
      return result.data;
    },
  });
}

/** Composes multiple schemas into a sequential validation pipeline. */
export function composeSchemas<T>(
  ...schemas: readonly ValidationSchema<T>[]
): ValidationSchema<T> {
  if (schemas.length === 0)
    throw new TypeError("At least one schema is required.");
  const [first, ...rest] = schemas;
  return rest.reduce(
    (current, schema) =>
      (current as unknown as { pipe(s: unknown): unknown }).pipe(
        schema,
      ) as ValidationSchema<T>,
    first!,
  );
}

/** Creates a validation step from a schema. */
export function schemaStep<T>(schema: ValidationSchema<T>): ValidationStep<T> {
  return (value: T): ValidationResult<T> => validate(schema, value);
}

/** Creates a validation step from a constraint. */
export function constraintStep<T>(
  constraint: ValidationConstraint<T>,
): ValidationStep<T> {
  return (value: T): ValidationResult<T> =>
    checkConstraints([constraint], value);
}

/** Creates a validation step from multiple constraints. */
export function constraintsStep<T>(
  constraints: readonly ValidationConstraint<T>[],
): ValidationStep<T> {
  return (value: T): ValidationResult<T> =>
    checkConstraints(constraints, value);
}
