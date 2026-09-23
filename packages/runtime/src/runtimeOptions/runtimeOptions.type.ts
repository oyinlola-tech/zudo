import type { Environment } from "@zudojs/constants";

import type { RuntimeId } from "../runtimeState/runtimeState.type.js";

/**
 * Runtime configuration options.
 */
export interface RuntimeOptions {
  /**
   * Runtime identifier.
   * Auto-generated if not provided.
   */
  readonly runtimeId?: RuntimeId;

  /**
   * Application environment.
   */
  readonly environment: Environment;

  /**
   * Application name.
   */
  readonly applicationName: string;

  /**
   * Application version.
   */
  readonly applicationVersion?: string;

  /**
   * Whether to handle process signals (SIGTERM, SIGINT).
   * @default true
   */
  readonly handleSignals?: boolean;

  /**
   * Whether to handle fatal errors (uncaughtException, unhandledRejection).
   * @default true
   */
  readonly handleFatalErrors?: boolean;

  /**
   * Whether a second SIGTERM/SIGINT during shutdown exits immediately
   * with code 1.
   * @default true
   */
  readonly forceExitOnSecondSignal?: boolean;

  /**
   * Whether an uncaught exception or unhandled rejection exits the
   * process with code 1 once shutdown finishes. Set to `false` to stop
   * the runtime but leave the process running.
   * @default true
   */
  readonly exitOnFatalError?: boolean;

  /**
   * How long a fatal-error shutdown may take before the process exits
   * anyway, in milliseconds.
   * @default 10000
   */
  readonly fatalExitTimeout?: number;

  /**
   * Graceful shutdown timeout in milliseconds.
   * @default 30000
   */
  readonly shutdownTimeout?: number;

  /**
   * Startup timeout in milliseconds.
   * @default 60000
   */
  readonly startupTimeout?: number;

  /**
   * Whether to enable runtime events.
   * @default true
   */
  readonly emitEvents?: boolean;

  /**
   * Whether to enable readiness tracking.
   * @default true
   */
  readonly trackReadiness?: boolean;

  /**
   * Whether health is derived from readiness checks.
   *
   * When `false`, `runtime.health` reports `unknown` and no
   * `runtime.health.changed` events are emitted; readiness checks still
   * run and `runtime.ready` is unaffected.
   *
   * @default true
   */
  readonly trackHealth?: boolean;

  /**
   * How long a single readiness check may run before it is recorded as
   * failed, in milliseconds. Set to `0` to remove the bound.
   *
   * @default 5000
   */
  readonly readinessCheckTimeout?: number;

  /**
   * Whether modules at the same dependency depth are initialized
   * concurrently.
   *
   * Modules within a depth group do not depend on one another, so this is
   * safe by construction — but it surfaces any ordering a module assumed
   * without declaring, so it is opt-in.
   *
   * @default false
   */
  readonly parallelInitialization?: boolean;

  /**
   * Whether `stop()` disposes the container passed in `dependencies`.
   *
   * The caller that created the container owns it, so by default the
   * runtime leaves it alone: dispose it yourself after `stop()`, or set
   * this to hand ownership to the runtime. It is disposed after every
   * module has shut down and been destroyed (or on `stop()` of a runtime
   * that never started). A disposal failure is recorded in
   * `status.shutdownFailures` under `"(container)"` rather than failing
   * the stop. `createTestRuntime` creates its own container and sets this.
   *
   * @default false
   */
  readonly disposeContainerOnStop?: boolean;

  /**
   * Additional runtime metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Resolved runtime options with defaults applied.
 */
export interface ResolvedRuntimeOptions {
  readonly runtimeId: RuntimeId;
  readonly environment: Environment;
  readonly applicationName: string;
  readonly applicationVersion: string;
  readonly handleSignals: boolean;
  readonly handleFatalErrors: boolean;
  readonly forceExitOnSecondSignal: boolean;
  readonly exitOnFatalError: boolean;
  readonly fatalExitTimeout: number;
  readonly shutdownTimeout: number;
  readonly startupTimeout: number;
  readonly emitEvents: boolean;
  readonly trackReadiness: boolean;
  readonly trackHealth: boolean;
  readonly readinessCheckTimeout: number;
  readonly parallelInitialization: boolean;
  readonly disposeContainerOnStop: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Default runtime options.
 */
export const DEFAULT_RUNTIME_OPTIONS = Object.freeze({
  handleSignals: true,
  handleFatalErrors: true,
  forceExitOnSecondSignal: true,
  exitOnFatalError: true,
  fatalExitTimeout: 10_000,
  shutdownTimeout: 30_000,
  startupTimeout: 60_000,
  emitEvents: true,
  trackReadiness: true,
  trackHealth: true,
  readinessCheckTimeout: 5_000,
  parallelInitialization: false,
  disposeContainerOnStop: false,
  applicationVersion: "0.1.0",
  // `metadata` is required on ResolvedRuntimeOptions, so it needs a
  // default; without one the resolved options claimed a value the
  // runtime never had.
  metadata: Object.freeze({}),
} as const);
