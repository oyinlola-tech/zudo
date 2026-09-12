/**
 * @zudojs/lifecycle/manager/startup
 *
 * Startup orchestration — initializes, starts, and readies components.
 */

import { LifecyclePhase, LifecycleState } from "@zudojs/constants";
import { LifecycleComponentError, LifecycleStartError } from "@zudojs/errors";
import { buildExecutionPlan } from "../lifecyclePlan/lifecyclePlan.core.js";
import { createLifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";
import {
  transitionComponent,
  transitionComponentBatch,
  emitComponentFailed,
  failComponent,
  markAttempted,
  recordResult,
} from "./lifecycleManager.context.js";
import type { ExecutionResult } from "../lifecycleExecutor/lifecycleExecutor.core.js";
import { performShutdown } from "./lifecycleManager.shutdown.js";
import type { LifecycleEventType } from "../lifecycleEvents/lifecycleEvents.core.js";

/** Phase name union for startup orchestration. */
type StartupPhase =
  | typeof LifecyclePhase.INITIALIZE
  | typeof LifecyclePhase.START
  | typeof LifecyclePhase.READY;

/** Maps startup phases to their target component state after success. */
const SUCCESS_STATE: Record<StartupPhase, LifecycleState> = {
  [LifecyclePhase.INITIALIZE]: LifecycleState.INITIALIZED,
  [LifecyclePhase.START]: LifecycleState.STARTED,
  [LifecyclePhase.READY]: LifecycleState.READY,
};

/** Maps startup phases to their component state during execution. */
const EXECUTING_STATE: Record<StartupPhase, LifecycleState> = {
  [LifecyclePhase.INITIALIZE]: LifecycleState.INITIALIZING,
  [LifecyclePhase.START]: LifecycleState.STARTING,
  [LifecyclePhase.READY]: LifecycleState.STARTED,
};

/**
 * Per-phase component events.
 *
 * Every one of these event types was declared by LifecycleEventType
 * from the first release, but startup only ever emitted the generic
 * "component:starting"/"component:started" pair — and the "starting"
 * event carried a comma-joined list of ids in the `componentId` field
 * instead of a real component id.
 */
const PHASE_EVENTS: Record<
  StartupPhase,
  { readonly begin: LifecycleEventType; readonly end: LifecycleEventType }
> = {
  [LifecyclePhase.INITIALIZE]: {
    begin: "component:initializing",
    end: "component:initialized",
  },
  [LifecyclePhase.START]: {
    begin: "component:starting",
    end: "component:started",
  },
  [LifecyclePhase.READY]: {
    begin: "component:starting",
    end: "component:ready",
  },
};

/** Application-level event emitted when a startup phase begins. */
const PHASE_APPLICATION_EVENT: Record<StartupPhase, LifecycleEventType> = {
  [LifecyclePhase.INITIALIZE]: "application:initializing",
  [LifecyclePhase.START]: "application:starting",
  [LifecyclePhase.READY]: "application:starting",
};

/**
 * Performs the full startup sequence: initialize → start → ready.
 *
 * When a CRITICAL component fails, the application is rolled back
 * (stop → dispose) and this function REJECTS with a LifecycleStartError.
 * It previously resolved normally after rolling everything back, so
 * `await manager.start()` reported success for an application that had
 * just been torn down.
 */
export async function performStartup(
  ctx: LifecycleManagerContext,
): Promise<void> {
  ctx.startTime = Date.now();
  ctx.state.transition(LifecycleState.INITIALIZING);

  try {
    ctx.registry.freeze();

    const failedInit = await executePhase(ctx, LifecyclePhase.INITIALIZE);
    if (failedInit) {
      throw new LifecycleStartError(failedInit.id, failedInit.error);
    }
    assertNotShuttingDown(ctx, LifecyclePhase.INITIALIZE);
    ctx.state.transition(LifecycleState.INITIALIZED);
    ctx.events.emit("application:initialized", {
      duration: Date.now() - ctx.startTime,
    });

    ctx.state.transition(LifecycleState.STARTING);
    const failedStart = await executePhase(ctx, LifecyclePhase.START);
    if (failedStart) {
      throw new LifecycleStartError(failedStart.id, failedStart.error);
    }
    assertNotShuttingDown(ctx, LifecyclePhase.START);
    ctx.state.transition(LifecycleState.STARTED);

    // A failing `ready` hook on a critical component used to be
    // ignored completely: no state change, no rollback, and start()
    // resolved with the application stuck in STARTED.
    const failedReady = await executePhase(ctx, LifecyclePhase.READY);
    if (failedReady) {
      throw new LifecycleStartError(failedReady.id, failedReady.error);
    }
    assertNotShuttingDown(ctx, LifecyclePhase.READY);

    ctx.state.transition(LifecycleState.READY);
    ctx.events.emit("application:ready", {
      duration: Date.now() - ctx.startTime,
    });
  } catch (error) {
    // Rollback happens on exactly one path, so a completed teardown is
    // never re-entered and its DISPOSED state is never overwritten
    // with FAILED.
    // When the failure IS a requested shutdown, the teardown already
    // owns the application state.
    if (
      ctx.shutdownPromise === undefined &&
      ctx.state.state !== LifecycleState.FAILED &&
      ctx.state.state !== LifecycleState.DISPOSED
    ) {
      ctx.state.forceState(LifecycleState.FAILED);
    }

    await performShutdown(ctx);

    throw error;
  }
}

/**
 * Throws when a shutdown has been requested while startup is running.
 *
 * Startup used to keep launching later stages after `shutdown()` had
 * already torn everything down: a component started that way was
 * never stopped, and the eventual failure was an opaque
 * LifecycleStateError from the DISPOSED → INITIALIZED transition.
 */
function assertNotShuttingDown(
  ctx: LifecycleManagerContext,
  phase: LifecyclePhase,
): void {
  if (ctx.shutdownPromise !== undefined) {
    throw new LifecycleStartError(
      "application",
      new LifecycleComponentError(
        "application",
        phase,
        new Error(
          "Startup was cancelled because shutdown was requested while the application was starting.",
        ),
      ),
    );
  }
}

/** Identifies the critical component that aborted a phase. */
interface PhaseFailure {
  readonly id: string;
  readonly error: unknown;
}

/**
 * Executes a single startup phase across all registered components.
 * Returns the failure of the first critical component, or undefined.
 *
 * Two bookkeeping rules apply to every stage:
 *
 * - A component that FAILED an earlier phase, or whose dependency has
 *   failed, does not enter this phase. It used to have `start()` and
 *   `ready()` invoked after its own `initialize()` had thrown, and its
 *   dependents were started as if the dependency were healthy —
 *   silently voiding the `dependsOn` contract. A skipped dependent is
 *   recorded as FAILED with a LifecycleComponentError naming the
 *   failed dependency, and its own `critical` flag decides whether
 *   startup aborts.
 *
 * - Every result of a stage is recorded, transitioned and announced
 *   before a critical failure aborts the phase. Returning on the first
 *   failed result dropped the results of siblings in the same stage,
 *   which were then left in INITIALIZING / STARTING forever (no
 *   transition leads out of those states except to their success or
 *   FAILED) even after rollback had disposed them.
 */
async function executePhase(
  ctx: LifecycleManagerContext,
  phase: StartupPhase,
): Promise<PhaseFailure | undefined> {
  const plan = buildExecutionPlan(ctx.registry.getAll(), phase);
  const context = createLifecycleContext(
    phase,
    ctx.startTime,
    ctx.controller.signal,
  );

  const events = PHASE_EVENTS[phase];

  ctx.events.emit(PHASE_APPLICATION_EVENT[phase], {});

  for (const stage of plan.stages) {
    const stageRegs = stage.components
      .map((id) => ctx.registry.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    if (stageRegs.length === 0) continue;

    assertNotShuttingDown(ctx, phase);

    const runnable: typeof stageRegs = [];
    let criticalFailure: PhaseFailure | undefined;

    for (const reg of stageRegs) {
      if (ctx.componentStates.get(reg.id)?.state === LifecycleState.FAILED) {
        // Already failed in an earlier phase; nothing more to run.
        continue;
      }

      const failedDependency = reg.dependsOn.find(
        (dep) =>
          ctx.componentStates.get(dep)?.state === LifecycleState.FAILED,
      );

      if (failedDependency === undefined) {
        runnable.push(reg);
        continue;
      }

      const skipped: ExecutionResult = {
        id: reg.id,
        phase,
        duration: 0,
        success: false,
        error: new LifecycleComponentError(
          reg.id,
          phase,
          new Error(
            `Component "${reg.id}" was not started because its dependency "${failedDependency}" failed.`,
          ),
        ),
      };

      recordResult(ctx, skipped);
      failComponent(ctx, reg.id);
      emitComponentFailed(ctx, skipped);

      if (reg.critical) {
        criticalFailure ??= { id: reg.id, error: skipped.error };
      }
    }

    if (criticalFailure) {
      ctx.state.forceState(LifecycleState.FAILED);
      return criticalFailure;
    }

    if (runnable.length === 0) continue;

    transitionComponentBatch(
      ctx,
      runnable.map((r) => r.id),
      EXECUTING_STATE[phase],
    );

    for (const reg of runnable) {
      markAttempted(ctx, reg.id, phase);
      ctx.events.emit(events.begin, {
        component: { componentId: reg.id },
      });
    }

    const pending = ctx.executor.executeStage(
      runnable,
      phase,
      context,
      ctx.concurrency,
    );
    ctx.inFlight = pending;

    let results: readonly ExecutionResult[];
    try {
      results = await pending;
    } finally {
      ctx.inFlight = undefined;
    }

    for (const result of results) {
      recordResult(ctx, result);

      if (!result.success) {
        transitionComponent(ctx, result.id, LifecycleState.FAILED);
        emitComponentFailed(ctx, result);
        if (ctx.registry.get(result.id)?.critical) {
          criticalFailure ??= { id: result.id, error: result.error };
        }
      } else {
        transitionComponent(ctx, result.id, SUCCESS_STATE[phase]);
        ctx.events.emit(events.end, {
          component: { componentId: result.id, duration: result.duration },
        });
      }
    }

    if (criticalFailure) {
      ctx.state.forceState(LifecycleState.FAILED);
      return criticalFailure;
    }
  }

  return undefined;
}
