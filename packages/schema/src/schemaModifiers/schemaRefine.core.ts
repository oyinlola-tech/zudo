/**
 * @zudojs/schema/modifiers/refine
 *
 * Refine schema — adds custom synchronous validation logic.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { describeThrown } from "../schemaBase/schemaBase.describe.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema that adds a custom refinement check to another schema.
 */
export class RefineSchema<T> extends Schema<T> {
  public readonly _type = "refine";

  constructor(
    private readonly _inner: Schema<T>,
    private readonly _check: (value: T) => boolean,
    private readonly _message: string,
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): T {
    const value = this._inner._parse(ctx, input);

    let passed: boolean;
    try {
      passed = this._check(value);
    } catch (error) {
      // A throwing predicate is a defect in the caller's code, not invalid
      // input — surface it with context rather than as a bare failure.
      addIssue(ctx, {
        code: SchemaIssueCode.REFINE_FAILED,
        path: [...ctx.path],
        message: `Refinement threw: ${describeThrown(error)}`,
      });
      failValidation();
    }

    if (!passed) {
      addIssue(ctx, {
        code: SchemaIssueCode.CUSTOM,
        path: [...ctx.path],
        message: this._message,
      });
      failValidation();
    }

    return value;
  }
}

/** Adds a custom refinement check to a schema. */
export function refineSchema<T>(
  schema: Schema<T>,
  check: (value: T) => boolean,
  message: string,
): RefineSchema<T> {
  return new RefineSchema(schema, check, message);
}
