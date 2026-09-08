import type { ConfigurationSourceType } from "./configurationSource.source.js";
import type { ConfigurationKey } from "./configurationKey.key.js";
import {
  normalizeConfigurationPath,
  requireConfigurationPath,
} from "./configurationPath.path.js";
import {
  ConfigurationMissingError,
  ConfigurationPathError,
  ConfigurationTypeError,
} from "../error/configurationError.error.js";

/** Configuration value types supported by the core configuration system. */
export type ConfigurationValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ConfigurationValue[]
  | { readonly [key: string]: ConfigurationValue };

/**
 * Source attribution for a configuration entry.
 *
 * "mixed" is reported when the values under a path originate
 * from more than one source type.
 */
export type ConfigurationEntrySource = ConfigurationSourceType | "mixed";

/** Options used to create a Configuration instance. */
export interface ConfigurationOptions {
  readonly values?: Record<string, ConfigurationValue>;
  readonly source?: ConfigurationSourceType;
  readonly namespace?: string;

  /**
   * Per-path source attribution.
   *
   * Used internally when deriving configurations so entry-level
   * source information survives `with()`, `merge()`, and `scope()`.
   */
  readonly sources?: ReadonlyMap<string, ConfigurationSourceType>;
}

/** Represents a configuration entry. */
export interface ConfigurationEntry<T = ConfigurationValue> {
  readonly path: string;
  readonly value: T;
  readonly source: ConfigurationEntrySource;
}

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Recursively freezes a configuration value tree.
 *
 * Nodes that are already frozen are assumed to be deep-frozen
 * (which holds for all trees produced by this module) and are
 * skipped.
 */
function deepFreezeConfigurationValue<T extends ConfigurationValue>(
  value: T,
): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) deepFreezeConfigurationValue(item);
    return Object.freeze(value) as T;
  }

  for (const child of Object.values(value)) {
    deepFreezeConfigurationValue(child as ConfigurationValue);
  }
  return Object.freeze(value) as T;
}

/**
 * Deep-copies a configuration value tree.
 *
 * Plain objects and arrays are cloned recursively; primitives are
 * returned as-is. Used so accessors that hand out whole subtrees
 * never expose internal references.
 */
function cloneConfigurationValue<T extends ConfigurationValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneConfigurationValue(item as ConfigurationValue),
    ) as T;
  }

  const result: Record<string, ConfigurationValue> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = cloneConfigurationValue(child as ConfigurationValue);
  }
  return result as T;
}

const STRICT_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Immutable configuration container.
 *
 * The values tree is deep-frozen at construction, so accessors can
 * safely hand out internal references. Callers should treat any
 * object passed into the constructor (or `with()`) as owned by the
 * configuration afterwards: it becomes frozen.
 */
export class Configuration {
  private readonly values: Readonly<Record<string, ConfigurationValue>>;
  private readonly source: ConfigurationSourceType;
  private readonly namespace?: string;
  private readonly pathSources: ReadonlyMap<string, ConfigurationSourceType>;

  public constructor(options: ConfigurationOptions = {}) {
    this.source = options.source ?? "runtime";
    this.namespace = options.namespace;
    this.values = deepFreezeConfigurationValue(
      (options.values ?? {}) as Record<string, ConfigurationValue>,
    ) as Readonly<Record<string, ConfigurationValue>>;
    this.pathSources = new Map(options.sources ?? []);
  }

  public getNamespace(): string | undefined {
    return this.namespace;
  }

  /**
   * Returns the source of a configuration path, or of the whole
   * configuration when no path is supplied.
   *
   * When entries originate from multiple source types, "mixed"
   * is returned.
   */
  public getSource(path?: string): ConfigurationEntrySource {
    if (path === undefined) {
      const distinct = new Set(this.pathSources.values());
      if (distinct.size === 0) return this.source;

      for (const key of Object.keys(this.values)) {
        if (!this.hasSourceRecordFor(key)) {
          distinct.add(this.source);
          break;
        }
      }

      if (distinct.size === 1)
        return [...distinct][0] as ConfigurationSourceType;
      return "mixed";
    }

    const normalizedPath = this.normalizePath(path);
    if (!normalizedPath) return this.source;
    return this.resolvePathSource(normalizedPath);
  }

  public get<T = ConfigurationValue>(path: string): T | undefined {
    const normalizedPath = this.normalizePath(path);
    if (!normalizedPath) return undefined;
    const parts = normalizedPath.split(".");
    let current: unknown = this.values;
    for (const part of parts) {
      if (
        typeof current !== "object" ||
        current === null ||
        !Object.hasOwn(current, part)
      )
        return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current as T;
  }

  public require<T = ConfigurationValue>(path: string): T {
    const value = this.get<T>(path);
    if (value === undefined) throw new ConfigurationMissingError(path);
    return value;
  }

  public getByKey<T>(key: ConfigurationKey<T>): T | undefined {
    return this.get<T>(key.path);
  }

  public requireByKey<T>(key: ConfigurationKey<T>): T {
    const value = this.getByKey(key);
    if (value === undefined) throw new ConfigurationMissingError(key.path);
    return value;
  }

  public has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  public getBoolean(path: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(path);
    if (value === undefined) return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes")
        return true;
      if (normalized === "false" || normalized === "0" || normalized === "no")
        return false;
    }
    throw new ConfigurationTypeError(path, "boolean", value);
  }

  public getNumber(path: string, defaultValue?: number): number | undefined {
    const value = this.get(path);
    if (value === undefined) return defaultValue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) return value;
      throw new ConfigurationTypeError(path, "number", value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        /*
         * Empty and whitespace-only strings are treated as
         * "value not provided" rather than silently coerced to 0.
         */
        if (defaultValue !== undefined) return defaultValue;
        throw new ConfigurationTypeError(path, "number", value);
      }
      if (STRICT_DECIMAL_PATTERN.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    throw new ConfigurationTypeError(path, "number", value);
  }

  public getString(path: string, defaultValue?: string): string | undefined {
    const value = this.get(path);
    if (value === undefined) return defaultValue;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    throw new ConfigurationTypeError(path, "string", value);
  }

  public scope(namespace: string): Configuration {
    const normalizedNamespace = requireConfigurationPath(namespace);

    const exactSource = this.pathSources.get(normalizedNamespace);
    const scopedSource =
      exactSource ??
      this.resolveAncestorSource(normalizedNamespace) ??
      this.source;

    const scopedSources = new Map<string, ConfigurationSourceType>();
    const prefix = `${normalizedNamespace}.`;
    for (const [recordedPath, source] of this.pathSources) {
      if (recordedPath.startsWith(prefix)) {
        scopedSources.set(recordedPath.slice(prefix.length), source);
      }
    }

    const scopedValues =
      this.get<Record<string, ConfigurationValue>>(normalizedNamespace);
    if (
      scopedValues === undefined ||
      typeof scopedValues !== "object" ||
      scopedValues === null ||
      Array.isArray(scopedValues)
    ) {
      return new Configuration({
        values: {},
        source: scopedSource,
        namespace: normalizedNamespace,
      });
    }
    return new Configuration({
      values: scopedValues,
      source: scopedSource,
      namespace: normalizedNamespace,
      sources: scopedSources,
    });
  }

  public entries(): readonly ConfigurationEntry[] {
    return Object.entries(this.values).map(([path, value]) => ({
      path,
      value,
      source: this.resolvePathSource(path),
    }));
  }

  /**
   * Returns a deep copy of the complete values tree.
   *
   * The copy is unfrozen and independent of the configuration, so
   * callers may mutate it freely without affecting this instance
   * or anything derived from it.
   */
  public toObject(): Record<string, ConfigurationValue> {
    return cloneConfigurationValue(
      this.values as Record<string, ConfigurationValue>,
    );
  }

  /**
   * Deeply merges another configuration on top of this one.
   *
   * Objects are merged recursively, arrays and primitives are
   * replaced. Per-path source attribution from both configurations
   * is preserved; the other configuration wins on conflicts.
   */
  public merge(other: Configuration): Configuration {
    const values = this.deepMergeValues(this.values, other.values) as Record<
      string,
      ConfigurationValue
    >;

    const sources = new Map(this.pathSources);
    for (const [path, source] of other.pathSources) sources.set(path, source);

    return new Configuration({
      values,
      source: other.source,
      namespace: other.namespace ?? this.namespace,
      sources,
    });
  }

  public with<T extends ConfigurationValue>(
    path: string,
    value: T,
    source: ConfigurationSourceType = "runtime",
  ): Configuration {
    const normalizedPath = requireConfigurationPath(path);
    const values = this.setNestedValue(this.values, normalizedPath, value);

    const sources = new Map(this.pathSources);
    const prefix = `${normalizedPath}.`;
    for (const recordedPath of sources.keys()) {
      if (recordedPath.startsWith(prefix)) sources.delete(recordedPath);
    }
    sources.set(normalizedPath, source);

    return new Configuration({
      values,
      source: this.source,
      namespace: this.namespace,
      sources,
    });
  }

  public without(path: string): Configuration {
    const normalizedPath = this.normalizePath(path);
    if (!normalizedPath) return this;
    const values = this.deleteNestedValue(this.values, normalizedPath);

    const sources = new Map(this.pathSources);
    const prefix = `${normalizedPath}.`;
    sources.delete(normalizedPath);
    for (const recordedPath of [...sources.keys()]) {
      if (recordedPath.startsWith(prefix)) sources.delete(recordedPath);
    }

    return new Configuration({
      values,
      source: this.source,
      namespace: this.namespace,
      sources,
    });
  }

  private normalizePath(path: string): string {
    return normalizeConfigurationPath(path);
  }

  private hasSourceRecordFor(topLevelKey: string): boolean {
    if (this.pathSources.has(topLevelKey)) return true;
    const prefix = `${topLevelKey}.`;
    for (const recordedPath of this.pathSources.keys()) {
      if (recordedPath.startsWith(prefix)) return true;
    }
    return false;
  }

  private resolveAncestorSource(
    path: string,
  ): ConfigurationSourceType | undefined {
    const parts = path.split(".");
    for (let index = parts.length - 1; index > 0; index--) {
      const ancestor = parts.slice(0, index).join(".");
      const source = this.pathSources.get(ancestor);
      if (source !== undefined) return source;
    }
    return undefined;
  }

  private resolvePathSource(path: string): ConfigurationEntrySource {
    const exact = this.pathSources.get(path);
    if (exact !== undefined) return exact;

    const ancestor = this.resolveAncestorSource(path);
    if (ancestor !== undefined) return ancestor;

    const prefix = `${path}.`;
    const descendantSources = new Set<ConfigurationSourceType>();
    for (const [recordedPath, source] of this.pathSources) {
      if (recordedPath.startsWith(prefix)) descendantSources.add(source);
    }
    if (descendantSources.size === 1)
      return [...descendantSources][0] as ConfigurationSourceType;
    if (descendantSources.size > 1) return "mixed";

    return this.source;
  }

  private deepMergeValues(
    base: ConfigurationValue,
    override: ConfigurationValue,
  ): ConfigurationValue {
    if (
      base === null ||
      override === null ||
      typeof base !== "object" ||
      typeof override !== "object" ||
      Array.isArray(base) ||
      Array.isArray(override)
    ) {
      return override;
    }

    const result: Record<string, ConfigurationValue> = {};
    for (const [key, value] of Object.entries(base)) {
      if (FORBIDDEN_PATH_SEGMENTS.has(key)) continue;
      result[key] = value;
    }
    for (const [key, value] of Object.entries(override)) {
      if (FORBIDDEN_PATH_SEGMENTS.has(key)) continue;
      const existing = result[key];
      result[key] =
        existing !== undefined ? this.deepMergeValues(existing, value) : value;
    }
    return result;
  }

  private setNestedValue(
    source: Readonly<Record<string, ConfigurationValue>>,
    path: string,
    value: ConfigurationValue,
  ): Record<string, ConfigurationValue> {
    const parts = path.split(".");
    if (parts.some((p) => FORBIDDEN_PATH_SEGMENTS.has(p))) {
      throw new ConfigurationPathError(path, "path names a forbidden segment.");
    }
    const result: Record<string, ConfigurationValue> = { ...source };
    let current: Record<string, ConfigurationValue> = result;
    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index]!;
      const existing = current[part];
      const nested =
        existing !== null &&
        typeof existing === "object" &&
        !Array.isArray(existing)
          ? { ...(existing as Record<string, ConfigurationValue>) }
          : {};
      current[part] = nested;
      current = nested;
    }
    current[parts[parts.length - 1]!] = value;
    return result;
  }

  /**
   * Removes a nested value by shallow-cloning only the objects
   * along the path, mirroring the strategy used by setNestedValue.
   */
  private deleteNestedValue(
    source: Readonly<Record<string, ConfigurationValue>>,
    path: string,
  ): Record<string, ConfigurationValue> {
    const parts = path.split(".");
    if (parts.some((p) => FORBIDDEN_PATH_SEGMENTS.has(p))) {
      throw new ConfigurationPathError(path, "path names a forbidden segment.");
    }
    const result: Record<string, ConfigurationValue> = { ...source };
    let current: Record<string, ConfigurationValue> = result;
    for (let index = 0; index < parts.length - 1; index++) {
      const part = parts[index]!;
      const next = current[part];
      if (next === null || typeof next !== "object" || Array.isArray(next))
        return result;
      const clone = { ...(next as Record<string, ConfigurationValue>) };
      current[part] = clone;
      current = clone;
    }
    delete current[parts[parts.length - 1]!];
    return result;
  }
}

/** Creates a Configuration instance. */
export function createConfiguration(
  options: ConfigurationOptions = {},
): Configuration {
  return new Configuration(options);
}
