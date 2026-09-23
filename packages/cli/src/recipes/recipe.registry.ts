/**
 * zudojs-cli — The recipe behind every feature `zudojs add` accepts.
 *
 * Kept in step with `FEATURE_PACKAGES` by `tests/addRecipes.test.ts`: a
 * feature name without a recipe would install a package and write nothing,
 * which is exactly what `add` used to do.
 */

import {
  FEATURE_ALIASES,
  FEATURE_PACKAGES,
  FEATURE_REFUSALS,
} from "../constants/index.js";
import { CLIValidationError } from "../errors/index.js";
import {
  cacheRecipe,
  databaseRecipe,
  emailRecipe,
  messagingRecipe,
  observabilityRecipe,
  openapiRecipe,
  queueRecipe,
  redisRecipe,
  schedulerRecipe,
  storageRecipe,
  websocketsRecipe,
} from "./catalog/index.js";
import { dockerRecipe } from "./docker/index.js";
import type { FeatureRecipe } from "./recipe.type.js";

/** Every recipe, keyed by feature. */
export const FEATURE_RECIPES: Readonly<Record<string, FeatureRecipe>> = Object.freeze({
  database: databaseRecipe,
  redis: redisRecipe,
  websockets: websocketsRecipe,
  email: emailRecipe,
  docker: dockerRecipe,
  queue: queueRecipe,
  messaging: messagingRecipe,
  openapi: openapiRecipe,
  observability: observabilityRecipe,
  cache: cacheRecipe,
  storage: storageRecipe,
  scheduler: schedulerRecipe,
});

/**
 * Resolves a feature name (or alias) to its recipe.
 *
 * @throws {CLIValidationError} For refused or unknown names.
 */
export function resolveFeatureRecipe(name: string): FeatureRecipe {
  const available = Object.keys(FEATURE_PACKAGES).join(", ");
  const feature = Object.hasOwn(FEATURE_ALIASES, name) ? (FEATURE_ALIASES[name] ?? name) : name;
  if (Object.hasOwn(FEATURE_REFUSALS, feature)) {
    throw new CLIValidationError(`"${name}" cannot be added: ${FEATURE_REFUSALS[feature]}`);
  }
  // Own keys only: `constructor` or `__proto__` must not resolve to
  // Object.prototype members.
  const recipe = Object.hasOwn(FEATURE_RECIPES, feature) ? FEATURE_RECIPES[feature] : undefined;
  if (recipe === undefined) {
    throw new CLIValidationError(`Unknown feature: "${name}". Available: ${available}`);
  }
  return recipe;
}
