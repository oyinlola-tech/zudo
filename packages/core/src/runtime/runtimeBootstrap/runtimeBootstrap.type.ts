import type { Logger } from "../../logging/core/logger.js";

import type { ModuleLoader } from "../../modules/moduleLoader/index.js";

import type { ModuleLifecycleManager } from "../../modules/moduleLifecycle/index.js";

import type { ModuleRegistry } from "../../modules/moduleRegistry/index.js";

import type { RuntimeIdentity } from "../runtimeContext/index.js";

import type { RuntimeEnvironment } from "../runtimeEnvironment/index.js";

/**
 * Dependencies required by RuntimeBootstrap.
 */
export interface RuntimeBootstrapDependencies {
  /** Identity attached to errors and log entries. */
  readonly identity: RuntimeIdentity;
  readonly environment: RuntimeEnvironment;
  readonly moduleLoader: ModuleLoader;
  readonly moduleRegistry: ModuleRegistry;
  readonly moduleLifecycle: ModuleLifecycleManager;
  readonly logger: Logger;
}

/**
 * Options for a bootstrap operation.
 */
export interface RuntimeBootstrapOptions {
  readonly loadModules?: boolean;
  readonly initializeModules?: boolean;
  readonly startModules?: boolean;
  readonly continueOnInitializeError?: boolean;
  readonly continueOnStartError?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Individual bootstrap phase.
 */
export type RuntimeBootstrapPhase =
  | "created"
  | "loading"
  | "loaded"
  | "initializing"
  | "initialized"
  | "starting"
  | "started"
  | "completed"
  | "failed";

/**
 * Represents an error produced by a bootstrap phase.
 *
 * Module-level failures carry the failing module id in `moduleName`;
 * pipeline-level failures (timeouts, loader errors) do not.
 */
export interface RuntimeBootstrapErrorInfo {
  readonly phase: RuntimeBootstrapPhase;
  readonly error: unknown;
  readonly moduleName?: string;
}

/**
 * Result of a bootstrap operation.
 *
 * `success` is true only when no error was recorded. A bootstrap that
 * continued past module failures (continueOn*Error) resolves with
 * `success: false` and the failures listed in `errors`.
 */
export interface RuntimeBootstrapResult {
  readonly success: boolean;
  readonly phase: RuntimeBootstrapPhase;
  readonly loadedModules: number;
  readonly initializedModules: number;
  readonly startedModules: number;
  readonly errors: readonly RuntimeBootstrapErrorInfo[];
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
}

/**
 * Runtime bootstrap contract.
 */
export interface RuntimeBootstrap {
  readonly running: boolean;
  readonly phase: RuntimeBootstrapPhase;
  bootstrap(options?: RuntimeBootstrapOptions): Promise<RuntimeBootstrapResult>;
  getLastResult(): RuntimeBootstrapResult | undefined;
  reset(): void;
}

/**
 * Internal resolved bootstrap configuration.
 */
export interface ResolvedBootstrapOptions {
  readonly loadModules: boolean;
  readonly initializeModules: boolean;
  readonly startModules: boolean;
  readonly continueOnInitializeError: boolean;
  readonly continueOnStartError: boolean;
  readonly timeoutMs: number;
}
