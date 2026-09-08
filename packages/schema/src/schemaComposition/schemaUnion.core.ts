/**
 * @zudojs/schema/composition/union
 *
 * Union schema — validates against multiple schemas, returning the first match.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext, SchemaIssue } from "../schemaBase/index.js";
import {
  addIssue,
  failValidation,
  rethrowUnexpected,
} from "../schemaBase/index.js";
import { SchemaIssueCode } from "@zudojs/constants";

/** Helper type to infer union output from schema array. */
type UnionOutput<TSchemas extends readonly Schema<unknown>[]> =
  TSchemas[number] extends Schema<infer U> ? U : never;

/**
 * Forks a context for one union branch.
 *
 * The branch needs its own `issues` array — a branch that fails must not leave
 * issues behind on the parent — but everything else has to be inherited.
 * Building a brand new root context instead used to drop `abortEarly` and
 * `maxIssues`, reset `depth` to zero (so a union inside a recursive schema
 * restarted the depth count), and abandon the `seen` set that detects cycles.
 */
function branchContext(ctx: SchemaParseContext): SchemaParseContext {
  return {
    issues: [],
    options: ctx.options,
    seen: ctx.seen,
    depth: ctx.depth,
    path: [...ctx.path],
  };
}

/**
 * Schema that accepts values matching any of the provided schemas.
 */
export class UnionSchema<
  TSchemas extends readonly Schema<unknown>[],
> extends Schema<UnionOutput<TSchemas>> {
  public readonly _type = "union";

  constructor(private readonly _schemas: TSchemas) {
    super();
    if (_schemas.length === 0) {
      throw new Error("A union schema requires at least one member schema");
    }
  }

  public _parse(
    ctx: SchemaParseContext,
    input: unknown,
  ): UnionOutput<TSchemas> {
    const branchIssues: SchemaIssue[][] = [];

    for (const schema of this._schemas) {
      const childCtx = branchContext(ctx);
      try {
        const result = schema._parse(childCtx, input);
        if (childCtx.issues.length === 0) {
          return result as UnionOutput<TSchemas>;
        }
        branchIssues.push(childCtx.issues);
      } catch (error) {
        // A genuine fault — a stack overflow, a bug in a refinement — must not
        // be mistaken for "this branch did not match".
        rethrowUnexpected(error);
        branchIssues.push(childCtx.issues);
      }
    }

    addIssue(ctx, {
      code: SchemaIssueCode.INVALID_UNION,
      path: [...ctx.path],
      message: `Invalid union: no matching schema found`,
      // Carry why each branch failed, so the caller can see which one came
      // closest instead of a bare "no match".
      details: {
        branches: branchIssues.map((issues, index) => ({
          schema: this._schemas[index]?._type ?? "unknown",
          issues,
        })),
      },
    });
    failValidation();
  }
}

/**
 * Discriminated union schema — uses a discriminator key to select the right schema.
 */
export class DiscriminatedUnionSchema<
  K extends string,
  TSchemas extends readonly Schema<Record<string, unknown>>[],
> extends Schema<UnionOutput<TSchemas>> {
  public readonly _type = "discriminatedUnion";
  private readonly _schemaMap: Map<string, Schema<unknown>>;

  constructor(
    private readonly _discriminator: K,
    schemas: TSchemas,
  ) {
    super();
    this._schemaMap = new Map();

    for (const schema of schemas) {
      // Key on the literal value each variant declares at the discriminator
      // key. Keying on `schema._type` — which is the string "object" for every
      // object variant — collapsed all variants onto one entry and could never
      // match a real discriminator value.
      const values = discriminatorValuesOf(schema, _discriminator);

      if (values.length === 0) {
        throw new Error(
          `Discriminated union: variant has no literal value at discriminator "${_discriminator}". ` +
            `Declare it as schema.literal(...) or schema.enum([...]) in the variant's shape.`,
        );
      }

      for (const value of values) {
        if (this._schemaMap.has(value)) {
          throw new Error(
            `Discriminated union: duplicate discriminator value "${value}" for "${_discriminator}"`,
          );
        }
        this._schemaMap.set(value, schema);
      }
    }
  }

  /** The discriminator values this union can dispatch on. */
  public get variants(): readonly string[] {
    return [...this._schemaMap.keys()];
  }

  public _parse(
    ctx: SchemaParseContext,
    input: unknown,
  ): UnionOutput<TSchemas> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected object for discriminated union, received ${Array.isArray(input) ? "array" : typeof input}`,
        expected: "object",
        received: Array.isArray(input) ? "array" : typeof input,
      });
      failValidation();
    }

    const obj = input as Record<string, unknown>;
    const rawValue = Object.prototype.hasOwnProperty.call(
      obj,
      this._discriminator,
    )
      ? obj[this._discriminator]
      : undefined;

    if (rawValue === undefined) {
      addIssue(ctx, {
        code: SchemaIssueCode.REQUIRED,
        path: [...ctx.path, this._discriminator],
        message: `Missing discriminator "${this._discriminator}"`,
        expected: `one of [${this.variants.join(", ")}]`,
      });
      failValidation();
    }

    const discriminatorValue = String(rawValue);
    const schema = this._schemaMap.get(discriminatorValue);

    if (schema) {
      return schema._parse(ctx, input) as UnionOutput<TSchemas>;
    }

    addIssue(ctx, {
      code: SchemaIssueCode.INVALID_UNION,
      path: [...ctx.path, this._discriminator],
      message: `No matching variant for discriminator "${this._discriminator}" = "${discriminatorValue}"`,
      expected: `one of [${this.variants.join(", ")}]`,
      received: discriminatorValue,
    });
    failValidation();
  }
}

/**
 * Reads the literal values a variant declares at the discriminator key.
 *
 * Supports `schema.literal(...)` and `schema.enum([...])`, and looks through
 * optional/default wrappers.
 */
function discriminatorValuesOf(
  schema: Schema<unknown>,
  discriminator: string,
): string[] {
  const shape = (
    schema as unknown as { shape?: Record<string, Schema<unknown>> }
  ).shape;
  if (!shape) return [];

  let field: Schema<unknown> | undefined = shape[discriminator];
  if (!field) return [];

  // Look through optional/default wrappers.
  for (let i = 0; i < 8; i++) {
    const current: Schema<unknown> = field;
    const inner: Schema<unknown> | undefined = (
      current as unknown as { _inner?: Schema<unknown> }
    )._inner;
    if (
      (current._type === "optional" ||
        current._type === "nullable" ||
        current._type === "default") &&
      inner !== undefined
    ) {
      field = inner;
      continue;
    }
    break;
  }

  if (field._type === "literal") {
    const literal = (field as unknown as { _expected?: unknown })._expected;
    if (literal !== undefined) return [String(literal)];
  }

  const values = (field as unknown as { _values?: readonly unknown[] })._values;
  if (field._type === "enum" && Array.isArray(values)) {
    return values.map((v) => String(v));
  }

  return [];
}

/** Creates a union schema. */
export function unionSchema<T extends readonly Schema<unknown>[]>(
  schemas: T,
): UnionSchema<T> {
  return new UnionSchema(schemas);
}

/** Creates a discriminated union schema. */
export function discriminatedUnionSchema<
  K extends string,
  T extends readonly Schema<Record<string, unknown>>[],
>(discriminator: K, schemas: T): DiscriminatedUnionSchema<K, T> {
  return new DiscriminatedUnionSchema(discriminator, schemas);
}
