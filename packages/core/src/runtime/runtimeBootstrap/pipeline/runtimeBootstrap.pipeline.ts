import type { ModuleLoader } from "../../../modules/moduleLoader/index.js";
import type { ModuleLifecycleManager } from "../../../modules/moduleLifecycle/index.js";
import type { ModuleLifecycleResult } from "../../../modules/moduleLifecycle/index.js";
import type {
  RuntimeBootstrapPhase,
  RuntimeBootstrapErrorInfo,
  RuntimeBootstrapResult,
  ResolvedBootstrapOptions,
} from "../runtimeBootstrap.type.js";
import {
  RuntimeLoadError,
  RuntimeInitializationError,
  RuntimeStartError,
} from "../../runtimeError/runtimeError.lifecycle.js";
import { RuntimeErrorCode } from "../../runtimeError/runtimeError.type.js";

export type BootstrapLogFn = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>,
) => void;

/**
 * Module counts produced by the bootstrap pipeline.
 */
export interface BootstrapCounters {
  loadedModules: number;
  initializedModules: number;
  startedModules: number;
}

/**
 * Services the bootstrap pipeline drives.
 */
export interface BootstrapPipelineServices {
  readonly moduleLoader: ModuleLoader;
  readonly moduleLifecycle: ModuleLifecycleManager;
  /** Identity attached to every error the pipeline raises. */
  readonly runtimeId?: string;
  readonly runtimeName?: string;
}

/**
 * Mutable pipeline state shared with the caller so that counts and
 * recorded errors survive a thrown failure.
 */
export interface BootstrapPipelineState {
  readonly counters: BootstrapCounters;
  readonly errors: RuntimeBootstrapErrorInfo[];
}

export function createBootstrapPipelineState(): BootstrapPipelineState {
  return {
    counters: { loadedModules: 0, initializedModules: 0, startedModules: 0 },
    errors: [],
  };
}

/**
 * Executes the load → initialize → start pipeline.
 *
 * - Module-level failures reported by the ModuleLifecycleManager are
 *   recorded once per module (with `moduleName`).
 * - When the phase's continueOn*Error flag is false the pipeline
 *   throws; the thrown error is NOT pushed to `errors` here — the
 *   caller records it exactly once.
 * - Once `signal` is aborted (timeout) the pipeline stops publishing
 *   phase changes so an abandoned run cannot mutate the owner.
 */
export async function executeBootstrapPipeline(
  options: ResolvedBootstrapOptions,
  services: BootstrapPipelineServices,
  state: BootstrapPipelineState,
  signal: AbortSignal,
  setPhase: (phase: RuntimeBootstrapPhase) => void,
  log: BootstrapLogFn,
): Promise<void> {
  const publish = (phase: RuntimeBootstrapPhase): void => {
    if (!signal.aborted) setPhase(phase);
  };

  const identity = {
    runtimeId: services.runtimeId,
    runtimeName: services.runtimeName,
  };

  if (options.loadModules) {
    await loadModules(services.moduleLoader, identity, state, publish, log);
  }

  if (options.initializeModules) {
    await runLifecyclePhase(
      "initializing",
      "initialized",
      () =>
        services.moduleLifecycle.initialize(
          phaseOptions(options.continueOnInitializeError),
        ),
      services.moduleLifecycle,
      options.continueOnInitializeError,
      (count) => {
        state.counters.initializedModules = count;
      },
      (message, opts) =>
        new RuntimeInitializationError(message, { ...identity, ...opts }),
      state,
      publish,
      log,
    );
  }

  if (options.startModules) {
    await runLifecyclePhase(
      "starting",
      "started",
      () =>
        services.moduleLifecycle.start(
          phaseOptions(options.continueOnStartError),
        ),
      services.moduleLifecycle,
      options.continueOnStartError,
      (count) => {
        state.counters.startedModules = count;
      },
      (message, opts) =>
        new RuntimeStartError(message, {
          ...identity,
          ...opts,
          code: RuntimeErrorCode.MODULE_START_FAILED,
        }),
      state,
      publish,
      log,
    );
  }
}

/**
 * Per-phase options handed to the ModuleLifecycleManager.
 *
 * The runtime's continueOn*Error flag can only relax the manager: when
 * it is on, the manager must keep going too (otherwise it would roll
 * every module back and throw, and the runtime would report READY
 * with nothing running). When it is off the manager keeps its own
 * setting; a permissive manager then returns the failures and the
 * runtime throws and unwinds.
 */
function phaseOptions(
  continueOnError: boolean,
): { readonly continueOnError?: boolean } {
  return continueOnError ? { continueOnError: true } : {};
}

async function loadModules(
  moduleLoader: ModuleLoader,
  identity: { readonly runtimeId?: string; readonly runtimeName?: string },
  state: BootstrapPipelineState,
  publish: (phase: RuntimeBootstrapPhase) => void,
  log: BootstrapLogFn,
): Promise<void> {
  publish("loading");
  log("debug", "Loading runtime modules.");

  try {
    const result = await moduleLoader.loadAll();
    state.counters.loadedModules =
      result.loaded.length + result.alreadyLoaded.length;
    publish("loaded");
    log("debug", "Runtime modules loaded.", {
      loaded: result.loaded.length,
      alreadyLoaded: result.alreadyLoaded.length,
      skipped: result.skipped.length,
    });
  } catch (error) {
    throw new RuntimeLoadError("Failed to load runtime modules.", {
      ...identity,
      phase: "loading",
      cause: error,
    });
  }
}

type PhaseErrorFactory = (
  message: string,
  options: {
    readonly phase: "initializing" | "starting";
    readonly cause?: unknown;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
) => Error;

async function runLifecyclePhase(
  phase: "initializing" | "starting",
  donePhase: "initialized" | "started",
  run: () => Promise<ModuleLifecycleResult>,
  moduleLifecycle: ModuleLifecycleManager,
  continueOnError: boolean,
  setCount: (count: number) => void,
  createError: PhaseErrorFactory,
  state: BootstrapPipelineState,
  publish: (phase: RuntimeBootstrapPhase) => void,
  log: BootstrapLogFn,
): Promise<void> {
  publish(phase);
  log("debug", `Runtime modules ${phase}.`);

  let result: ModuleLifecycleResult;

  try {
    result = await run();
  } catch (error) {
    if (!continueOnError) {
      throw createError(`Runtime module ${phase} failed.`, {
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
      throw createError(
        `${result.failed.length} module(s) failed during ${phase}: ${result.failed.join(", ")}.`,
        {
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

export function createBootstrapResult(
  success: boolean,
  phase: RuntimeBootstrapPhase,
  counters: BootstrapCounters,
  errors: readonly RuntimeBootstrapErrorInfo[],
  startedAt: Date,
  completedAt: Date,
): RuntimeBootstrapResult {
  return Object.freeze({
    success,
    phase,
    loadedModules: counters.loadedModules,
    initializedModules: counters.initializedModules,
    startedModules: counters.startedModules,
    errors: Object.freeze([...errors]),
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  });
}
