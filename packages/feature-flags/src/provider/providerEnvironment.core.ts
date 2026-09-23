/**
 * Environment-variable feature flag provider.
 *
 * Reads feature flags from environment variables with a configurable prefix.
 *
 * Example: FEATURE_NEW_UI=true → key "new-ui" with value true.
 *
 * @module provider/providerEnvironment
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type { RefreshableFeatureFlagProvider } from "../featureFlagTypes/featureFlagProvider.js";

/** Options for the environment provider. */
export interface EnvironmentProviderOptions {
  /** Prefix for environment variable names (default: "FEATURE_"). */
  readonly prefix?: string;
  /** Process env object to read from (default: process.env). */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * How a variable name becomes a flag key, once the prefix is removed.
   *
   * - `"kebab"` (default): lower-cased, `_` becomes `-`, so
   *   `FEATURE_NEW_CHECKOUT` is the flag `new-checkout` — the same key a
   *   memory or remote provider would use.
   * - `"preserve"`: the name as written (`NEW_CHECKOUT`), the behaviour
   *   before 1.4.
   *
   * With `"kebab"`, `get()` normalises the key it is asked for the same way,
   * so `get("NEW_CHECKOUT")`, `get("new_checkout")` and
   * `get("new-checkout")` all find the flag.
   */
  readonly keyFormat?: "kebab" | "preserve";
}

/**
 * Normalise an environment-derived key to kebab case: `NEW_CHECKOUT` and
 * `new_checkout` both become `new-checkout`.
 *
 * @param key - The key, with the prefix already removed.
 * @returns The lower-cased key with underscores replaced by hyphens.
 */
export function toEnvironmentFlagKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

/**
 * Parse a string value into a feature flag value.
 */
function parseEnvValue(raw: string): boolean | string | number {
  if (raw === "true") return true;
  if (raw === "false") return false;

  // `Number("")` and `Number("   ")` are both `0`, so an empty
  // `FEATURE_X=` used to become the number zero. Only a value that is not
  // blank is a candidate for a number; blank stays the string it is.
  if (raw.trim() !== "") {
    const num = Number(raw);
    if (!Number.isNaN(num)) return num;
  }

  return raw;
}

/**
 * Create an environment-variable feature flag provider.
 *
 * @param options - Configuration options.
 * @returns A provider that reads from environment variables.
 */
export function createEnvironmentProvider(
  options: EnvironmentProviderOptions = {},
): RefreshableFeatureFlagProvider {
  const prefix = options.prefix ?? "FEATURE_";
  const normalise =
    options.keyFormat === "preserve"
      ? (key: string): string => key
      : toEnvironmentFlagKey;
  const env =
    options.env ?? (typeof process !== "undefined" ? process.env : {});

  function readFlags(): FeatureFlag[] {
    const flags: FeatureFlag[] = [];

    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        const flagKey = normalise(key.slice(prefix.length));
        flags.push({
          key: flagKey,
          enabled: true,
          defaultValue: parseEnvValue(value),
        });
      }
    }

    return flags;
  }

  let cached: readonly FeatureFlag[] | undefined;

  return {
    async get(key: string): Promise<FeatureFlag | undefined> {
      if (!cached) cached = readFlags();
      const wanted = normalise(key);
      return cached.find((f) => f.key === wanted);
    },

    async getAll(): Promise<readonly FeatureFlag[]> {
      if (!cached) cached = readFlags();
      return cached;
    },

    async refresh(): Promise<void> {
      cached = readFlags();
    },
  };
}
