/**
 * @zudojs/lifecycle/manager
 *
 * Lifecycle manager — the heart of the lifecycle system.
 * Orchestrates component registration, startup, shutdown, rollback, and signals.
 */

import {
  LifecycleState,
  LIFECYCLE_DEFAULT_CONCURRENCY,
  LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT,
} from "@zudojs/constants";
import type {
  LifecycleComponent,
  LifecycleRegistrationOptions,
} from "../lifecycleComponent/lifecycleComponent.type.js";
import { LifecycleRegistry } from "../lifecycleRegistry/lifecycleRegistry.core.js";
import { LifecycleStateMachine } from "../lifecycleState/lifecycleState.machine.js";
import { LifecycleExecutor } from "../lifecycleExecutor/lifecycleExecutor.core.js";
import type { ExecutionResult } from "../lifecycleExecutor/lifecycleExecutor.type.js";
import { LifecycleEventEmitter } from "../lifecycleEvents/lifecycleEvents.core.js";
import { installSignalHandlers } from "../lifecycleSignal/lifecycleSignal.handler.js";
import { performStartup } from "./lifecycleManager.startup.js";
import { performShutdown } from "./lifecycleManager.shutdown.js";
import { assertTimeoutBudget } from "../lifecycleInternal/index.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";

/** Options for creating a lifecycle manager. */
export interface LifecycleManagerOptions {
  /** Maximum concurrent component operations. */
  readonly concurrency?: number;
  /**
   * Global shutdown timeout in ms. `Infinity` means no deadline; NaN
   * and negative values are rejected by the constructor.
   */
  readonly shutdownTimeout?: number;
  /**
   * Whether to install SIGINT/SIGTERM handlers. They are installed by
   * `start()` (not the constructor) and removed once shutdown finishes,
   * and a second signal during shutdown exits with code 1.
   */
  readonly handleSignals?: boolean;
  /** Signals to listen for. */
  readonly signals?: readonly NodeJS.Signals[];
}

/**
 * Orchestrates application and component lifecycle.
 *
 * @example
 * ```ts
 * const lifecycle = createLifecycleManager();
 * lifecycle.register(database, { id: "db" });
 * lifecycle.register(queue, { id: "queue", dependsOn: ["db"] });
 * await lifecycle.start();
 * // ... later
 * await lifecycle.shutdown();
 * ```
 */
export class LifecycleManager {
  private readonly _ctx: LifecycleManagerContext;
  private _startPromise?: Promise<void>;
  private _removeSignalHandlers?: () => void;
  private readonly _handleSignals: boolean;
  private readonly _signals: readonly NodeJS.Signals[] | undefined;

  constructor(options: LifecycleManagerOptions = {}) {
    if (options.shutdownTimeout !== undefined) {
      assertTimeoutBudget("shutdownTimeout", options.shutdownTimeout);
    }

    const events = new LifecycleEventEmitter();

    this._ctx = {
      registry: new LifecycleRegistry(),
      state: new LifecycleStateMachine("application"),
      executor: new LifecycleExecutor({
        // Retries used to be invisible: a backoff delay could only be
        // inferred from wall-clock timing.
        onRetry: (notice) => {
          events.emit("component:retrying", {
            component: {
              componentId: notice.id,
              attempt: notice.attempt,
              delay: notice.delay,
              error: notice.error,
            },
          });
        },
      }),
      events,
      concurrency: options.concurrency ?? LIFECYCLE_DEFAULT_CONCURRENCY,
      shutdownTimeout:
        options.shutdownTimeout ?? LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT,
      componentStates: new Map(),
      results: new Map(),
      attempted: new Map(),
      startTime: 0,
      shutdownTimedOut: false,
      controller: new AbortController(),
    };

    // Installing in the constructor disabled Ctrl-C for the whole
    // process as soon as a manager existed (tests, libraries), and the
    // listener outlived shutdown, so a process with a leaked handle
    // could no longer be interrupted.
    this._handleSignals = options.handleSignals !== false;
    this._signals = options.signals;
  }

  /** Registers a component with the lifecycle manager. */
  public register(
    component: LifecycleComponent,
    options: LifecycleRegistrationOptions = {},
  ): void {
    this._ctx.registry.register(component, options);

    const id = options.id ?? component.name;
    this._ctx.componentStates.set(id, new LifecycleStateMachine(id));
    this._ctx.results.set(id, []);

    this._ctx.events.emit("component:registered", {
      component: { componentId: id },
    });
  }

  /**
   * Starts the application lifecycle.
   * Idempotent — returns the same promise if called multiple times.
   */
  public async start(): Promise<void> {
    if (this._startPromise) {
      return this._startPromise;
    }
    if (this._handleSignals && this._removeSignalHandlers === undefined) {
      this._removeSignalHandlers = installSignalHandlers({
        signals: this._signals,
        handler: () => {
          void this.shutdown();
        },
      });
    }
    this._startPromise = performStartup(this._ctx).catch(async (error) => {
      // A failed startup rolls back through the shared shutdown.
      await this._ctx.shutdownPromise?.catch(() => undefined);
      this.releaseSignalHandlers();
      throw error;
    });
    return this._startPromise;
  }

  /**
   * Shuts down the application lifecycle.
   * Idempotent — returns the same promise if called multiple times.
   *
   * Always resolves, even when `shutdownTimeout` expires: a signal
   * handler awaiting it must not crash the process. Expiry is reported
   * through {@link shutdownTimedOut}, the `application:shutdown-timeout`
   * event, and a FAILED status (with a LifecycleTimeoutError result)
   * for every component whose hook was still running.
   */
  public async shutdown(): Promise<void> {
    // performShutdown is itself single-flight, so a shutdown started by
    // startup rollback and one started here are the SAME run.
    try {
      await performShutdown(this._ctx);
    } finally {
      this.releaseSignalHandlers();
    }
  }

  private releaseSignalHandlers(): void {
    this._removeSignalHandlers?.();
    this._removeSignalHandlers = undefined;
  }

  /** Returns the current application state. */
  public get state(): LifecycleState {
    return this._ctx.state.state;
  }

  /**
   * Whether the last (or current) shutdown ran out of `shutdownTimeout`
   * before every component was stopped and disposed.
   */
  public get shutdownTimedOut(): boolean {
    return this._ctx.shutdownTimedOut;
  }

  /** Returns the event emitter for lifecycle events. */
  public get events(): LifecycleEventEmitter {
    return this._ctx.events;
  }

  /** Returns the registry. */
  public get registry(): LifecycleRegistry {
    return this._ctx.registry;
  }

  /** Returns component status information. */
  public getStatus(): ReadonlyMap<
    string,
    { state: LifecycleState; results: readonly ExecutionResult[] }
  > {
    const status = new Map<
      string,
      { state: LifecycleState; results: readonly ExecutionResult[] }
    >();

    for (const [id, sm] of this._ctx.componentStates) {
      status.set(id, {
        state: sm.state,
        results: this._ctx.results.get(id) ?? [],
      });
    }

    return status;
  }

  /**
   * Disposes the lifecycle manager and cleans up resources.
   *
   * This removes signal handlers and listeners only; it does NOT run
   * component teardown — call `shutdown()` first for that.
   */
  public dispose(): void {
    this.releaseSignalHandlers();
    this._ctx.events.clear();
  }
}

/** Creates a new lifecycle manager. */
export function createLifecycleManager(
  options?: LifecycleManagerOptions,
): LifecycleManager {
  return new LifecycleManager(options);
}
