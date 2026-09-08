/**
 * Environment detection and helper utilities.
 *
 * @module environment/environment
 */

import { type Environment } from "./environment.type.js";
import { InvalidConstantError } from "../constantsErrors/constantsError.base.js";

/** Node environment variable name for detecting the current environment. */
export const NODE_ENV_KEY = "NODE_ENV" as const;

/**
 * Unrecognized NODE_ENV values that have already been warned about, so each
 * distinct typo is reported once per process rather than on every call.
 */
const warnedUnrecognizedValues = new Set<string>();

/**
 * Options for {@link resolveEnvironment}.
 */
export interface ResolveEnvironmentOptions {
  /**
   * Throw an {@link InvalidConstantError} instead of warning and falling back
   * to `"development"` when NODE_ENV holds an unrecognized value.
   */
  readonly strict?: boolean;
  /**
   * Suppress the one-time `console.warn` emitted for unrecognized NODE_ENV
   * values (ignored in strict mode, which throws instead).
   */
  readonly silent?: boolean;
}

/**
 * Read the current environment from process.env.
 *
 * - Unset/empty NODE_ENV resolves to `"development"` silently.
 * - An unrecognized value (e.g. a typo such as `"prodution"`) resolves to
 *   `"development"` but emits a `console.warn` once per distinct value per
 *   process, so a misconfigured production deployment does not silently run
 *   with development behaviour. Pass `{ silent: true }` to suppress the
 *   warning, or `{ strict: true }` to throw an {@link InvalidConstantError}
 *   instead.
 *
 * @param envOverride - Optional env map override (useful for testing)
 * @param options - `strict`: throw on unrecognized values; `silent`: do not warn
 * @returns The resolved Environment value
 * @throws {InvalidConstantError} in strict mode, when NODE_ENV is set to an
 * unrecognized value
 */
export function resolveEnvironment(
  envOverride?: Record<string, string | undefined>,
  options?: ResolveEnvironmentOptions,
): Environment {
  const raw = (envOverride ?? process.env)[NODE_ENV_KEY];
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalised = raw.trim().toLowerCase();
    if (normalised === "dev" || normalised === "development")
      return "development";
    if (normalised === "prod" || normalised === "production")
      return "production";
    if (normalised === "test") return "test";
    if (normalised === "staging") return "staging";
    if (options?.strict === true) {
      throw new InvalidConstantError(
        `Unrecognized ${NODE_ENV_KEY} value: ${JSON.stringify(raw)}`,
        { metadata: { value: raw } },
      );
    }
    if (options?.silent !== true && !warnedUnrecognizedValues.has(raw)) {
      warnedUnrecognizedValues.add(raw);
      console.warn(
        `[@zudojs/constants] Unrecognized ${NODE_ENV_KEY} value ${JSON.stringify(raw)}; ` +
          `falling back to "development". Expected one of: development, test, staging, production ` +
          `(or the aliases dev, prod).`,
      );
    }
  }
  return "development";
}

/**
 * Check whether the current environment is production.
 */
export function isProduction(
  envOverride?: Record<string, string | undefined>,
): boolean {
  return resolveEnvironment(envOverride) === "production";
}

/**
 * Check whether the current environment is development.
 */
export function isDevelopment(
  envOverride?: Record<string, string | undefined>,
): boolean {
  return resolveEnvironment(envOverride) === "development";
}

/**
 * Check whether the current environment is test.
 */
export function isTest(
  envOverride?: Record<string, string | undefined>,
): boolean {
  return resolveEnvironment(envOverride) === "test";
}
