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
import type { ExecutionResult } from "../lifecycleExecutor/lifecycleExecutor.core.js";
import { LifecycleEventEmitter } from "../lifecycleEvents/lifecycleEvents.core.js";
import { installSignalHandlers } from "../lifecycleSignal/lifecycleSignal.handler.js";
import { performStartup } from "./lifecycleManager.startup.js";
import { performShutdown } from "./lifecycleManager.shutdown.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";

/** Options for creating a lifecycle manager. */
export interface LifecycleManagerOptions {
  /** Maximum concurrent component operations. */
  readonly concurrency?: number;
  /** Global shutdown timeout in ms. */
  readonly shutdownTimeout?: number;
  /** Whether to automatically install signal handlers. */
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

  constructor(options: LifecycleManagerOptions = {}) {
    this._ctx = {
      registry: new LifecycleRegistry(),
      state: new LifecycleStateMachine("application"),
      executor: new LifecycleExecutor(),
      events: new LifecycleEventEmitter(),
      concurrency: options.concurrency ?? LIFECYCLE_DEFAULT_CONCURRENCY,
      shutdownTimeout:
        options.shutdownTimeout ?? LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT,
      componentStates: new Map(),
      results: new Map(),
      attempted: new Map(),
      startTime: 0,
      controller: new AbortController(),
    };

    if (options.handleSignals !== false) {
      this._removeSignalHandlers = installSignalHandlers({
        signals: options.signals,
        handler: () => {
          void this.shutdown();
        },
      });
    }
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
    this._startPromise = performStartup(this._ctx);
    return this._startPromise;
  }

  /**
   * Shuts down the application lifecycle.
   * Idempotent — returns the same promise if called multiple times.
   */
  public async shutdown(): Promise<void> {
    // performShutdown is itself single-flight, so a shutdown started by
    // startup rollback and one started here are the SAME run.
    return performShutdown(this._ctx);
  }

  /** Returns the current application state. */
  public get state(): LifecycleState {
    return this._ctx.state.state;
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
    this._removeSignalHandlers?.();
    this._removeSignalHandlers = undefined;
    this._ctx.events.clear();
  }
}

/** Creates a new lifecycle manager. */
export function createLifecycleManager(
  options?: LifecycleManagerOptions,
): LifecycleManager {
  return new LifecycleManager(options);
}
