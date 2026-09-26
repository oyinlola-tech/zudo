/**
 * @zudojs/schema/composition/enum
 *
 * Enum schema for constrained value sets.
 */

import type { SchemaParseContext } from "../schemaBase/index.js";
import { ModifiableSchema } from "../schemaModifiers/schemaModifiable.core.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { describeValue } from "../schemaBase/schemaBase.describe.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema for a fixed set of allowed values.
 *
 * `T` is a `const` type parameter so the members stay literal even when the
 * schema is written inline inside `union([...])` or an object shape. There
 * the contextual return type (`Schema<unknown>`) used to widen `T` to
 * `string`, and `parse()` on the union returned `string` while `Infer<>` on
 * the same schema written on its own line gave the literal union.
 */
export class EnumSchema<const T extends string | number> extends ModifiableSchema<T> {
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
        received: describeValue(input),
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
export function enumSchema<const T extends string | number>(
  values: readonly T[],
): EnumSchema<T> {
  return new EnumSchema(values);
}
