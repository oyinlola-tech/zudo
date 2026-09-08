/**
 * @zudojs/core/configuration/core
 *
 * Core configuration types, keys, and source abstractions.
 */

export { Configuration, createConfiguration } from "./configuration.js";

export type {
  ConfigurationOptions,
  ConfigurationValue,
  ConfigurationEntry,
  ConfigurationEntrySource,
} from "./configuration.js";

/**
 * Compatibility alias. The string-union source type now lives in
 * configurationSource.source.ts as ConfigurationSourceType.
 */
export type { ConfigurationSourceType as ConfigurationValueSource } from "./configurationSource.source.js";

export { createConfigurationKey } from "./configurationKey.key.js";

export type { ConfigurationKey } from "./configurationKey.key.js";

export {
  normalizeConfigurationPath,
  requireConfigurationPath,
} from "./configurationPath.path.js";

export {
  BaseConfigurationSource,
  createConfigurationSource,
  sortConfigurationSources,
} from "./configurationSource.source.js";

export type {
  ConfigurationSource,
  ConfigurationSourceType,
  ConfigurationSourceEntry,
  ConfigurationSourceOptions,
} from "./configurationSource.source.js";
