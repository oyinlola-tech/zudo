import type { ResolvedRuntimeOptions } from "../runtimeOptions/index.js";
import type {
  RuntimeShutdownDependencies,
  RuntimeShutdownConfig,
  RuntimeShutdownPhase,
  RuntimeShutdownResult,
  RuntimeShutdown,
  ResolvedShutdownOptions,
} from "./runtimeShutdown.type.js";
import type { RuntimeIdentity } from "../runtimeContext/index.js";
import type { RuntimeEnvironment } from "../runtimeEnvironment/index.js";
import type { ModuleRegistry } from "../../modules/moduleRegistry/index.js";
import type { ModuleLifecycleManager } from "../../modules/moduleLifecycle/index.js";
import type { Logger } from "../../logging/core/logger.js";
import {
  executeShutdownPipeline,
  createShutdownPipelineState,
  createShutdownResult,
} from "./pipeline/index.js";
import { logRuntimeEvent } from "../runtimeLogger.js";
import { withRuntimeTimeout } from "../runtimeTimeout.js";
import { RuntimeError } from "../runtimeError/runtimeError.base.js";
import {
  InvalidRuntimeStateError,
  RuntimeStopError,
} from "../runtimeError/runtimeError.lifecycle.js";
import { RuntimeErrorCode } from "../runtimeError/runtimeError.type.js";

/**
 * Default shutdown service: stops and destroys modules according to
 * the runtime's shutdown options.
 */
export class DefaultRuntimeShutdown implements RuntimeShutdown {
  private readonly _identity: RuntimeIdentity;
  private readonly _environment: RuntimeEnvironment;
  private readonly _moduleRegistry: ModuleRegistry;
  private readonly _moduleLifecycle: ModuleLifecycleManager;
  private readonly _logger: Logger;
  private readonly _runtimeOptions: ResolvedRuntimeOptions;
  private _running = false;
  private _phase: RuntimeShutdownPhase = "created";
  private _lastResult: RuntimeShutdownResult | undefined;

  public constructor(
    dependencies: RuntimeShutdownDependencies,
    runtimeOptions: ResolvedRuntimeOptions,
  ) {
    this._identity = dependencies.identity;
    this._environment = dependencies.environment;
    this._moduleRegistry = dependencies.moduleRegistry;
    this._moduleLifecycle = dependencies.moduleLifecycle;
    this._logger = dependencies.logger;
    this._runtimeOptions = runtimeOptions;
  }

  public get running(): boolean {
    return this._running;
  }

  public get phase(): RuntimeShutdownPhase {
    return this._phase;
  }

  public async shutdown(
    options: RuntimeShutdownConfig = {},
  ): Promise<RuntimeShutdownResult> {
    if (this._running) {
      throw new InvalidRuntimeStateError(
        "Runtime shutdown is already running.",
        this.errorContext({ state: this._phase }),
      );
    }

    if (this._phase === "completed") {
      throw new InvalidRuntimeStateError(
        "Runtime has already been shut down.",
        this.errorContext({ state: this._phase }),
      );
    }

    this._running = true;
    this._phase = "created";

    const startedAt = new Date();
    const configuration = this.resolveOptions(options);
    const state = createShutdownPipelineState();
    const diagnostics = this._runtimeOptions.diagnostics;

    try {
      if (diagnostics.shutdownLogging) {
        this.log("info", "Runtime shutdown started.", {
          ...(diagnostics.includeState && { phase: this._phase }),
          ...(diagnostics.includeModules && {
            modules: this._moduleRegistry
              .getLoadedModules()
              .map((module) => module.id),
          }),
        });
      }

      await withRuntimeTimeout(
        (signal) =>
          executeShutdownPipeline(
            configuration,
            {
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
          message: `Runtime shutdown exceeded the configured timeout of ${configuration.timeoutMs}ms.`,
          error: this.errorContext({
            code: RuntimeErrorCode.SHUTDOWN_TIMEOUT,
            operation: "stop",
            phase: "stopping",
          }),
          onLateRejection: (error) => {
            this.log("warn", "Abandoned runtime shutdown failed late.", {
              error,
            });
          },
        },
      );

      this._phase = "completed";

      const result = createShutdownResult(
        state.errors.length === 0,
        "completed",
        state.counters,
        state.errors,
        startedAt,
        new Date(),
      );
      this._lastResult = result;

      if (diagnostics.shutdownLogging) {
        this.log(
          result.success ? "info" : "warn",
          result.success
            ? "Runtime shutdown completed."
            : "Runtime shutdown completed with errors.",
          {
            durationMs: result.durationMs,
            stoppedModules: result.stoppedModules,
            destroyedModules: result.destroyedModules,
            errors: result.errors.length,
            ...(diagnostics.includeState && { phase: result.phase }),
          },
        );
      }

      return result;
    } catch (error) {
      const failedPhase = this._phase;
      this._phase = "failed";

      const shutdownError =
        error instanceof RuntimeError
          ? error
          : new RuntimeStopError(
              "Runtime shutdown failed.",
              this.errorContext({ phase: "stopping", cause: error }),
            );

      state.errors.push({ phase: failedPhase, error: shutdownError });

      const result = createShutdownResult(
        false,
        "failed",
        state.counters,
        state.errors,
        startedAt,
        new Date(),
      );
      this._lastResult = result;

      this.log("error", "Runtime shutdown failed.", {
        error: shutdownError,
        failedPhase,
        durationMs: result.durationMs,
      });

      throw shutdownError;
    } finally {
      this._running = false;
    }
  }

  public getLastResult(): RuntimeShutdownResult | undefined {
    return this._lastResult;
  }

  public reset(): void {
    if (this._running) {
      throw new InvalidRuntimeStateError(
        "Cannot reset runtime shutdown while it is running.",
        this.errorContext({ state: this._phase }),
      );
    }

    this._phase = "created";
    this._lastResult = undefined;
  }

  private resolveOptions(
    options: RuntimeShutdownConfig,
  ): ResolvedShutdownOptions {
    const shutdown = this._runtimeOptions.shutdown;

    return {
      stopModules: options.stopModules ?? shutdown.autoStopModules,
      destroyModules: options.destroyModules ?? shutdown.autoDestroyModules,
      continueOnStopError:
        options.continueOnStopError ?? shutdown.continueOnStopError,
      continueOnDestroyError:
        options.continueOnDestroyError ?? shutdown.continueOnDestroyError,
      timeoutMs: options.timeoutMs ?? shutdown.timeoutMs,
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
