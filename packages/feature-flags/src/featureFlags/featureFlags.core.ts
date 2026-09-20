/**
 * FeatureFlags — the main public API.
 *
 * Provides isEnabled, get, evaluate, and snapshot methods.
 *
 * @module featureFlags/featureFlags
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagValue } from "../featureFlagTypes/featureFlagRule/featureFlagValue.type.js";
import type { FeatureFlagEvaluation } from "../featureFlagTypes/featureFlagEvaluation.js";
import type {
  FeatureFlagProvider,
  Unsubscribe,
} from "../featureFlagTypes/featureFlagProvider.js";
import type { FeatureFlagRegistry } from "../registry/registry.core.js";
import { createFeatureFlagRegistry } from "../registry/registry.core.js";
import { evaluateFlag } from "../evaluator/evaluator.core.js";
import {
  FeatureFlagNotFoundError,
  FeatureFlagProviderError,
} from "../featureFlagErrors/featureFlagError.types.js";
import { resolveDependencies, mergeContext } from "./featureFlags.resolve.js";
import {
  createMissCache,
  DEFAULT_MISSING_FLAG_TTL_MS,
} from "./featureFlags.missCache.js";
import {
  createProviderCooloff,
  DEFAULT_PROVIDER_COOLOFF_MS,
} from "./featureFlags.cooloff.js";

/** Options for creating a FeatureFlags instance. */
export interface FeatureFlagsOptions {
  /** Provider to load flag definitions from. */
  readonly provider: FeatureFlagProvider;
  /** Default context applied to all evaluations. */
  readonly defaultContext?: FeatureFlagContext;
  /** Whether to throw on missing flags (default: false, returns default value). */
  readonly throwOnMissing?: boolean;
  /**
   * Reports a provider failure that evaluation contained.
   *
   * A store that cannot be reached must not decide a flag, and it must not
   * take the caller down either: the evaluation falls back to the flag's
   * declared default (or `not_found` when nothing is known about it) and the
   * failure surfaces here.
   */
  readonly onError?: (error: unknown, source: string) => void;
  /**
   * Rethrow provider failures instead of containing them. Default: `false`.
   *
   * Set it when an unreachable store should be a hard failure the caller
   * handles itself.
   */
  readonly throwOnProviderError?: boolean;
  /**
   * How long a key the provider does not know is remembered as missing, in
   * ms. Default: 30,000. At most 1,000 missing keys are kept. `0` asks the
   * provider on every evaluation, as before. The memory is dropped on every
   * reload (`refresh()`, a provider change notification).
   */
  readonly missingFlagTtlMs?: number;
  /**
   * How long a failing provider is left alone before it is probed again, in
   * ms. Default: 5,000. `0` calls the provider on every evaluation, as
   * before. A successful call clears the window at once.
   */
  readonly providerCooloffMs?: number;
}

/** The public FeatureFlags API. */
export interface FeatureFlags {
  isEnabled(key: string, context?: FeatureFlagContext): Promise<boolean>;
  get<T extends FeatureFlagValue = FeatureFlagValue>(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<T | undefined>;
  getBoolean(
    key: string,
    defaultValue: boolean,
    context?: FeatureFlagContext,
  ): Promise<boolean>;
  evaluate<T extends FeatureFlagValue = FeatureFlagValue>(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<FeatureFlagEvaluation<T>>;
  snapshot(
    context?: FeatureFlagContext,
  ): Promise<ReadonlyMap<string, FeatureFlagEvaluation>>;
  refresh(): Promise<void>;
  getAll(): Promise<readonly FeatureFlag[]>;
  /** Stop listening for provider changes. */
  close(): void;
}

/**
 * Create a FeatureFlags instance.
 *
 * @param options - Configuration options.
 * @returns A FeatureFlags API object.
 */
export function createFeatureFlags(options: FeatureFlagsOptions): FeatureFlags {
  const {
    provider,
    defaultContext = {},
    throwOnMissing = false,
    onError,
    throwOnProviderError = false,
    missingFlagTtlMs = DEFAULT_MISSING_FLAG_TTL_MS,
    providerCooloffMs = DEFAULT_PROVIDER_COOLOFF_MS,
  } = options;
  const misses = createMissCache(missingFlagTtlMs);
  const cooloff = createProviderCooloff(providerCooloffMs);

  let registry: FeatureFlagRegistry = createFeatureFlagRegistry();
  let loaded = false;

  /**
   * Report a provider failure, or rethrow it when the caller asked to own it.
   *
   * @returns `false` when the failure was contained.
   */
  function handleProviderError(error: unknown, source: string): false {
    cooloff.recordFailure();
    if (throwOnProviderError) throw error;
    onError?.(
      error instanceof Error
        ? error
        : new FeatureFlagProviderError(`Provider ${source} failed.`, {
            cause: error,
          }),
      source,
    );
    return false;
  }

  async function load(): Promise<boolean> {
    try {
      const flags = await provider.getAll();
      registry = createFeatureFlagRegistry(flags);
      loaded = true;
      misses.clear();
      cooloff.recordSuccess();
      return true;
    } catch (error) {
      return handleProviderError(error, "FeatureFlagProvider.getAll");
    }
  }

  async function ensureLoaded(): Promise<boolean> {
    // Keyed on whether a load has ever succeeded, not on `registry.size`: a
    // provider that legitimately holds no flags used to be re-queried on
    // every single evaluation.
    if (loaded) return true;
    // A provider that just failed is left alone until its window closes,
    // rather than being re-queried (and waited on) by every evaluation.
    if (cooloff.active()) return false;
    return load();
  }

  /**
   * Fails a bulk read that has no flags because the store could not be read.
   *
   * `evaluate()` can say `reason: "error"` per flag; a `Map` or an array has
   * nowhere to put that, and an empty one is indistinguishable from "no flags
   * are configured" — a total outage would otherwise ship to a browser as
   * every flag being off. `onError` still sees the underlying failure first.
   *
   * @throws {FeatureFlagProviderError} When the flags were never loaded.
   */
  function requireAvailable(available: boolean, operation: string): void {
    if (available) return;
    throw new FeatureFlagProviderError(
      `Feature flags are unavailable: ${operation}() cannot report flags because the provider could not be loaded.`,
      { provider: "FeatureFlagProvider.getAll" },
    );
  }

  /** A flag lookup, and whether the store answered. */
  interface FlagLookup {
    readonly flag: FeatureFlag | undefined;
    readonly reachable: boolean;
  }

  async function resolveFlag(key: string): Promise<FlagLookup> {
    const known = registry.get(key);
    if (known) return { flag: known, reachable: true };
    if (misses.has(key)) return { flag: undefined, reachable: true };
    if (cooloff.active()) return { flag: undefined, reachable: false };

    try {
      const flag = await provider.get(key);
      if (flag) registry.set(flag);
      else if (loaded) misses.add(key);
      cooloff.recordSuccess();
      return { flag, reachable: true };
    } catch (error) {
      handleProviderError(error, "FeatureFlagProvider.get");
      // A `get()` that failed is not a `get()` that found nothing: reporting
      // it as `not_found` (or throwing FeatureFlagNotFoundError under
      // `throwOnMissing`) told the caller the flag does not exist when the
      // truth is that the store could not be asked.
      return { flag: undefined, reachable: false };
    }
  }

  // A provider that can announce changes is asked to: without this, a flag
  // flipped at the source never reached an already-loaded instance until
  // somebody called refresh() by hand.
  let unsubscribe: Unsubscribe | undefined = provider.subscribe?.((flags) => {
    registry = createFeatureFlagRegistry(flags);
    loaded = true;
    misses.clear();
    cooloff.recordSuccess();
  });

  const api: FeatureFlags = {
    async isEnabled(key, context): Promise<boolean> {
      const result = await api.evaluate(key, context);
      // Strictly `true`. Returning the raw value meant a flag holding a
      // string or a number — "off", 0.5, a config object — came back truthy
      // from a method whose whole contract is a boolean.
      return result.value === true;
    },

    async get<T extends FeatureFlagValue = FeatureFlagValue>(
      key: string,
      context?: FeatureFlagContext,
    ): Promise<T | undefined> {
      const result = await api.evaluate<T>(key, context);
      return result.value;
    },

    async getBoolean(key, defaultValue, context): Promise<boolean> {
      const result = await api.evaluate<boolean>(key, context);
      if (result.reason === "not_found" || result.reason === "error") {
        return defaultValue;
      }
      return typeof result.value === "boolean" ? result.value : defaultValue;
    },

    async evaluate<T extends FeatureFlagValue = FeatureFlagValue>(
      key: string,
      context?: FeatureFlagContext,
    ): Promise<FeatureFlagEvaluation<T>> {
      const available = await ensureLoaded();

      const mergedCtx = mergeContext(defaultContext, context);
      const { flag, reachable } = await resolveFlag(key);

      if (!flag) {
        if (!available || !reachable) {
          // The store could not be reached and nothing is known about this
          // flag. Report it as an error, not as a decision.
          return {
            key,
            value: undefined as unknown as T,
            reason: "error",
            defaulted: true,
          };
        }
        if (throwOnMissing) throw new FeatureFlagNotFoundError(key);
        return {
          key,
          value: undefined as unknown as T,
          reason: "not_found",
          defaulted: true,
        };
      }

      const dependenciesSatisfied =
        !flag.dependencies ||
        flag.dependencies.length === 0 ||
        resolveDependencies(key, registry, undefined, undefined, mergedCtx);

      return evaluateFlag<T>(flag, mergedCtx, { dependenciesSatisfied });
    },

    async snapshot(
      context,
    ): Promise<ReadonlyMap<string, FeatureFlagEvaluation>> {
      requireAvailable(await ensureLoaded(), "snapshot");

      const mergedCtx = mergeContext(defaultContext, context);
      const flags = registry.getAll();
      const results = new Map<string, FeatureFlagEvaluation>();

      for (const flag of flags) {
        // Only flags explicitly marked client-visible. A flag that declares
        // no visibility stays server-side: a snapshot is shipped to a
        // browser, so the safe default is to withhold.
        if (flag.visibility !== "client") continue;
        const dependenciesSatisfied =
          !flag.dependencies ||
          flag.dependencies.length === 0 ||
          resolveDependencies(
            flag.key,
            registry,
            undefined,
            undefined,
            mergedCtx,
          );
        results.set(
          flag.key,
          evaluateFlag(flag, mergedCtx, { dependenciesSatisfied }),
        );
      }

      return results;
    },

    async refresh(): Promise<void> {
      try {
        await provider.refresh?.();
      } catch (error) {
        handleProviderError(error, "FeatureFlagProvider.refresh");
      }
      await load();
    },

    async getAll(): Promise<readonly FeatureFlag[]> {
      requireAvailable(await ensureLoaded(), "getAll");
      return registry.getAll();
    },

    close(): void {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };

  return api;
}
