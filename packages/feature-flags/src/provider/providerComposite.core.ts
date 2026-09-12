/**
 * Composite feature flag provider.
 *
 * Chains multiple providers with first-match-wins resolution.
 *
 * @module provider/providerComposite
 */

import type { FeatureFlag } from "../featureFlagTypes/featureFlag.interface.js";
import type {
  FeatureFlagChangeListener,
  FeatureFlagProvider,
  RefreshableFeatureFlagProvider,
  Unsubscribe,
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
  /**
   * The last flag list each member produced — from its own `getAll()` or
   * from a change it announced. Lets a change be re-announced synchronously
   * as the merged view, without a round trip to every other member.
   */
  const lastSeen = new Map<FeatureFlagProvider, readonly FeatureFlag[]>();

  function merge(lists: readonly (readonly FeatureFlag[])[]): FeatureFlag[] {
    const seen = new Set<string>();
    const result: FeatureFlag[] = [];

    for (const flags of lists) {
      for (const flag of flags) {
        if (!seen.has(flag.key)) {
          seen.add(flag.key);
          result.push(flag);
        }
      }
    }

    return result;
  }

  async function getAll(): Promise<readonly FeatureFlag[]> {
    const lists: (readonly FeatureFlag[])[] = [];
    for (const provider of providers) {
      const flags = await provider.getAll();
      lastSeen.set(provider, flags);
      lists.push(flags);
    }
    return merge(lists);
  }

  // Changes announced by any member are re-announced as the merged view, so
  // a consumer subscribed to the composite sees the same precedence
  // `getAll()` applies. The composite used to have no `subscribe` at all,
  // which silently cut change propagation for every provider behind it.
  const subscribable = providers.filter((provider) => provider.subscribe);
  const subscribe: Pick<RefreshableFeatureFlagProvider, "subscribe"> =
    subscribable.length > 0
      ? {
          subscribe(listener: FeatureFlagChangeListener): Unsubscribe {
            // A merged snapshot fetched asynchronously must not overtake a
            // later change.
            let version = 0;
            const unsubscribes = subscribable.map((provider) =>
              provider.subscribe!((flags) => {
                lastSeen.set(provider, flags);
                const current = ++version;

                if (providers.every((member) => lastSeen.has(member))) {
                  listener(merge(providers.map((member) => lastSeen.get(member)!)));
                  return;
                }

                void getAll().then(
                  (merged) => {
                    if (current === version) listener(merged);
                  },
                  () => {
                    /* a member that cannot be read keeps the last view */
                  },
                );
              }),
            );
            return () => {
              for (const unsubscribe of unsubscribes) unsubscribe();
            };
          },
        }
      : {};

  return {
    ...subscribe,

    async get(key: string): Promise<FeatureFlag | undefined> {
      for (const provider of providers) {
        const flag = await provider.get(key);
        if (flag) return flag;
      }
      return undefined;
    },

    getAll,

    async refresh(): Promise<void> {
      for (const provider of providers) {
        await provider.refresh?.();
      }
    },
  };
}
