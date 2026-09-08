/**
 * @zudojs/schema/primitives/sentinel
 *
 * Schemas for null, undefined, unknown, any, and never types.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/**
 * Schema that only accepts null.
 */
export class NullSchema extends Schema<null> {
  public readonly _type = "null";

  public _parse(ctx: SchemaParseContext, input: unknown): null {
    if (input !== null) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected null, received ${typeof input}`,
        expected: "null",
        received: typeof input,
      });
      failValidation();
    }
    return null;
  }
}

/**
 * Schema that only accepts undefined.
 */
export class UndefinedSchema extends Schema<undefined> {
  public readonly _type = "undefined";

  public _parse(ctx: SchemaParseContext, input: unknown): undefined {
    if (input !== undefined) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected undefined, received ${typeof input}`,
        expected: "undefined",
        received: typeof input,
      });
      failValidation();
    }
    return undefined;
  }
}

/**
 * Schema that accepts any value without validation.
 */
export class AnySchema extends Schema<unknown> {
  public readonly _type = "any";

  public _parse(_ctx: SchemaParseContext, input: unknown): unknown {
    return input;
  }
}

/**
 * Schema that accepts any value without validation (alias).
 */
export class UnknownSchema extends Schema<unknown> {
  public readonly _type = "unknown";

  public _parse(_ctx: SchemaParseContext, input: unknown): unknown {
    return input;
  }
}

/**
 * Schema that never accepts any value.
 */
export class NeverSchema extends Schema<never> {
  public readonly _type = "never";

  public _parse(ctx: SchemaParseContext, input: unknown): never {
    addIssue(ctx, {
      code: SchemaIssueCode.INVALID_TYPE,
      path: [...ctx.path],
      message: `Expected never, received ${typeof input}`,
      expected: "never",
      received: typeof input,
    });
    failValidation();
  }
}

/** Creates a null schema. */
export function nullSchema(): NullSchema {
  return new NullSchema();
}

/** Creates an undefined schema. */
export function undefinedSchema(): UndefinedSchema {
  return new UndefinedSchema();
}

/** Creates an any schema. */
export function anySchema(): AnySchema {
  return new AnySchema();
}

/** Creates an unknown schema. */
export function unknownSchema(): UnknownSchema {
  return new UnknownSchema();
}

/** Creates a never schema. */
export function neverSchema(): NeverSchema {
  return new NeverSchema();
}

/**
 * Schema that only accepts BigInt values.
 */
export class BigIntSchema extends Schema<bigint> {
  public readonly _type = "bigint";

  public _parse(ctx: SchemaParseContext, input: unknown): bigint {
    if (typeof input !== "bigint") {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected bigint, received ${typeof input}`,
        expected: "bigint",
        received: typeof input,
      });
      failValidation();
    }
    return input;
  }
}

/**
 * Schema that only accepts symbols.
 */
export class SymbolSchema extends Schema<symbol> {
  public readonly _type = "symbol";

  public _parse(ctx: SchemaParseContext, input: unknown): symbol {
    if (typeof input !== "symbol") {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected symbol, received ${typeof input}`,
        expected: "symbol",
        received: typeof input,
      });
      failValidation();
    }
    return input;
  }
}

/** Creates a bigint schema. */
export function bigintSchema(): BigIntSchema {
  return new BigIntSchema();
}

/** Creates a symbol schema. */
export function symbolSchema(): SymbolSchema {
  return new SymbolSchema();
}
