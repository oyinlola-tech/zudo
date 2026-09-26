/**
 * @zudojs/lifecycle/manager/shutdown
 *
 * Shutdown orchestration — stops and disposes components in reverse order.
 */

import { LifecyclePhase, LifecycleState } from "@zudojs/constants";
import { buildExecutionPlan } from "../lifecyclePlan/lifecyclePlan.core.js";
import { createLifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import type { LifecycleEventType } from "../lifecycleEvents/lifecycleEvents.core.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";
import {
  emitComponentFailed,
  recordResult,
  transitionComponent,
  wasAttempted,
} from "./lifecycleManager.context.js";
import { expireShutdown, raceDeadline } from "./lifecycleManager.deadline.js";

/** Shutdown phases in execution order. */
const SHUTDOWN_PHASES = [LifecyclePhase.STOP, LifecyclePhase.DISPOSE] as const;

type ShutdownPhase = (typeof SHUTDOWN_PHASES)[number];

/**
 * Per-phase component events. Dispose used to reuse the stop pair, so
 * a listener saw every component "stopped" twice.
 */
const PHASE_EVENTS: Record<
  ShutdownPhase,
  { readonly begin: LifecycleEventType; readonly end: LifecycleEventType }
> = {
  [LifecyclePhase.STOP]: {
    begin: "component:stopping",
    end: "component:stopped",
  },
  [LifecyclePhase.DISPOSE]: {
    begin: "component:disposing",
    end: "component:disposed",
  },
};

/**
 * Performs the full shutdown sequence: stop → dispose.
 *
 * Idempotent and single-flight: concurrent callers (a signal handler
 * and a failing startup, say) all await the SAME teardown rather than
 * running overlapping ones.
 */
export function performShutdown(ctx: LifecycleManagerContext): Promise<void> {
  ctx.shutdownPromise ??= runShutdown(ctx);

  return ctx.shutdownPromise;
}

async function runShutdown(ctx: LifecycleManagerContext): Promise<void> {
  if (ctx.state.state === LifecycleState.DISPOSED) return;

  // Shutdown must always be possible, including mid-startup. A plain
  // transition() threw LifecycleStateError when shutdown() was called
  // while the application was still INITIALIZING or STARTING, so a
  // signal arriving during startup crashed instead of tearing down.
  if (
    ctx.state.state !== LifecycleState.STOPPING &&
    ctx.state.state !== LifecycleState.FAILED
  ) {
    if (ctx.state.canTransition(LifecycleState.STOPPING)) {
      ctx.state.transition(LifecycleState.STOPPING);
    } else {
      ctx.state.forceState(LifecycleState.STOPPING);
    }
  }
  ctx.shutdownTimedOut = false;
  ctx.events.emit("application:stopping", {});

  const deadline = Date.now() + ctx.shutdownTimeout;

  // A startup stage still executing must settle before its components
  // are stopped, otherwise `stop()` overlaps the component's own
  // `start()`. Startup itself refuses to launch further stages once
  // `shutdownPromise` is set, and each hook in the stage is bounded by
  // its component timeout, so this wait is bounded by one stage.
  //
  // Hooks abandoned by a component timeout are NOT waited for here:
  // the executor makes each component's stop()/dispose() wait for that
  // component's own abandoned hook, bounded by its timeout, so one
  // hung start() no longer holds every other component's teardown
  // until the global deadline.
  if (ctx.inFlight !== undefined) {
    await raceDeadline(
      ctx,
      LifecyclePhase.STOP,
      ctx.inFlight.then(
        () => undefined,
        () => undefined,
      ),
      Math.max(deadline - Date.now(), 1),
    );
  }

  // The whole phase is raced against the remaining budget; expiry is
  // recorded by expireShutdown (components FAILED, event emitted,
  // signal aborted) rather than passing silently.
  for (const phase of SHUTDOWN_PHASES) {
    const remaining = deadline - Date.now();

    if (ctx.shutdownTimedOut || remaining <= 0) {
      expireShutdown(ctx, phase);
      break;
    }

    if (phase === LifecyclePhase.DISPOSE) {
      ctx.events.emit("application:disposing", {});
    }

    try {
      await raceDeadline(ctx, phase, executeShutdownPhase(ctx, phase), remaining);
    } catch {
      // Shutdown must continue even if individual components fail.
    }
  }

  ctx.state.forceState(LifecycleState.DISPOSED);
  ctx.events.emit("application:stopped", {
    duration: Date.now() - ctx.startTime,
  });
  ctx.events.emit("application:disposed", {
    duration: Date.now() - ctx.startTime,
  });
}

/**
 * Executes a single shutdown phase across all registered components.
 *
 * A hook only runs for components that reached the matching startup
 * phase: `stop()` when `start` completed (or timed out, so its outcome
 * is unknown), `dispose()` when `initialize` was invoked at all — a
 * failed initialize may still hold resources. Rollback used to call
 * `stop()` on a component whose own `start()` had just thrown, and on
 * non-critical components that never came up; a real server's
 * `close()` throws in that situation and the phantom failure was then
 * recorded against the component.
 */
async function executeShutdownPhase(
  ctx: LifecycleManagerContext,
  phase: ShutdownPhase,
): Promise<void> {
  const plan = buildExecutionPlan(ctx.registry.getAll(), phase);
  const context = createLifecycleContext(
    phase,
    ctx.startTime,
    ctx.controller.signal,
  );

  const isStop = phase === LifecyclePhase.STOP;
  const prerequisite = isStop
    ? LifecyclePhase.START
    : LifecyclePhase.INITIALIZE;
  const successState = isStop
    ? LifecycleState.STOPPED
    : LifecycleState.DISPOSED;
  const events = PHASE_EVENTS[phase];

  for (const stage of plan.stages) {
    if (ctx.shutdownTimedOut) return;

    const stageRegs = stage.components
      .map((id) => ctx.registry.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);

    if (stageRegs.length === 0) continue;

    const runnable: typeof stageRegs = [];

    for (const reg of stageRegs) {
      if (!wasAttempted(ctx, reg.id, prerequisite)) {
        // Never reached the phase this hook undoes. It still ends up
        // DISPOSED so status reflects the teardown.
        if (!isStop) {
          transitionComponent(ctx, reg.id, LifecycleState.DISPOSED);
        }
        continue;
      }

      runnable.push(reg);

      // Only the stop phase moves a component into STOPPING; dispose
      // runs from STOPPED (or FAILED) and transitions straight to
      // DISPOSED.
      if (isStop) {
        transitionComponent(ctx, reg.id, LifecycleState.STOPPING);
      }
      ctx.events.emit(events.begin, {
        component: { componentId: reg.id },
      });
    }

    if (runnable.length === 0) continue;

    const startedAt = Date.now();
    ctx.shutdownInFlight = new Map(runnable.map((reg) => [reg.id, startedAt]));

    let results;
    try {
      results = await ctx.executor.executeStage(
        runnable,
        phase,
        context,
        ctx.concurrency,
      );
    } finally {
      ctx.shutdownInFlight = undefined;
    }

    // Results arriving after the deadline expired belong to hooks the
    // deadline already reported as timed out. Recording them would emit
    // events after shutdown() has resolved and overwrite that verdict.
    if (ctx.shutdownTimedOut) return;

    for (const result of results) {
      recordResult(ctx, result);

      if (result.success) {
        transitionComponent(ctx, result.id, successState);
        ctx.events.emit(events.end, {
          component: { componentId: result.id, duration: result.duration },
        });
        continue;
      }

      transitionComponent(ctx, result.id, LifecycleState.FAILED);
      emitComponentFailed(ctx, result);
    }
  }
}
