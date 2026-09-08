import type { ConfigValue } from "../configValue/configValue.core.js";
import type { ConfigSourceType } from "../configSource/configSource.core.js";

/**
 * Represents a single resolved configuration entry.
 *
 * Entries retain both the resolved value and the information about
 * where that value came from. This allows the configuration system
 * to provide useful debugging and introspection without exposing
 * secrets accidentally.
 */
export interface ConfigEntry<T extends ConfigValue = ConfigValue> {
  readonly key: string;
  readonly value: T;
  readonly source: string;
  readonly sourceType: ConfigSourceType;
  readonly priority: number;
  readonly sensitive: boolean;
  readonly resolved: boolean;
  readonly createdAt: number;
}

/**
 * Options used when creating a configuration entry.
 */
export interface ConfigEntryOptions<T extends ConfigValue = ConfigValue> {
  readonly key: string;
  readonly value: T;
  readonly source?: string;
  readonly sourceType?: ConfigSourceType;
  readonly priority?: number;
  readonly sensitive?: boolean;
  readonly resolved?: boolean;
  readonly createdAt?: number;
}

/**
 * Creates a configuration entry.
 */
export function createConfigEntry<T extends ConfigValue>(
  options: ConfigEntryOptions<T>,
): ConfigEntry<T> {
  const key = options.key.trim();

  if (key.length === 0) {
    throw new TypeError("Configuration entry key cannot be empty.");
  }

  return Object.freeze({
    key,
    value: options.value,
    source: options.source ?? "unknown",
    sourceType: options.sourceType ?? ("custom" as ConfigSourceType),
    priority: options.priority ?? 0,
    sensitive: options.sensitive ?? false,
    resolved: options.resolved ?? true,
    createdAt: options.createdAt ?? Date.now(),
  });
}

/**
 * Creates an entry from another entry while replacing its value.
 */
export function updateConfigEntry<T extends ConfigValue>(
  entry: ConfigEntry,
  value: T,
): ConfigEntry<T> {
  return createConfigEntry({
    key: entry.key,
    value,
    source: entry.source,
    sourceType: entry.sourceType,
    priority: entry.priority,
    sensitive: entry.sensitive,
    resolved: entry.resolved,
    createdAt: entry.createdAt,
  });
}

/**
 * Checks whether a value is a valid configuration entry.
 */
export function isConfigEntry(value: unknown): value is ConfigEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Partial<ConfigEntry>;

  return (
    typeof entry.key === "string" &&
    entry.key.length > 0 &&
    "value" in entry &&
    typeof entry.source === "string" &&
    typeof entry.sourceType === "string" &&
    typeof entry.priority === "number" &&
    typeof entry.sensitive === "boolean" &&
    typeof entry.resolved === "boolean" &&
    typeof entry.createdAt === "number"
  );
}

/**
 * Masks a sensitive configuration value.
 *
 * The entire value — including arrays and objects — collapses to a
 * single replacement token so that no structural information (such
 * as an array's length) leaks about the sensitive value.
 */
export function redactConfigValue(
  _value: ConfigValue,
  replacement = "[REDACTED]",
): ConfigValue {
  return replacement;
}

/**
 * Creates a safe representation of an entry for logging or
 * diagnostics.
 *
 * Sensitive values are never returned in clear text.
 */
export function toSafeConfigEntry(entry: ConfigEntry): ConfigEntry {
  if (!entry.sensitive) {
    return entry;
  }

  return createConfigEntry({
    key: entry.key,
    value: redactConfigValue(entry.value),
    source: entry.source,
    sourceType: entry.sourceType,
    priority: entry.priority,
    sensitive: true,
    resolved: entry.resolved,
    createdAt: entry.createdAt,
  });
}

/**
 * Converts an entry into a plain serializable object.
 */
export function serializeConfigEntry(
  entry: ConfigEntry,
): Record<string, unknown> {
  const safeEntry = toSafeConfigEntry(entry);

  return {
    key: safeEntry.key,
    value: safeEntry.value,
    source: safeEntry.source,
    sourceType: safeEntry.sourceType,
    priority: safeEntry.priority,
    sensitive: safeEntry.sensitive,
    resolved: safeEntry.resolved,
    createdAt: safeEntry.createdAt,
  };
}

/**
 * Creates a copy of an entry with a different source.
 */
export function withConfigEntrySource<T extends ConfigValue>(
  entry: ConfigEntry<T>,
  source: string,
  sourceType: ConfigSourceType,
  priority = entry.priority,
): ConfigEntry<T> {
  return createConfigEntry({
    key: entry.key,
    value: entry.value,
    source,
    sourceType,
    priority,
    sensitive: entry.sensitive,
    resolved: entry.resolved,
    createdAt: entry.createdAt,
  });
}

/**
 * Compares two configuration entries.
 *
 * Source metadata is included in the comparison because two entries
 * with the same value can still represent different configuration
 * states.
 */
export function configEntriesEqual(
  left: ConfigEntry,
  right: ConfigEntry,
): boolean {
  return (
    left.key === right.key &&
    left.source === right.source &&
    left.sourceType === right.sourceType &&
    left.priority === right.priority &&
    left.sensitive === right.sensitive &&
    left.resolved === right.resolved &&
    left.createdAt === right.createdAt &&
    Object.is(left.value, right.value)
  );
}

/**
 * Sorts configuration entries by key and then priority.
 */
export function sortConfigEntries(
  entries: readonly ConfigEntry[],
): readonly ConfigEntry[] {
  return [...entries].sort((left, right) => {
    const keyComparison = left.key.localeCompare(right.key);

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return right.priority - left.priority;
  });
}
