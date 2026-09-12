/**
 * Schema that applies a transform function to the output of another schema.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { describeThrown } from "../schemaBase/schemaBase.describe.js";
import { SchemaIssueCode } from "@zudojs/constants";

export class TransformSchema<TInput, TOutput> extends Schema<TOutput> {
  public readonly _type = "transform";

  constructor(
    private readonly _base: Schema<TInput>,
    private readonly _fn: (value: TInput) => TOutput,
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): TOutput {
    const value = this._base._parse(ctx, input);
    try {
      return this._fn(value);
    } catch (error) {
      addIssue(ctx, {
        code: SchemaIssueCode.TRANSFORM_FAILED,
        path: [...ctx.path],
        message: `Transform failed: ${describeThrown(error)}`,
      });
      failValidation();
    }
  }
}
