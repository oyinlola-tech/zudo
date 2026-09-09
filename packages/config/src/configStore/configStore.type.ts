import type { ConfigValue } from "../configValue/configValue.core.js";

import type { ConfigEntry } from "../configEntry/configEntry.type.js";

/**
 * Event emitted when a configuration value changes.
 */
export interface ConfigChangeEvent {
  readonly key: string;
  readonly previous?: ConfigEntry;
  readonly current?: ConfigEntry;
  readonly timestamp: number;
}

/**
 * Listener called when configuration changes.
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

/**
 * Options used to initialize a configuration store.
 */
export interface ConfigStoreOptions {
  readonly initialValues?: Readonly<Record<string, ConfigValue>>;

  readonly entries?: readonly ConfigEntry[];

  /**
   * Whether stored values are deep-cloned and deep-frozen on write
   * (default true).
   *
   * When `false`, the store keeps REFERENCES to the exact objects
   * passed to `set()`: callers can still mutate them afterwards and
   * those mutations are visible through the store. `get()` likewise
   * returns the shared reference. Only `toObject()` defends against
   * this by cloning. Use `freeze: false` only for trusted,
   * performance-sensitive code that treats values as immutable.
   */
  readonly freeze?: boolean;
}
