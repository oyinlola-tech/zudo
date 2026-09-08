import type { ConfigValue } from "../../configValue/configValue.core.js";

import type { ConfigSchema } from "../../configSchema/index.js";

import type { ConfigStore } from "../../configStore/configStore.core.js";

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
