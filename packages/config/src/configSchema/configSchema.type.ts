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
  readonly validate?: (
    value: T,
    context: ConfigValidationContext,
  ) =>
    boolean | string | ConfigValidationIssue | readonly ConfigValidationIssue[];
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

/**
 * String configuration schema.
 */
export interface ConfigStringSchema extends ConfigSchema<string> {
  readonly type: ConfigValueType.STRING;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string | RegExp;
  readonly enum?: readonly string[];
}

/**
 * Number configuration schema.
 */
export interface ConfigNumberSchema extends ConfigSchema<number> {
  readonly type: ConfigValueType.NUMBER;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly positive?: boolean;
}

/**
 * Boolean configuration schema.
 */
export interface ConfigBooleanSchema extends ConfigSchema<boolean> {
  readonly type: ConfigValueType.BOOLEAN;
}
