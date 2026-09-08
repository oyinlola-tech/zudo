/**
 * @zudojs/schema/context
 *
 * Context creation and manipulation for schema parsing.
 */

import type {
  SchemaParseContext,
  SchemaParseOptions,
  SchemaIssue,
  SchemaPathSegment,
} from "./schemaBase.type.js";
import { SCHEMA_DEFAULT_MAX_DEPTH, SchemaIssueCode } from "@zudojs/constants";

/** Creates a fresh parse context from options. */
export function createParseContext(
  options: SchemaParseOptions = {},
): SchemaParseContext {
  return {
    issues: [],
    options,
    seen: new WeakSet(),
    depth: 0,
    path: [...(options.path ?? [])],
  };
}

/** Creates a child context with a deeper path segment. */
export function childContext(
  ctx: SchemaParseContext,
  segment: SchemaPathSegment,
): SchemaParseContext {
  return {
    issues: ctx.issues,
    options: ctx.options,
    seen: ctx.seen,
    depth: ctx.depth + 1,
    path: [...ctx.path, segment],
  };
}

/** Pushes an issue into the context. Returns true if the issue was added. */
export function addIssue(ctx: SchemaParseContext, issue: SchemaIssue): boolean {
  if (
    ctx.options.maxIssues !== undefined &&
    ctx.issues.length >= ctx.options.maxIssues
  ) {
    return false;
  }
  ctx.issues.push(issue);
  return true;
}

/** Checks whether the context has exceeded maximum depth. */
export function isMaxDepthExceeded(ctx: SchemaParseContext): boolean {
  const limit = ctx.options.maxDepth ?? SCHEMA_DEFAULT_MAX_DEPTH;
  return ctx.depth >= limit;
}

/**
 * Internal sentinel signalling "this branch failed, issues are on the context".
 *
 * Composite schemas used to throw a bare `new Error("Validation failed")` and
 * catch it with `catch {}`. That swallowed genuine faults too — a `RangeError`
 * from stack exhaustion, a `TypeError` from a buggy refinement — and reported
 * them as ordinary validation failures, or in the recursive case as *success*.
 */
export class SchemaValidationSignal extends Error {
  public override readonly name = "SchemaValidationSignal";

  constructor(message = "Validation failed") {
    super(message);
  }
}

/** Throws the internal failure signal. */
export function failValidation(message?: string): never {
  throw new SchemaValidationSignal(message);
}

/**
 * Re-throws anything that is not the internal failure signal.
 *
 * Every composite `catch` runs this so that a real defect propagates instead
 * of being reported as invalid input.
 */
export function rethrowUnexpected(error: unknown): void {
  if (!(error instanceof SchemaValidationSignal)) {
    throw error;
  }
}

/**
 * Guards a composite parse against over-deep and circular input.
 *
 * Records an issue and returns false when the value must not be descended
 * into. `ctx.seen` was previously threaded through every child context and
 * never read, so neither limit had any effect.
 */
export function enterComposite(
  ctx: SchemaParseContext,
  input: unknown,
): boolean {
  if (isMaxDepthExceeded(ctx)) {
    addIssue(ctx, {
      code: SchemaIssueCode.MAX_DEPTH_EXCEEDED,
      path: [...ctx.path],
      message: `Maximum nesting depth of ${ctx.options.maxDepth ?? SCHEMA_DEFAULT_MAX_DEPTH} exceeded`,
    });
    return false;
  }

  if (typeof input === "object" && input !== null) {
    if (ctx.seen.has(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.CIRCULAR_REFERENCE,
        path: [...ctx.path],
        message: "Circular reference detected",
      });
      return false;
    }
    ctx.seen.add(input);
  }

  return true;
}

/** Releases a value recorded by {@link enterComposite}. */
export function leaveComposite(ctx: SchemaParseContext, input: unknown): void {
  if (typeof input === "object" && input !== null) {
    ctx.seen.delete(input);
  }
}

/** Returns true if we should abort after the first issue. */
export function shouldAbortEarly(ctx: SchemaParseContext): boolean {
  return ctx.options.abortEarly === true;
}
