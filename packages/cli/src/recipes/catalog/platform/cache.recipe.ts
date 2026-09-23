/**
 * zudojs-cli — `zudojs add cache`: an in-memory cache (@zudojs/cache) with
 * a bounded entry count and a default TTL from the environment.
 */

import { zudojsDependencies } from "../../../constants/index.js";
import type { AppRecipe } from "../../recipe.type.js";

const source = (): string => `import {
  createCacheService,
  createMemoryCacheAdapter,
  type CacheService,
} from "@zudojs/cache";

import type { Integration } from "./integration.js";

let service: CacheService | undefined;

/** The cache. Throws before the runtime has started. */
export function cache(): CacheService {
  if (service === undefined) {
    throw new Error("The cache is not ready: start the runtime first.");
  }
  return service;
}

export const cacheIntegration: Integration = {
  name: "cache",

  async start({ config }) {
    service = createCacheService({
      adapter: createMemoryCacheAdapter({ maxEntries: config.cache.maxEntries }),
      config: { defaultTtl: config.cache.defaultTtlMs },
    });
  },

  async stop() {
    service = undefined;
  },

  async health() {
    return service !== undefined;
  },
};
`;

export const cacheRecipe: AppRecipe = {
  scope: "app",
  feature: "cache",
  summary: "In-memory cache (src/integrations/cache.ts)",
  dependencies: zudojsDependencies(["@zudojs/cache"]),
  env: () => [
    { name: "CACHE_MAX_ENTRIES", value: "10000" },
    { name: "CACHE_DEFAULT_TTL_MS", value: "60000" },
  ],
  configSection: `cache: Object.freeze({ maxEntries: int(config, "cache_max_entries", 10_000), defaultTtlMs: int(config, "cache_default_ttl_ms", 60_000) }),`,
  integration: { file: "cache.ts", exportName: "cacheIntegration", source },
};
