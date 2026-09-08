/**
 * @zudojs/schema/structures/tuple
 *
 * Tuple schema for fixed-length arrays with per-position types.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import {
  addIssue,
  childContext,
  failValidation,
  enterComposite,
  leaveComposite,
  rethrowUnexpected,
} from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/** Helper type to infer tuple output type. */
type InferTuple<T extends readonly Schema<unknown>[]> = {
  [K in keyof T]: T[K] extends Schema<infer U> ? U : never;
};

/**
 * Schema for fixed-length tuples.
 */
export class TupleSchema<
  TSchemas extends readonly Schema<unknown>[],
> extends Schema<InferTuple<TSchemas>> {
  public readonly _type = "tuple";

  constructor(private readonly _schemas: TSchemas) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): InferTuple<TSchemas> {
    if (!Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected tuple, received ${typeof input}`,
        expected: "tuple",
        received: typeof input,
      });
      failValidation();
    }

    if (input.length !== this._schemas.length) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_LENGTH,
        path: [...ctx.path],
        message: `Tuple must have exactly ${this._schemas.length} elements`,
        expected: String(this._schemas.length),
        received: String(input.length),
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      const result: unknown[] = [];
      let failed = false;

      for (let i = 0; i < this._schemas.length; i++) {
        const childCtx = childContext(ctx, i);
        const itemSchema = this._schemas[i];
        if (!itemSchema) continue;
        try {
          result.push(itemSchema._parse(childCtx, input[i]));
        } catch (error) {
          rethrowUnexpected(error);
          // Hold the slot. Skipping the push shifted every later element down
          // a position, so a tuple that failed at index 0 came back with its
          // remaining values misaligned.
          result.push(undefined);
          failed = true;
        }
      }

      if (failed) {
        failValidation();
      }

      return result as InferTuple<TSchemas>;
    } finally {
      leaveComposite(ctx, input);
    }
  }
}

/** Creates a tuple schema from an array of schemas. */
export function tupleSchema<T extends readonly Schema<unknown>[]>(
  schemas: T,
): TupleSchema<T> {
  return new TupleSchema(schemas);
}
