/**
 * @zudojs/schema/composition/lazy
 *
 * Lazy schema for recursive and self-referencing data structures.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import {
  addIssue,
  failValidation,
  isMaxDepthExceeded,
} from "../schemaBase/index.js";
import { SCHEMA_DEFAULT_MAX_DEPTH, SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema that defers creation of the inner schema until parse time.
 * Essential for recursive data structures like trees and nested comments.
 */
export class LazySchema<TOutput, TInput = TOutput> extends Schema<
  TOutput,
  TInput
> {
  public readonly _type = "lazy";
  private readonly _factory: () => Schema<TOutput, TInput>;
  private _inner: Schema<TOutput, TInput> | undefined;

  constructor(factory: () => Schema<TOutput, TInput>) {
    super();
    this._factory = factory;
  }

  private _resolve(): Schema<TOutput, TInput> {
    if (!this._inner) {
      const resolved = this._factory();
      if ((resolved as unknown) === this) {
        throw new Error(
          "Lazy schema factory returned the lazy schema itself, which would recurse forever",
        );
      }
      this._inner = resolved;
    }
    return this._inner;
  }

  public _parse(ctx: SchemaParseContext, input: TInput): TOutput {
    // Lazy is how recursive schemas are built, so it is the one place where an
    // unbounded structure reliably reaches the stack limit. Only the depth
    // guard belongs here: cycle detection is left to the inner composite,
    // which would otherwise see the value this wrapper had already recorded
    // and report a cycle on the very first visit.
    if (isMaxDepthExceeded(ctx)) {
      addIssue(ctx, {
        code: SchemaIssueCode.MAX_DEPTH_EXCEEDED,
        path: [...ctx.path],
        message: `Maximum nesting depth of ${ctx.options.maxDepth ?? SCHEMA_DEFAULT_MAX_DEPTH} exceeded`,
      });
      failValidation();
    }

    const childCtx: SchemaParseContext = { ...ctx, depth: ctx.depth + 1 };
    return this._resolve()._parse(childCtx, input);
  }
}

/** Creates a lazy schema from a factory function. */
export function lazySchema<TOutput, TInput = TOutput>(
  factory: () => Schema<TOutput, TInput>,
): LazySchema<TOutput, TInput> {
  return new LazySchema(factory);
}
