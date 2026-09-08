/**
 * @zudojs/schema/composition/intersection
 *
 * Intersection schema — validates against all schemas, merging results.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import {
  addIssue,
  failValidation,
  rethrowUnexpected,
} from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema that accepts values matching all provided schemas.
 * Results are merged left to right.
 */
export class IntersectionSchema<TLeft, TRight> extends Schema<TLeft & TRight> {
  public readonly _type = "intersection";

  constructor(
    private readonly _left: Schema<TLeft>,
    private readonly _right: Schema<TRight>,
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): TLeft & TRight {
    let leftResult: TLeft;
    try {
      leftResult = this._left._parse(ctx, input);
    } catch (error) {
      rethrowUnexpected(error);
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_UNION,
        path: [...ctx.path],
        message: "Intersection left schema failed",
      });
      failValidation();
    }

    let rightResult: TRight;
    try {
      rightResult = this._right._parse(ctx, input);
    } catch (error) {
      rethrowUnexpected(error);
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_UNION,
        path: [...ctx.path],
        message: "Intersection right schema failed",
      });
      failValidation();
    }

    // Only object results can be merged. Spreading two strings produced a
    // character-indexed object typed as `string & string`, which is nonsense
    // the type system cannot catch.
    if (!isMergeable(leftResult) || !isMergeable(rightResult)) {
      if (Object.is(leftResult, rightResult)) {
        // Two schemas that validated the same primitive agree on it.
        return leftResult as TLeft & TRight;
      }
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message:
          "Intersection can only merge object results; both sides produced " +
          "values that disagree",
      });
      failValidation();
    }

    return { ...leftResult, ...rightResult } as TLeft & TRight;
  }
}

/** Creates an intersection schema from two schemas. */
export function intersectionSchema<TLeft, TRight>(
  left: Schema<TLeft>,
  right: Schema<TRight>,
): IntersectionSchema<TLeft, TRight> {
  return new IntersectionSchema(left, right);
}

/** True when a parse result can participate in an object merge. */
function isMergeable(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}
