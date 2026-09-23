import type { ConfigValue } from "../configValue/configValue.core.js";

/**
 * Supported configuration value types.
 */
export enum ConfigValueType {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  BIGINT = "bigint",
  DATE = "date",
  OBJECT = "object",
  ARRAY = "array",
  NULL = "null",
  ANY = "any",
}

/**
 * Validation issue severity.
 */
export enum ConfigValidationSeverity {
  ERROR = "error",
  WARNING = "warning",
}

/**
 * A single schema validation issue.
 */
export interface ConfigValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
  readonly severity: ConfigValidationSeverity;
  readonly expected?: ConfigValueType | readonly ConfigValueType[];
  readonly received?: ConfigValueType;
}

/**
 * Result of validating a configuration value.
 */
export interface ConfigValidationResult {
  readonly valid: boolean;
  readonly value?: ConfigValue;
  readonly issues: readonly ConfigValidationIssue[];
}

/**
 * Validation context.
 */
export interface ConfigValidationContext {
  readonly path: string;
  readonly root: unknown;
  readonly parent?: unknown;
  readonly key?: string | number;
}

/**
 * Configuration schema.
 */
export interface ConfigSchema<T extends ConfigValue = ConfigValue> {
  readonly type: ConfigValueType | readonly ConfigValueType[];
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly default?: T | (() => T);
  readonly description?: string;
  /**
   * Marks the value as secret. When a ConfigManager validates its
   * configuration, store entries whose property schema is flagged
   * `secret` are marked sensitive, so toSafeObject() and safe entry
   * serialization redact them.
   */
  readonly secret?: boolean;
  /**
   * Coerces string input before the type check. Defaults to `true`.
   *
   * Environment variables, `.env` files and CLI flags are always
   * strings, so a `NUMBER` or `BOOLEAN` schema could never pass on them.
   * When the value is a string, the schema does not itself accept
   * strings, and the schema type includes `NUMBER` or `BOOLEAN`, the
   * string is parsed strictly first: decimal numbers only (`"8080"`
   * passes, `"80a"` and `"0x1F90"` do not), and booleans by the
   * `parseConfigBoolean` convention (`true/false`, `1/0`, `yes/no`,
   * `y/n`, `on/off`). A string that does not parse is still reported
   * as `TYPE_MISMATCH`. `validate` and `transform` receive the coerced
   * value. Set `false` to require a real number or boolean.
   */
  readonly coerce?: boolean;
  /**
   * Custom check on the FINAL value, after coercion and `transform`.
   * Returning `false`, a message or issues fails validation.
   */
  readonly validate?: (
    value: T,
    context: ConfigValidationContext,
  ) =>
    boolean | string | ConfigValidationIssue | readonly ConfigValidationIssue[];
  /**
   * Converts the value. A value that already has the schema's `type` is
   * transformed after its constraints pass. A STRING that does not have
   * the type is passed to `transform` as a parser, and the output must
   * then have the type and satisfy the constraints (so `{ type: ARRAY,
   * transform: (s) => String(s).split(",") }` accepts `"a,b"`). A
   * non-string of the wrong type is rejected without calling it.
   */
  readonly transform?: (
    value: ConfigValue,
    context: ConfigValidationContext,
  ) => T;
}

/**
 * A schema for a nested value whose value type the container does not
 * know.
 *
 * `ConfigSchema<T>` is contravariant in `T` through `validate(value: T,
 * ...)` and `transform`, so a `ConfigStringSchema` (which extends
 * `ConfigSchema<string>`) is NOT assignable to `ConfigSchema<ConfigValue>`:
 * a validator that accepts only `string` cannot stand in for one that must
 * accept any `ConfigValue`.
 *
 * That made typed object schemas inexpressible. Declaring `properties` as
 * `Record<string, ConfigSchema>` rejected every specific variant, including
 * through a typed intermediate constant, so there was no user-side
 * workaround short of a cast:
 *
 * ```ts
 * const schema: ConfigObjectSchema = {
 *   type: ConfigValueType.OBJECT,
 *   // previously: not assignable to ConfigSchema<ConfigValue>
 *   properties: { port: { type: ConfigValueType.NUMBER, min: 1 } },
 * };
 * ```
 *
 * A container of schemas over differing value types is an existential
 * type, which TypeScript cannot express. `ConfigSchema<any>` is the
 * deliberate encoding of that: `any` is assignable in both directions, so
 * every variant is accepted and the validator can still invoke `validate`
 * on what it reads back out.
 *
 * The named variants are unioned in as well so an inline literal may carry
 * variant-specific fields (`minLength`, `min`, `max`, `enum`). Excess
 * property checking against a union admits any property declared by some
 * member, which a bare `ConfigSchema<any>` would reject.
 */
export type AnyConfigSchema =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ConfigSchema<any>
  | ConfigStringSchema
  | ConfigNumberSchema
  | ConfigBooleanSchema
  | ConfigObjectSchema
  | ConfigArraySchema;

/**
 * Object configuration schema.
 */
export interface ConfigObjectSchema<
  T extends ConfigValue = ConfigValue,
> extends ConfigSchema<T> {
  readonly type: ConfigValueType.OBJECT;
  readonly properties: Readonly<Record<string, AnyConfigSchema>>;
  readonly additionalProperties?: boolean | AnyConfigSchema;
}

/**
 * Array configuration schema.
 */
export interface ConfigArraySchema<
  T extends ConfigValue = ConfigValue,
> extends ConfigSchema<T> {
  readonly type: ConfigValueType.ARRAY;
  readonly items?: AnyConfigSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

/** Constraints enforced on a string value. */
export interface ConfigStringConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string | RegExp;
  readonly enum?: readonly string[];
}

/** Constraints enforced on a number value. */
export interface ConfigNumberConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly positive?: boolean;
}

/**
 * String configuration schema.
 */
export interface ConfigStringSchema
  extends ConfigSchema<string>, ConfigStringConstraints {
  readonly type: ConfigValueType.STRING;
}

/**
 * Number configuration schema.
 */
export interface ConfigNumberSchema
  extends ConfigSchema<number>, ConfigNumberConstraints {
  readonly type: ConfigValueType.NUMBER;
}

/**
 * A schema accepted by `resolve()` / `resolveResult()`: a union keyed on
 * `type`, so each value type carries exactly the constraints the
 * validator enforces for it. `{ type: NUMBER, min: 1 }` and
 * `{ type: STRING, minLength: 1 }` type-check; `{ type: NUMBER,
 * minLength: 1 }` does not. `T` is the resolved (post-`transform`) type.
 */
export type TypedConfigSchema<T extends ConfigValue = ConfigValue> =
  | (ConfigSchemaBase<T> &
      ConfigStringConstraints & { readonly type: ConfigValueType.STRING })
  | (ConfigSchemaBase<T> &
      ConfigNumberConstraints & { readonly type: ConfigValueType.NUMBER })
  | (ConfigSchemaBase<T> &
      ConfigArrayConstraints & { readonly type: ConfigValueType.ARRAY })
  | (ConfigSchemaBase<T> &
      ConfigObjectConstraints & { readonly type: ConfigValueType.OBJECT })
  | (ConfigSchemaBase<T> & {
      readonly type:
        | ConfigValueType.BOOLEAN
        | ConfigValueType.BIGINT
        | ConfigValueType.DATE
        | ConfigValueType.NULL
        | ConfigValueType.ANY;
    })
  // A union of types: each constraint applies when the runtime value has
  // the matching type, so every constraint is accepted.
  | (ConfigSchemaBase<T> &
      ConfigStringConstraints &
      ConfigNumberConstraints &
      ConfigArrayConstraints &
      ConfigObjectConstraints & { readonly type: readonly ConfigValueType[] });

/**
 * {@link ConfigSchema} without `type`, so each {@link TypedConfigSchema}
 * member can declare a single `type` that TypeScript discriminates on.
 */
type ConfigSchemaBase<T extends ConfigValue> = Omit<ConfigSchema<T>, "type">;

/** Constraints enforced on an array value. */
export interface ConfigArrayConstraints {
  readonly items?: AnyConfigSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

/** Nested property schemas enforced on an object value. */
export interface ConfigObjectConstraints {
  readonly properties?: Readonly<Record<string, AnyConfigSchema>>;
  readonly additionalProperties?: boolean | AnyConfigSchema;
}

/**
 * Boolean configuration schema.
 */
export interface ConfigBooleanSchema extends ConfigSchema<boolean> {
  readonly type: ConfigValueType.BOOLEAN;
}
