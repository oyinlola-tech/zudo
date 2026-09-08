/**
 * @zudojs/schema/primitives/number
 *
 * Number schema with constraints and transformations.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";
import { TransformSchema } from "./schemaTransform.core.js";
import { OptionalModifierSchema } from "../schemaModifiers/schemaOptionalNullable.core.js";
import { NullableModifierSchema } from "../schemaModifiers/schemaOptionalNullable.core.js";
import { DefaultSchema } from "../schemaModifiers/schemaDefault.core.js";
import { RefineSchema } from "../schemaModifiers/schemaRefine.core.js";

/** Configuration for number schema constraints. */
interface NumberSchemaConfig {
  readonly min?: number;
  readonly max?: number;
  readonly int?: boolean;
  readonly positive?: boolean;
  readonly negative?: boolean;
  readonly finite?: boolean;
  readonly safe?: boolean;
  readonly multipleOf?: number;
  readonly gt?: number;
  readonly lt?: number;
}

/**
 * Schema for number values with optional constraints.
 */
export class NumberSchema extends Schema<number> {
  public readonly _type = "number";
  private readonly _config: NumberSchemaConfig;

  constructor(config: NumberSchemaConfig = {}) {
    super();
    this._config = config;
  }

  public _parse(ctx: SchemaParseContext, input: unknown): number {
    if (typeof input !== "number" || Number.isNaN(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected number, received ${typeof input}`,
        expected: "number",
        received: typeof input,
      });
      failValidation();
    }

    this._validateConstraints(ctx, input);
    return input;
  }

  private _validateConstraints(ctx: SchemaParseContext, value: number): void {
    const c = this._config;
    let failed = false;

    if (c.int && !Number.isInteger(value)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_NUMBER,
        path: [...ctx.path],
        message: `Expected integer, received ${value}`,
      });
      failed = true;
    }
    if (c.safe && !Number.isSafeInteger(value)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_NUMBER,
        path: [...ctx.path],
        message: `Expected a safe integer, received ${value}`,
      });
      failed = true;
    }
    if (c.finite && !Number.isFinite(value)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_NUMBER,
        path: [...ctx.path],
        message: `Expected finite number, received ${value}`,
      });
      failed = true;
    }
    if (c.positive && value <= 0) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_SMALL,
        path: [...ctx.path],
        message: `Expected positive number, received ${value}`,
        expected: "> 0",
        received: String(value),
      });
      failed = true;
    }
    if (c.negative && value >= 0) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `Expected negative number, received ${value}`,
        expected: "< 0",
        received: String(value),
      });
      failed = true;
    }
    if (c.min !== undefined && value < c.min) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_SMALL,
        path: [...ctx.path],
        message: `Expected >= ${c.min}, received ${value}`,
        expected: `>= ${c.min}`,
        received: String(value),
      });
      failed = true;
    }
    if (c.max !== undefined && value > c.max) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `Expected <= ${c.max}, received ${value}`,
        expected: `<= ${c.max}`,
        received: String(value),
      });
      failed = true;
    }
    if (c.gt !== undefined && value <= c.gt) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_SMALL,
        path: [...ctx.path],
        message: `Expected > ${c.gt}, received ${value}`,
        expected: `> ${c.gt}`,
        received: String(value),
      });
      failed = true;
    }
    if (c.lt !== undefined && value >= c.lt) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `Expected < ${c.lt}, received ${value}`,
        expected: `< ${c.lt}`,
        received: String(value),
      });
      failed = true;
    }
    if (c.multipleOf !== undefined && !isMultipleOf(value, c.multipleOf)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_NUMBER,
        path: [...ctx.path],
        message: `Expected multiple of ${c.multipleOf}, received ${value}`,
        expected: `multiple of ${c.multipleOf}`,
      });
      failed = true;
    }

    if (failed) {
      failValidation();
    }
  }

  /** Minimum value (inclusive). */
  public min(min: number): NumberSchema {
    return new NumberSchema({ ...this._config, min });
  }

  /** Maximum value (inclusive). */
  public max(max: number): NumberSchema {
    return new NumberSchema({ ...this._config, max });
  }

  /** Must be an integer. */
  public int(): NumberSchema {
    return new NumberSchema({ ...this._config, int: true });
  }

  /** Must be positive (> 0). */
  public positive(): NumberSchema {
    return new NumberSchema({ ...this._config, positive: true });
  }

  /** Must be negative (< 0). */
  public negative(): NumberSchema {
    return new NumberSchema({ ...this._config, negative: true });
  }

  /** Must be finite (not Infinity or -Infinity). */
  public finite(): NumberSchema {
    return new NumberSchema({ ...this._config, finite: true });
  }

  /** Must be a multiple of the given value. */
  public multipleOf(n: number): NumberSchema {
    if (n === 0 || !Number.isFinite(n)) {
      // `value % 0` is NaN, so a zero step made every value fail with a
      // message that read as though the value were at fault.
      throw new RangeError(
        `multipleOf requires a non-zero finite step, got: ${n}`,
      );
    }
    return new NumberSchema({ ...this._config, multipleOf: n });
  }

  /** Must be a safe integer (within Number.MAX_SAFE_INTEGER). */
  public safe(): NumberSchema {
    return new NumberSchema({ ...this._config, safe: true });
  }

  /** Greater than (exclusive). */
  public gt(n: number): NumberSchema {
    return new NumberSchema({ ...this._config, gt: n });
  }

  /** Less than (exclusive). */
  public lt(n: number): NumberSchema {
    return new NumberSchema({ ...this._config, lt: n });
  }

  /** Makes this schema optional (accepts undefined). */
  public optional(): Schema<number | undefined> {
    return new OptionalModifierSchema(this);
  }

  /** Makes this schema nullable (accepts null). */
  public nullable(): Schema<number | null> {
    return new NullableModifierSchema(this);
  }

  /** Adds a default value when input is undefined. */
  public default(defaultValue: number | (() => number)): Schema<number> {
    return new DefaultSchema(this, defaultValue);
  }

  /** Adds a custom refinement check. */
  public refine(
    check: (value: number) => boolean,
    message: string,
  ): Schema<number> {
    return new RefineSchema(this, check, message);
  }

  /** Transforms the number value. */
  public transform<TOutput>(
    fn: (value: number) => TOutput,
  ): TransformSchema<number, TOutput> {
    return new TransformSchema(this, fn);
  }
}

/** Creates a number schema. */
export function numberSchema(): NumberSchema {
  return new NumberSchema();
}

/**
 * Floating-point safe multiple check.
 *
 * `0.3 % 0.1` is 0.09999999999999998, not 0, so the plain modulo rejected
 * values that are multiples in every sense the caller cares about. Comparing
 * the remainder against both 0 and the step absorbs the representation error.
 */
function isMultipleOf(value: number, step: number): boolean {
  const remainder = Math.abs(value % step);
  const tolerance = Math.abs(step) * 1e-9;
  return (
    remainder < tolerance || Math.abs(remainder - Math.abs(step)) < tolerance
  );
}
