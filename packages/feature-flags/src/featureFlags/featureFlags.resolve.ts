/**
 * Dependency resolution and context merging for FeatureFlags.
 *
 * @module featureFlags/featureFlags.resolve
 */

import type { FeatureFlagContext } from "../featureFlagTypes/featureFlagContext.js";
import type { FeatureFlagRegistry } from "../registry/registry.core.js";
import { dependenciesOn } from "./featureFlags.dependency.js";

/**
 * Resolve dependencies for a flag, detecting cycles.
 *
 * A dependency is satisfied when the prerequisite *evaluates* on for the
 * given context (see `dependenciesOn`), not merely when its kill switch is
 * on. Without a context the prerequisites are evaluated against `{}`.
 *
 * @param key - The flag key to resolve.
 * @param registry - The flag registry.
 * @param chain - Keys on the current resolution path, for cycle detection.
 * @param satisfied - Keys already proved satisfied *for this context*.
 * @param context - The evaluation context the prerequisites are checked for.
 * @returns True if the flag is enabled and every dependency is on.
 */
export function resolveDependencies(
  key: string,
  registry: FeatureFlagRegistry,
  chain: Set<string> = new Set(),
  satisfied: Set<string> = new Set(),
  context: FeatureFlagContext = {},
): boolean {
  if (satisfied.has(key)) return true;
  if (chain.has(key)) return false;

  const flag = registry.get(key);
  if (!flag || !flag.enabled) return false;

  const ok = dependenciesOn(flag, registry, context, new Set([...chain, key]));
  if (ok) satisfied.add(key);
  return ok;
}

/**
 * Merge default context with provided context.
 */
export function mergeContext(
  defaultContext: FeatureFlagContext,
  context?: FeatureFlagContext,
): FeatureFlagContext {
  if (!context) return defaultContext;
  return {
    ...defaultContext,
    ...context,
    attributes: {
      ...defaultContext.attributes,
      ...context.attributes,
    },
  };
}
