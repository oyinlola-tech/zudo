import type { RuntimeError } from "@zudojs/errors";

import type { Logger } from "@zudojs/logger";

import type { EventBus } from "@zudojs/events";

import type { Container } from "@zudojs/container";

import type { ConfigurationManager, Module, ModuleContext } from "@zudojs/core";

import type {
  RuntimeState,
  RuntimeStatus,
  RuntimeHealth,
  RuntimeHealthState,
} from "../runtimeState/index.js";

import {
  assertTransition,
  canStart,
  canStop,
  hasFailed,
  isRunning,
} from "../runtimeState/index.js";

import type {
  RuntimeOptions,
  ResolvedRuntimeOptions,
} from "../runtimeOptions/index.js";

import { createRuntimeOptions } from "../runtimeOptions/index.js";

import type { RuntimeContext } from "../runtimeContext/index.js";

import {
  createRuntimeContext,
  withRuntimeContextState,
} from "../runtimeContext/index.js";

import { LifecycleManager } from "../lifecycle/index.js";

import { executeStartup, rollbackStartup } from "../startup/index.js";

import { executeShutdown } from "../shutdown/index.js";

import type { LifecycleFailure } from "../lifecycle/lifecycle.type.js";

import { SignalHandler } from "../signalHandler/index.js";

import { ReadinessTracker } from "../readiness/index.js";

import type {
  ReadinessCheckFn,
  ReadinessTrackerState,
} from "../readiness/index.js";

import { computeRuntimeHealth } from "../health/index.js";

import {
  createRuntimeEventPayload,
  createFailureEventPayload,
  createHealthEventPayload,
  createReadinessEventPayload,
  publishRuntimeEvent,
} from "../runtimeEvents/index.js";

import { createEvent } from "@zudojs/events";

import { RuntimeStateError, toRuntimeError } from "../runtimeError/index.js";

/**
 * Zudojs runtime interface.
 *
 * The runtime is the orchestrator that manages the complete
 * application lifecycle from creation through shutdown.
 */
export interface Runtime {
  readonly state: RuntimeState;
  readonly status: RuntimeStatus;
  readonly context: RuntimeContext;
  readonly health: RuntimeHealth;
  readonly ready: boolean;

  start(): Promise<void>;
  stop(): Promise<void>;

  /**
   * Registers a readiness check.
   *
   * A registered check starts out failing until it is first evaluated by
   * `runReadinessChecks`, so registering one on a running runtime moves it
   * to `degraded` until the check passes.
   */
  registerReadinessCheck(name: string, check: ReadinessCheckFn): void;

  /**
   * Removes a readiness check. Returns whether one was registered.
   */
  removeReadinessCheck(name: string): boolean;

  /**
   * Re-evaluates every registered readiness check.
   */
  runReadinessChecks(): Promise<void>;

  /**
   * Current readiness state, including per-check results.
   */
  readonly readiness: ReadinessTrackerState;
}

/**
 * Dependencies required to create a runtime.
 */
export interface RuntimeDependencies {
  readonly modules: ReadonlyMap<string, Module>;
  readonly logger: Logger;
  readonly container: Container;
  readonly eventBus: EventBus;

  /**
   * Configuration manager exposed to modules through their context.
   * Defaults to an empty manager loaded at startup.
   */
  readonly configuration?: ConfigurationManager;

  /**
   * Application context exposed to modules as `context.application`.
   * Modules that read it without one supplied get a clear error.
   */
  readonly application?: ModuleContext["application"];
}

/**
 * Default runtime implementation.
 */
export class DefaultRuntime implements Runtime {
  private _state: RuntimeState = "created";
  private readonly _contextBase: RuntimeContext;
  private _startedAt?: Date;
  private _stoppedAt?: Date;
  private _failedAt?: Date;
  private _error?: RuntimeError;
  private _shutdownFailures: readonly LifecycleFailure[] = [];

  private readonly options: ResolvedRuntimeOptions;
  private readonly modules: ReadonlyMap<string, Module>;
  private readonly logger: Logger;
  private readonly lifecycle: LifecycleManager;
  private readonly signalHandler: SignalHandler;
  private readonly readinessTracker: ReadinessTracker;

  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  public constructor(
    dependencies: RuntimeDependencies,
    options: RuntimeOptions,
  ) {
    this.options = createRuntimeOptions(options as ResolvedRuntimeOptions);
    this.modules = dependencies.modules;
    this.logger = dependencies.logger;

    this._contextBase = createRuntimeContext({
      runtimeId: this.options.runtimeId,
      environment: this.options.environment,
      applicationName: this.options.applicationName,
      applicationVersion: this.options.applicationVersion,
      logger: dependencies.logger,
      container: dependencies.container,
      eventBus: dependencies.eventBus,
      metadata: this.options.metadata,
    });

    this.lifecycle = new LifecycleManager(
      this.modules,
      this.logger,
      {
        shutdownTimeout: this.options.shutdownTimeout,
        // Always false during startup: rollback depends on stopping at
        // the first failure rather than pressing on into modules whose
        // dependencies never came up.
        continueOnFailure: false,
        parallelInitialization: this.options.parallelInitialization,
        runtimeId: this.options.runtimeId,
        onModuleEvent: (type, payload) => {
          this.emitEvent(type, payload);
        },
      },
      {
        ...(dependencies.configuration !== undefined && {
          configuration: dependencies.configuration,
        }),
        ...(dependencies.application !== undefined && {
          application: dependencies.application,
        }),
      },
    );

    this.signalHandler = new SignalHandler(this.logger, {
      handleSignals: this.options.handleSignals,
      handleFatalErrors: this.options.handleFatalErrors,
    });

    this.readinessTracker = new ReadinessTracker({
      autoMarkReady: this.options.trackReadiness,
      checkTimeout: this.options.readinessCheckTimeout,
    });
  }

  /**
   * Current runtime state.
   */
  public get state(): RuntimeState {
    return this._state;
  }

  /**
   * Current runtime status.
   */
  public get status(): RuntimeStatus {
    return Object.freeze({
      state: this._state,
      ready: this.ready,
      running: isRunning(this._state),
      startedAt: this._startedAt,
      stoppedAt: this._stoppedAt,
      failedAt: this._failedAt,
      error: this._error,
      shutdownFailures: this._shutdownFailures,
    });
  }

  /**
   * Runtime context.
   */
  public get context(): RuntimeContext {
    return withRuntimeContextState(this._contextBase, {
      status: this.status,
      health: this.health,
      ready: this.ready,
      ...(this._startedAt !== undefined && { startedAt: this._startedAt }),
      ...(this._stoppedAt !== undefined && { stoppedAt: this._stoppedAt }),
      ...(this._failedAt !== undefined && { failedAt: this._failedAt }),
      ...(this._error !== undefined && { error: this._error }),
    });
  }

  /**
   * Current runtime health, derived from the lifecycle state and the
   * registered readiness checks.
   */
  public get health(): RuntimeHealth {
    if (!this.options.trackHealth) {
      return Object.freeze({
        state: "unknown" as const,
        checks: Object.freeze([]),
        timestamp: new Date(),
      });
    }

    return computeRuntimeHealth(this._state, this.readinessTracker.getState());
  }

  /**
   * Current readiness state, including per-check results.
   */
  public get readiness(): ReadinessTrackerState {
    return this.readinessTracker.getState();
  }

  /**
   * Registers a readiness check.
   */
  public registerReadinessCheck(name: string, check: ReadinessCheckFn): void {
    const previousHealth = this.health.state;

    this.readinessTracker.registerCheck(name, check);

    this.emitHealthChange(previousHealth);
  }

  /**
   * Removes a readiness check.
   */
  public removeReadinessCheck(name: string): boolean {
    const previousHealth = this.health.state;

    const removed = this.readinessTracker.removeCheck(name);

    if (removed) {
      this.emitHealthChange(previousHealth);
    }

    return removed;
  }

  /**
   * Re-evaluates every registered readiness check.
   */
  public async runReadinessChecks(): Promise<void> {
    const previousHealth = this.health.state;
    const previouslyReady = this.ready;

    await this.readinessTracker.runChecks();

    this.emitHealthChange(previousHealth);

    if (this.options.emitEvents && this.ready !== previouslyReady) {
      const state = this.readinessTracker.getState();

      this.emitEvent(
        "runtime.readiness.changed",
        createReadinessEventPayload(
          this.options.runtimeId,
          this._state,
          state.ready,
          state.reason,
        ),
      );
    }
  }

  /**
   * Whether the runtime is ready.
   */
  public get ready(): boolean {
    return this.readinessTracker.isReady();
  }

  /**
   * Starts the runtime.
   */
  public async start(): Promise<void> {
    if (this._state === "running") {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (!canStart(this._state)) {
      throw new RuntimeStateError(
        `Cannot start a runtime in state "${this._state}"; start is only valid from "created". ` +
          (hasFailed(this._state)
            ? "This runtime failed to start; call stop() to release it and create a new one."
            : "Create a new runtime instead of restarting this one."),
      );
    }

    this.startPromise = this.performStart();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  /**
   * Stops the runtime.
   */
  /**
   * Stops the runtime.
   *
   * A failed runtime is stoppable: startup rollback only reaches modules
   * that were started, so this is the operator's route to releasing
   * everything else. It is also idempotent — stopping an already-stopped
   * runtime is a no-op rather than an error.
   */
  public async stop(): Promise<void> {
    if (this._state === "stopped") {
      return;
    }

    if (this.stopPromise) {
      return this.stopPromise;
    }

    if (this._state === "created") {
      this._state = "stopped";
      this._stoppedAt = new Date();
      this.signalHandler.unregister();
      return;
    }

    if (!canStop(this._state)) {
      throw new RuntimeStateError(
        `Cannot stop a runtime in state "${this._state}"; stop is valid from "created", "running" and "failed".`,
      );
    }

    this.stopPromise = this.performStop();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = undefined;
    }
  }

  /**
   * Performs runtime startup.
   */
  private async performStart(): Promise<void> {
    this.transitionTo("initializing");
    this.readinessTracker.setState(
      "initializing",
      "Runtime is starting its modules.",
    );

    if (this.options.emitEvents) {
      this.emitEvent("runtime.initializing");
    }

    // Registered before startup rather than after: a SIGTERM arriving
    // while modules are still coming up must be handled, not ignored.
    this.signalHandler.register(() => this.handleShutdownSignal());

    try {
      await executeStartup(
        this.lifecycle,
        this.options.runtimeId,
        this._contextBase.eventBus,
        this.logger,
        this.options.emitEvents,
        this.options.startupTimeout,
      );

      this.transitionTo("running");
      this._startedAt = new Date();

      // Evaluate any checks registered before startup instead of
      // declaring readiness over the top of them. Force-marking ready
      // here reported a runtime as ready while a dependency check was
      // failing.
      await this.readinessTracker.runChecks();

      if (this.readinessTracker.hasChecks()) {
        if (!this.ready) {
          this.logger.warn(
            "Runtime started, but one or more readiness checks are failing.",
            { reason: this.readinessTracker.getState().reason },
          );
        }
      } else {
        this.readinessTracker.markReady("Runtime started successfully.");
      }

      if (this.options.emitEvents) {
        this.emitEvent("runtime.running");
        this.emitEvent(
          "runtime.readiness.changed",
          createReadinessEventPayload(
            this.options.runtimeId,
            "running",
            this.ready,
            this.readinessTracker.getState().reason,
          ),
        );
      }

      this.logger.info("Runtime is ready.", {
        runtimeId: this.options.runtimeId,
        environment: this.options.environment,
      });
    } catch (error) {
      const runtimeError = toRuntimeError(error, "startup");

      this._error = runtimeError;
      this._failedAt = new Date();

      this.logger.error("Runtime failed to start.", {
        errorMessage: runtimeError.message,
      });

      if (this.options.emitEvents) {
        this.emitEvent(
          "runtime.failed",
          createFailureEventPayload(
            this.options.runtimeId,
            "failed",
            runtimeError,
            "startup",
          ),
        );
      }

      try {
        const rollbackFailures = await rollbackStartup(
          this.lifecycle,
          this.logger,
        );

        if (rollbackFailures.length > 0) {
          this.logger.error("Rollback completed with failures.", {
            failedModules: rollbackFailures.map((failure) => failure.moduleId),
          });
        }
      } catch (rollbackError) {
        this.logger.error("Rollback failed.", {
          errorMessage:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        });
      }

      this.transitionTo("failed");

      throw runtimeError;
    }
  }

  /**
   * Performs runtime shutdown.
   */
  private async performStop(): Promise<void> {
    this.transitionTo("stopping");
    this.readinessTracker.setState(
      "shutting_down",
      "Runtime is shutting down.",
    );

    if (this.options.emitEvents) {
      this.emitEvent("runtime.stopping");
    }

    try {
      const result = await executeShutdown(
        this.lifecycle,
        this.options.runtimeId,
        this._contextBase.eventBus,
        this.logger,
        this.options.shutdownTimeout,
        this.options.emitEvents,
      );

      this._shutdownFailures = result.failures;

      this.transitionTo("stopped");
      this._stoppedAt = new Date();

      if (this.options.emitEvents) {
        this.emitEvent("runtime.stopped");
      }

      if (result.failures.length > 0) {
        // A teardown that dropped modules on the floor must not read as
        // a clean stop; `status.shutdownFailures` records what failed.
        this.logger.warn("Runtime stopped with module failures.", {
          runtimeId: this.options.runtimeId,
          failedModules: result.failures.map((failure) => failure.moduleId),
        });
      } else {
        this.logger.info("Runtime stopped.", {
          runtimeId: this.options.runtimeId,
        });
      }
    } catch (error) {
      const runtimeError = toRuntimeError(error, "shutdown");

      this._error = runtimeError;
      this._failedAt = new Date();

      this.logger.error("Runtime failed to stop.", {
        errorMessage: runtimeError.message,
      });

      if (this.options.emitEvents) {
        this.emitEvent(
          "runtime.failed",
          createFailureEventPayload(
            this.options.runtimeId,
            "failed",
            runtimeError,
            "stop",
          ),
        );
      }

      this.transitionTo("failed");

      throw runtimeError;
    } finally {
      // Released on both paths: leaving handlers attached after a failed
      // stop keeps the process listening for a signal it can no longer
      // act on.
      this.signalHandler.unregister();
    }
  }

  /**
   * Runs shutdown in response to a termination signal.
   */
  private async handleShutdownSignal(): Promise<void> {
    try {
      await this.stop();
    } catch (error) {
      this.logger.error("Shutdown failed.", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Transitions to a new state.
   */
  private transitionTo(newState: RuntimeState): void {
    const oldState = this._state;

    // Delegates to the exported assertion so the public state machine and
    // the runtime cannot disagree about what a legal transition is.
    assertTransition(oldState, newState);

    const previousHealth = this.health.state;

    this._state = newState;

    this.logger.debug(`Runtime state: ${oldState} -> ${newState}`);

    this.emitHealthChange(previousHealth);
  }

  /**
   * Emits `runtime.health.changed` when the derived health state has moved
   * away from `previousHealth`. Health is derived rather than stored, so
   * callers compare against a value captured before the change.
   */
  private emitHealthChange(previousHealth: RuntimeHealthState): void {
    if (!this.options.emitEvents || !this.options.trackHealth) {
      return;
    }

    const health = this.health;

    if (health.state === previousHealth) {
      return;
    }

    this.emitEvent(
      "runtime.health.changed",
      createHealthEventPayload(
        this.options.runtimeId,
        this._state,
        previousHealth,
        health.state,
        health.checks.map((check) => ({
          name: check.name,
          healthy: check.healthy,
        })),
      ),
    );
  }

  /**
   * Emits a runtime event.
   */
  private emitEvent(eventType: string, payload?: unknown): void {
    if (this.options.emitEvents && this._contextBase.eventBus) {
      const eventPayload =
        payload ??
        createRuntimeEventPayload(this.options.runtimeId, this._state);
      const event = createEvent({
        type: eventType,
        payload: eventPayload,
      });
      publishRuntimeEvent(this._contextBase.eventBus, this.logger, event);
    }
  }
}

/**
 * Creates a runtime instance.
 */
export function createRuntime(
  dependencies: RuntimeDependencies,
  options: RuntimeOptions,
): Runtime {
  return new DefaultRuntime(dependencies, options);
}
