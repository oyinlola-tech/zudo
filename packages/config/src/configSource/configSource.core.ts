/**
 * Sources from which configuration can be loaded.
 *
 * A source represents one provider of configuration values, such as
 * environment variables, in-memory values, files, or programmatic
 * configuration.
 */

import type { ConfigValue } from "../configValue/configValue.core.js";

/**
 * Supported configuration source kinds.
 */
export enum ConfigSourceType {
  DEFAULTS = "defaults",
  ENVIRONMENT = "environment",
  FILE = "file",
  MEMORY = "memory",
  REMOTE = "remote",
  CUSTOM = "custom",
}

/**
 * Context supplied to a configuration source while loading values.
 */
export interface ConfigSourceContext {
  readonly environment?: string;
  readonly namespace?: string;
  readonly signal?: AbortSignal;
}

/**
 * Result returned by a configuration source.
 */
export interface ConfigSourceResult {
  readonly values: Readonly<Record<string, ConfigValue>>;
  readonly source: string;
  readonly type: ConfigSourceType;

  /**
   * Keys within `values` whose entries must be marked sensitive.
   *
   * Sensitive entries are redacted by safe serialization paths such
   * as ConfigStore.toSafeObject() and toSafeConfigEntry().
   */
  readonly sensitiveKeys?: readonly string[];
}

/**
 * Configuration source contract.
 */
export interface ConfigSource {
  readonly name: string;
  readonly type: ConfigSourceType;
  readonly priority: number;
  readonly optional: boolean;

  load(context: ConfigSourceContext): Promise<ConfigSourceResult>;

  isAvailable?(context: ConfigSourceContext): boolean | Promise<boolean>;

  close?(): Promise<void> | void;
}

/**
 * Function-based configuration source.
 */
export type ConfigSourceLoader = (
  context: ConfigSourceContext,
) => ConfigSourceResult | Promise<ConfigSourceResult>;

/**
 * Configuration source implementation that delegates loading to a
 * function.
 */
export interface FunctionConfigSource extends ConfigSource {
  readonly type: ConfigSourceType.CUSTOM;
  readonly loader: ConfigSourceLoader;
}

/**
 * Options used to create a configuration source.
 */
export interface ConfigSourceOptions {
  readonly name: string;
  readonly type?: ConfigSourceType;
  readonly priority?: number;
  readonly optional?: boolean;
}

/**
 * Checks whether a value is a configuration source.
 */
export function isConfigSource(value: unknown): value is ConfigSource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const source = value as Partial<ConfigSource>;

  return (
    typeof source.name === "string" &&
    source.name.length > 0 &&
    typeof source.type === "string" &&
    typeof source.priority === "number" &&
    typeof source.optional === "boolean" &&
    typeof source.load === "function"
  );
}

/**
 * Creates a function-based configuration source.
 */
export function createConfigSource(
  options: ConfigSourceOptions,
  loader: ConfigSourceLoader,
): FunctionConfigSource {
  const type = options.type ?? ConfigSourceType.CUSTOM;

  const priority = options.priority ?? 0;

  if (options.name.trim().length === 0) {
    throw new TypeError("Configuration source name cannot be empty.");
  }

  if (!Number.isFinite(priority)) {
    throw new TypeError(
      "Configuration source priority must be a finite number.",
    );
  }

  if (typeof loader !== "function") {
    throw new TypeError("Configuration source loader must be a function.");
  }

  return Object.freeze({
    name: options.name,
    type,
    priority,
    optional: options.optional ?? false,
    loader,

    async load(context: ConfigSourceContext): Promise<ConfigSourceResult> {
      const result = await loader(context);

      return normalizeConfigSourceResult(result, options.name, type);
    },

    isAvailable: async () => true,
  }) as FunctionConfigSource;
}

/**
 * Creates a source backed by an in-memory object.
 */
export function createMemoryConfigSource(
  values: Readonly<Record<string, ConfigValue>>,
  options: Omit<ConfigSourceOptions, "type"> & {
    readonly type?: ConfigSourceType;
  },
): ConfigSource {
  const sourceName = options.name;

  return createConfigSource(
    {
      ...options,
      type: options.type ?? ConfigSourceType.MEMORY,
    },
    async () => ({
      source: sourceName,
      type: options.type ?? ConfigSourceType.MEMORY,
      values: {
        ...values,
      },
    }),
  );
}

/**
 * Creates a defaults configuration source.
 */
export function createDefaultsConfigSource(
  values: Readonly<Record<string, ConfigValue>>,
  name = "defaults",
): ConfigSource {
  return createMemoryConfigSource(values, {
    name,
    type: ConfigSourceType.DEFAULTS,
    priority: -1000,
    optional: false,
  });
}

/**
 * Creates a custom configuration source.
 */
export function createCustomConfigSource(
  name: string,
  loader: ConfigSourceLoader,
  options: Omit<ConfigSourceOptions, "name" | "type"> = {},
): FunctionConfigSource {
  return createConfigSource(
    {
      ...options,
      name,
      type: ConfigSourceType.CUSTOM,
    },
    loader,
  );
}

/**
 * Normalizes a source result.
 *
 * Note on reference semantics: the returned `values` record is a
 * frozen SHALLOW copy — nested objects and arrays are still shared
 * with the object the source returned. Consumers that need isolation
 * (e.g. the loader/store with freeze enabled) clone values before
 * storing them.
 */
export function normalizeConfigSourceResult(
  result: ConfigSourceResult,
  fallbackName: string,
  fallbackType: ConfigSourceType,
): ConfigSourceResult {
  if (!result || typeof result !== "object") {
    throw new TypeError(
      `Configuration source "${fallbackName}" returned an invalid result.`,
    );
  }

  if (
    typeof result.values !== "object" ||
    result.values === null ||
    Array.isArray(result.values)
  ) {
    throw new TypeError(
      `Configuration source "${fallbackName}" returned invalid values.`,
    );
  }

  return Object.freeze({
    source: result.source ?? fallbackName,

    type: result.type ?? fallbackType,

    values: Object.freeze({
      ...result.values,
    }),

    ...(result.sensitiveKeys
      ? { sensitiveKeys: Object.freeze([...result.sensitiveKeys]) }
      : {}),
  });
}

/**
 * Sorts configuration sources by priority.
 *
 * Higher-priority sources are returned first. Sources with equal
 * priority keep their REGISTRATION ORDER (the sort is stable), so
 * among equal priorities the last-registered source is applied last
 * and wins.
 */
export function sortConfigSources(
  sources: readonly ConfigSource[],
): readonly ConfigSource[] {
  // Array.prototype.sort is stable, so equal priorities preserve the
  // original registration order.
  return [...sources].sort((left, right) => right.priority - left.priority);
}

/**
 * Finds a source by name.
 */
export function findConfigSource(
  sources: readonly ConfigSource[],
  name: string,
): ConfigSource | undefined {
  return sources.find((source) => source.name === name);
}

/**
 * Removes duplicate sources by name.
 *
 * The first occurrence wins.
 */
export function deduplicateConfigSources(
  sources: readonly ConfigSource[],
): readonly ConfigSource[] {
  const seen = new Set<string>();

  const result: ConfigSource[] = [];

  for (const source of sources) {
    if (seen.has(source.name)) {
      continue;
    }

    seen.add(source.name);

    result.push(source);
  }

  return result;
}

/**
 * Loads a single configuration source safely.
 *
 * Optional sources are allowed to fail without preventing startup.
 */
export async function loadConfigSource(
  source: ConfigSource,
  context: ConfigSourceContext = {},
): Promise<ConfigSourceResult | undefined> {
  try {
    return await loadConfigSourceStrict(source, context);
  } catch (error) {
    if (source.optional) {
      return undefined;
    }

    throw error;
  }
}

/**
 * Loads a single configuration source WITHOUT swallowing failures.
 *
 * An unavailable optional source still resolves to `undefined`, but
 * every other failure propagates so callers can route it to their own
 * error handling (ConfigLoader forwards it to `onSourceError`).
 *
 * This is the single implementation of the source loading contract;
 * `loadConfigSource` is the error-swallowing wrapper around it.
 */
export async function loadConfigSourceStrict(
  source: ConfigSource,
  context: ConfigSourceContext = {},
): Promise<ConfigSourceResult | undefined> {
  if (source.isAvailable) {
    const available = await source.isAvailable(context);

    if (!available) {
      if (source.optional) {
        return undefined;
      }

      throw new Error(`Configuration source "${source.name}" is unavailable.`);
    }
  }

  const result = await source.load(context);

  if (!result || typeof result !== "object") {
    throw new Error(
      `Configuration source "${source.name}" returned an invalid result.`,
    );
  }

  return result;
}

/**
 * Loads multiple configuration sources in priority order.
 */
export async function loadConfigSources(
  sources: readonly ConfigSource[],
  context: ConfigSourceContext = {},
): Promise<readonly ConfigSourceResult[]> {
  const sorted = sortConfigSources(deduplicateConfigSources(sources));

  const results: ConfigSourceResult[] = [];

  for (const source of sorted) {
    const result = await loadConfigSource(source, context);

    if (result) {
      results.push(result);
    }
  }

  return results;
}
