/**
 * @zudojs/schema/structures/record
 *
 * Record schema for objects with constrained keys and values.
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
import { SchemaIssueCode, SCHEMA_FORBIDDEN_KEYS } from "@zudojs/constants";
import { StringSchema } from "../schemaPrimitives/index.js";

/**
 * Schema for record objects with string keys and typed values.
 */
export class RecordSchema<TValue> extends Schema<Record<string, TValue>> {
  public readonly _type = "record";

  constructor(
    private readonly _keySchema: Schema<string>,
    private readonly _valueSchema: Schema<TValue>,
  ) {
    super();
  }

  public _parse(
    ctx: SchemaParseContext,
    input: unknown,
  ): Record<string, TValue> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected record, received ${Array.isArray(input) ? "array" : typeof input}`,
        expected: "record",
        received: Array.isArray(input) ? "array" : typeof input,
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

    let failed = false;
    for (const key of Object.keys(obj)) {
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

/** Creates a record schema. */
export function recordSchema<TValue>(
  valueSchema: Schema<TValue>,
): RecordSchema<TValue> {
  return new RecordSchema(new StringSchema(), valueSchema);
}
