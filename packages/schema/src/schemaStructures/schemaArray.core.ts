/**
 * @zudojs/schema/structures/array
 *
 * Array schema with item validation and length constraints.
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
import {
  SchemaIssueCode,
  SCHEMA_DEFAULT_MAX_ARRAY_LENGTH,
} from "@zudojs/constants";

/** Configuration for array schema. */
interface ArraySchemaConfig<T> {
  readonly itemSchema: Schema<T>;
  readonly min?: number;
  readonly max?: number;
  readonly length?: number;
}

/**
 * Schema for array values.
 */
export class ArraySchema<TOutput> extends Schema<TOutput[]> {
  public readonly _type = "array";
  private readonly _config: ArraySchemaConfig<TOutput>;

  constructor(config: ArraySchemaConfig<TOutput>) {
    super();
    this._config = config;
  }

  public _parse(ctx: SchemaParseContext, input: unknown): TOutput[] {
    if (!Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected array, received ${typeof input}`,
        expected: "array",
        received: typeof input,
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      this._validateLength(ctx, input.length);

      const result: TOutput[] = [];
      let failed = false;
      for (let i = 0; i < input.length; i++) {
        const childCtx = childContext(ctx, i);
        try {
          result.push(this._config.itemSchema._parse(childCtx, input[i]));
        } catch (error) {
          rethrowUnexpected(error);
          failed = true;
          if (ctx.options.abortEarly) break;
        }
      }

      if (failed) {
        failValidation();
      }

      return result;
    } finally {
      leaveComposite(ctx, input);
    }
  }

  private _validateLength(ctx: SchemaParseContext, length: number): void {
    const c = this._config;
    let failed = false;

    // A default ceiling, so an unbounded array schema does not validate a
    // million attacker-supplied elements. Callers who need more say so with
    // an explicit `.max()`.
    const hardMax = c.max ?? SCHEMA_DEFAULT_MAX_ARRAY_LENGTH;
    if (length > hardMax) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `Array must have at most ${hardMax} items`,
        expected: `<= ${hardMax}`,
        received: String(length),
      });
      failed = true;
    }

    if (c.min !== undefined && length < c.min) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_SMALL,
        path: [...ctx.path],
        message: `Array must have at least ${c.min} items`,
        expected: `>= ${c.min}`,
        received: String(length),
      });
      failed = true;
    }
    if (c.max !== undefined && length > c.max) {
      addIssue(ctx, {
        code: SchemaIssueCode.TOO_LARGE,
        path: [...ctx.path],
        message: `Array must have at most ${c.max} items`,
        expected: `<= ${c.max}`,
        received: String(length),
      });
      failed = true;
    }
    if (c.length !== undefined && length !== c.length) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_LENGTH,
        path: [...ctx.path],
        message: `Array must have exactly ${c.length} items`,
        expected: String(c.length),
        received: String(length),
      });
      failed = true;
    }

    if (failed) {
      failValidation();
    }
  }

  /** Minimum number of items (inclusive). */
  public min(min: number): ArraySchema<TOutput> {
    return new ArraySchema({ ...this._config, min });
  }

  /** Maximum number of items (inclusive). */
  public max(max: number): ArraySchema<TOutput> {
    return new ArraySchema({ ...this._config, max });
  }

  /** Exact number of items. */
  public length(length: number): ArraySchema<TOutput> {
    return new ArraySchema({ ...this._config, length });
  }

  /** Array must have at least one item. */
  public nonempty(): ArraySchema<TOutput> {
    return new ArraySchema({ ...this._config, min: 1 });
  }
}

/** Creates an array schema from an item schema. */
export function arraySchema<T>(itemSchema: Schema<T>): ArraySchema<T> {
  return new ArraySchema({ itemSchema });
}
