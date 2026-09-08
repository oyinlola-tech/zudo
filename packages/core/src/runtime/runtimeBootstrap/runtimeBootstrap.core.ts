import type { ResolvedRuntimeOptions } from "../runtimeOptions/index.js";
import type {
  RuntimeBootstrapDependencies,
  RuntimeBootstrapOptions,
  RuntimeBootstrapPhase,
  RuntimeBootstrapResult,
  RuntimeBootstrap,
  ResolvedBootstrapOptions,
} from "./runtimeBootstrap.type.js";
import type { RuntimeIdentity } from "../runtimeContext/index.js";
import type { RuntimeEnvironment } from "../runtimeEnvironment/index.js";
import type { ModuleLoader } from "../../modules/moduleLoader/index.js";
import type { ModuleRegistry } from "../../modules/moduleRegistry/index.js";
import type { ModuleLifecycleManager } from "../../modules/moduleLifecycle/index.js";
import type { Logger } from "../../logging/core/logger.js";
import {
  executeBootstrapPipeline,
  createBootstrapPipelineState,
  createBootstrapResult,
} from "./pipeline/index.js";
import { logRuntimeEvent } from "../runtimeLogger.js";
import { withRuntimeTimeout } from "../runtimeTimeout.js";
import { RuntimeError } from "../runtimeError/runtimeError.base.js";
import {
  InvalidRuntimeStateError,
  RuntimeStartError,
} from "../runtimeError/runtimeError.lifecycle.js";
import { RuntimeErrorCode } from "../runtimeError/runtimeError.type.js";

/**
 * Default bootstrap service: loads, initializes, and starts modules
 * according to the runtime's startup options.
 */
export class DefaultRuntimeBootstrap implements RuntimeBootstrap {
  private readonly _identity: RuntimeIdentity;
  private readonly _environment: RuntimeEnvironment;
  private readonly _moduleLoader: ModuleLoader;
  private readonly _moduleRegistry: ModuleRegistry;
  private readonly _moduleLifecycle: ModuleLifecycleManager;
  private readonly _logger: Logger;
  private readonly _runtimeOptions: ResolvedRuntimeOptions;
  private _running = false;
  private _phase: RuntimeBootstrapPhase = "created";
  private _lastResult: RuntimeBootstrapResult | undefined;

  public constructor(
    dependencies: RuntimeBootstrapDependencies,
    runtimeOptions: ResolvedRuntimeOptions,
  ) {
    this._identity = dependencies.identity;
    this._environment = dependencies.environment;
    this._moduleLoader = dependencies.moduleLoader;
    this._moduleRegistry = dependencies.moduleRegistry;
    this._moduleLifecycle = dependencies.moduleLifecycle;
    this._logger = dependencies.logger;
    this._runtimeOptions = runtimeOptions;
  }

  public get running(): boolean {
    return this._running;
  }

  public get phase(): RuntimeBootstrapPhase {
    return this._phase;
  }

  public async bootstrap(
    options: RuntimeBootstrapOptions = {},
  ): Promise<RuntimeBootstrapResult> {
    if (this._running) {
      throw new InvalidRuntimeStateError(
        "Runtime bootstrap is already running.",
        this.errorContext({ state: this._phase }),
      );
    }

    if (this._phase === "completed") {
      throw new InvalidRuntimeStateError(
        "Runtime has already been bootstrapped.",
        this.errorContext({ state: this._phase }),
      );
    }

    this._running = true;
    this._phase = "created";

    const startedAt = new Date();
    const configuration = this.resolveOptions(options);
    const state = createBootstrapPipelineState();
    const diagnostics = this._runtimeOptions.diagnostics;

    try {
      if (diagnostics.startupLogging) {
        this.log("info", "Runtime bootstrap started.", {
          ...(diagnostics.includeState && { phase: this._phase }),
        });
      }

      await withRuntimeTimeout(
        (signal) =>
          executeBootstrapPipeline(
            configuration,
            {
              moduleLoader: this._moduleLoader,
              moduleLifecycle: this._moduleLifecycle,
              runtimeId: this._identity.id,
              runtimeName: this._identity.name,
            },
            state,
            signal,
            (phase) => {
              this._phase = phase;
            },
            this.log.bind(this),
          ),
        configuration.timeoutMs,
        {
          message: `Runtime bootstrap exceeded the configured timeout of ${configuration.timeoutMs}ms.`,
          error: this.errorContext({
            code: RuntimeErrorCode.BOOTSTRAP_TIMEOUT,
            operation: "start",
            phase: "bootstrapping",
          }),
          onLateRejection: (error) => {
            this.log("warn", "Abandoned runtime bootstrap failed late.", {
              error,
            });
          },
        },
      );

      this._phase = "completed";

      const result = createBootstrapResult(
        state.errors.length === 0,
        "completed",
        state.counters,
        state.errors,
        startedAt,
        new Date(),
      );
      this._lastResult = result;

      if (diagnostics.startupLogging) {
        this.log(
          result.success ? "info" : "warn",
          result.success
            ? "Runtime bootstrap completed."
            : "Runtime bootstrap completed with errors.",
          {
            durationMs: result.durationMs,
            loadedModules: result.loadedModules,
            initializedModules: result.initializedModules,
            startedModules: result.startedModules,
            errors: result.errors.length,
            ...(diagnostics.includeState && { phase: result.phase }),
            ...(diagnostics.includeModules && {
              modules: this._moduleRegistry
                .getLoadedModules()
                .map((module) => module.id),
            }),
          },
        );
      }

      return result;
    } catch (error) {
      const failedPhase = this._phase;
      this._phase = "failed";

      const bootstrapError =
        error instanceof RuntimeError
          ? error
          : new RuntimeStartError(
              "Runtime bootstrap failed.",
              this.errorContext({ phase: "bootstrapping", cause: error }),
            );

      state.errors.push({ phase: failedPhase, error: bootstrapError });

      const result = createBootstrapResult(
        false,
        "failed",
        state.counters,
        state.errors,
        startedAt,
        new Date(),
      );
      this._lastResult = result;

      this.log("error", "Runtime bootstrap failed.", {
        error: bootstrapError,
        failedPhase,
        durationMs: result.durationMs,
      });

      throw bootstrapError;
    } finally {
      this._running = false;
    }
  }

  public getLastResult(): RuntimeBootstrapResult | undefined {
    return this._lastResult;
  }

  public reset(): void {
    if (this._running) {
      throw new InvalidRuntimeStateError(
        "Cannot reset runtime bootstrap while it is running.",
        this.errorContext({ state: this._phase }),
      );
    }

    this._phase = "created";
    this._lastResult = undefined;
  }

  private resolveOptions(
    options: RuntimeBootstrapOptions,
  ): ResolvedBootstrapOptions {
    const startup = this._runtimeOptions.startup;

    return {
      loadModules: options.loadModules ?? startup.autoLoadModules,
      initializeModules:
        options.initializeModules ?? startup.autoInitializeModules,
      startModules: options.startModules ?? startup.autoStartModules,
      continueOnInitializeError:
        options.continueOnInitializeError ?? startup.continueOnInitializeError,
      continueOnStartError:
        options.continueOnStartError ?? startup.continueOnStartError,
      timeoutMs: options.timeoutMs ?? startup.timeoutMs,
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

  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    logRuntimeEvent(
      this._logger,
      this._identity,
      this._environment,
      level,
      message,
      metadata,
    );
  }
}
