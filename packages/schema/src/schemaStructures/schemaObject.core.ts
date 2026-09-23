/**
 * @zudojs/schema/structures/object
 *
 * Object schema with shape validation, unknown key handling, and composition methods.
 */

import { Schema } from "../schemaBase/index.js";
import type { SchemaParseContext } from "../schemaBase/index.js";
import { describeType } from "../schemaBase/schemaBase.describe.js";
import {
  addIssue,
  countIssues,
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
import type { ObjectShapeOutput } from "../schemaInference/schemaInfer.type.js";
import { checkKeyCount } from "./schemaRecord.core.js";

/** Shape type — record of property names to schemas. */
export type SchemaShape = Record<string, Schema<unknown>>;

/** Unknown keys handling strategy. */
type UnknownKeyStrategy = "strip" | "strict" | "passthrough";

/** Configuration for object schema. */
interface ObjectSchemaConfig {
  readonly shape: SchemaShape;
  readonly unknownKeys?: UnknownKeyStrategy;
  readonly requiredKeys?: ReadonlySet<string>;
  /** Key ceiling for `strict`/`passthrough` input (never below the shape). */
  readonly maxKeys?: number;
}

/**
 * Schema types known to supply or tolerate a missing value.
 *
 * A missing key is handed to these rather than being reported as required —
 * `.default()` in particular exists precisely to fill in `undefined`, and
 * matching only on `"optional"` meant a defaulted property could never be
 * omitted.
 *
 * This set is a fast path, not the rule. Any other schema is *asked* whether
 * it accepts `undefined` (see {@link probeUndefined}): `schema.undefined()`,
 * a union containing it, or a `refine`/`transform`/`lazy` wrapped around an
 * optional all accept a missing key, and matching on the outer `_type` alone
 * reported every one of them as required.
 */
const ACCEPTS_UNDEFINED = new Set(["optional", "default", "any", "unknown"]);

/**
 * Schema for object values with a defined shape.
 */
export class ObjectSchema<
  TOutput extends Record<string, unknown>,
> extends Schema<TOutput> {
  public readonly _type = "object";
  private readonly _config: ObjectSchemaConfig;
  private readonly _keys: readonly string[];
  private readonly _keySet: ReadonlySet<string>;

  constructor(config: ObjectSchemaConfig) {
    super();
    this._config = config;
    this._keys = Object.keys(config.shape);
    this._keySet = new Set(this._keys);
  }

  /** The shape this schema validates against. */
  public get shape(): SchemaShape {
    return this._config.shape;
  }

  public _parse(ctx: SchemaParseContext, input: unknown): TOutput {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      addIssue(ctx, {
        code: SchemaIssueCode.INVALID_TYPE,
        path: [...ctx.path],
        message: `Expected object, received ${describeType(input)}`,
        expected: "object",
        received: describeType(input),
      });
      failValidation();
    }

    if (!enterComposite(ctx, input)) {
      failValidation();
    }

    try {
      return this._parseShape(ctx, input as Record<string, unknown>);
    } finally {
      leaveComposite(ctx, input);
    }
  }

  private _parseShape(
    ctx: SchemaParseContext,
    obj: Record<string, unknown>,
  ): TOutput {
    const result: Record<string, unknown> = {};
    const inputKeys = Object.keys(obj);

    // `strip` only ever reads the shape's keys; the other strategies walk
    // every input key, so they are bounded before doing so.
    if ((this._config.unknownKeys ?? "strip") !== "strip") {
      const limit = Math.max(
        this._config.maxKeys ?? SCHEMA_DEFAULT_MAX_OBJECT_KEYS,
        this._keys.length,
      );
      if (!checkKeyCount(ctx, inputKeys.length, limit)) failValidation();
    }

    // Check for prototype pollution keys
    for (const key of inputKeys) {
      if (SCHEMA_FORBIDDEN_KEYS.has(key)) {
        addIssue(ctx, {
          code: SchemaIssueCode.INVALID_KEY,
          path: [...ctx.path],
          message: `Forbidden key: ${key}`,
        });
        failValidation();
      }
    }

    // Validate known properties
    for (const key of this._keys) {
      const childCtx = childContext(ctx, key);
      const schema = this._config.shape[key];
      if (!schema) continue;

      // `obj[key]` alone would pick up an inherited member when a shape key
      // collides with one — `toString`, `valueOf` — and validate the
      // prototype's function instead of reporting the property as missing.
      const present = Object.prototype.hasOwnProperty.call(obj, key);
      const value = present ? obj[key] : undefined;

      if (!present || value === undefined) {
        if (this._config.requiredKeys?.has(key)) {
          addIssue(ctx, {
            code: SchemaIssueCode.REQUIRED,
            path: [...childCtx.path],
            message: `Required field missing: ${key}`,
          });
          if (ctx.options.abortEarly) break;
          continue;
        }

        if (this._acceptsUndefined(schema)) {
          // Delegate to the wrapper so `.default()` can supply its value and
          // `.optional()` can return undefined.
          try {
            const produced = schema._parse(childCtx, undefined);
            defineResultKey(result, key, produced, present);
          } catch (error) {
            rethrowUnexpected(error);
            if (ctx.options.abortEarly) break;
          }
          continue;
        }

        // Anything else is asked, in isolation, whether it accepts undefined;
        // a schema that does is not a required field.
        const probe = probeUndefined(schema, childCtx);
        if (probe.accepted) {
          defineResultKey(result, key, probe.value, present);
          continue;
        }

        addIssue(ctx, {
          code: SchemaIssueCode.REQUIRED,
          path: [...childCtx.path],
          message: `Required field missing: ${key}`,
        });
        if (ctx.options.abortEarly) break;
        continue;
      }

      try {
        defineKey(result, key, schema._parse(childCtx, value));
      } catch (error) {
        rethrowUnexpected(error);
        if (ctx.options.abortEarly) break;
      }
    }

    // Handle unknown keys
    const strategy = this._config.unknownKeys ?? "strip";
    if (strategy !== "strip") {
      const extraKeys = Object.keys(obj).filter((k) => !this._keySet.has(k));

      if (strategy === "strict" && extraKeys.length > 0) {
        for (const key of extraKeys) {
          addIssue(ctx, {
            code: SchemaIssueCode.UNKNOWN_KEYS,
            path: [...ctx.path],
            message: `Unknown key: ${key}`,
            details: { key },
          });
        }
        failValidation();
      }

      if (strategy === "passthrough") {
        // Previously nothing copied these across, so `passthrough` behaved
        // exactly like `strip`.
        for (const key of extraKeys) {
          defineKey(result, key, obj[key]);
        }
      }
    }

    return result as TOutput;
  }

  private _acceptsUndefined(schema: Schema<unknown>): boolean {
    return ACCEPTS_UNDEFINED.has(schema._type);
  }

  // --- Composition methods ---

  /** Creates a new schema with only the specified keys. */
  public pick<K extends keyof TOutput>(
    keys: readonly K[],
  ): ObjectSchema<Pick<TOutput, K>> {
    const newShape: Record<string, Schema<unknown>> = {};
    const kept = new Set<string>();
    for (const key of keys) {
      const k = key as string;
      const schema = this._config.shape[k];
      if (schema) {
        newShape[k] = schema;
        kept.add(k);
      }
    }
    return new ObjectSchema({
      shape: newShape as SchemaShape,
      // Narrowing a schema must not quietly relax it: a `.strict()` schema
      // stays strict, and any explicit requiredKeys survive.
      unknownKeys: this._config.unknownKeys,
      maxKeys: this._config.maxKeys,
      requiredKeys: this._intersectRequired(kept),
    });
  }

  /** Creates a new schema without the specified keys. */
  public omit<K extends keyof TOutput>(
    keys: readonly K[],
  ): ObjectSchema<Omit<TOutput, K>> {
    const removed = new Set(keys as readonly string[]);
    const newShape: Record<string, Schema<unknown>> = {};
    const kept = new Set<string>();
    for (const key of this._keys) {
      const schema = this._config.shape[key];
      if (!removed.has(key) && schema) {
        newShape[key] = schema;
        kept.add(key);
      }
    }
    return new ObjectSchema({
      shape: newShape as SchemaShape,
      unknownKeys: this._config.unknownKeys,
      maxKeys: this._config.maxKeys,
      requiredKeys: this._intersectRequired(kept),
    });
  }

  /**
   * Makes all properties optional.
   *
   * A key absent from the input stays absent from the output, and a
   * `.default()` is NOT applied to it: an update schema built with
   * `partial()` must not reset every defaulted field the caller left out.
   * A value that is present is still validated, defaults and all.
   */
  public partial(): ObjectSchema<{ [K in keyof TOutput]?: TOutput[K] }> {
    const newShape: Record<string, Schema<unknown>> = {};
    for (const key of this._keys) {
      const schema = this._config.shape[key];
      if (schema) {
        newShape[key] =
          schema._type === "optional" ||
          schema._type === "any" ||
          schema._type === "unknown"
            ? schema
            : new OptionalSchema(schema);
      }
    }
    return new ObjectSchema({
      shape: newShape as SchemaShape,
      unknownKeys: this._config.unknownKeys,
      maxKeys: this._config.maxKeys,
      // Every key is optional now, so an explicit required list cannot survive.
    });
  }

  /** Makes all properties required. */
  public required(): ObjectSchema<{ [K in keyof TOutput]-?: TOutput[K] }> {
    const newShape: Record<string, Schema<unknown>> = {};
    for (const key of this._keys) {
      const schema = this._config.shape[key];
      if (!schema) continue;
      newShape[key] = unwrapOptional(schema);
    }
    return new ObjectSchema({
      shape: newShape as SchemaShape,
      unknownKeys: this._config.unknownKeys,
      maxKeys: this._config.maxKeys,
      requiredKeys: new Set(Object.keys(newShape)),
    });
  }

  /** Merges another object schema's shape into this one. */
  public extend<TEnd extends Record<string, unknown>>(
    other: ObjectSchema<TEnd>,
  ): ObjectSchema<TOutput & TEnd> {
    const newShape = { ...this._config.shape, ...other._config.shape };
    const requiredKeys = new Set<string>([
      ...(this._config.requiredKeys ?? []),
      ...(other._config.requiredKeys ?? []),
    ]);
    return new ObjectSchema({
      shape: newShape,
      unknownKeys: this._config.unknownKeys,
      maxKeys: this._config.maxKeys,
      ...(requiredKeys.size > 0 ? { requiredKeys } : {}),
    });
  }

  /** Merges two object schemas (last wins on conflicts). */
  public merge<TEnd extends Record<string, unknown>>(
    other: ObjectSchema<TEnd>,
  ): ObjectSchema<TOutput & TEnd> {
    return this.extend(other);
  }

  /** Sets unknown keys strategy to strip. */
  public strip(): ObjectSchema<TOutput> {
    return new ObjectSchema({ ...this._config, unknownKeys: "strip" });
  }

  /** Sets unknown keys strategy to strict (reject unknown). */
  public strict(): ObjectSchema<TOutput> {
    return new ObjectSchema({ ...this._config, unknownKeys: "strict" });
  }

  /**
   * Sets the key ceiling applied in `strict`/`passthrough` mode (default
   * `SCHEMA_DEFAULT_MAX_OBJECT_KEYS`, 100, and never below the shape size).
   */
  public maxKeys(limit: number): ObjectSchema<TOutput> {
    return new ObjectSchema({ ...this._config, maxKeys: limit });
  }

  /** Sets unknown keys strategy to passthrough. */
  public passthrough(): ObjectSchema<TOutput> {
    return new ObjectSchema({ ...this._config, unknownKeys: "passthrough" });
  }

  /** Narrows an explicit required-key set to the keys that still exist. */
  private _intersectRequired(
    kept: ReadonlySet<string>,
  ): Set<string> | undefined {
    const required = this._config.requiredKeys;
    if (!required) return undefined;
    const next = new Set<string>();
    for (const key of required) {
      if (kept.has(key)) next.add(key);
    }
    return next.size > 0 ? next : undefined;
  }
}

/**
 * Parses `undefined` through a schema in an isolated context.
 *
 * The probe has its own issue list so a rejection leaves nothing behind on
 * the real context; everything else (options, depth, cycle set) is inherited.
 */
function probeUndefined(
  schema: Schema<unknown>,
  ctx: SchemaParseContext,
): { readonly accepted: boolean; readonly value?: unknown } {
  const probeCtx: SchemaParseContext = {
    issues: [],
    options: ctx.options,
    seen: ctx.seen,
    depth: ctx.depth,
    path: [...ctx.path],
  };

  try {
    const value = schema._parse(probeCtx, undefined);
    return countIssues(probeCtx) === 0
      ? { accepted: true, value }
      : { accepted: false };
  } catch (error) {
    rethrowUnexpected(error);
    return { accepted: false };
  }
}

/** Removes one layer of optional/default wrapping, if present. */
function unwrapOptional(schema: Schema<unknown>): Schema<unknown> {
  const inner = (schema as unknown as { _inner?: Schema<unknown> })._inner;
  if (
    (schema._type === "optional" || schema._type === "default") &&
    inner !== undefined
  ) {
    return inner;
  }
  return schema;
}

/**
 * Records the value produced for a key the input did not supply a value
 * for. An absent key whose schema produced `undefined` (an `.optional()`)
 * stays absent: an own `undefined` key reads as "set this to nothing" to a
 * repository or a spread, and wiped stored columns. A key the input held
 * as `undefined` keeps its own key.
 */
function defineResultKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  present: boolean,
): void {
  if (value !== undefined || present) {
    defineKey(target, key, value);
  }
}

/**
 * Assigns a key without invoking an inherited setter.
 *
 * Input keys are screened against SCHEMA_FORBIDDEN_KEYS, but a *shape* key is
 * developer-supplied and is not, so plain assignment could still reach the
 * `__proto__` setter here.
 */
function defineKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Wrapper schema that marks an inner schema as optional.
 */
export class OptionalSchema<T> extends Schema<T | undefined> {
  public readonly _type = "optional";

  constructor(public readonly _inner: Schema<T>) {
    super();
  }

  public _parse(ctx: SchemaParseContext, input: unknown): T | undefined {
    if (input === undefined) return undefined;
    return this._inner._parse(ctx, input);
  }
}

/** Creates an object schema from a shape. */
export function objectSchema<T extends Record<string, Schema<unknown>>>(
  shape: T,
): ObjectSchema<ObjectShapeOutput<T>> {
  return new ObjectSchema({ shape: shape as unknown as SchemaShape });
}
