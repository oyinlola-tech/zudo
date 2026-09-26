/**
 * @zudojs/schema/composition/intersection
 *
 * Intersection schema — validates against all schemas, merging results.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { ModifiableSchema } from "../schemaModifiers/schemaModifiable.core.js";

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
export class IntersectionSchema<TLeft, TRight> extends ModifiableSchema<
  TLeft & TRight
> {
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

    return deepMerge(leftResult, rightResult) as TLeft & TRight;
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

/**
 * Merges two validated object results, recursing into nested plain objects.
 *
 * A shallow spread let the right side's `db: { port }` replace the left
 * side's `db: { host, port }`, silently dropping fields the left schema had
 * required and validated. Keys are defined, never assigned, so a `__proto__`
 * key cannot reach the setter. For non-object leaves the right side wins.
 */
function deepMerge(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const source of [left, right]) {
    for (const key of Object.keys(source)) {
      const incoming = source[key];
      const existing = Object.hasOwn(result, key) ? result[key] : undefined;
      const value =
        source === right && isMergeable(existing) && isMergeable(incoming)
          ? deepMerge(existing, incoming)
          : incoming;
      Object.defineProperty(result, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}
