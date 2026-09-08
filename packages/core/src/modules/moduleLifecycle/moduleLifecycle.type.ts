import type { ModuleId, ModuleLifecycle } from "../module.js";

import type { ContextStorage } from "../../context/provider/contextStorage.storage.js";

/**
 * Lifecycle phases supported by the module system.
 */
export type ModuleLifecyclePhase =
  | "created"
  | "initializing"
  | "initialized"
  | "starting"
  | "started"
  | "stopping"
  | "stopped"
  | "destroying"
  | "destroyed"
  | "failed";

/**
 * Runtime lifecycle state for a module.
 */
export interface ModuleLifecycleState {
  readonly moduleId: ModuleId;

  readonly phase: ModuleLifecyclePhase;

  readonly error?: unknown;

  readonly initializedAt?: Date;

  readonly startedAt?: Date;

  readonly stoppedAt?: Date;

  readonly destroyedAt?: Date;
}

/**
 * Canonical lifecycle hook names of the public Module contract.
 *
 * The lifecycle engine invokes exactly these methods:
 *
 * initialize step → onInitialize
 * start step      → onReady
 * stop step       → onShutdown
 * destroy step    → onDestroy
 */
export type ModuleLifecycleHookName =
  "onInitialize" | "onReady" | "onShutdown" | "onDestroy";

/**
 * Lifecycle steps executed by the module lifecycle engine.
 *
 * Each step maps onto one ModuleLifecycleHookName; see
 * ModuleLifecycleHookName for the mapping.
 */
export type ModuleLifecycleStep = "initialize" | "start" | "stop" | "destroy";

/**
 * Lifecycle hooks supported by a module.
 *
 * @deprecated The module hook contract is ModuleLifecycle
 * (onInitialize/onReady/onShutdown/onDestroy). This alias exists
 * for source compatibility only; the legacy
 * initialize/start/stop/destroy method names are never invoked
 * by the lifecycle engine.
 */
export type ModuleLifecycleHooks = ModuleLifecycle;

/**
 * Options controlling module lifecycle behavior.
 */
export interface ModuleLifecycleOptions {
  /**
   * Whether initialization should continue when one module fails.
   *
   * Defaults to false.
   */
  readonly continueOnInitializeError?: boolean;

  /**
   * Whether startup should continue when one module fails.
   *
   * Defaults to false.
   */
  readonly continueOnStartError?: boolean;

  /**
   * Whether shutdown should continue when one module fails.
   *
   * Defaults to true.
   */
  readonly continueOnStopError?: boolean;

  /**
   * Whether destruction should continue when one module fails.
   *
   * Defaults to true.
   */
  readonly continueOnDestroyError?: boolean;

  /**
   * ContextStorage consulted before every hook invocation. When an
   * execution context is active in it (the runtime establishes its
   * RuntimeExecutionContext around bootstrap and shutdown), each
   * hook runs in a context derived from it with
   * `module`/`operation` set and `{ moduleId, phase }` merged into
   * the metadata. When no context is active the hook is invoked
   * directly.
   *
   * Defaults to getDefaultContextStorage(); pass the runtime's
   * storage when injecting a custom one.
   */
  readonly contextStorage?: ContextStorage;
}

import { ModuleOperationError } from "../moduleError/moduleError.lifecycle.js";

/**
 * Error thrown when a module lifecycle operation fails.
 *
 * Part of the core module error taxonomy: it is a ModuleError
 * carrying the phase-specific code (MODULE_INITIALIZATION_FAILED,
 * MODULE_START_FAILED, ...), so callers can catch it by type or by
 * code.
 */
export class ModuleLifecycleError extends ModuleOperationError {
  /**
   * Errors encountered while rolling back already-completed
   * modules after this failure. Best-effort: rollback itself
   * never masks the original failure.
   */
  public rollbackErrors?: readonly unknown[];

  public constructor(
    moduleId: ModuleId,
    phase: ModuleLifecyclePhase,
    cause: unknown,
  ) {
    super(moduleId, phase, cause);

    this.name = "ModuleLifecycleError";
  }
}

/**
 * Reason a module was skipped during a lifecycle phase.
 */
export interface ModuleLifecycleSkip {
  readonly moduleId: ModuleId;

  readonly reason: string;
}

/**
 * Result of a lifecycle operation.
 */
export interface ModuleLifecycleResult {
  readonly completed: readonly ModuleId[];

  readonly failed: readonly ModuleId[];

  /**
   * Modules that could not participate in the phase, with the
   * reason: their required dependencies failed or were skipped,
   * or their current phase does not permit the transition.
   */
  readonly skipped: readonly ModuleLifecycleSkip[];
}

/**
 * Internal lifecycle state map.
 */
export type LifecycleStateMap = Map<ModuleId, ModuleLifecycleState>;
