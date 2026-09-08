import type { RuntimeEnvironmentVariables } from "../runtimeEnvironment/runtimeEnvironment.type.js";

/**
 * Runtime execution mode.
 */
export type RuntimeMode = "development" | "test" | "production";

/**
 * Runtime role.
 */
export type RuntimeRole =
  "application" | "api" | "worker" | "scheduler" | "cli";

/**
 * Options controlling runtime startup behavior.
 */
export interface RuntimeStartupOptions {
  readonly autoLoadModules?: boolean;
  readonly autoInitializeModules?: boolean;
  readonly autoStartModules?: boolean;
  /**
   * Continue bootstrapping when one or more modules fail to
   * initialize. The runtime still becomes READY but the bootstrap
   * result reports `success: false` with the failures listed.
   */
  readonly continueOnInitializeError?: boolean;
  /**
   * Continue bootstrapping when one or more modules fail to start.
   */
  readonly continueOnStartError?: boolean;
  /**
   * Bootstrap timeout in milliseconds. 0 disables the timeout.
   */
  readonly timeoutMs?: number;
}

/**
 * Options controlling runtime shutdown.
 */
export interface RuntimeShutdownOptions {
  readonly autoStopModules?: boolean;
  readonly autoDestroyModules?: boolean;
  readonly continueOnStopError?: boolean;
  readonly continueOnDestroyError?: boolean;
  /**
   * Shutdown timeout in milliseconds. 0 disables the timeout.
   */
  readonly timeoutMs?: number;
}

/**
 * Options related to runtime process signals.
 *
 * Handlers are registered when the runtime starts and removed when it
 * stops, fails, or is disposed. The runtime never calls
 * `process.exit()` unless `forceExitOnSecondSignal` is explicitly on.
 */
export interface RuntimeSignalOptions {
  /** Stop the runtime gracefully on SIGINT. */
  readonly handleSigint?: boolean;
  /** Stop the runtime gracefully on SIGTERM. */
  readonly handleSigterm?: boolean;
  /** Stop the runtime gracefully on SIGHUP. */
  readonly handleSighup?: boolean;
  /** Mark the runtime failed and stop it on uncaughtException. */
  readonly handleUncaughtException?: boolean;
  /** Mark the runtime failed and stop it on unhandledRejection. */
  readonly handleUnhandledRejection?: boolean;
  /**
   * When a second termination signal arrives while a graceful stop is
   * already in progress, exit the process immediately with
   * `forceExitCode`. Off by default: the second signal is logged and
   * ignored.
   */
  readonly forceExitOnSecondSignal?: boolean;
  /** Exit code used by `forceExitOnSecondSignal`. Defaults to 1. */
  readonly forceExitCode?: number;
}

/**
 * Options controlling runtime diagnostics.
 */
export interface RuntimeDiagnosticsOptions {
  /** Emit info-level logs for bootstrap start/completion. */
  readonly startupLogging?: boolean;
  /** Emit info-level logs for shutdown start/completion. */
  readonly shutdownLogging?: boolean;
  /** Include the pipeline phase in bootstrap/shutdown logs. */
  readonly includeState?: boolean;
  /** Include loaded module ids in bootstrap/shutdown logs. */
  readonly includeModules?: boolean;
}

/**
 * Overrides for runtime environment detection. Useful for tests and
 * for hosts that already know their environment.
 */
export interface RuntimeEnvironmentOverrides {
  readonly variables?: RuntimeEnvironmentVariables;
  readonly isCI?: boolean;
  readonly isContainer?: boolean;
}

/**
 * Complete runtime options.
 */
export interface RuntimeOptions {
  readonly name?: string;
  readonly mode?: RuntimeMode;
  readonly role?: RuntimeRole;
  readonly startup?: RuntimeStartupOptions;
  readonly shutdown?: RuntimeShutdownOptions;
  readonly signals?: RuntimeSignalOptions;
  readonly diagnostics?: RuntimeDiagnosticsOptions;
  readonly environment?: RuntimeEnvironmentOverrides;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Fully normalized runtime options.
 */
export interface ResolvedRuntimeOptions {
  readonly name: string;
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly startup: Required<RuntimeStartupOptions>;
  readonly shutdown: Required<RuntimeShutdownOptions>;
  readonly signals: Required<RuntimeSignalOptions>;
  readonly diagnostics: Required<RuntimeDiagnosticsOptions>;
  readonly environment: RuntimeEnvironmentOverrides;
  readonly metadata: Readonly<Record<string, unknown>>;
}
