import type {
  RuntimeOptions,
  ResolvedRuntimeOptions,
} from "./runtimeOptions.type.js";

import { DEFAULT_RUNTIME_OPTIONS } from "./runtimeOptions.defaults.js";

import {
  validateRuntimeName,
  validateRuntimeTimeout,
  assertRuntimeMode,
  assertRuntimeRole,
} from "./runtimeOptions.validation.js";

/**
 * Resolves partial runtime options into a complete immutable runtime configuration.
 */
export function resolveRuntimeOptions(
  options: RuntimeOptions = {},
): ResolvedRuntimeOptions {
  const startup = options.startup ?? {};
  const shutdown = options.shutdown ?? {};
  const signals = options.signals ?? {};
  const diagnostics = options.diagnostics ?? {};

  validateRuntimeName(options.name);
  validateRuntimeTimeout(startup.timeoutMs, "startup");
  validateRuntimeTimeout(shutdown.timeoutMs, "shutdown");

  const resolved: ResolvedRuntimeOptions = {
    name: options.name ?? DEFAULT_RUNTIME_OPTIONS.name,
    mode: options.mode ?? DEFAULT_RUNTIME_OPTIONS.mode,
    role: options.role ?? DEFAULT_RUNTIME_OPTIONS.role,

    startup: {
      autoLoadModules:
        startup.autoLoadModules ??
        DEFAULT_RUNTIME_OPTIONS.startup.autoLoadModules,
      autoInitializeModules:
        startup.autoInitializeModules ??
        DEFAULT_RUNTIME_OPTIONS.startup.autoInitializeModules,
      autoStartModules:
        startup.autoStartModules ??
        DEFAULT_RUNTIME_OPTIONS.startup.autoStartModules,
      continueOnInitializeError:
        startup.continueOnInitializeError ??
        DEFAULT_RUNTIME_OPTIONS.startup.continueOnInitializeError,
      continueOnStartError:
        startup.continueOnStartError ??
        DEFAULT_RUNTIME_OPTIONS.startup.continueOnStartError,
      timeoutMs: startup.timeoutMs ?? DEFAULT_RUNTIME_OPTIONS.startup.timeoutMs,
    },

    shutdown: {
      autoStopModules:
        shutdown.autoStopModules ??
        DEFAULT_RUNTIME_OPTIONS.shutdown.autoStopModules,
      autoDestroyModules:
        shutdown.autoDestroyModules ??
        DEFAULT_RUNTIME_OPTIONS.shutdown.autoDestroyModules,
      continueOnStopError:
        shutdown.continueOnStopError ??
        DEFAULT_RUNTIME_OPTIONS.shutdown.continueOnStopError,
      continueOnDestroyError:
        shutdown.continueOnDestroyError ??
        DEFAULT_RUNTIME_OPTIONS.shutdown.continueOnDestroyError,
      timeoutMs:
        shutdown.timeoutMs ?? DEFAULT_RUNTIME_OPTIONS.shutdown.timeoutMs,
    },

    signals: {
      handleSigint:
        signals.handleSigint ?? DEFAULT_RUNTIME_OPTIONS.signals.handleSigint,
      handleSigterm:
        signals.handleSigterm ?? DEFAULT_RUNTIME_OPTIONS.signals.handleSigterm,
      handleSighup:
        signals.handleSighup ?? DEFAULT_RUNTIME_OPTIONS.signals.handleSighup,
      handleUncaughtException:
        signals.handleUncaughtException ??
        DEFAULT_RUNTIME_OPTIONS.signals.handleUncaughtException,
      handleUnhandledRejection:
        signals.handleUnhandledRejection ??
        DEFAULT_RUNTIME_OPTIONS.signals.handleUnhandledRejection,
      forceExitOnSecondSignal:
        signals.forceExitOnSecondSignal ??
        DEFAULT_RUNTIME_OPTIONS.signals.forceExitOnSecondSignal,
      forceExitCode:
        signals.forceExitCode ?? DEFAULT_RUNTIME_OPTIONS.signals.forceExitCode,
    },

    diagnostics: {
      startupLogging:
        diagnostics.startupLogging ??
        DEFAULT_RUNTIME_OPTIONS.diagnostics.startupLogging,
      shutdownLogging:
        diagnostics.shutdownLogging ??
        DEFAULT_RUNTIME_OPTIONS.diagnostics.shutdownLogging,
      includeState:
        diagnostics.includeState ??
        DEFAULT_RUNTIME_OPTIONS.diagnostics.includeState,
      includeModules:
        diagnostics.includeModules ??
        DEFAULT_RUNTIME_OPTIONS.diagnostics.includeModules,
    },

    environment: Object.freeze({
      ...options.environment,
    }),

    metadata: Object.freeze({
      ...options.metadata,
    }),
  };

  return Object.freeze(resolved);
}

/**
 * Validates runtime options.
 */
export function validateRuntimeOptions(options: RuntimeOptions): void {
  assertRuntimeMode(options.mode ?? DEFAULT_RUNTIME_OPTIONS.mode);
  assertRuntimeRole(options.role ?? DEFAULT_RUNTIME_OPTIONS.role);
  validateRuntimeName(options.name);
  validateRuntimeTimeout(options.startup?.timeoutMs, "startup");
  validateRuntimeTimeout(options.shutdown?.timeoutMs, "shutdown");
}
