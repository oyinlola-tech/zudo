import type { ResolvedRuntimeOptions } from "./runtimeOptions.type.js";

import { DEFAULT_RUNTIME_OPTIONS } from "./runtimeOptions.type.js";

/**
 * Resolves runtime options with defaults applied.
 */
export function resolveRuntimeOptions(
  options: ResolvedRuntimeOptions,
): ResolvedRuntimeOptions {
  return Object.freeze({
    ...DEFAULT_RUNTIME_OPTIONS,
    ...options,
  });
}

/**
 * Validates runtime options.
 */
export function validateRuntimeOptions(options: ResolvedRuntimeOptions): void {
  if (!options.environment) {
    throw new Error("Runtime environment is required.");
  }

  if (!options.applicationName) {
    throw new Error("Application name is required.");
  }

  if (options.shutdownTimeout <= 0) {
    throw new Error("Shutdown timeout must be positive.");
  }

  if (options.startupTimeout <= 0) {
    throw new Error("Startup timeout must be positive.");
  }
}

/**
 * Creates a runtime options object with all defaults applied.
 */
export function createRuntimeOptions(
  options: ResolvedRuntimeOptions,
): ResolvedRuntimeOptions {
  const resolved = resolveRuntimeOptions(options);
  validateRuntimeOptions(resolved);
  return resolved;
}
