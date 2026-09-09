import type { ConfigValue } from "../configValue/configValue.core.js";
import type { ConfigSchema } from "../configSchema/configSchema.type.js";
import type { ConfigSource } from "../configSource/configSource.core.js";
import type { ConfigStore } from "../configStore/configStore.core.js";
import type { ConfigManagerOptions } from "../configManager/configManager.type.js";

import type { ConfigManager } from "../configManager/configManager.core.js";

import {
  createConfigManager,
  initializeConfigManager,
} from "../configManager/configManager.factory.js";

/**
 * Factory options for creating a configuration manager.
 */
export type ConfigFactoryOptions = ConfigManagerOptions;

/**
 * Creates a configuration manager without loading it.
 */
export function createConfiguration(
  options: ConfigFactoryOptions = {},
): ConfigManager {
  return createConfigManager(options);
}

/**
 * Creates and initializes a configuration manager.
 */
export async function createInitializedConfiguration(
  options: ConfigFactoryOptions = {},
): Promise<ConfigManager> {
  return initializeConfigManager(options);
}

/**
 * Creates a configuration manager from initial values.
 */
export function createConfigurationFromValues(
  values: Readonly<Record<string, ConfigValue>>,
  options: Omit<ConfigFactoryOptions, "initialValues"> = {},
): ConfigManager {
  return createConfigManager({
    ...options,
    initialValues: values,
  });
}

/**
 * Creates a configuration manager from sources.
 */
export function createConfigurationFromSources(
  sources: readonly ConfigSource[],
  options: Omit<ConfigFactoryOptions, "sources"> = {},
): ConfigManager {
  return createConfigManager({
    ...options,
    sources,
  });
}

/**
 * Creates a configuration manager from an existing store.
 */
export function createConfigurationFromStore(
  store: ConfigStore,
  options: Omit<ConfigFactoryOptions, "store"> = {},
): ConfigManager {
  return createConfigManager({
    ...options,
    store,
  });
}

/**
 * Creates a configuration manager and validates it against a schema.
 */
export async function createValidatedConfiguration<
  T extends ConfigValue = ConfigValue,
>(
  schema: {
    readonly properties: Readonly<Record<string, ConfigSchema>>;
    readonly additionalProperties?: boolean | ConfigSchema;
  },
  options: ConfigFactoryOptions = {},
): Promise<{
  readonly manager: ConfigManager;
  readonly config: T;
}> {
  const manager = await createInitializedConfiguration(options);

  try {
    const config = manager.validate<T>(schema);

    return {
      manager,
      config,
    };
  } catch (error) {
    await manager.dispose();

    throw error;
  }
}

/**
 * Factory object for dependency injection and application bootstrap.
 */
export const configFactory = Object.freeze({
  create: createConfiguration,

  initialize: createInitializedConfiguration,

  fromValues: createConfigurationFromValues,

  fromSources: createConfigurationFromSources,

  fromStore: createConfigurationFromStore,

  validated: createValidatedConfiguration,
});
