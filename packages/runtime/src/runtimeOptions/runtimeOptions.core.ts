import type { ResolvedRuntimeOptions } from "./runtimeOptions.type.js";

import { DEFAULT_RUNTIME_OPTIONS } from "./runtimeOptions.type.js";

/**
 * Resolves runtime options with defaults applied.
 */
export function resolveRuntimeOptions(
  options: ResolvedRuntimeOptions,
): ResolvedRuntimeOptions {
  // Spreading `options` wholesale lets an explicitly-undefined key erase
  // its default — a common footgun when callers build options with
  // optional fields. Only defined values override.
  const provided = Object.fromEntries(
    Object.entries(options ?? {}).filter(([, value]) => value !== undefined),
  );

  return Object.freeze({
    ...DEFAULT_RUNTIME_OPTIONS,
    ...provided,
  }) as ResolvedRuntimeOptions;
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
