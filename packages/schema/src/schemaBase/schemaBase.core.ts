/**
 * @zudojs/schema/base
 *
 * Abstract base class for all Zudojs schemas.
 * Defines the core parsing pipeline: Input → validate → Output.
 */

import type {
  SchemaParseContext,
  SchemaParseOptions,
  SchemaResult,
  SchemaMetadata,
} from "./schemaBase.type.js";
import { createParseContext } from "./schemaBase.context.js";
import { schemaSuccess, schemaFailure } from "./schemaBase.result.js";
import { SchemaError } from "@zudojs/errors";

/**
 * Base schema class. All schema types extend this.
 *
 * @typeParam TOutput - The output type after parsing/transforms.
 * @typeParam TInput - The input type (defaults to TOutput).
 */
export abstract class Schema<TOutput, TInput = TOutput> {
  /** The schema type name for debugging. */
  public abstract readonly _type: string;

  /** Optional metadata (description, example, etc.). */
  protected _metadata: SchemaMetadata | undefined;

  /**
   * Internal parse implementation — subclasses implement this.
   */
  public abstract _parse(ctx: SchemaParseContext, input: unknown): TOutput;

  /**
   * Parses input and returns the output value.
   * Throws SchemaError on failure.
   *
   * Accepts `unknown` — the whole point of a schema is to validate values
   * that are not yet known to match `TInput`. Use `SchemaInput<T>` when the
   * declared input type is needed for inference.
   */
  public parse(input: unknown, options?: SchemaParseOptions): TOutput {
    const ctx = createParseContext(options);
    try {
      const data = this._parse(ctx, input);

      // Not every schema signals failure by throwing: composite schemas
      // collect issues on the context and return a partial value. Without
      // this check `parse` would hand back that partial value while
      // `safeParse` reported the very same input as invalid.
      if (ctx.issues.length > 0) {
        throw new SchemaError("Validation failed", {
          issues: [...ctx.issues],
        });
      }

      return data;
    } catch (error) {
      if (error instanceof SchemaError) {
        throw error;
      }
      throw new SchemaError(describeThrown(error), {
        issues: ctx.issues.length > 0 ? ctx.issues : undefined,
        cause: error,
      });
    }
  }

  /**
   * Parses input and returns a discriminated result.
   * Never throws.
   */
  public safeParse(
    input: unknown,
    options?: SchemaParseOptions,
  ): SchemaResult<TOutput> {
    const ctx = createParseContext(options);
    try {
      const data = this._parse(ctx, input);
      if (ctx.issues.length > 0) {
        return schemaFailure([...ctx.issues]);
      }
      return schemaSuccess(data);
    } catch {
      if (ctx.issues.length > 0) {
        return schemaFailure([...ctx.issues]);
      }
      return schemaFailure([
        {
          code: "custom",
          path: [],
          message: "Unknown validation error",
        },
      ]);
    }
  }

  /**
   * Returns the output type TOutput. Runtime no-op, purely for type inference.
   */
  public _output(): TOutput {
    return undefined as unknown as TOutput;
  }

  /**
   * Returns the input type TInput. Runtime no-op, purely for type inference.
   */
  public _input(): TInput {
    return undefined as unknown as TInput;
  }

  /** Attaches metadata to the schema. */
  public describe(description: string): this {
    this._metadata = { ...this._metadata, description };
    return this;
  }

  /** Attaches example metadata. */
  public example(value: unknown): this {
    this._metadata = { ...this._metadata, example: value };
    return this;
  }

  /** Attaches title metadata. */
  public title(title: string): this {
    this._metadata = { ...this._metadata, title };
    return this;
  }

  /** Marks the schema as deprecated. */
  public deprecated(): this {
    this._metadata = { ...this._metadata, deprecated: true };
    return this;
  }

  /** Returns the current metadata. */
  public getMetadata(): SchemaMetadata | undefined {
    return this._metadata;
  }
}

/**
 * Produces a safe message for an arbitrary thrown value. `String(value)` throws
 * for null-prototype objects and objects whose `toString` throws, which would
 * turn a schema failure into an unrelated TypeError.
 */
function describeThrown(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "Schema parsing failed.";
  }
}
