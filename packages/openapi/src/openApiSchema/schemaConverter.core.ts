import type { OpenAPISchema } from "../openApiTypes/openApiTypes.core.js";
import { DEFAULT_OPENAPI_VERSION } from "../openApiConstants/openApiConstants.core.js";

/**
 * Converts `@zudojs/schema` schemas into OpenAPI schema objects.
 *
 * The conversion reads the schema classes' runtime fields directly rather
 * than importing them, so this package stays usable with any object that
 * follows the same shape. That structural coupling is the reason every field
 * name below is named in one place and covered by tests: a rename in
 * `@zudojs/schema` is not a compile error here, it is a silently empty
 * document.
 *
 * Field names as of `@zudojs/schema@0.1.0`:
 *   object   `_config.shape`, `_config.requiredKeys` (a Set), `_config.unknownKeys`
 *   array    `_config.itemSchema`, `_config.min`, `_config.max`, `_config.length`
 *   string   `_config.min|max|length|pattern|format`
 *   number   `_config.min|max|int|gt|lt|multipleOf`
 *   coerce.string / coerce.number
 *            `_constraints` — the wrapped StringSchema / NumberSchema that
 *            carries the `_config` above
 *   union    `_schemas`          intersection `_left` / `_right`
 *   enum     `_values`           literal      `_expected`
 *   optional `_inner`            nullable     `_inner`
 *   default  `_inner`, `_defaultValue` (a value or a factory function)
 *   refine   `_inner`
 *   transform `_inner` (`schema.transform(...)`, TransformModifierSchema)
 *             or `_base` (the standalone TransformSchema class)
 *   lazy     `_factory` / `_inner`
 *   record   `_keySchema`, `_valueSchema`     tuple  `_schemas`
 *   map      `_keySchema`, `_valueSchema`     set    `_valueSchema`
 *   metadata `_metadata` (description, example, title, deprecated)
 *
 * Object parsing accepts a missing key when the field schema is one of
 * `optional`, `default`, `any` or `unknown` (`ACCEPTS_UNDEFINED` in
 * schemaObject.core.ts), so exactly those are left out of `required`.
 */

export interface SchemaConversionResult {
  readonly schema: OpenAPISchema;
  readonly warnings: readonly string[];
}

/** Options controlling how a schema is converted. */
export interface SchemaConversionOptions {
  /**
   * Target specification version. 3.1 expresses nullability as
   * `type: [t, "null"]`; 3.0 uses `nullable: true`, which 3.1 removed.
   */
  readonly version?: string;
  /**
   * Depth at which conversion stops descending. Guards against a recursive
   * schema whose `lazy` wrapper resolves to itself. Default: 32.
   */
  readonly maxDepth?: number;
}

interface ConversionState {
  readonly warnings: string[];
  readonly visited: Set<object>;
  readonly version: string;
  readonly maxDepth: number;
  depth: number;
}

/** Metadata attached by `.describe()`, `.example()`, `.title()`, `.deprecated()`. */
interface SchemaMetadata {
  readonly description?: string;
  readonly example?: unknown;
  readonly deprecated?: boolean;
  readonly title?: string;
}

/** The structural shape this converter reads. */
interface SchemaLike {
  readonly _type: string;
  readonly _metadata?: SchemaMetadata;
  readonly [key: string]: unknown;
}

/** Maps `@zudojs/schema` string formats onto OpenAPI `format` values. */
const STRING_FORMATS: Readonly<Record<string, string>> = {
  email: "email",
  url: "uri",
  uuid: "uuid",
  "uuid-v4": "uuid",
  datetime: "date-time",
  date: "date",
  time: "time",
  ipv4: "ipv4",
  ipv6: "ipv6",
};

/**
 * Assigns a property that may be named `__proto__`.
 *
 * `properties["__proto__"] = schema` on a plain object literal sets the
 * object's prototype instead of adding a member: the property vanishes from
 * the generated document with no error anywhere. A schema field genuinely
 * called `__proto__` is unusual; one supplied by an attacker to make a
 * constraint disappear from the published contract is exactly the point.
 */
function defineProperty<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function isSchemaLike(value: unknown): value is SchemaLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { _type?: unknown })._type === "string"
  );
}

/**
 * Field schemas for which `ObjectSchema` accepts a missing key. Mirrors
 * `ACCEPTS_UNDEFINED` in `@zudojs/schema`: a field with a default is filled
 * in when absent, so documenting it as `required` publishes a contract
 * stricter than the code that validates against it.
 */
const ACCEPTS_MISSING_KEY: ReadonlySet<string> = new Set([
  "optional",
  "default",
  "any",
  "unknown",
]);

function acceptsMissingKey(value: unknown): boolean {
  return isSchemaLike(value) && ACCEPTS_MISSING_KEY.has(value._type);
}

/**
 * The schema a `coerce.*` wrapper delegates its constraints to.
 *
 * `s.coerce.number().int().min(1)` keeps `int` and `min` on the wrapped
 * `NumberSchema` under `_constraints`, not on the wrapper's own `_config`;
 * reading the wrapper alone yields a bare `{ type: "number" }`.
 */
function coercionTarget(schema: SchemaLike): SchemaLike {
  const constraints = schema["_constraints"];
  return isSchemaLike(constraints) ? constraints : schema;
}

/**
 * Resolves a `default` schema's value, which may be a factory function.
 *
 * A factory (`.default(() => new Date())`) is invoked once for the document.
 * Emitting the function itself produces a `default` that `JSON.stringify`
 * silently drops and the YAML serializer renders as source text.
 */
function resolveDefaultValue(
  schema: SchemaLike,
  state: ConversionState,
): unknown {
  const raw = schema["_defaultValue"];
  if (typeof raw !== "function") return raw;
  try {
    return (raw as () => unknown)();
  } catch (error) {
    state.warnings.push(
      `A \`default\` factory threw and its value was omitted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function extractMeta(schema: SchemaLike): Partial<OpenAPISchema> {
  const meta = schema._metadata;
  if (!meta) return {};
  return {
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.example !== undefined ? { example: meta.example } : {}),
    ...(meta.deprecated ? { deprecated: true } : {}),
    ...(meta.title ? { title: meta.title } : {}),
  };
}

function config(schema: SchemaLike): Record<string, unknown> {
  const raw = schema["_config"];
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** True when the document being produced follows OpenAPI 3.1 or later. */
export function isVersion31(version: string): boolean {
  return !version.startsWith("3.0");
}

/**
 * Applies nullability in the way the target version expresses it.
 *
 * 3.1 dropped `nullable` in favour of a type union, so emitting `nullable`
 * into a 3.1 document produces a schema validators quietly ignore.
 */
function applyNullable(schema: OpenAPISchema, version: string): OpenAPISchema {
  if (!isVersion31(version)) {
    return { ...schema, nullable: true };
  }

  if (schema.type === undefined) {
    // No type to widen — express it as a union with the null type.
    return { ...schema, anyOf: [...(schema.anyOf ?? []), { type: "null" }] };
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("null")) return schema;
  return { ...schema, type: [...types, "null"] };
}

function convertString(
  schema: SchemaLike,
  state: ConversionState,
): OpenAPISchema {
  const c = config(schema);
  const format = typeof c["format"] === "string" ? c["format"] : undefined;
  const pattern = c["pattern"];
  const exact = num(c["length"]);

  if (format !== undefined && STRING_FORMATS[format] === undefined) {
    state.warnings.push(
      `String format "${format}" has no OpenAPI equivalent; the constraint ` +
        `was dropped from the schema.`,
    );
  }

  if (pattern instanceof RegExp) {
    // `pattern` in JSON Schema carries no flags. An `i` regex silently
    // becomes case-sensitive in the document, so the published contract is
    // stricter than the code that validates against it — the kind of drift
    // that only shows up as a rejected request in production.
    const meaningful = pattern.flags.replace(/[gy]/g, "");
    if (meaningful.length > 0) {
      state.warnings.push(
        `Pattern /${pattern.source}/${pattern.flags} has flags OpenAPI ` +
          `cannot express; the emitted pattern is case- and mode-sensitive.`,
      );
    }
  } else if (pattern !== undefined && typeof pattern !== "string") {
    state.warnings.push(
      "A `pattern` constraint was not a RegExp and could not be emitted.",
    );
  }

  return {
    type: "string",
    ...(format && STRING_FORMATS[format]
      ? { format: STRING_FORMATS[format] }
      : {}),
    ...(exact !== undefined
      ? { minLength: exact, maxLength: exact }
      : {
          ...(num(c["min"]) !== undefined ? { minLength: num(c["min"]) } : {}),
          ...(num(c["max"]) !== undefined ? { maxLength: num(c["max"]) } : {}),
        }),
    ...(pattern instanceof RegExp
      ? { pattern: pattern.source }
      : typeof pattern === "string"
        ? { pattern }
        : {}),
  };
}

/**
 * Renders an exclusive bound the way the target version spells it.
 *
 * 3.1 (JSON Schema 2020-12) gives `exclusiveMinimum` the numeric bound. 3.0
 * defines it as a *boolean* modifier on `minimum`, so emitting the number
 * into a 3.0 document produces a keyword of the wrong type: a strict
 * validator rejects the document and a lenient one ignores the bound — either
 * way the constraint is gone.
 */
function exclusiveBound(
  kind: "minimum" | "maximum",
  value: number,
  version: string,
): OpenAPISchema {
  if (isVersion31(version)) {
    return kind === "minimum"
      ? { exclusiveMinimum: value }
      : { exclusiveMaximum: value };
  }
  return kind === "minimum"
    ? { minimum: value, exclusiveMinimum: true }
    : { maximum: value, exclusiveMaximum: true };
}

function convertNumber(
  schema: SchemaLike,
  state: ConversionState,
): OpenAPISchema {
  const c = config(schema);
  const gt = num(c["gt"]);
  const lt = num(c["lt"]);
  const version = state.version;

  const exclusiveMin =
    gt !== undefined
      ? gt
      : c["positive"] === true && num(c["min"]) === undefined
        ? 0
        : undefined;
  const exclusiveMax =
    lt !== undefined
      ? lt
      : c["negative"] === true && num(c["max"]) === undefined
        ? 0
        : undefined;

  return {
    type: c["int"] === true ? "integer" : "number",
    ...(num(c["min"]) !== undefined ? { minimum: num(c["min"]) } : {}),
    ...(num(c["max"]) !== undefined ? { maximum: num(c["max"]) } : {}),
    ...(num(c["multipleOf"]) !== undefined
      ? { multipleOf: num(c["multipleOf"]) }
      : {}),
    ...(exclusiveMin !== undefined
      ? exclusiveBound("minimum", exclusiveMin, version)
      : {}),
    ...(exclusiveMax !== undefined
      ? exclusiveBound("maximum", exclusiveMax, version)
      : {}),
  };
}

/** Infers the JSON Schema type of a literal or enum member. */
function typeOfValue(value: unknown): string | undefined {
  if (typeof value === "string") return "string";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (value === null) return "null";
  return undefined;
}

function enumSchema(
  values: readonly unknown[],
  version?: string,
): OpenAPISchema {
  const types = new Set(values.map(typeOfValue));
  const type = types.size === 1 ? [...types][0] : undefined;
  // `"null"` is not a type in 3.0; leaving the enum untyped is correct there.
  const usable =
    type === "null" && version !== undefined && !isVersion31(version)
      ? undefined
      : type;
  return {
    ...(usable ? { type: usable } : {}),
    enum: [...values],
  };
}

function convertNode(input: unknown, state: ConversionState): OpenAPISchema {
  if (state.depth > state.maxDepth) {
    state.warnings.push(
      `Schema nesting exceeded the maximum depth of ${state.maxDepth}.`,
    );
    return {};
  }

  if (!isSchemaLike(input)) {
    return convertLiteralValue(input, state);
  }

  // Cycle guard. `lazy` schemas exist precisely to describe self-referential
  // shapes, so without this a comment-with-replies schema recurses until the
  // stack gives out.
  if (state.visited.has(input)) {
    state.warnings.push(
      `Recursive schema detected at "${input._type}"; emitted an empty schema. ` +
        `Register the schema as a named component and reference it with $ref.`,
    );
    return {};
  }
  state.visited.add(input);
  state.depth++;

  try {
    return { ...convertSchemaNode(input, state), ...extractMeta(input) };
  } finally {
    state.depth--;
    state.visited.delete(input);
  }
}

function convertSchemaNode(
  schema: SchemaLike,
  state: ConversionState,
): OpenAPISchema {
  const c = config(schema);

  switch (schema._type) {
    case "string":
      return convertString(schema, state);

    case "coerce.string":
      return convertString(coercionTarget(schema), state);

    case "number":
      return convertNumber(schema, state);

    case "coerce.number":
      return convertNumber(coercionTarget(schema), state);

    case "boolean":
    case "coerce.boolean":
      return { type: "boolean" };

    case "bigint":
    case "coerce.bigint":
      return { type: "string", format: "int64" };

    case "null":
      // 3.0 has no `null` type; `nullable` on an untyped schema is the
      // closest it can express.
      return isVersion31(state.version)
        ? { type: "null" }
        : { nullable: true };

    case "any":
    case "unknown":
      return {};

    case "never":
      return { not: {} };

    case "undefined":
      state.warnings.push(
        "An `undefined` schema has no OpenAPI equivalent; emitted an empty schema.",
      );
      return {};

    case "object": {
      const shape = (c["shape"] as Record<string, unknown> | undefined) ?? {};
      const requiredKeys = c["requiredKeys"];
      const properties: Record<string, OpenAPISchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        defineProperty(properties, key, convertNode(value, state));
        // A field is required unless the object parser accepts its absence
        // (`optional`, `default`, `any`, `unknown`). An explicit
        // `requiredKeys` set (from `.required()`) forces it back on.
        const forced = requiredKeys instanceof Set && requiredKeys.has(key);
        if (forced || !acceptsMissingKey(value)) required.push(key);
      }

      const unknownKeys = c["unknownKeys"];
      return {
        type: "object",
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
        ...(required.length > 0 ? { required } : {}),
        ...(unknownKeys === "strip" || unknownKeys === "strict"
          ? { additionalProperties: false }
          : {}),
      };
    }

    case "record": {
      const valueSchema = c["_valueSchema"] ?? schema["_valueSchema"];
      return {
        type: "object",
        additionalProperties:
          valueSchema === undefined ? true : convertNode(valueSchema, state),
      };
    }

    case "array": {
      const items = c["itemSchema"];
      const exact = num(c["length"]);
      return {
        type: "array",
        ...(items !== undefined ? { items: convertNode(items, state) } : {}),
        ...(exact !== undefined
          ? { minItems: exact, maxItems: exact }
          : {
              ...(num(c["min"]) !== undefined
                ? { minItems: num(c["min"]) }
                : {}),
              ...(num(c["max"]) !== undefined
                ? { maxItems: num(c["max"]) }
                : {}),
            }),
      };
    }

    case "set": {
      const valueSchema = schema["_valueSchema"];
      return {
        type: "array",
        uniqueItems: true,
        ...(valueSchema !== undefined
          ? { items: convertNode(valueSchema, state) }
          : {}),
      };
    }

    case "map": {
      const valueSchema = schema["_valueSchema"];
      state.warnings.push(
        "A `map` schema is represented as an object with additionalProperties; " +
          "non-string keys cannot be expressed in OpenAPI.",
      );
      return {
        type: "object",
        additionalProperties:
          valueSchema === undefined ? true : convertNode(valueSchema, state),
      };
    }

    case "tuple": {
      const schemas = schema["_schemas"];
      if (!Array.isArray(schemas)) return { type: "array" };
      const items = schemas.map((entry) => convertNode(entry, state));
      if (!isVersion31(state.version)) {
        // 3.0 has no positional items. `anyOf` over the member schemas keeps
        // the length constraint honest without claiming a per-position type
        // the version cannot express; emitting `prefixItems` instead produces
        // a keyword every 3.0 validator ignores.
        state.warnings.push(
          "A `tuple` schema cannot express positional item types in " +
            "OpenAPI 3.0; emitted a length-constrained array instead.",
        );
        return {
          type: "array",
          ...(items.length > 0 ? { items: { anyOf: items } } : {}),
          minItems: items.length,
          maxItems: items.length,
        };
      }
      return {
        type: "array",
        prefixItems: items,
        minItems: items.length,
        maxItems: items.length,
      };
    }

    case "enum": {
      const values = schema["_values"];
      if (!Array.isArray(values) || values.length === 0) {
        state.warnings.push(
          "An `enum` schema had no values; `enum` must be non-empty in OpenAPI.",
        );
        return {};
      }
      return enumSchema(values, state.version);
    }

    case "literal": {
      const value = schema["_expected"];
      if (value === undefined) {
        state.warnings.push("A `literal` schema had no value.");
        return {};
      }
      // `const` arrived with JSON Schema 2020-12; a 3.0 document expresses a
      // single permitted value as a one-member enum.
      return isVersion31(state.version)
        ? { ...enumSchema([value], state.version), const: value }
        : enumSchema([value], state.version);
    }

    case "union": {
      const schemas = schema["_schemas"];
      if (!Array.isArray(schemas) || schemas.length === 0) {
        state.warnings.push("A `union` schema had no members.");
        return {};
      }
      return { anyOf: schemas.map((entry) => convertNode(entry, state)) };
    }

    case "discriminatedUnion": {
      const map = schema["_schemaMap"];
      const discriminator = schema["_discriminator"];
      const members = map instanceof Map ? [...map.values()] : [];
      if (members.length === 0) {
        state.warnings.push("A `discriminatedUnion` schema had no members.");
        return {};
      }
      return {
        oneOf: members.map((entry) => convertNode(entry, state)),
        ...(typeof discriminator === "string"
          ? { discriminator: { propertyName: discriminator } }
          : {}),
      };
    }

    case "intersection": {
      const left = schema["_left"];
      const right = schema["_right"];
      const parts = [left, right].filter((part) => part !== undefined);
      if (parts.length === 0) {
        state.warnings.push("An `intersection` schema had no members.");
        return {};
      }
      return { allOf: parts.map((part) => convertNode(part, state)) };
    }

    case "optional":
      // Optionality is expressed by the parent's `required` list, not by the
      // property schema, so the wrapper contributes nothing of its own.
      return convertInner(schema["_inner"], state, "optional");

    case "nullable":
      return applyNullable(
        convertInner(schema["_inner"], state, "nullable"),
        state.version,
      );

    case "default": {
      const inner = convertInner(schema["_inner"], state, "default");
      const defaultValue = resolveDefaultValue(schema, state);
      return defaultValue === undefined
        ? inner
        : { ...inner, default: defaultValue };
    }

    case "refine":
      // A refinement is a runtime predicate with no schema equivalent; the
      // inner shape is still the right description of the data.
      return convertInner(schema["_inner"], state, "refine");

    case "transform":
      // `schema.transform(fn)` / `s.transform(schema, fn)` build a
      // TransformModifierSchema, whose source is `_inner`; the standalone
      // TransformSchema class names it `_base`.
      return convertInner(
        schema["_inner"] ?? schema["_base"],
        state,
        "transform",
      );

    case "lazy": {
      const resolved = schema["_inner"] ?? resolveLazy(schema, state);
      if (resolved === undefined) return {};
      return convertNode(resolved, state);
    }

    default:
      state.warnings.push(`Unsupported schema type: ${schema._type}`);
      return {};
  }
}

function resolveLazy(
  schema: SchemaLike,
  state: ConversionState,
): unknown | undefined {
  const factory = schema["_factory"];
  if (typeof factory !== "function") return undefined;
  try {
    return (factory as () => unknown)();
  } catch (error) {
    state.warnings.push(
      `A \`lazy\` schema could not be resolved: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

function convertInner(
  inner: unknown,
  state: ConversionState,
  wrapper: string,
): OpenAPISchema {
  if (inner === undefined) {
    state.warnings.push(`A \`${wrapper}\` schema has no inner schema.`);
    return {};
  }
  return convertNode(inner, state);
}

/**
 * Converts a bare JavaScript value used as a shorthand schema.
 *
 * `["a"]` means "array of string" and `"x"` means "string" — a convenience
 * for hand-written metadata, not for real schemas.
 */
function convertLiteralValue(
  input: unknown,
  state: ConversionState,
): OpenAPISchema {
  if (Array.isArray(input)) {
    const first = input[0];
    if (first === undefined) return { type: "array" };
    return { type: "array", items: convertNode(first, state) };
  }
  if (typeof input === "string") return { type: "string" };
  if (typeof input === "number") {
    return { type: Number.isInteger(input) ? "integer" : "number" };
  }
  if (typeof input === "boolean") return { type: "boolean" };
  if (input === null) {
    return isVersion31(state.version) ? { type: "null" } : { nullable: true };
  }

  state.warnings.push("Unable to convert unknown schema input.");
  return {};
}

/**
 * Converts a schema into an OpenAPI schema object.
 *
 * Warnings describe everything that could not be represented exactly. They
 * are part of the result rather than a side channel, because silently
 * emitting `{}` for an unsupported construct is how a specification ends up
 * documenting nothing.
 */
export function convertSchema(
  input: unknown,
  options?: SchemaConversionOptions,
): SchemaConversionResult {
  const state: ConversionState = {
    warnings: [],
    visited: new Set<object>(),
    version: options?.version ?? DEFAULT_OPENAPI_VERSION,
    maxDepth: options?.maxDepth ?? 32,
    depth: 0,
  };

  const schema = convertNode(input, state);
  return { schema, warnings: state.warnings };
}

export interface SchemaConverter {
  convert(
    input: unknown,
    options?: SchemaConversionOptions,
  ): SchemaConversionResult;
}

/** Creates a converter bound to a specification version. */
export function createSchemaConverter(
  defaults?: SchemaConversionOptions,
): SchemaConverter {
  return {
    convert: (input, options) =>
      convertSchema(input, { ...defaults, ...options }),
  };
}
