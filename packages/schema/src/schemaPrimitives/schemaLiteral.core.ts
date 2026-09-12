/**
 * @zudojs/schema/primitives/literal
 *
 * Literal schema for exact value matching.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { describeValue } from "../schemaBase/schemaBase.describe.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema for a specific literal value.
 */
export class LiteralSchema<
  T extends string | number | boolean | null,
> extends Schema<T> {
  public readonly _type = "literal";

  constructor(private readonly _expected: T) {
    super();
  }

  public _parse(_ctx: SchemaParseContext, input: unknown): T {
    if (input !== this._expected) {
      addIssue(_ctx, {
        code: SchemaIssueCode.INVALID_LITERAL,
        path: [..._ctx.path],
        message: `Expected ${describeValue(this._expected)}, received ${describeValue(input)}`,
        expected: describeValue(this._expected),
        received: describeValue(input),
      });
      failValidation();
    }
    return this._expected;
  }
}

/** Creates a literal schema. */
export function literalSchema<T extends string | number | boolean | null>(
  value: T,
): LiteralSchema<T> {
  return new LiteralSchema(value);
}
