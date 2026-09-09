import { cloneConfigValue } from "../configValue/configValue.core.js";

import type { ConfigEntry } from "../configEntry/configEntry.type.js";

import { createConfigEntry } from "../configEntry/configEntry.type.js";

import type {
  ConfigSource,
  ConfigSourceContext,
  ConfigSourceResult,
} from "../configSource/configSource.core.js";

import {
  loadConfigSourceStrict,
  sortConfigSources,
} from "../configSource/configSource.core.js";

import type { ConfigStore } from "../configStore/configStore.core.js";

import { createConfigStore } from "../configStore/configStore.factory.js";

/**
 * Options controlling configuration loading.
 */
export interface ConfigLoaderOptions {
  readonly sources?: readonly ConfigSource[];

  readonly context?: ConfigSourceContext;

  readonly store?: ConfigStore;

  /**
   * Whether a store created by the loader deep-clones and freezes
   * stored values. When false, the store shares REFERENCES with the
   * values that sources returned — mutating them later mutates the
   * store's view as well. Ignored when an existing `store` is given.
   */
  readonly freeze?: boolean;

  readonly clearStore?: boolean;

  readonly onSourceLoaded?: (
    source: ConfigSource,
    result: ConfigSourceResult,
  ) => void | Promise<void>;

  readonly onSourceError?: (
    source: ConfigSource,
    error: unknown,
  ) => void | Promise<void>;
}

/**
 * Result returned after configuration loading.
 */
export interface ConfigLoadResult {
  readonly store: ConfigStore;

  readonly entries: readonly ConfigEntry[];

  readonly sources: readonly ConfigSourceResult[];

  readonly loadedAt: number;
}

/**
 * Configuration loader.
 *
 * Sources are loaded in priority order and their values are resolved
 * into a single ConfigStore. Higher-priority sources win.
 */
export class ConfigLoader {
  private readonly sources: ConfigSource[];

  private readonly context: ConfigSourceContext;

  private readonly store: ConfigStore;

  private readonly onSourceLoaded?: ConfigLoaderOptions["onSourceLoaded"];

  private readonly onSourceError?: ConfigLoaderOptions["onSourceError"];

  private readonly clearStore: boolean;

  private readonly freeze: boolean;

  private loading = false;

  private loaded = false;

  private disposed = false;

  private lastResult?: ConfigLoadResult;

  constructor(options: ConfigLoaderOptions = {}) {
    this.sources = [...(options.sources ?? [])];

    this.context = options.context ?? {};

    this.store =
      options.store ??
      createConfigStore({
        freeze: options.freeze ?? true,
      });

    this.onSourceLoaded = options.onSourceLoaded;

    this.onSourceError = options.onSourceError;

    this.clearStore = options.clearStore ?? true;

    this.freeze = options.freeze ?? true;
  }

  /**
   * Returns the underlying configuration store.
   */
  getStore(): ConfigStore {
    this.assertActive();

    return this.store;
  }

  /**
   * Returns the configured sources.
   */
  getSources(): readonly ConfigSource[] {
    this.assertActive();

    return [...this.sources];
  }

  /**
   * Returns whether configuration has been loaded.
   */
  get isLoaded(): boolean {
    return this.loaded && !this.disposed;
  }

  /**
   * Returns whether configuration is currently loading.
   */
  get isLoading(): boolean {
    return this.loading;
  }

  /**
   * Returns the previous load result.
   */
  get lastLoadResult(): ConfigLoadResult | undefined {
    return this.lastResult;
  }

  /**
   * Loads all configured sources.
   *
   * When the loader context carries an AbortSignal, the signal is
   * checked between sources: once aborted, loading stops early and
   * this method throws the signal's abort reason. Values applied by
   * sources that completed before the abort remain in the store.
   */
  async load(): Promise<ConfigLoadResult> {
    this.assertActive();

    if (this.loading) {
      throw new Error("Configuration is already being loaded.");
    }

    this.loading = true;

    try {
      if (this.clearStore) {
        this.store.clear();
      }

      const sortedSources = sortConfigSources(this.sources);

      const results: ConfigSourceResult[] = [];

      const signal = this.context.signal;

      for (const source of sortedSources) {
        if (signal?.aborted) {
          throw (
            (signal.reason as Error | undefined) ??
            new Error("Configuration loading was aborted.")
          );
        }

        try {
          const result = await loadConfigSourceStrict(source, this.context);

          if (!result) {
            continue;
          }

          results.push(result);

          this.applySource(source, result);

          if (this.onSourceLoaded) {
            await this.onSourceLoaded(source, result);
          }
        } catch (error) {
          if (this.onSourceError) {
            await this.onSourceError(source, error);
          }

          if (!source.optional) {
            throw error;
          }
        }
      }

      const result: ConfigLoadResult = {
        store: this.store,
        entries: this.store.getEntries(),
        sources: results,
        loadedAt: Date.now(),
      };

      this.lastResult = result;

      this.loaded = true;

      return result;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Reloads configuration.
   *
   * The current store is replaced with freshly loaded values.
   */
  async reload(): Promise<ConfigLoadResult> {
    this.assertActive();

    this.loaded = false;

    return this.load();
  }

  /**
   * Loads only selected sources.
   *
   * The shared store is never cleared: values loaded previously are
   * retained and only the given sources are (re)applied. Source
   * callbacks configured on this loader are invoked as usual.
   */
  async loadSources(
    sources: readonly ConfigSource[],
  ): Promise<ConfigLoadResult> {
    this.assertActive();

    const temporaryLoader = new ConfigLoader({
      sources,
      context: this.context,
      store: this.store,
      clearStore: false,
      freeze: this.freeze,
      onSourceLoaded: this.onSourceLoaded,
      onSourceError: this.onSourceError,
    });

    const result = await temporaryLoader.load();

    temporaryLoader.detach();

    return result;
  }

  /**
   * Adds a source to the loader.
   */
  addSource(source: ConfigSource): void {
    this.assertActive();

    if (this.sources.some((existing) => existing.name === source.name)) {
      throw new Error(
        `Configuration source "${source.name}" is already registered.`,
      );
    }

    this.sources.push(source);
  }

  /**
   * Removes a source by name.
   */
  removeSource(name: string): boolean {
    this.assertActive();

    const index = this.sources.findIndex((source) => source.name === name);

    if (index === -1) {
      return false;
    }

    this.sources.splice(index, 1);

    return true;
  }

  /**
   * Finds a source by name.
   */
  getSource(name: string): ConfigSource | undefined {
    this.assertActive();

    return this.sources.find((source) => source.name === name);
  }

  /**
   * Disposes the loader and, by default, its source resources.
   *
   * Pass `closeSources: false` when the sources are owned by the
   * caller and must outlive this loader.
   */
  async dispose(
    options: { readonly closeSources?: boolean } = {},
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.loaded = false;

    if (options.closeSources ?? true) {
      for (const source of this.sources) {
        if (!source.close) {
          continue;
        }

        try {
          await source.close();
        } catch {
          // Continue closing remaining sources.
        }
      }
    }

    this.sources.length = 0;
    this.lastResult = undefined;
  }

  /**
   * Detaches this loader from its source lifecycle.
   *
   * Useful for temporary loaders sharing an existing store.
   */
  private detach(): void {
    this.sources.length = 0;
    this.lastResult = undefined;
    this.disposed = true;
  }

  /**
   * Applies one source to the configuration store.
   *
   * Sources are processed from highest to lowest priority. Existing
   * strictly-higher-priority values are retained; an EQUAL-priority
   * source overwrites, so among equal priorities the last-applied
   * (last-registered) source wins.
   *
   * Keys listed in the result's `sensitiveKeys` are marked sensitive.
   * Once an entry is sensitive it stays sensitive even when a later
   * source overwrites its value.
   */
  private applySource(source: ConfigSource, result: ConfigSourceResult): void {
    const priority = source.priority;

    const sensitiveKeys = new Set(result.sensitiveKeys ?? []);

    for (const [key, value] of Object.entries(result.values)) {
      const existing = this.store.getEntry(key);

      if (existing && existing.priority > priority) {
        continue;
      }

      this.store.set(key, cloneConfigValue(value), {
        source: source.name,
        sourceType: source.type,
        priority,
        sensitive: sensitiveKeys.has(key) || (existing?.sensitive ?? false),
        resolved: true,
      });
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("ConfigLoader has been disposed.");
    }
  }
}

/**
 * Creates a configuration loader.
 */
export function createConfigLoader(
  options: ConfigLoaderOptions = {},
): ConfigLoader {
  return new ConfigLoader(options);
}

/**
 * Loads configuration directly from a collection of sources.
 *
 * The temporary loader is disposed afterwards WITHOUT closing the
 * given sources — they are owned by the caller and remain usable.
 */
export async function loadConfiguration(
  sources: readonly ConfigSource[],
  options: Omit<ConfigLoaderOptions, "sources"> = {},
): Promise<ConfigLoadResult> {
  const loader = createConfigLoader({
    ...options,
    sources,
  });

  try {
    return await loader.load();
  } finally {
    await loader.dispose({ closeSources: false });
  }
}

/**
 * Converts loaded source results into configuration entries.
 */
export function sourceResultsToEntries(
  results: readonly ConfigSourceResult[],
  sources: readonly ConfigSource[],
): readonly ConfigEntry[] {
  const sourceMap = new Map(sources.map((source) => [source.name, source]));

  const entries: ConfigEntry[] = [];

  for (const result of results) {
    const source = sourceMap.get(result.source);

    // A source result's `sensitiveKeys` must survive the conversion:
    // dropping it here produced entries with `sensitive: false` for
    // credentials, which toSafeConfigEntry() then printed in clear.
    const sensitiveKeys = new Set(result.sensitiveKeys ?? []);

    for (const [key, value] of Object.entries(result.values)) {
      entries.push(
        createConfigEntry({
          key,
          value,
          source: result.source,
          sourceType: result.type,
          priority: source?.priority ?? 0,
          sensitive: sensitiveKeys.has(key),
        }),
      );
    }
  }

  return entries;
}
