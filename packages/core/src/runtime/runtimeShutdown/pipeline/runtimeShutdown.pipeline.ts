import type { ModuleLifecycleManager } from "../../../modules/moduleLifecycle/index.js";
import type { ModuleLifecycleResult } from "../../../modules/moduleLifecycle/index.js";
import type {
  RuntimeShutdownPhase,
  RuntimeShutdownErrorInfo,
  RuntimeShutdownResult,
  ResolvedShutdownOptions,
} from "../runtimeShutdown.type.js";
import { RuntimeStopError } from "../../runtimeError/runtimeError.lifecycle.js";
import { RuntimeErrorCode } from "../../runtimeError/runtimeError.type.js";

export type ShutdownLogFn = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>,
) => void;

/**
 * Module counts produced by the shutdown pipeline.
 */
export interface ShutdownCounters {
  stoppedModules: number;
  destroyedModules: number;
}

/**
 * Mutable pipeline state shared with the caller so that counts and
 * recorded errors survive a thrown failure.
 */
export interface ShutdownPipelineState {
  readonly counters: ShutdownCounters;
  readonly errors: RuntimeShutdownErrorInfo[];
}

export function createShutdownPipelineState(): ShutdownPipelineState {
  return {
    counters: { stoppedModules: 0, destroyedModules: 0 },
    errors: [],
  };
}

/**
 * Executes the stop → destroy pipeline.
 *
 * Mirrors the bootstrap pipeline contract: module-level failures are
 * recorded once per module; a phase whose continueOn*Error flag is
 * false throws (and the caller records that error once); aborted
 * runs stop publishing phase changes.
 */
/**
 * Services the shutdown pipeline drives.
 */
export interface ShutdownPipelineServices {
  readonly moduleLifecycle: ModuleLifecycleManager;
  /** Identity attached to every error the pipeline raises. */
  readonly runtimeId?: string;
  readonly runtimeName?: string;
}

export async function executeShutdownPipeline(
  options: ResolvedShutdownOptions,
  services: ShutdownPipelineServices,
  state: ShutdownPipelineState,
  signal: AbortSignal,
  setPhase: (phase: RuntimeShutdownPhase) => void,
  log: ShutdownLogFn,
): Promise<void> {
  const publish = (phase: RuntimeShutdownPhase): void => {
    if (!signal.aborted) setPhase(phase);
  };
  const { moduleLifecycle } = services;
  const identity = {
    runtimeId: services.runtimeId,
    runtimeName: services.runtimeName,
  };

  if (options.stopModules) {
    await runShutdownPhase(
      "stopping",
      "stopped",
      () => moduleLifecycle.stop(phaseOptions(options.continueOnStopError)),
      moduleLifecycle,
      options.continueOnStopError,
      (count) => {
        state.counters.stoppedModules = count;
      },
      RuntimeErrorCode.MODULE_STOP_FAILED,
      identity,
      state,
      publish,
      log,
    );
  }

  if (options.destroyModules) {
    await runShutdownPhase(
      "destroying",
      "destroyed",
      () =>
        moduleLifecycle.destroy(phaseOptions(options.continueOnDestroyError)),
      moduleLifecycle,
      options.continueOnDestroyError,
      (count) => {
        state.counters.destroyedModules = count;
      },
      RuntimeErrorCode.MODULE_DESTROY_FAILED,
      identity,
      state,
      publish,
      log,
    );
  }
}

/**
 * Per-phase options for the ModuleLifecycleManager: the runtime flag
 * relaxes the manager when on and leaves its own setting when off
 * (see the bootstrap pipeline for the rationale).
 */
function phaseOptions(
  continueOnError: boolean,
): { readonly continueOnError?: boolean } {
  return continueOnError ? { continueOnError: true } : {};
}

async function runShutdownPhase(
  phase: "stopping" | "destroying",
  donePhase: "stopped" | "destroyed",
  run: () => Promise<ModuleLifecycleResult>,
  moduleLifecycle: ModuleLifecycleManager,
  continueOnError: boolean,
  setCount: (count: number) => void,
  code: RuntimeErrorCode,
  identity: { readonly runtimeId?: string; readonly runtimeName?: string },
  state: ShutdownPipelineState,
  publish: (phase: RuntimeShutdownPhase) => void,
  log: ShutdownLogFn,
): Promise<void> {
  publish(phase);
  log("debug", `Runtime modules ${phase}.`);

  let result: ModuleLifecycleResult;

  try {
    result = await run();
  } catch (error) {
    if (!continueOnError) {
      throw new RuntimeStopError(`Runtime module ${phase} failed.`, {
        ...identity,
        code,
        phase,
        cause: error,
      });
    }

    state.errors.push({ phase, error });
    log("warn", `Runtime module ${phase} reported an error. Continuing.`, {
      error,
    });
    return;
  }

  setCount(result.completed.length);

  for (const moduleId of result.failed) {
    state.errors.push({
      phase,
      moduleName: moduleId,
      error:
        moduleLifecycle.getState(moduleId)?.error ??
        new Error(`Module "${moduleId}" failed during ${phase}.`),
    });
  }

  if (result.failed.length > 0) {
    if (!continueOnError) {
      throw new RuntimeStopError(
        `${result.failed.length} module(s) failed during ${phase}: ${result.failed.join(", ")}.`,
        {
          ...identity,
          code,
          phase,
          metadata: { modules: result.failed.join(",") },
        },
      );
    }

    log(
      "warn",
      `Runtime module ${phase} completed with failures. Continuing.`,
      {
        failed: [...result.failed],
      },
    );
  }

  publish(donePhase);
  log("debug", `Runtime modules ${donePhase}.`, {
    completed: result.completed.length,
    failed: result.failed.length,
    skipped: result.skipped.length,
  });
}

export function createShutdownResult(
  success: boolean,
  phase: RuntimeShutdownPhase,
  counters: ShutdownCounters,
  errors: readonly RuntimeShutdownErrorInfo[],
  startedAt: Date,
  completedAt: Date,
): RuntimeShutdownResult {
  return Object.freeze({
    success,
    phase,
    stoppedModules: counters.stoppedModules,
    destroyedModules: counters.destroyedModules,
    errors: Object.freeze([...errors]),
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  });
}
