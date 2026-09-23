import type { ConfigValue } from "../../configValue/configValue.core.js";

/**
 * Options for resolving configuration values.
 */
export interface ConfigResolverOptions {
  readonly strict?: boolean;
  readonly allowUndefined?: boolean;
  readonly clone?: boolean;
}

/**
 * Result returned when resolving a configuration value.
 */
export interface ConfigResolutionResult<T extends ConfigValue = ConfigValue> {
  readonly key: string;
  readonly value: T | undefined;
  readonly found: boolean;
  readonly valid: boolean;
  readonly issues: readonly unknown[];
}

/**
 * Widens a literal fallback to its primitive type.
 *
 * `get(key, fallback)` returns the stored value when one exists, so a
 * fallback of `false` or `"dev"` must not narrow the result to the literal
 * `false` or `"dev"`: the result is `boolean` or `string`.
 */
export type ConfigWiden<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends bigint
        ? bigint
        : T;
