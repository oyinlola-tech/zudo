/**
 * @zudojs/schema/result
 *
 * Result constructors and type guards for schema outcomes.
 */

import type {
  SchemaResult,
  SchemaSuccess,
  SchemaFailure,
  SchemaIssue,
  SchemaParseContext,
} from "./schemaBase.type.js";

/**
 * Issues that `maxIssues` kept off an issue list, keyed by that list.
 *
 * Failure used to be decided by `issues.length > 0` alone, so a cap that
 * recorded nothing (`maxIssues: 0`) turned every schema into accept-anything.
 * Counting dropped issues separately keeps "did anything fail" independent of
 * how many issues the caller asked to see.
 */
const droppedIssues = new WeakMap<readonly SchemaIssue[], number>();

/** Records that an issue was raised but not stored because of `maxIssues`. */
export function noteDroppedIssue(ctx: SchemaParseContext): void {
  droppedIssues.set(ctx.issues, (droppedIssues.get(ctx.issues) ?? 0) + 1);
}

/**
 * Total number of issues raised against a context's issue list, including
 * any that `maxIssues` dropped. Use this, not `issues.length`, to decide
 * whether a parse failed.
 */
export function countIssues(ctx: SchemaParseContext): number {
  return ctx.issues.length + (droppedIssues.get(ctx.issues) ?? 0);
}

/** Creates a successful result. */
export function schemaSuccess<T>(data: T): SchemaSuccess<T> {
  return { success: true, data } as const;
}

/** Creates a failure result. */
export function schemaFailure(issues: readonly SchemaIssue[]): SchemaFailure {
  return { success: false, issues } as const;
}

/** Type guard for successful results. */
export function isSchemaSuccess<T>(
  result: SchemaResult<T>,
): result is SchemaSuccess<T> {
  return result.success === true;
}

/** Type guard for failure results. */
export function isSchemaFailure<T>(
  result: SchemaResult<T>,
): result is SchemaFailure {
  return result.success === false;
}

/** Unwraps a result, throwing on failure. */
export function unwrapSchemaResult<T>(result: SchemaResult<T>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(
    `Schema validation failed with ${result.issues.length} issue(s): ${result.issues
      .map((i) => i.message)
      .join("; ")}`,
  );
}
