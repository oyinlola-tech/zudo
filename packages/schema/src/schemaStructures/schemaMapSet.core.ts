/**
 * @zudojs/schema/structures/map-set
 *
 * Map and Set schemas.
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
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema for Map objects.
 */
export class MapSchema<TKey, TValue> extends Schema<Map<TKey, TValue>> {
  public readonly _type = "map";

  constructor(
    private readonly _keySchema: Schema<TKey>,
    private readonly _valueSchema: Schema<TValue>,
  ) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): Map<TKey, TValue> {
    if (!(input instanceof Map)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected Map, received ${typeof input}`,
        expected: "Map",
        received: typeof input,
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      const result = new Map<TKey, TValue>();
      let failed = false;
      let index = 0;

      for (const [key, value] of input) {
        // A child context per entry, so an issue path names the entry rather
        // than pointing at the Map as a whole.
        const entryCtx = childContext(ctx, index++);
        try {
          const k = this._keySchema._parse(entryCtx, key);
          const v = this._valueSchema._parse(entryCtx, value);
          result.set(k, v);
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
}

/**
 * Schema for Set objects.
 */
export class SetSchema<TValue> extends Schema<Set<TValue>> {
  public readonly _type = "set";

  constructor(private readonly _valueSchema: Schema<TValue>) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): Set<TValue> {
    if (!(input instanceof Set)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected Set, received ${typeof input}`,
        expected: "Set",
        received: typeof input,
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      const result = new Set<TValue>();
      let failed = false;
      let index = 0;

      for (const value of input) {
        const entryCtx = childContext(ctx, index++);
        try {
          result.add(this._valueSchema._parse(entryCtx, value));
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
}

/** Creates a map schema from key and value schemas. */
export function mapSchema<TKey, TValue>(
  keySchema: Schema<TKey>,
  valueSchema: Schema<TValue>,
): MapSchema<TKey, TValue> {
  return new MapSchema(keySchema, valueSchema);
}

/** Creates a set schema from a value schema. */
export function setSchema<TValue>(
  valueSchema: Schema<TValue>,
): SetSchema<TValue> {
  return new SetSchema(valueSchema);
}
