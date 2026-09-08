import type { ResolvedRuntimeOptions } from "./runtimeOptions.type.js";

/**
 * Default runtime configuration.
 */
export const DEFAULT_RUNTIME_OPTIONS: Readonly<
  Omit<ResolvedRuntimeOptions, "environment" | "metadata">
> = Object.freeze({
  name: "application",
  mode: "development",
  role: "application",

  startup: {
    autoLoadModules: true,
    autoInitializeModules: true,
    autoStartModules: true,
    continueOnInitializeError: false,
    continueOnStartError: false,
    timeoutMs: 0,
  },

  shutdown: {
    autoStopModules: true,
    autoDestroyModules: true,
    continueOnStopError: true,
    continueOnDestroyError: true,
    timeoutMs: 30_000,
  },

  signals: {
    handleSigint: true,
    handleSigterm: true,
    handleSighup: false,
    handleUncaughtException: true,
    handleUnhandledRejection: true,
    forceExitOnSecondSignal: false,
    forceExitCode: 1,
  },

  diagnostics: {
    startupLogging: true,
    shutdownLogging: true,
    includeState: true,
    includeModules: true,
  },
});
