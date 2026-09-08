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
 * Object configuration schema.
 */
export interface ConfigObjectSchema<
  T extends ConfigValue = ConfigValue,
> extends ConfigSchema<T> {
  readonly type: ConfigValueType.OBJECT;
  readonly properties: Readonly<Record<string, ConfigSchema>>;
  readonly additionalProperties?: boolean | ConfigSchema;
}

/**
 * Array configuration schema.
 */
export interface ConfigArraySchema<
  T extends ConfigValue = ConfigValue,
> extends ConfigSchema<T> {
  readonly type: ConfigValueType.ARRAY;
  readonly items?: ConfigSchema;
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
