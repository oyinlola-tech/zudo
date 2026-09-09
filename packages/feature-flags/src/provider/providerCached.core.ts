/**
 * Cached feature flag provider.
 *
 * Wraps a remote provider with in-memory caching to avoid per-request network calls.
 *
 * @module provider/providerCached
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type {
  FeatureFlagProvider,
  RefreshableFeatureFlagProvider,
} from "../featureFlagTypes/featureFlagProvider.js";

/** Options for the cached provider. */
export interface CachedProviderOptions {
  /** Time-to-live in milliseconds (default: 30,000). */
  readonly ttl?: number;
}

interface CacheEntry {
  readonly value: FeatureFlag | undefined;
  readonly expiresAt: number;
}

/**
 * Create a cached feature flag provider.
 *
 * @param inner - The upstream provider to cache.
 * @param options - Caching options.
 * @returns A provider with in-memory TTL caching.
 */
export function createCachedProvider(
  inner: FeatureFlagProvider,
  options: CachedProviderOptions = {},
): RefreshableFeatureFlagProvider {
  const ttl = options.ttl ?? 30_000;
  const flagCache = new Map<string, CacheEntry>();
  let listCache:
    | { readonly flags: readonly FeatureFlag[]; readonly expiresAt: number }
    | undefined;

  function isExpired(entry: { expiresAt: number }): boolean {
    return Date.now() > entry.expiresAt;
  }

  return {
    async get(key: string): Promise<FeatureFlag | undefined> {
      const cached = flagCache.get(key);
      if (cached && !isExpired(cached)) return cached.value;

      const flag = await inner.get(key);
      flagCache.set(key, { value: flag, expiresAt: Date.now() + ttl });
      return flag;
    },

    async getAll(): Promise<readonly FeatureFlag[]> {
      if (listCache && !isExpired(listCache)) return listCache.flags;

      const flags = await inner.getAll();
      listCache = { flags, expiresAt: Date.now() + ttl };
      return flags;
    },

    async refresh(): Promise<void> {
      flagCache.clear();
      listCache = undefined;
      await inner.refresh?.();
    },
  };
}
