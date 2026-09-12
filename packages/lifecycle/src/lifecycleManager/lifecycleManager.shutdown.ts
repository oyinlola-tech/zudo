/**
 * @zudojs/lifecycle/manager/shutdown
 *
 * Shutdown orchestration — stops and disposes components in reverse order.
 */

import { LifecyclePhase, LifecycleState } from "@zudojs/constants";
import { buildExecutionPlan } from "../lifecyclePlan/lifecyclePlan.core.js";
import { createLifecycleContext } from "../lifecycleContext/lifecycleContext.type.js";
import type { LifecycleManagerContext } from "./lifecycleManager.context.js";
import {
  emitComponentFailed,
  recordResult,
  transitionComponent,
  wasAttempted,
} from "./lifecycleManager.context.js";

/** Shutdown phases in execution order. */
const SHUTDOWN_PHASES = [LifecyclePhase.STOP, LifecyclePhase.DISPOSE] as const;

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
  ctx.events.emit("application:stopping", {});

  const deadline = Date.now() + ctx.shutdownTimeout;

  // A startup stage still executing must settle before its components
  // are stopped, otherwise `stop()` overlaps the component's own
  // `start()`. Startup itself refuses to launch further stages once
  // `shutdownPromise` is set, so this wait is bounded by one stage.
  if (ctx.inFlight !== undefined) {
    await raceDeadline(
      ctx,
      ctx.inFlight.then(
        () => undefined,
        () => undefined,
      ),
      Math.max(deadline - Date.now(), 1),
    );
  }

  // The shutdown deadline used to be checked only BETWEEN the two
  // phases, so a single hook that never settled hung shutdown (and the
  // process) forever. Race the whole phase against the remaining
  // budget and abort the run's signal when it expires, so hooks that
  // honour cancellation stop and the rest are abandoned.
  for (const phase of SHUTDOWN_PHASES) {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      ctx.controller.abort(
        new Error(
          `Lifecycle shutdown exceeded its ${ctx.shutdownTimeout}ms deadline.`,
        ),
      );
      break;
    }

    try {
      await raceDeadline(ctx, executeShutdownPhase(ctx, phase), remaining);
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
 * Resolves when the phase finishes or the shutdown budget runs out.
 *
 * On expiry the run's AbortController is aborted so in-flight hooks
 * observing `context.signal` unwind, and the timer is always cleared
 * so it can never hold the event loop open.
 */
async function raceDeadline(
  ctx: LifecycleManagerContext,
  phase: Promise<void>,
  remainingMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      ctx.controller.abort(
        new Error(
          `Lifecycle shutdown exceeded its ${ctx.shutdownTimeout}ms deadline.`,
        ),
      );
      resolve();
    }, remainingMs);
  });

  try {
    await Promise.race([phase, expiry]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }

  // The abandoned phase promise must never surface as an unhandled
  // rejection once the race has been decided.
  void phase.catch(() => {});
}

/**
 * Executes a single shutdown phase across all registered components.
 *
 * A hook only runs for components that reached the matching startup
 * phase: `stop()` when `start` ran, `dispose()` when `initialize` ran.
 * Rollback after an early failure — and `shutdown()` on a manager that
 * was never started — used to call `stop()` on components that had
 * never started; a real server's `close()` throws in that situation
 * and the phantom failure was then recorded against the component.
 */
async function executeShutdownPhase(
  ctx: LifecycleManagerContext,
  phase: LifecyclePhase,
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

  for (const stage of plan.stages) {
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
      ctx.events.emit("component:stopping", {
        component: { componentId: reg.id },
      });
    }

    if (runnable.length === 0) continue;

    const results = await ctx.executor.executeStage(
      runnable,
      phase,
      context,
      ctx.concurrency,
    );

    // Shutdown results used to be discarded entirely: a component whose
    // stop() or dispose() threw was still reported as cleanly STOPPED,
    // its failure never reached getStatus() or the event stream, and
    // operators had no way to learn a resource had leaked.
    for (const result of results) {
      recordResult(ctx, result);

      if (result.success) {
        transitionComponent(ctx, result.id, successState);
        ctx.events.emit("component:stopped", {
          component: { componentId: result.id, duration: result.duration },
        });
        continue;
      }

      transitionComponent(ctx, result.id, LifecycleState.FAILED);
      emitComponentFailed(ctx, result);
    }
  }
}
