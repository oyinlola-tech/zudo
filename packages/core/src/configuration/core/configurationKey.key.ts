import { requireConfigurationPath } from "./configurationPath.path.js";

/**
 * A strongly typed key used to access a configuration value.
 *
 * The generic type T represents the expected value associated
 * with the configuration key.
 *
 * Example:
 *
 * const portKey =
 *   createConfigurationKey<number>("app.port");
 *
 * const port =
 *   configuration.requireByKey(portKey);
 */
export interface ConfigurationKey<T> {
  /**
   * Dot separated configuration path.
   *
   * Examples:
   *
   * app.name
   * app.port
   * database.host
   * auth.jwt.secret
   */
  readonly path: string;

  /**
   * Unique identifier for this configuration key.
   *
   * Note that configuration lookups are performed by `path`,
   * not by this symbol. The symbol only helps distinguish key
   * instances from each other in debugging and diagnostics;
   * two keys with the same path resolve the same value.
   */
  readonly id: symbol;
}

/**
 * Creates a strongly typed configuration key.
 *
 * The key itself does not contain the configuration value.
 * It only describes where that value can be found and what
 * type the caller expects it to have.
 */
export function createConfigurationKey<T>(path: string): ConfigurationKey<T> {
  const normalizedPath = requireConfigurationPath(path);

  return Object.freeze({
    path: normalizedPath,
    id: Symbol(normalizedPath),
  });
}
