/**
 * Application environment constants.
 *
 * @module environment/environment
 */

import { ImmutableSet } from "../internal/immutableSet.js";

/** Type-safe environment name string. */
export type Environment = "development" | "test" | "staging" | "production";

/**
 * All supported environments as an object map.
 */
export const Environments = Object.freeze({
  DEVELOPMENT: "development",
  TEST: "test",
  STAGING: "staging",
  PRODUCTION: "production",
} as const);

/** Set of all valid environments for quick membership checks (immutable at runtime). */
export const ENVIRONMENTS: ReadonlySet<Environment> =
  new ImmutableSet<Environment>(Object.values(Environments));

/**
 * Check whether a string is a valid Environment value.
 */
export function isValidEnvironment(value: string): value is Environment {
  return ENVIRONMENTS.has(value as Environment);
}
