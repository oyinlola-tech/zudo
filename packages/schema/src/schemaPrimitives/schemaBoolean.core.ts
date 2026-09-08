/**
 * @zudojs/schema/primitives/boolean
 *
 * Boolean schema with optional coercion.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { addIssue, failValidation } from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/** Configuration for boolean schema. */
interface BooleanSchemaConfig {
  readonly coerce?: boolean;
}

/**
 * Schema for boolean values.
 */
export class BooleanSchema extends Schema<boolean> {
  public readonly _type = "boolean";
  private readonly _config: BooleanSchemaConfig;

  constructor(config: BooleanSchemaConfig = {}) {
    super();
    this._config = config;
  }

  public _parse(ctx: SchemaParseContext, input: unknown): boolean {
    if (typeof input === "boolean") {
      return input;
    }

    if (this._config.coerce) {
      if (input === "true" || input === 1) return true;
      if (input === "false" || input === 0) return false;
    }

    addIssue(ctx, {
      code: SchemaIssueCode.INVALID_TYPE,
      path: [...ctx.path],
      message: `Expected boolean, received ${typeof input}`,
      expected: "boolean",
      received: typeof input,
    });
    failValidation();
  }

  /** Enables coercion from string/number to boolean. */
  public coerce(): BooleanSchema {
    return new BooleanSchema({ coerce: true });
  }
}

/** Creates a boolean schema. */
export function booleanSchema(): BooleanSchema {
  return new BooleanSchema();
}
