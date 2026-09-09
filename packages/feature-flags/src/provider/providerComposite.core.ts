/**
 * Composite feature flag provider.
 *
 * Chains multiple providers with first-match-wins resolution.
 *
 * @module provider/providerComposite
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type {
  FeatureFlagProvider,
  RefreshableFeatureFlagProvider,
} from "../featureFlagTypes/featureFlagProvider.js";

/**
 * Create a composite provider that queries providers in order.
 *
 * The first provider to return a flag wins. `getAll()` merges all flags
 * with earlier providers taking priority.
 *
 * @param providers - Providers to chain, in priority order.
 * @returns A composite FeatureFlagProvider.
 */
export function createCompositeProvider(
  providers: readonly FeatureFlagProvider[],
): RefreshableFeatureFlagProvider {
  return {
    async get(key: string): Promise<FeatureFlag | undefined> {
      for (const provider of providers) {
        const flag = await provider.get(key);
        if (flag) return flag;
      }
      return undefined;
    },

    async getAll(): Promise<readonly FeatureFlag[]> {
      const seen = new Set<string>();
      const result: FeatureFlag[] = [];

      for (const provider of providers) {
        const flags = await provider.getAll();
        for (const flag of flags) {
          if (!seen.has(flag.key)) {
            seen.add(flag.key);
            result.push(flag);
          }
        }
      }

      return result;
    },

    async refresh(): Promise<void> {
      for (const provider of providers) {
        await provider.refresh?.();
      }
    },
  };
}
