import type { Logger } from "../../logging/core/logger.js";

import type { ModuleLifecycleManager } from "../../modules/moduleLifecycle/index.js";

import type { ModuleRegistry } from "../../modules/moduleRegistry/index.js";

import type { RuntimeIdentity } from "../runtimeContext/index.js";

import type { RuntimeEnvironment } from "../runtimeEnvironment/index.js";

/**
 * Dependencies required by RuntimeShutdown.
 */
export interface RuntimeShutdownDependencies {
  /** Identity attached to errors and log entries. */
  readonly identity: RuntimeIdentity;
  readonly environment: RuntimeEnvironment;
  readonly moduleRegistry: ModuleRegistry;
  readonly moduleLifecycle: ModuleLifecycleManager;
  readonly logger: Logger;
}

/**
 * Options for a shutdown operation.
 */
export interface RuntimeShutdownConfig {
  readonly stopModules?: boolean;
  readonly destroyModules?: boolean;
  readonly continueOnStopError?: boolean;
  readonly continueOnDestroyError?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Individual shutdown phase.
 */
export type RuntimeShutdownPhase =
  | "created"
  | "stopping"
  | "stopped"
  | "destroying"
  | "destroyed"
  | "completed"
  | "failed";

/**
 * Error captured during shutdown.
 *
 * Module-level failures carry the failing module id in `moduleName`.
 */
export interface RuntimeShutdownErrorInfo {
  readonly phase: RuntimeShutdownPhase;
  readonly error: unknown;
  readonly moduleName?: string;
}

/**
 * Result of a shutdown operation.
 *
 * `success` is true only when no error was recorded. A shutdown that
 * continued past module failures (continueOn*Error) resolves with
 * `success: false` and the failures listed in `errors`.
 */
export interface RuntimeShutdownResult {
  readonly success: boolean;
  readonly phase: RuntimeShutdownPhase;
  readonly stoppedModules: number;
  readonly destroyedModules: number;
  readonly errors: readonly RuntimeShutdownErrorInfo[];
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
}

/**
 * Runtime shutdown contract.
 */
export interface RuntimeShutdown {
  readonly running: boolean;
  readonly phase: RuntimeShutdownPhase;
  shutdown(options?: RuntimeShutdownConfig): Promise<RuntimeShutdownResult>;
  getLastResult(): RuntimeShutdownResult | undefined;
  reset(): void;
}

/**
 * Internal resolved shutdown configuration.
 */
export interface ResolvedShutdownOptions {
  readonly stopModules: boolean;
  readonly destroyModules: boolean;
  readonly continueOnStopError: boolean;
  readonly continueOnDestroyError: boolean;
  readonly timeoutMs: number;
}
