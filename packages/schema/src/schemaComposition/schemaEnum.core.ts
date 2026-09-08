/**
 * @zudojs/schema/composition/enum
 *
 * Enum schema for constrained value sets.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema for a fixed set of allowed values.
 */
export class EnumSchema<T extends string | number> extends Schema<T> {
  public readonly _type = "enum";

  constructor(private readonly _values: readonly T[]) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): T {
    if (!this._values.includes(input as T)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_ENUM,
        path: [...ctx.path],
        message: `Expected one of ${this._values.map((v) => JSON.stringify(v)).join(", ")}`,
        expected: this._values.map((v) => JSON.stringify(v)).join(", "),
        received: JSON.stringify(input),
      });
      failValidation();
    }
    return input as T;
  }

  /** Returns the allowed values. */
  public getValues(): readonly T[] {
    return this._values;
  }
}

/** Creates an enum schema from an array of allowed values. */
export function enumSchema<T extends string | number>(
  values: readonly T[],
): EnumSchema<T> {
  return new EnumSchema(values);
}
