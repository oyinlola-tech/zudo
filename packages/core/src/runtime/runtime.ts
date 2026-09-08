import type { ApplicationContext } from "../application/applicationContext.context.js";
import type { ConfigurationManager } from "../configuration/configurationManager.manager.js";
import type { Logger } from "../logging/core/logger.js";
import type { Module } from "../modules/module.js";
import type { ModuleLoader } from "../modules/moduleLoader/index.js";
import type { ModuleLifecycleManager } from "../modules/moduleLifecycle/index.js";
import type { ModuleRegistry } from "../modules/moduleRegistry/index.js";
import type { Disposable } from "../contracts/disposable.js";
import type { ContextStorage } from "../context/provider/contextStorage.storage.js";
import { getDefaultContextStorage } from "../context/provider/defaultContextStorage.storage.js";
import {
  RuntimeState,
  assertRuntimeTransition,
  createRuntimeStateSnapshot,
  isRuntimeTerminal,
} from "./runtimeState.state.js";
import type {
  RuntimeStateSnapshot,
  RuntimeTiming,
} from "./runtimeState.state.js";
import {
  createRuntimeExecutionContext,
  createRuntimeIdentity,
} from "./runtimeContext/index.js";
import type {
  RuntimeExecutionContext,
  RuntimeIdentity,
} from "./runtimeContext/index.js";
import { createRuntimeEnvironment } from "./runtimeEnvironment/index.js";
import type { RuntimeEnvironment } from "./runtimeEnvironment/index.js";
import { resolveRuntimeOptions } from "./runtimeOptions/index.js";
import type {
  RuntimeOptions,
  ResolvedRuntimeOptions,
} from "./runtimeOptions/index.js";
import { DefaultRuntimeBootstrap } from "./runtimeBootstrap/runtimeBootstrap.core.js";
import type {
  RuntimeBootstrap,
  RuntimeBootstrapResult,
} from "./runtimeBootstrap/runtimeBootstrap.type.js";
import { DefaultRuntimeShutdown } from "./runtimeShutdown/runtimeShutdown.core.js";
import type {
  RuntimeShutdown,
  RuntimeShutdownResult,
} from "./runtimeShutdown/runtimeShutdown.type.js";
import { RuntimeSignalManager } from "./runtimeSignals/runtimeSignals.js";
import type {
  RuntimeSignalTarget,
  RuntimeTerminationSignal,
} from "./runtimeSignals/runtimeSignals.js";
import { InvalidRuntimeStateError } from "./runtimeError/runtimeError.lifecycle.js";
import { RuntimeNotReadyError } from "./runtimeError/runtimeError.specialized.js";
import { RuntimeTimeoutError } from "./runtimeError/runtimeError.specialized.js";

/**
 * Runtime lifecycle state as a plain string union (the values of the
 * RuntimeState enum).
 */
export type RuntimeLifecycleState = `${RuntimeState}`;

/**
 * Dependencies required by the runtime.
 *
 * `bootstrap`, `shutdown`, `environment`, `signalTarget`, and
 * `contextStorage` are optional overrides; the runtime creates
 * defaults when omitted.
 */
export interface RuntimeDependencies {
  readonly application: ApplicationContext;
  readonly configuration: ConfigurationManager;
  readonly logger: Logger;
  readonly moduleRegistry: ModuleRegistry;
  readonly moduleLoader: ModuleLoader;
  readonly moduleLifecycle: ModuleLifecycleManager;
  readonly environment?: RuntimeEnvironment;
  readonly bootstrap?: RuntimeBootstrap;
  readonly shutdown?: RuntimeShutdown;
  readonly signalTarget?: RuntimeSignalTarget;
  /**
   * ContextStorage the runtime establishes its execution context
   * in around start() and stop(). Defaults to the process-wide
   * storage from getDefaultContextStorage(). Supply the same
   * storage to the ModuleLifecycleManager (and the container's
   * `currentScope`) when injecting a custom one.
   */
  readonly contextStorage?: ContextStorage;
}

/**
 * Runtime status snapshot.
 */
export interface RuntimeStatus {
  readonly state: RuntimeState;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
  readonly failedAt?: Date;
  readonly timing: RuntimeTiming;
  readonly error?: unknown;
  readonly bootstrap?: RuntimeBootstrapResult;
  readonly shutdown?: RuntimeShutdownResult;
}

/**
 * Runtime contract.
 *
 * A runtime is single-use: CREATED → BOOTSTRAPPING → READY → STOPPING
 * → STOPPED, with FAILED reachable from every non-terminal state. A
 * stopped or failed runtime cannot be started again; create a new one.
 */
export interface Runtime extends Disposable {
  readonly state: RuntimeState;
  /**
   * The runtime's immutable execution context. Active (via
   * `contextStorage`) during start(), stop(), and every module
   * lifecycle hook the runtime drives.
   */
  readonly context: RuntimeExecutionContext;
  /** Storage in which `context` is established. */
  readonly contextStorage: ContextStorage;
  /** Timestamps of the state transitions observed so far. */
  readonly timing: RuntimeTiming;
  readonly environment: RuntimeEnvironment;
  readonly identity: RuntimeIdentity;
  readonly options: ResolvedRuntimeOptions;
  readonly ready: boolean;
  readonly stopped: boolean;
  readonly failed: boolean;
  /** Whether process signal handlers are currently registered. */
  readonly signalHandlersRegistered: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Marks the runtime as failed from any non-terminal state. Does not
   * unwind modules by itself; call `stop()` afterwards to do so.
   */
  fail(error?: unknown): void;
  dispose(): Promise<void>;
  getStatus(): RuntimeStatus;
  getStateSnapshot(): RuntimeStateSnapshot;
  getUptime(): number;
  getApplicationContext(): ApplicationContext;
  getConfiguration(): ConfigurationManager;
  getLogger(): Logger;
  getModuleRegistry(): ModuleRegistry;
  getModuleLoader(): ModuleLoader;
  getModuleLifecycle(): ModuleLifecycleManager;
  getModule(moduleId: string): Module | undefined;
  requireModule(moduleId: string): Module;
}

/**
 * Default runtime implementation.
 *
 * Owns the runtime state machine and identity, and orchestrates the
 * bootstrap and shutdown services, the module subsystem, and process
 * signal handling.
 */
export class DefaultRuntime implements Runtime {
  private readonly _options: ResolvedRuntimeOptions;
  private readonly _identity: RuntimeIdentity;
  private readonly _context: RuntimeExecutionContext;
  private readonly _contextStorage: ContextStorage;
  private readonly _environment: RuntimeEnvironment;
  private readonly _bootstrap: RuntimeBootstrap;
  private readonly _shutdown: RuntimeShutdown;
  private readonly _signals: RuntimeSignalManager;
  private readonly _application: ApplicationContext;
  private readonly _configuration: ConfigurationManager;
  private readonly _logger: Logger;
  private readonly _moduleRegistry: ModuleRegistry;
  private readonly _moduleLoader: ModuleLoader;
  private readonly _moduleLifecycle: ModuleLifecycleManager;

  private _state: RuntimeState = RuntimeState.CREATED;
  private _timing: RuntimeTiming;
  private _error: unknown;
  private _startPromise: Promise<void> | undefined;
  private _stopPromise: Promise<void> | undefined;
  private _unwound = false;

  public constructor(
    dependencies: RuntimeDependencies,
    options: RuntimeOptions = {},
  ) {
    this._options = resolveRuntimeOptions(options);
    this._application = dependencies.application;
    this._configuration = dependencies.configuration;
    this._logger = dependencies.logger;
    this._moduleRegistry = dependencies.moduleRegistry;
    this._moduleLoader = dependencies.moduleLoader;
    this._moduleLifecycle = dependencies.moduleLifecycle;

    this._identity = createRuntimeIdentity({
      name: this._options.name,
      mode: this._options.mode,
      role: this._options.role,
    });
    this._timing = Object.freeze({ createdAt: this._identity.createdAt });

    this._contextStorage =
      dependencies.contextStorage ?? getDefaultContextStorage();

    this._environment =
      dependencies.environment ??
      createRuntimeEnvironment({
        mode: this._options.mode,
        role: this._options.role,
        variables: this._options.environment.variables,
        isCI: this._options.environment.isCI,
        isContainer: this._options.environment.isContainer,
      });

    this._context = createRuntimeExecutionContext(
      this._identity,
      this._options.metadata,
    );

    this._bootstrap =
      dependencies.bootstrap ??
      new DefaultRuntimeBootstrap(
        {
          identity: this._identity,
          environment: this._environment,
          moduleLoader: this._moduleLoader,
          moduleRegistry: this._moduleRegistry,
          moduleLifecycle: this._moduleLifecycle,
          logger: this._logger,
        },
        this._options,
      );

    this._shutdown =
      dependencies.shutdown ??
      new DefaultRuntimeShutdown(
        {
          identity: this._identity,
          environment: this._environment,
          moduleRegistry: this._moduleRegistry,
          moduleLifecycle: this._moduleLifecycle,
          logger: this._logger,
        },
        this._options,
      );

    this._signals = new RuntimeSignalManager({
      signals: this._options.signals,
      target: dependencies.signalTarget,
      logger: this._logger,
    });
  }

  public get state(): RuntimeState {
    return this._state;
  }
  public get context(): RuntimeExecutionContext {
    return this._context;
  }
  public get contextStorage(): ContextStorage {
    return this._contextStorage;
  }
  public get timing(): RuntimeTiming {
    return this._timing;
  }
  public get environment(): RuntimeEnvironment {
    return this._environment;
  }
  public get identity(): RuntimeIdentity {
    return this._identity;
  }
  public get options(): ResolvedRuntimeOptions {
    return this._options;
  }
  public get ready(): boolean {
    return this._state === RuntimeState.READY;
  }
  public get stopped(): boolean {
    return this._state === RuntimeState.STOPPED;
  }
  public get failed(): boolean {
    return this._state === RuntimeState.FAILED;
  }

  public get signalHandlersRegistered(): boolean {
    return this._signals.registered;
  }

  public async start(): Promise<void> {
    if (this._state === RuntimeState.READY) return;
    if (this._startPromise) return this._startPromise;

    if (this._state !== RuntimeState.CREATED) {
      throw new InvalidRuntimeStateError(
        this._state === RuntimeState.STOPPING
          ? "Cannot start the runtime while it is stopping."
          : this._state === RuntimeState.STOPPED
            ? "A stopped runtime cannot be started again."
            : "A failed runtime cannot be started again.",
        this.errorContext({ operation: "start", state: this._state }),
      );
    }

    this._startPromise = this.inContext(() => this.performStart());

    try {
      await this._startPromise;
    } finally {
      this._startPromise = undefined;
    }
  }

  public async stop(): Promise<void> {
    if (this._state === RuntimeState.STOPPED) return;
    if (this._stopPromise) return this._stopPromise;

    if (this._state === RuntimeState.BOOTSTRAPPING && this._startPromise) {
      // A stop requested mid-bootstrap waits for bootstrap to settle,
      // then unwinds whatever it produced.
      await this._startPromise.catch(() => undefined);
      return this.stop();
    }

    if (this._state === RuntimeState.CREATED) {
      this.transitionTo(RuntimeState.STOPPED, "Runtime stopped before start.");
      return;
    }

    this._stopPromise = this.inContext(() =>
      this._state === RuntimeState.FAILED ? this.unwind() : this.performStop(),
    );

    try {
      await this._stopPromise;
    } finally {
      this._stopPromise = undefined;
    }
  }

  public fail(error?: unknown): void {
    if (isRuntimeTerminal(this._state)) return;

    this._error = error;
    this.transitionTo(RuntimeState.FAILED, "Runtime marked as failed.");
    this._signals.unregister();
  }

  public async dispose(): Promise<void> {
    try {
      await this.stop();
    } finally {
      this._signals.unregister();
    }
  }

  private async performStart(): Promise<void> {
    this.transitionTo(RuntimeState.BOOTSTRAPPING, "Runtime startup initiated.");
    this._error = undefined;
    this._signals.register({
      onSignal: (signal) => this.handleSignal(signal),
      onUncaughtException: (error) =>
        this.handleFatal("uncaughtException", error),
      onUnhandledRejection: (reason) =>
        this.handleFatal("unhandledRejection", reason),
    });

    try {
      const result = await this._bootstrap.bootstrap();

      if (this._state !== RuntimeState.BOOTSTRAPPING) {
        // fail() was called while bootstrapping: unwind what started.
        await this.unwind();
        throw new InvalidRuntimeStateError(
          "Runtime was marked failed during bootstrap.",
          this.errorContext({ operation: "start", state: this._state }),
        );
      }

      if (!result.success) {
        this._logger.warn(
          "Runtime became ready with module errors (continueOn*Error).",
          this.logContext({ errors: result.errors.length }),
        );
      }

      this.transitionTo(RuntimeState.READY, "Runtime startup completed.");
    } catch (error) {
      this.fail(error);
      this._logger.error("Runtime failed to start.", error, this.logContext());

      // The module subsystem has already rolled back when the module
      // lifecycle manager threw; a timed-out bootstrap is still
      // running and must not be unwound concurrently.
      if (!(error instanceof RuntimeTimeoutError)) {
        await this.unwind();
      }

      throw error;
    }
  }

  private async performStop(): Promise<void> {
    this.transitionTo(RuntimeState.STOPPING, "Runtime shutdown initiated.");

    try {
      await this.runShutdown();

      // fail() may have been called while stopping; stay FAILED.
      if (this._state === RuntimeState.STOPPING) {
        this.transitionTo(RuntimeState.STOPPED, "Runtime shutdown completed.");
      } else {
        this.recordTiming({ stoppedAt: new Date() });
      }
    } catch (error) {
      this.fail(error);
      this._logger.error(
        "Runtime failed to stop cleanly.",
        error,
        this.logContext(),
      );
      throw error;
    } finally {
      this._signals.unregister();
    }
  }

  /**
   * Best-effort module unwinding used after a failure. Errors are
   * logged and swallowed; the runtime stays FAILED.
   */
  private async unwind(): Promise<void> {
    if (this._unwound) return;

    try {
      await this.runShutdown();
    } catch (error) {
      this._logger.error(
        "Runtime cleanup after failure reported errors.",
        error,
        this.logContext(),
      );
    } finally {
      this.recordTiming({ stoppedAt: this._timing.stoppedAt ?? new Date() });
    }
  }

  /**
   * Runs an operation inside the runtime's execution context so that
   * module hooks, container factories, and loggers reached from it
   * observe the context through `contextStorage`.
   */
  private inContext<T>(operation: () => Promise<T>): Promise<T> {
    return this._contextStorage.run(this._context, operation);
  }

  private async runShutdown(): Promise<void> {
    if (this._unwound) return;

    this._unwound = true;
    const result = await this._shutdown.shutdown();

    if (!result.success) {
      this._logger.warn(
        "Runtime shutdown completed with module errors (continueOn*Error).",
        this.logContext({ errors: result.errors.length }),
      );
    }
  }

  /*
   * Process-level callbacks run in whatever async context was active
   * when the listener was registered, so the handlers re-establish
   * the runtime context explicitly.
   */
  private handleSignal(signal: RuntimeTerminationSignal): Promise<void> {
    return this.inContext(async () => {
      this._logger.info(
        `Stopping runtime after ${signal}.`,
        this.logContext({ signal }),
      );

      try {
        await this.stop();
      } catch (error) {
        this._logger.error(
          `Runtime shutdown after ${signal} failed.`,
          error,
          this.logContext({ signal }),
        );
      }
    });
  }

  private handleFatal(
    event: "uncaughtException" | "unhandledRejection",
    error: unknown,
  ): Promise<void> {
    return this.inContext(async () => {
      this._logger.fatal(
        `Runtime received ${event}; marking runtime failed and stopping.`,
        error,
        this.logContext({ event }),
      );

      if (this._state === RuntimeState.BOOTSTRAPPING && this._startPromise) {
        await this._startPromise.catch(() => undefined);
      }

      this.fail(error);

      try {
        await this.stop();
      } catch (stopError) {
        this._logger.error(
          `Runtime shutdown after ${event} failed.`,
          stopError,
          this.logContext({ event }),
        );
      }
    });
  }

  private transitionTo(next: RuntimeState, reason?: string): void {
    const current = this._state;
    assertRuntimeTransition(current, next);
    this._state = next;
    this.recordTimingForState(next);

    try {
      this._logger.debug(
        `Runtime state changed from "${current}" to "${next}".`,
        this.logContext({ from: current, to: next, reason }),
      );
    } catch {
      /* Logging must never prevent a lifecycle transition. */
    }
  }

  private recordTimingForState(state: RuntimeState): void {
    const now = new Date();
    const t = this._timing;

    switch (state) {
      case RuntimeState.BOOTSTRAPPING:
        this.recordTiming({ startupStartedAt: t.startupStartedAt ?? now });
        break;
      case RuntimeState.READY:
        this.recordTiming({ readyAt: t.readyAt ?? now });
        break;
      case RuntimeState.STOPPING:
        this.recordTiming({ shutdownStartedAt: t.shutdownStartedAt ?? now });
        break;
      case RuntimeState.STOPPED:
        this.recordTiming({ stoppedAt: t.stoppedAt ?? now });
        break;
      case RuntimeState.FAILED:
        this.recordTiming({ failedAt: t.failedAt ?? now });
        break;
      default:
        break;
    }
  }

  private recordTiming(update: Partial<RuntimeTiming>): void {
    this._timing = Object.freeze({ ...this._timing, ...update });
  }

  private logContext(
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      runtimeId: this._identity.id,
      runtimeName: this._identity.name,
      ...extra,
    };
  }

  private errorContext<const T extends Record<string, unknown>>(
    extra: T,
  ): T & { readonly runtimeId: string; readonly runtimeName: string } {
    return {
      ...extra,
      runtimeId: this._identity.id,
      runtimeName: this._identity.name,
    };
  }

  public getStatus(): RuntimeStatus {
    return Object.freeze({
      state: this._state,
      startedAt: this._timing.readyAt,
      stoppedAt: this._timing.stoppedAt,
      failedAt: this._timing.failedAt,
      timing: this._timing,
      error: this._error,
      bootstrap: this._bootstrap.getLastResult(),
      shutdown: this._shutdown.getLastResult(),
    });
  }
  public getStateSnapshot(): RuntimeStateSnapshot {
    return createRuntimeStateSnapshot(this._state);
  }
  public getUptime(): number {
    return Date.now() - this._identity.createdAt.getTime();
  }
  public getApplicationContext(): ApplicationContext {
    return this._application;
  }
  public getConfiguration(): ConfigurationManager {
    return this._configuration;
  }
  public getLogger(): Logger {
    return this._logger;
  }
  public getModuleRegistry(): ModuleRegistry {
    return this._moduleRegistry;
  }
  public getModuleLoader(): ModuleLoader {
    return this._moduleLoader;
  }
  public getModuleLifecycle(): ModuleLifecycleManager {
    return this._moduleLifecycle;
  }
  public getModule(moduleId: string): Module | undefined {
    return this._moduleRegistry.get(moduleId)?.instance;
  }
  public requireModule(moduleId: string): Module {
    // Throws the module subsystem's ModuleNotFoundError when unknown.
    const module = this._moduleRegistry.require(moduleId).instance;

    if (!module) {
      throw new RuntimeNotReadyError(
        `Module "${moduleId}" is registered but not loaded.`,
        this.errorContext({
          moduleName: moduleId,
          metadata: { state: this._state },
        }),
      );
    }

    return module;
  }
}

/**
 * Creates a runtime.
 */
export function createRuntime(
  dependencies: RuntimeDependencies,
  options: RuntimeOptions = {},
): Runtime {
  return new DefaultRuntime(dependencies, options);
}
