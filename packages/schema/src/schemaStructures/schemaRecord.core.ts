/**
 * @zudojs/schema/structures/record
 *
 * Record schema for objects with constrained keys and values.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { describeType } from "../schemaBase/schemaBase.describe.js";
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
  SCHEMA_FORBIDDEN_KEYS,
  SCHEMA_DEFAULT_MAX_OBJECT_KEYS,
} from "@zudojs/constants";
import { formatCount } from "@zudojs/types";

import { StringSchema } from "../schemaPrimitives/index.js";

/**
 * Schema for record objects with string keys and typed values.
 */
export class RecordSchema<TValue> extends Schema<Record<string, TValue>> {
  public readonly _type = "record";

  constructor(
    private readonly _keySchema: Schema<string>,
    private readonly _valueSchema: Schema<TValue>,
    private readonly _maxKeys: number = SCHEMA_DEFAULT_MAX_OBJECT_KEYS,
  ) {
    super();
  }

  /**
   * Sets the maximum number of keys accepted (default
   * `SCHEMA_DEFAULT_MAX_OBJECT_KEYS`, 100). Raise it for large maps.
   */
  public maxKeys(limit: number): RecordSchema<TValue> {
    return new RecordSchema(this._keySchema, this._valueSchema, limit);
  }

  public _parse(
    ctx: SchemaParseContext,
    input: unknown,
  ): Record<string, TValue> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected record, received ${describeType(input)}`,
        expected: "record",
        received: describeType(input),
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      return this._parseEntries(ctx, input as Record<string, unknown>);
    } finally {
      leaveComposite(ctx, input);
    }
  }

  private _parseEntries(
    ctx: SchemaParseContext,
    obj: Record<string, unknown>,
  ): Record<string, TValue> {
    const result: Record<string, TValue> = {};
    const keys = Object.keys(obj);
    if (!checkKeyCount(ctx, keys.length, this._maxKeys)) failValidation();

    let failed = false;
    for (const key of keys) {
      if (SCHEMA_FORBIDDEN_KEYS.has(key)) {
        addIssue(ctx, {
          code: SchemaIssueCode.INVALID_KEY,
          path: [...ctx.path],
          message: `Forbidden key: ${key}`,
        });
        failed = true;
        continue;
      }

      const keyCtx = childContext(ctx, key);
      const valueCtx = childContext(ctx, key);

      try {
        // Use the *parsed* key: a key schema that trims or lowercases had no
        // effect while the raw key was used for the assignment.
        const parsedKey = this._keySchema._parse(keyCtx, key);
        const value = this._valueSchema._parse(valueCtx, obj[key]);
        Object.defineProperty(result, parsedKey, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
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
  }
}

/**
 * Enforces a ceiling on an object's own key count before its keys are
 * walked. Returns false (with an issue recorded) when the count exceeds it.
 *
 * `SCHEMA_DEFAULT_MAX_OBJECT_KEYS` used to be defined and never read, so a
 * record or passthrough object validated any number of attacker keys.
 */
export function checkKeyCount(
  ctx: SchemaParseContext,
  count: number,
  limit: number,
): boolean {
  if (count <= limit) return true;
  addIssue(ctx, {
    code: SchemaIssueCode.TOO_LARGE,
    path: [...ctx.path],
    message: `Object must have at most ${formatCount(limit, "key")}`,
    expected: `<= ${limit}`,
    received: String(count),
  });
  return false;
}

/** Creates a record schema. */
export function recordSchema<TValue>(
  valueSchema: Schema<TValue>,
): RecordSchema<TValue> {
  return new RecordSchema(new StringSchema(), valueSchema);
}
