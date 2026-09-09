import type { ConfigValue } from "../configValue/configValue.core.js";

import {
  cloneConfigValue,
  configValuesEqual,
  defineConfigProperty,
  freezeConfigValue,
} from "../configValue/configValue.core.js";

import type { ConfigEntry } from "../configEntry/configEntry.type.js";

import {
  createConfigEntry,
  toSafeConfigEntry,
} from "../configEntry/configEntry.type.js";

import type { ConfigSourceType } from "../configSource/configSource.core.js";

import type {
  ConfigChangeEvent,
  ConfigChangeListener,
  ConfigStoreOptions,
} from "./configStore.type.js";

/**
 * Normalizes a configuration key.
 */
export function normalizeKey(key: string): string {
  if (typeof key !== "string") {
    throw new TypeError("Configuration key must be a string.");
  }

  const normalized = key.trim();

  if (normalized.length === 0) {
    throw new TypeError("Configuration key cannot be empty.");
  }

  return normalized;
}

/**
 * Central in-memory configuration store.
 *
 * The store keeps resolved values and their metadata together so
 * consumers can inspect where a value originated from.
 */
export class ConfigStore {
  private readonly entries = new Map<string, ConfigEntry>();

  private readonly listeners = new Set<ConfigChangeListener>();

  private readonly shouldFreeze: boolean;

  private disposed = false;

  constructor(options: ConfigStoreOptions = {}) {
    this.shouldFreeze = options.freeze ?? true;

    if (options.initialValues) {
      for (const [key, value] of Object.entries(options.initialValues)) {
        this.set(key, value);
      }
    }

    if (options.entries) {
      for (const entry of options.entries) {
        this.setEntry(entry);
      }
    }
  }

  /**
   * Returns whether the store has been disposed.
   */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Returns the number of stored configuration entries.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Checks whether a key exists.
   */
  has(key: string): boolean {
    this.assertActive();

    return this.entries.has(normalizeKey(key));
  }

  /**
   * Gets a configuration value.
   */
  get<T extends ConfigValue = ConfigValue>(key: string): T | undefined {
    this.assertActive();

    const entry = this.entries.get(normalizeKey(key));

    if (!entry) {
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Gets a configuration entry.
   */
  getEntry(key: string): ConfigEntry | undefined {
    this.assertActive();

    return this.entries.get(normalizeKey(key));
  }

  /**
   * Gets a value or returns the supplied fallback.
   */
  getOrDefault<T extends ConfigValue>(key: string, fallback: T): T {
    const value = this.get<T>(key);

    return value === undefined ? fallback : value;
  }

  /**
   * Sets a configuration value.
   */
  set<T extends ConfigValue>(
    key: string,
    value: T,
    options: {
      readonly source?: string;
      readonly sourceType?: ConfigSourceType;
      readonly priority?: number;
      readonly sensitive?: boolean;
      readonly resolved?: boolean;
    } = {},
  ): ConfigEntry<T> {
    this.assertActive();

    const normalizedKey = normalizeKey(key);

    const previous = this.entries.get(normalizedKey);

    const normalizedValue = this.shouldFreeze
      ? freezeConfigValue(cloneConfigValue(value))
      : value;

    const entry = createConfigEntry({
      key: normalizedKey,
      value: normalizedValue,
      source: options.source ?? "runtime",
      sourceType: options.sourceType,
      priority: options.priority ?? 0,
      sensitive: options.sensitive ?? false,
      resolved: options.resolved ?? true,
    });

    if (
      previous &&
      configValuesEqual(previous.value, entry.value) &&
      previous.source === entry.source &&
      previous.sourceType === entry.sourceType &&
      previous.priority === entry.priority &&
      previous.sensitive === entry.sensitive &&
      previous.resolved === entry.resolved
    ) {
      // No-op write: return the entry that is actually stored so
      // callers always hold a reference to live store state.
      return previous as ConfigEntry<T>;
    }

    this.entries.set(normalizedKey, entry);

    this.emitChange({
      key: normalizedKey,
      previous,
      current: entry,
      timestamp: Date.now(),
    });

    return entry;
  }

  /**
   * Stores an existing configuration entry.
   */
  setEntry(entry: ConfigEntry): void {
    this.assertActive();

    this.set(entry.key, entry.value, {
      source: entry.source,
      sourceType: entry.sourceType,
      priority: entry.priority,
      sensitive: entry.sensitive,
      resolved: entry.resolved,
    });
  }

  /**
   * Sets multiple configuration values.
   */
  setMany(
    values: Readonly<Record<string, ConfigValue>>,
    options: {
      readonly source?: string;
      readonly sourceType?: ConfigSourceType;
      readonly priority?: number;
      readonly sensitive?: boolean;
    } = {},
  ): void {
    this.assertActive();

    for (const [key, value] of Object.entries(values)) {
      this.set(key, value, options);
    }
  }

  /**
   * Removes a configuration value.
   */
  delete(key: string): boolean {
    this.assertActive();

    const normalizedKey = normalizeKey(key);

    const previous = this.entries.get(normalizedKey);

    if (!previous) {
      return false;
    }

    this.entries.delete(normalizedKey);

    this.emitChange({
      key: normalizedKey,
      previous,
      current: undefined,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Removes every configuration entry.
   */
  clear(): void {
    this.assertActive();

    const entries = Array.from(this.entries.values());

    this.entries.clear();

    const timestamp = Date.now();

    for (const previous of entries) {
      this.emitChange({
        key: previous.key,
        previous,
        current: undefined,
        timestamp,
      });
    }
  }

  /**
   * Returns all entries.
   */
  getEntries(): readonly ConfigEntry[] {
    this.assertActive();

    return Array.from(this.entries.values());
  }

  /**
   * Returns all keys.
   */
  keys(): readonly string[] {
    this.assertActive();

    return Array.from(this.entries.keys());
  }

  /**
   * Returns all values.
   */
  values(): readonly ConfigValue[] {
    this.assertActive();

    return Array.from(this.entries.values(), (entry) => entry.value);
  }

  /**
   * Returns a plain object containing all configuration values.
   *
   * WARNING: values are returned RAW — sensitive entries are NOT
   * redacted. Use toSafeObject() for logging or diagnostics.
   *
   * The returned object is a defensive snapshot: when the store does
   * not freeze values, each value is deep-cloned so later mutations
   * of the snapshot never affect the store (and vice versa). Frozen
   * stores share their (immutable) values directly.
   */
  toObject(): Readonly<Record<string, ConfigValue>> {
    this.assertActive();

    const result: Record<string, ConfigValue> = {};

    for (const entry of this.entries.values()) {
      // Keys come from configuration sources and may be hostile
      // ("__proto__"): define them instead of assigning so they can
      // never reach an inherited setter.
      defineConfigProperty(
        result,
        entry.key,
        this.shouldFreeze ? entry.value : cloneConfigValue(entry.value),
      );
    }

    if (this.shouldFreeze) {
      freezeConfigValue(result);
    }

    return result;
  }

  /**
   * Returns a plain object with sensitive values redacted.
   *
   * Entries marked sensitive are replaced with "[REDACTED]". This is
   * the safe counterpart to toObject() for logging and diagnostics.
   */
  toSafeObject(): Readonly<Record<string, ConfigValue>> {
    this.assertActive();

    const result: Record<string, ConfigValue> = {};

    for (const entry of this.entries.values()) {
      const safeEntry = toSafeConfigEntry(entry);

      defineConfigProperty(
        result,
        safeEntry.key,
        safeEntry.sensitive
          ? safeEntry.value
          : cloneConfigValue(safeEntry.value),
      );
    }

    return Object.freeze(result);
  }

  /**
   * Returns entries matching a prefix.
   */
  getByPrefix(prefix: string): readonly ConfigEntry[] {
    this.assertActive();

    const normalizedPrefix = normalizeKey(prefix);

    return Array.from(this.entries.values()).filter(
      (entry) =>
        entry.key === normalizedPrefix ||
        entry.key.startsWith(`${normalizedPrefix}.`),
    );
  }

  /**
   * Returns configuration values matching a prefix.
   */
  getObjectByPrefix(prefix: string): Readonly<Record<string, ConfigValue>> {
    const entries = this.getByPrefix(prefix);

    const normalizedPrefix = normalizeKey(prefix);

    const result: Record<string, ConfigValue> = {};

    for (const entry of entries) {
      const key =
        entry.key === normalizedPrefix
          ? ""
          : entry.key.slice(normalizedPrefix.length + 1);

      if (key.length > 0) {
        defineConfigProperty(result, key, entry.value);
      }
    }

    if (this.shouldFreeze) {
      freezeConfigValue(result);
    }

    return result;
  }

  /**
   * Subscribes to configuration changes.
   */
  subscribe(listener: ConfigChangeListener): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Configuration change listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Creates a snapshot of the current store.
   */
  snapshot(): ConfigStore {
    this.assertActive();

    return new ConfigStore({
      entries: this.getEntries(),
      freeze: this.shouldFreeze,
    });
  }

  /**
   * Replaces the current store contents.
   */
  replace(
    values: Readonly<Record<string, ConfigValue>>,
    options: {
      readonly source?: string;
      readonly sourceType?: ConfigSourceType;
      readonly priority?: number;
      readonly sensitive?: boolean;
    } = {},
  ): void {
    this.assertActive();

    const incomingKeys = new Set(Object.keys(values).map(normalizeKey));

    for (const key of this.keys()) {
      if (!incomingKeys.has(key)) {
        this.delete(key);
      }
    }

    this.setMany(values, options);
  }

  /**
   * Disposes the store and removes listeners.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.listeners.clear();
    this.entries.clear();
    this.disposed = true;
  }

  private emitChange(event: ConfigChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not break configuration writes.
      }
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("ConfigStore has been disposed.");
    }
  }
}
