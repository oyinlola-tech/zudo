import { Configuration } from "../core/configuration.js";

import type {
  ConfigurationSource,
  ConfigurationSourceEntry,
} from "../core/configurationSource.source.js";

import { sortConfigurationSources } from "../core/configurationSource.source.js";

import {
  ConfigurationSourceError,
  describeConfigurationCause,
} from "../error/configurationError.error.js";

/**
 * Options for loading configuration.
 */
export interface ConfigurationLoaderOptions {
  /**
   * Configuration sources to load.
   */
  readonly sources?: readonly ConfigurationSource[];

  /**
   * Whether sources should be loaded sequentially.
   *
   * Defaults to true.
   *
   * Sequential loading makes priority behavior predictable
   * and allows future sources to depend on earlier sources.
   */
  readonly sequential?: boolean;
}

/**
 * Result returned by the configuration loader.
 */
export interface ConfigurationLoadResult {
  /**
   * Final merged configuration.
   */
  readonly configuration: Configuration;

  /**
   * Sources successfully loaded.
   */
  readonly sources: readonly ConfigurationSource[];

  /**
   * Number of configuration entries loaded.
   */
  readonly entryCount: number;
}

/**
 * Applies entries from one source onto a configuration.
 *
 * Higher level components (loader, provider) share this logic so
 * source precedence behaves identically everywhere.
 */
export function applyConfigurationSourceEntries(
  configuration: Configuration,
  source: ConfigurationSource,
  entries: readonly ConfigurationSourceEntry[],
): Configuration {
  let result = configuration;

  for (const entry of entries) {
    const path = entry.path.trim();

    if (!path) {
      throw new ConfigurationLoadError(
        source,
        new Error("Configuration entry path cannot be empty."),
      );
    }

    result = result.with(path, entry.value, source.type);
  }

  return result;
}

/**
 * Loads and combines configuration from multiple sources.
 *
 * The loader is intentionally independent of the actual
 * configuration source implementation.
 */
export class ConfigurationLoader {
  private readonly sources: ConfigurationSource[];

  private readonly sequential: boolean;

  public constructor(options: ConfigurationLoaderOptions = {}) {
    this.sources = [...(options.sources ?? [])];

    this.sequential = options.sequential ?? true;
  }

  /**
   * Loads all registered configuration sources.
   *
   * Sources are ordered by ascending priority.
   * Higher priority sources are therefore applied later
   * and override lower priority values.
   *
   * Additional sources (for example, sources registered with a
   * ConfigurationRegistry) can be supplied; they are merged with
   * the loader's own sources and ordered by priority. When an
   * extra source shares a name with a registered source, the
   * loader's own source wins.
   */
  public async load(
    extraSources: readonly ConfigurationSource[] = [],
  ): Promise<ConfigurationLoadResult> {
    const sources = this.getSortedSources(extraSources);

    if (this.sequential) {
      return this.loadSequentially(sources);
    }

    return this.loadConcurrently(sources);
  }

  /**
   * Loads sources sequentially.
   *
   * This is the default behavior.
   */
  private async loadSequentially(
    sources: readonly ConfigurationSource[],
  ): Promise<ConfigurationLoadResult> {
    let configuration = new Configuration();

    let entryCount = 0;

    for (const source of sources) {
      const entries = await this.loadSource(source);

      configuration = applyConfigurationSourceEntries(
        configuration,
        source,
        entries,
      );

      entryCount += entries.length;
    }

    return {
      configuration,
      sources: [...sources],
      entryCount,
    };
  }

  /**
   * Loads sources concurrently.
   *
   * Even though loading happens concurrently, entries are
   * applied according to source priority to preserve
   * deterministic precedence.
   *
   * All sources are attempted; when any fail, a single
   * aggregated error listing every failed source is thrown.
   */
  private async loadConcurrently(
    sources: readonly ConfigurationSource[],
  ): Promise<ConfigurationLoadResult> {
    const settled = await Promise.allSettled(
      sources.map(async (source) => ({
        source,
        entries: await this.loadSource(source),
      })),
    );

    const failures: { source: ConfigurationSource; error: unknown }[] = [];

    const loaded: {
      source: ConfigurationSource;
      entries: readonly ConfigurationSourceEntry[];
    }[] = [];

    for (let index = 0; index < settled.length; index++) {
      const result = settled[index]!;

      if (result.status === "fulfilled") {
        loaded.push(result.value);
        continue;
      }

      failures.push({ source: sources[index]!, error: result.reason });
    }

    if (failures.length > 0) {
      throw ConfigurationLoadError.aggregate(failures);
    }

    let configuration = new Configuration();

    let entryCount = 0;

    for (const result of loaded) {
      configuration = applyConfigurationSourceEntries(
        configuration,
        result.source,
        result.entries,
      );

      entryCount += result.entries.length;
    }

    return {
      configuration,
      sources: [...sources],
      entryCount,
    };
  }

  /**
   * Loads a single configuration source.
   */
  private async loadSource(
    source: ConfigurationSource,
  ): Promise<readonly ConfigurationSourceEntry[]> {
    try {
      const entries = await source.load();

      return entries;
    } catch (error) {
      throw new ConfigurationLoadError(source, error);
    }
  }

  /**
   * Returns sources ordered by priority.
   *
   * Lower priority sources are loaded first.
   * Higher priority sources override them.
   */
  private getSortedSources(
    extraSources: readonly ConfigurationSource[] = [],
  ): ConfigurationSource[] {
    const merged = new Map<string, ConfigurationSource>();

    for (const source of extraSources) {
      merged.set(source.name, source);
    }

    for (const source of this.sources) {
      merged.set(source.name, source);
    }

    return sortConfigurationSources([...merged.values()]);
  }

  /**
   * Adds a configuration source.
   */
  public addSource(source: ConfigurationSource): void {
    this.sources.push(source);
  }

  /**
   * Returns all registered sources.
   */
  public getSources(): readonly ConfigurationSource[] {
    return [...this.sources];
  }

  /**
   * Removes a source by name.
   */
  public removeSource(name: string): boolean {
    const index = this.sources.findIndex((source) => source.name === name);

    if (index === -1) {
      return false;
    }

    this.sources.splice(index, 1);

    return true;
  }

  /**
   * Clears all registered sources.
   */
  public clearSources(): void {
    this.sources.length = 0;
  }
}

/**
 * Error thrown when one or more configuration sources cannot
 * be loaded.
 *
 * A ConfigurationSourceError (code CONFIGURATION_LOAD_FAILED)
 * that additionally carries the failed source object(s), so
 * callers can catch load failures by either type or by code. Raw
 * cause text is redacted before being embedded in the message.
 */
export class ConfigurationLoadError extends ConfigurationSourceError {
  /**
   * The source that failed, for single-source failures.
   */
  public readonly source?: ConfigurationSource;

  /**
   * Every failed source, for aggregate failures. Contains a
   * single element for single-source failures.
   */
  public readonly failures: readonly {
    readonly source: ConfigurationSource;
    readonly error: unknown;
  }[];

  public constructor(source: ConfigurationSource, cause: unknown) {
    super(source.name, source.type, cause);

    this.name = "ConfigurationLoadError";

    this.source = source;

    this.failures = Object.freeze([{ source, error: cause }]);
  }

  /**
   * Creates a single aggregated load error listing every
   * failed source.
   */
  public static aggregate(
    failures: readonly {
      readonly source: ConfigurationSource;
      readonly error: unknown;
    }[],
  ): ConfigurationLoadError {
    if (failures.length === 1) {
      const failure = failures[0]!;
      const single = failure.error;

      if (single instanceof ConfigurationLoadError) return single;
      return new ConfigurationLoadError(failure.source, single);
    }

    const first = failures[0]!;
    const error = new ConfigurationLoadError(first.source, first.error);

    const summary = failures
      .map(
        (failure) =>
          `"${failure.source.name}": ${describeConfigurationCause(
            failure.error instanceof ConfigurationLoadError
              ? (failure.error.cause ?? failure.error)
              : failure.error,
          )}`,
      )
      .join("; ");

    Object.defineProperty(error, "message", {
      value: `Failed to load ${failures.length} configuration sources: ${summary}`,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(error, "failures", {
      value: Object.freeze(
        failures.map((failure) => ({
          source: failure.source,
          error: failure.error,
        })),
      ),
      configurable: true,
    });

    return error;
  }
}

/**
 * Creates a ConfigurationLoader.
 */
export function createConfigurationLoader(
  options: ConfigurationLoaderOptions = {},
): ConfigurationLoader {
  return new ConfigurationLoader(options);
}
