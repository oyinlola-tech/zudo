/**
 * Environment-variable configuration source.
 *
 * ConfigSourceType.ENVIRONMENT existed from the first release but no
 * implementation ever shipped, so the documented "environment-specific
 * settings" use case had to be hand-rolled by every consumer.
 */

import type { ConfigValue } from "../configValue/configValue.core.js";

import { defineConfigProperty } from "../configValue/configValue.core.js";

import type { ConfigSource } from "./configSource.core.js";

import { ConfigSourceType, createConfigSource } from "./configSource.core.js";

/**
 * Environment variable names whose values are treated as secrets.
 *
 * Matching entries are reported through `sensitiveKeys`, so
 * `toSafeObject()` and safe entry serialization redact them instead of
 * printing credentials into logs.
 */
const DEFAULT_SECRET_PATTERN =
  /(pass(word)?|secret|token|api[_.-]?key|private[_.-]?key|credential|auth)/i;

/**
 * Options for the environment configuration source.
 */
export interface EnvironmentConfigSourceOptions {
  /**
   * Only variables starting with this prefix are read. The prefix is
   * removed from the resulting configuration key. When omitted, every
   * variable is read — rarely what an application wants.
   */
  readonly prefix?: string;

  /**
   * Source name (default "environment").
   */
  readonly name?: string;

  /**
   * Source priority (default 100, above in-memory defaults).
   */
  readonly priority?: number;

  /**
   * Whether load failures are tolerated (default false).
   */
  readonly optional?: boolean;

  /**
   * Variable map to read. Defaults to `process.env`.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;

  /**
   * Overrides the default variable-name to configuration-key mapping.
   * Receives the name with `prefix` already removed.
   *
   * The default lowercases the name and maps "__" to "." so
   * `APP__DB__HOST` becomes `db.host` under the prefix `APP__`.
   */
  readonly keyMapper?: (name: string) => string;

  /**
   * Decides whether a variable holds a secret. Receives the ORIGINAL
   * variable name and the derived configuration key. Defaults to a
   * name pattern covering passwords, tokens, API keys and credentials.
   *
   * Pass `() => false` to opt out — values are then NOT redacted by
   * safe serialization.
   */
  readonly isSensitive?: (name: string, key: string) => boolean;
}

/**
 * Maps an environment variable name to a configuration key.
 */
function defaultKeyMapper(name: string): string {
  return name.toLowerCase().split("__").join(".");
}

/**
 * Creates a configuration source backed by environment variables.
 *
 * Values are returned as RAW STRINGS: no boolean or numeric inference
 * happens here, because guessing types from strings is how `"false"`
 * ends up truthy. Use the typed accessors (`manager.number(key)`,
 * `manager.boolean(key)`) which coerce explicitly and reject values
 * that do not parse.
 *
 * Variables whose value is `undefined` are skipped; a variable set to
 * the empty string is kept, since "set but empty" is meaningful.
 */
export function createEnvironmentConfigSource(
  options: EnvironmentConfigSourceOptions = {},
): ConfigSource {
  const prefix = options.prefix ?? "";

  const keyMapper = options.keyMapper ?? defaultKeyMapper;

  const isSensitive =
    options.isSensitive ??
    ((name: string): boolean => DEFAULT_SECRET_PATTERN.test(name));

  const name = options.name ?? "environment";

  return createConfigSource(
    {
      name,
      type: ConfigSourceType.ENVIRONMENT,
      priority: options.priority ?? 100,
      optional: options.optional ?? false,
    },
    () => {
      const env = options.env ?? process.env;

      const values: Record<string, ConfigValue> = {};

      const sensitiveKeys: string[] = [];

      for (const [variable, raw] of Object.entries(env)) {
        if (raw === undefined) {
          continue;
        }

        if (prefix.length > 0 && !variable.startsWith(prefix)) {
          continue;
        }

        const key = keyMapper(variable.slice(prefix.length));

        if (key.length === 0) {
          continue;
        }

        defineConfigProperty(values, key, raw);

        if (isSensitive(variable, key)) {
          sensitiveKeys.push(key);
        }
      }

      return {
        source: name,
        type: ConfigSourceType.ENVIRONMENT,
        values,
        sensitiveKeys,
      };
    },
  );
}
