import type { ConfigValue } from "../configValue/configValue.core.js";

import { cloneConfigValue } from "../configValue/configValue.core.js";

import type { ConfigSchema } from "../configSchema/index.js";

import {
  ConfigValueType,
  validateConfigObject,
} from "../configSchema/index.js";

import type { ConfigSource } from "../configSource/configSource.core.js";

import { createConfigSource } from "../configSource/configSource.core.js";

import type { ConfigEntry } from "../configEntry/configEntry.type.js";

import type {
  ConfigLoader,
  ConfigLoadResult,
} from "../configLoader/configLoader.core.js";

import { createConfigLoader } from "../configLoader/configLoader.core.js";

import type { ConfigStore } from "../configStore/configStore.core.js";

import { createConfigStore } from "../configStore/configStore.factory.js";

import type { ConfigResolver } from "../configResolver/core/configResolver.core.js";

import type { ScopedConfigResolver } from "../configResolver/accessors/configResolver.scoped.js";

import { createConfigResolver } from "../configResolver/core/configResolver.factory.js";

import type {
  ConfigManagerOptions,
  ConfigManagerStatus,
  ConfigManagerListener,
} from "./configManager.type.js";

import { ConfigManagerState } from "./configManager.type.js";

import { ConfigManagerValidationError } from "./configManager.error.js";

/**
 * Central configuration lifecycle manager.
 *
 * ConfigManager coordinates the store, loader and resolver while
 * keeping their responsibilities separate.
 */
export class ConfigManager {
  /**
   * Human-readable name for this manager, surfaced in status
   * snapshots so applications running several managers can tell
   * their diagnostics apart.
   */
  readonly name: string;

  private readonly store: ConfigStore;

  private readonly loader: ConfigLoader;

  private readonly resolver: ConfigResolver;

  private readonly listeners = new Set<ConfigManagerListener>();

  private state: ConfigManagerState = ConfigManagerState.CREATED;

  private lastLoadedAt?: number;

  private lastError?: unknown;

  private disposed = false;

  private loadPromise?: Promise<ConfigLoadResult>;

  constructor(options: ConfigManagerOptions = {}) {
    // When a caller supplies a loader (and no explicit store), the
    // manager must resolve values from the SAME store that loader
    // writes to.
    const providedLoader = options.loader;

    const suppliedStore = options.store ?? providedLoader?.getStore();

    this.store =
      suppliedStore ??
      createConfigStore({
        initialValues: options.initialValues,
        freeze: options.freeze ?? true,
      });

    // initialValues used to be wired ONLY into a store the manager
    // created itself: passing `store` or `loader` silently discarded
    // them. Seed a supplied store explicitly instead.
    if (suppliedStore && options.initialValues) {
      for (const [key, value] of Object.entries(options.initialValues)) {
        suppliedStore.set(key, value, { source: "initialValues" });
      }
    }

    this.name = options.name ?? "config";

    this.loader =
      providedLoader ??
      createConfigLoader({
        sources: options.sources,
        context: options.context,
        store: this.store,
        freeze: options.freeze ?? true,
        // The manager seeds its store with initialValues and accepts
        // runtime set() writes; loading must layer sources on top of
        // those (by priority) instead of wiping them.
        clearStore: false,
      });

    this.resolver = createConfigResolver(this.store, {
      strict: options.strict ?? true,
      allowUndefined: options.allowUndefined ?? true,
      clone: options.clone ?? false,
    });

    if (options.autoLoad) {
      // Kick off the initial load immediately; ready() (or load())
      // exposes the in-flight promise. The catch handler prevents an
      // unhandled rejection when nobody awaits ready(): the failure
      // is still recorded in the FAILED state and lastError.
      this.load().catch(() => {});
    }
  }

  /**
   * Returns the current lifecycle state.
   */
  getState(): ConfigManagerState {
    return this.state;
  }

  /**
   * Returns whether the manager is ready.
   */
  get isReady(): boolean {
    return this.state === ConfigManagerState.READY;
  }

  /**
   * Returns whether configuration is currently loading.
   */
  get isLoading(): boolean {
    return (
      this.state === ConfigManagerState.LOADING ||
      this.state === ConfigManagerState.RELOADING
    );
  }

  /**
   * Returns the configuration store.
   */
  getStore(): ConfigStore {
    this.assertActive();

    return this.store;
  }

  /**
   * Returns the configuration loader.
   */
  getLoader(): ConfigLoader {
    this.assertActive();

    return this.loader;
  }

  /**
   * Returns the configuration resolver.
   */
  getResolver(): ConfigResolver {
    this.assertActive();

    return this.resolver;
  }

  /**
   * Returns a scoped resolver.
   */
  scoped(prefix: string): ScopedConfigResolver {
    this.assertActive();

    return this.resolver.scoped(prefix);
  }

  /**
   * Loads configuration.
   *
   * Calling load() while a load is already in flight returns the
   * in-flight promise instead of starting a second load.
   */
  async load(): Promise<ConfigLoadResult> {
    this.assertActive();

    if (this.isLoading) {
      if (this.loadPromise) {
        return this.loadPromise;
      }

      throw new Error("Configuration manager is already loading.");
    }

    this.setState(ConfigManagerState.LOADING);

    const promise = this.performLoad(false);

    this.loadPromise = promise;

    return promise;
  }

  /**
   * Waits until the initial configuration load has completed.
   *
   * With `autoLoad: true` this awaits the load started by the
   * constructor (rethrowing its failure). Otherwise it starts a load
   * when none has happened yet.
   */
  async ready(): Promise<void> {
    this.assertActive();

    if (this.loadPromise) {
      await this.loadPromise;

      return;
    }

    if (this.isReady) {
      return;
    }

    await this.load();
  }

  /**
   * Reloads configuration.
   */
  async reload(): Promise<ConfigLoadResult> {
    this.assertActive();

    if (this.isLoading) {
      throw new Error("Configuration manager is already loading.");
    }

    this.setState(ConfigManagerState.RELOADING);

    const promise = this.performLoad(true);

    this.loadPromise = promise;

    return promise;
  }

  /**
   * Executes a load or reload while keeping lifecycle state safe.
   *
   * If the manager is disposed while the load is in flight, no state
   * transition happens afterwards: a disposed manager stays DISPOSED.
   */
  private async performLoad(reload: boolean): Promise<ConfigLoadResult> {
    try {
      const result = reload
        ? await this.loader.reload()
        : await this.loader.load();

      if (this.disposed) {
        return result;
      }

      this.lastLoadedAt = result.loadedAt;

      this.lastError = undefined;

      this.setState(ConfigManagerState.READY);

      return result;
    } catch (error) {
      if (!this.disposed) {
        this.lastError = error;

        this.setState(ConfigManagerState.FAILED);
      }

      throw error;
    }
  }

  /**
   * Loads a schema and validates the complete configuration.
   */
  validate<T extends ConfigValue>(schema: {
    readonly properties: Readonly<Record<string, ConfigSchema>>;
    readonly additionalProperties?: boolean | ConfigSchema;
  }): T {
    this.assertActive();

    const result = validateConfigObject(this.store.toObject(), {
      type: ConfigValueType.OBJECT,
      properties: schema.properties,
      additionalProperties: schema.additionalProperties,
    });

    if (!result.valid) {
      throw new ConfigManagerValidationError(result.issues);
    }

    // Property schemas flagged `secret` mark the corresponding store
    // entries as sensitive so safe serialization redacts them.
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!propertySchema.secret) {
        continue;
      }

      const entry = this.store.getEntry(key);

      if (entry && !entry.sensitive) {
        this.store.set(key, entry.value, {
          source: entry.source,
          sourceType: entry.sourceType,
          priority: entry.priority,
          sensitive: true,
          resolved: entry.resolved,
        });
      }
    }

    return cloneConfigValue(result.value as T);
  }

  /**
   * Gets a raw configuration value.
   */
  get<T extends ConfigValue = ConfigValue>(key: string): T | undefined {
    this.assertActive();

    return this.resolver.get<T>(key);
  }

  /**
   * Gets a required configuration value.
   */
  required<T extends ConfigValue = ConfigValue>(key: string): T {
    this.assertActive();

    return this.resolver.required<T>(key);
  }

  /**
   * Gets a configuration value with schema validation.
   */
  resolve<T extends ConfigValue>(
    key: string,
    schema: ConfigSchema<T>,
  ): T | undefined {
    this.assertActive();

    return this.resolver.resolve(key, schema);
  }

  /**
   * Gets a string value.
   */
  string(key: string, fallback?: string): string | undefined {
    this.assertActive();

    return this.resolver.string(key, fallback);
  }

  /**
   * Gets a number value.
   */
  number(key: string, fallback?: number): number | undefined {
    this.assertActive();

    return this.resolver.number(key, fallback);
  }

  /**
   * Gets a boolean value.
   */
  boolean(key: string, fallback?: boolean): boolean | undefined {
    this.assertActive();

    return this.resolver.boolean(key, fallback);
  }

  /**
   * Gets a bigint value.
   */
  bigint(key: string, fallback?: bigint): bigint | undefined {
    this.assertActive();

    return this.resolver.bigint(key, fallback);
  }

  /**
   * Gets a Date value.
   */
  date(key: string, fallback?: Date): Date | undefined {
    this.assertActive();

    return this.resolver.date(key, fallback);
  }

  /**
   * Gets an object value.
   */
  object<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: T,
  ): T | undefined {
    this.assertActive();

    return this.resolver.object<T>(key, fallback);
  }

  /**
   * Gets an array value.
   */
  array<T extends ConfigValue = ConfigValue>(
    key: string,
    fallback?: readonly T[],
  ): readonly T[] | undefined {
    this.assertActive();

    return this.resolver.array<T>(key, fallback);
  }

  /**
   * Sets a runtime configuration value.
   */
  set<T extends ConfigValue>(
    key: string,
    value: T,
    options: {
      readonly source?: string;
      readonly priority?: number;
      readonly sensitive?: boolean;
    } = {},
  ): ConfigEntry<T> {
    this.assertActive();

    return this.store.set(key, value, {
      source: options.source ?? "runtime",
      priority: options.priority ?? Number.MAX_SAFE_INTEGER,
      sensitive: options.sensitive ?? false,
    });
  }

  /**
   * Removes a configuration value.
   */
  delete(key: string): boolean {
    this.assertActive();

    return this.store.delete(key);
  }

  /**
   * Returns the complete configuration object.
   *
   * WARNING: values are returned RAW — sensitive entries are NOT
   * redacted. Use toSafeObject() for logging or diagnostics.
   */
  toObject(): Readonly<Record<string, ConfigValue>> {
    this.assertActive();

    return this.store.toObject();
  }

  /**
   * Returns the configuration object with sensitive values redacted.
   */
  toSafeObject(): Readonly<Record<string, ConfigValue>> {
    this.assertActive();

    return this.store.toSafeObject();
  }

  /**
   * Returns a manager status snapshot.
   */
  getStatus(): ConfigManagerStatus {
    return {
      name: this.name,
      state: this.state,
      loaded: this.isReady,
      loading: this.isLoading,
      size: this.store.size,
      lastLoadedAt: this.lastLoadedAt,
      lastError: this.lastError,
    };
  }

  /**
   * Subscribes to lifecycle state changes.
   */
  subscribe(listener: ConfigManagerListener): () => void {
    this.assertActive();

    if (typeof listener !== "function") {
      throw new TypeError("Configuration manager listener must be a function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Adds a configuration source.
   */
  addSource(source: ConfigSource): void {
    this.assertActive();

    this.loader.addSource(source);
  }

  /**
   * Creates and adds a custom source.
   */
  addSourceLoader(
    name: string,
    loader: (context: {
      readonly environment?: string;
      readonly namespace?: string;
      readonly signal?: AbortSignal;
    }) =>
      | {
          readonly values: Readonly<Record<string, ConfigValue>>;
          readonly source: string;
          readonly type: import("../configSource/configSource.core.js").ConfigSourceType;
        }
      | Promise<{
          readonly values: Readonly<Record<string, ConfigValue>>;
          readonly source: string;
          readonly type: import("../configSource/configSource.core.js").ConfigSourceType;
        }>,
  ): ConfigSource {
    this.assertActive();

    const source = createConfigSource(
      {
        name,
      },
      loader,
    );

    this.loader.addSource(source);

    return source;
  }

  /**
   * Removes a source.
   */
  removeSource(name: string): boolean {
    this.assertActive();

    return this.loader.removeSource(name);
  }

  /**
   * Marks the manager as disposed.
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.listeners.clear();

    await this.loader.dispose();

    this.store.dispose();

    this.state = ConfigManagerState.DISPOSED;
  }

  private setState(state: ConfigManagerState): void {
    this.state = state;

    const status = this.getStatus();

    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch {
        // State listeners must not interrupt configuration lifecycle.
      }
    }
  }

  private assertActive(): void {
    if (this.disposed || this.state === ConfigManagerState.DISPOSED) {
      throw new Error("ConfigManager has been disposed.");
    }
  }
}
