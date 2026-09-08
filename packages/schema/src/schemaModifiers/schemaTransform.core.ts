/**
 * @zudojs/schema/modifiers/transform
 *
 * Transform modifier — applies a transformation function to validated output.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema that transforms the output of an inner schema.
 */
export class TransformModifierSchema<TInput, TOutput> extends Schema<
  TOutput,
  TInput
> {
  public readonly _type = "transform";

  constructor(
    private readonly _inner: Schema<TInput>,
    private readonly _fn: (value: TInput) => TOutput,
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: TInput): TOutput {
    const value = this._inner._parse(ctx, input);
    try {
      return this._fn(value);
    } catch (error) {
      addIssue(ctx, {
        code: SchemaIssueCode.TRANSFORM_FAILED,
        path: [...ctx.path],
        message: `Transform failed: ${String(error)}`,
      });
      failValidation();
    }
  }
}

/** Adds a transformation to a schema. */
export function transformSchema<TInput, TOutput>(
  schema: Schema<TInput>,
  fn: (value: TInput) => TOutput,
): TransformModifierSchema<TInput, TOutput> {
  return new TransformModifierSchema(schema, fn);
}
