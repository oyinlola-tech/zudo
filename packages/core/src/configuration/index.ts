/**
 * Core configuration container.
 */
export * from "./core/index.js";

/**
 * Strongly typed configuration keys.
 */
export * from "./loader/index.js";

/**
 * Configuration schemas and schema registry.
 */
export * from "./schema/index.js";

/**
 * Configuration provider.
 */
export * from "./registry/index.js";

/**
 * Configuration errors.
 */
export * from "./error/index.js";

/**
 * Configuration manager.
 */
export {
  ConfigurationManager,
  ConfigurationManagerState,
  createConfigurationManager,
} from "./configurationManager.manager.js";

export type {
  ConfigurationManagerOptions,
  ConfigurationManagerResult,
  ConfigurationEventSubscription,
} from "./configurationManager.manager.js";

/**
 * Configuration lifecycle events.
 */
export * from "./events/index.js";
