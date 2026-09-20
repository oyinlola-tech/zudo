import type { ResolvedRuntimeOptions } from "./runtimeOptions.type.js";

import { DEFAULT_RUNTIME_OPTIONS } from "./runtimeOptions.type.js";

import { createRuntimeId } from "../runtimeContext/runtimeContext.factory.js";

import { RuntimeError } from "@zudojs/errors";

/**
 * Resolves runtime options with defaults applied.
 *
 * `runtimeId` is documented as "auto-generated if not provided", but until
 * this generated one nothing did: `DEFAULT_RUNTIME_OPTIONS` has no entry
 * for it, so an omitted id reached every event payload, log line and
 * `runtime.context.runtimeId` as `undefined`.
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
    runtimeId: createRuntimeId(),
    ...provided,
  }) as ResolvedRuntimeOptions;
}

/**
 * Validates runtime options.
 */
export function validateRuntimeOptions(options: ResolvedRuntimeOptions): void {
  if (!options.environment) {
    throw new RuntimeError("Runtime environment is required.", {
      metadata: { option: "environment" },
    });
  }

  if (!options.applicationName) {
    throw new RuntimeError("Application name is required.", {
      metadata: { option: "applicationName" },
    });
  }

  if (options.shutdownTimeout <= 0) {
    throw new RuntimeError("Shutdown timeout must be positive.", {
      metadata: { option: "shutdownTimeout", value: options.shutdownTimeout },
    });
  }

  if (options.startupTimeout <= 0) {
    throw new RuntimeError("Startup timeout must be positive.", {
      metadata: { option: "startupTimeout", value: options.startupTimeout },
    });
  }

  if (!Number.isFinite(options.fatalExitTimeout) || options.fatalExitTimeout < 0) {
    throw new RuntimeError(
      `Fatal exit timeout must be a finite, non-negative number, got ${options.fatalExitTimeout}.`,
      {
        metadata: {
          option: "fatalExitTimeout",
          value: options.fatalExitTimeout,
        },
      },
    );
  }

  if (options.readinessCheckTimeout < 0) {
    throw new RuntimeError(
      `Readiness check timeout must be zero or positive, got ${options.readinessCheckTimeout}. Use 0 to run checks without a bound.`,
      {
        metadata: {
          option: "readinessCheckTimeout",
          value: options.readinessCheckTimeout,
        },
      },
    );
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
