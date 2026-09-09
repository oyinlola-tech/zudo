/**
 * @zudojs/lifecycle/manager/startup
 *
 * Startup orchestration — initializes, starts, and readies components.
 */

import { LifecyclePhase, LifecycleState } from "@zudojs/constants";
import { LifecycleStartError } from "@zudojs/errors";
import { buildExecutionPlan } from "../lifecyclePlan/lifecyclePlan.core.js";
import { createLifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";
import {
  transitionComponent,
  transitionComponentBatch,
  emitComponentFailed,
  recordResult,
} from "./lifecycleManager.context.js";
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
    ctx.state.transition(LifecycleState.INITIALIZED);
    ctx.events.emit("application:initialized", {
      duration: Date.now() - ctx.startTime,
    });

    ctx.state.transition(LifecycleState.STARTING);
    const failedStart = await executePhase(ctx, LifecyclePhase.START);
    if (failedStart) {
      throw new LifecycleStartError(failedStart.id, failedStart.error);
    }
    ctx.state.transition(LifecycleState.STARTED);

    // A failing `ready` hook on a critical component used to be
    // ignored completely: no state change, no rollback, and start()
    // resolved with the application stuck in STARTED.
    const failedReady = await executePhase(ctx, LifecyclePhase.READY);
    if (failedReady) {
      throw new LifecycleStartError(failedReady.id, failedReady.error);
    }

    ctx.state.transition(LifecycleState.READY);
    ctx.events.emit("application:ready", {
      duration: Date.now() - ctx.startTime,
    });
  } catch (error) {
    // Rollback happens on exactly one path, so a completed teardown is
    // never re-entered and its DISPOSED state is never overwritten
    // with FAILED.
    if (
      ctx.state.state !== LifecycleState.FAILED &&
      ctx.state.state !== LifecycleState.DISPOSED
    ) {
      ctx.state.forceState(LifecycleState.FAILED);
    }

    await performShutdown(ctx);

    throw error;
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

    transitionComponentBatch(
      ctx,
      stageRegs.map((r) => r.id),
      EXECUTING_STATE[phase],
    );

    for (const reg of stageRegs) {
      ctx.events.emit(events.begin, {
        component: { componentId: reg.id },
      });
    }

    const results = await ctx.executor.executeStage(
      stageRegs,
      phase,
      context,
      ctx.concurrency,
    );

    for (const result of results) {
      recordResult(ctx, result);

      if (!result.success) {
        transitionComponent(ctx, result.id, LifecycleState.FAILED);
        emitComponentFailed(ctx, result);
        if (ctx.registry.get(result.id)?.critical) {
          ctx.state.forceState(LifecycleState.FAILED);
          return { id: result.id, error: result.error };
        }
      } else {
        transitionComponent(ctx, result.id, SUCCESS_STATE[phase]);
        ctx.events.emit(events.end, {
          component: { componentId: result.id, duration: result.duration },
        });
      }
    }
  }

  return undefined;
}
