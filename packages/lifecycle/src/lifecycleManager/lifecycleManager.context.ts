/**
 * @zudojs/lifecycle/manager/context
 *
 * Internal context shared between startup and shutdown orchestration modules,
 * plus helper functions for component state transitions and event emission.
 */

import { LifecycleState } from "@zudojs/constants";
import type { LifecyclePhase } from "@zudojs/constants";
import type { LifecycleStateMachine } from "../lifecycleState/lifecycleState.machine.js";
import type { LifecycleRegistry } from "../lifecycleRegistry/lifecycleRegistry.core.js";
import type { LifecycleExecutor } from "../lifecycleExecutor/lifecycleExecutor.core.js";
import type { LifecycleEventEmitter } from "../lifecycleEvents/lifecycleEvents.core.js";
import type { ExecutionResult } from "../lifecycleExecutor/lifecycleExecutor.core.js";

/** Internal context passed to startup/shutdown orchestration functions. */
export interface LifecycleManagerContext {
  readonly registry: LifecycleRegistry;
  readonly state: LifecycleStateMachine;
  readonly executor: LifecycleExecutor;
  readonly events: LifecycleEventEmitter;
  readonly concurrency: number;
  readonly shutdownTimeout: number;
  readonly componentStates: Map<string, LifecycleStateMachine>;
  readonly results: Map<string, ExecutionResult[]>;

  /**
   * Startup phases that were actually run for each component.
   *
   * Shutdown consults this so `stop()` is only invoked on components
   * whose `start` phase ran and `dispose()` only on components whose
   * `initialize` phase ran. Rollback after an early failure used to
   * call `stop()` on components that had never started, which for a
   * real server throws and was then reported as a component failure.
   */
  readonly attempted: Map<string, Set<LifecyclePhase>>;
  startTime: number;

  /**
   * Cancellation source for the current run.
   *
   * Its signal is the one handed to every component hook through
   * LifecycleContext. It is aborted when the global shutdown deadline
   * expires, so a hook that honours the signal can bail out instead of
   * hanging the process.
   */
  readonly controller: AbortController;

  /**
   * The in-flight shutdown, shared by every caller.
   *
   * Startup rollback and LifecycleManager.shutdown() both go through
   * this field, so a signal arriving during a failing startup joins the
   * rollback already running instead of starting a second, overlapping
   * teardown.
   */
  shutdownPromise?: Promise<void>;

  /**
   * The startup stage currently executing, if any.
   *
   * A shutdown requested mid-startup waits for this to settle before
   * running `stop()`, so a component is never stopped while its own
   * `start()` is still in flight, and startup checks for a requested
   * shutdown before launching each further stage so no hook runs
   * after teardown has completed.
   */
  inFlight?: Promise<unknown>;
}

/** Records an execution result against its component. */
export function recordResult(
  ctx: LifecycleManagerContext,
  result: ExecutionResult,
): void {
  const existing = ctx.results.get(result.id) ?? [];
  ctx.results.set(result.id, [...existing, result]);
}

/**
 * Safely transitions a component state machine to the target state.
 * No-op if the transition is not valid from the current state.
 */
export function transitionComponent(
  ctx: LifecycleManagerContext,
  id: string,
  targetState: LifecycleState,
): void {
  const sm = ctx.componentStates.get(id);
  if (sm && sm.canTransition(targetState)) {
    sm.transition(targetState);
  }
}

/**
 * Marks a component as FAILED regardless of its current state.
 *
 * Used for components that are skipped because a dependency failed:
 * they have not entered the phase, so no validated transition leads to
 * FAILED from their current (IDLE / INITIALIZED / STARTED) state.
 */
export function failComponent(ctx: LifecycleManagerContext, id: string): void {
  ctx.componentStates.get(id)?.forceState(LifecycleState.FAILED);
}

/** Records that a startup phase ran for a component. */
export function markAttempted(
  ctx: LifecycleManagerContext,
  id: string,
  phase: LifecyclePhase,
): void {
  const phases = ctx.attempted.get(id) ?? new Set<LifecyclePhase>();
  phases.add(phase);
  ctx.attempted.set(id, phases);
}

/** Returns whether a startup phase ran for a component. */
export function wasAttempted(
  ctx: LifecycleManagerContext,
  id: string,
  phase: LifecyclePhase,
): boolean {
  return ctx.attempted.get(id)?.has(phase) ?? false;
}

/**
 * Transitions multiple component state machines to the same target state.
 */
export function transitionComponentBatch(
  ctx: LifecycleManagerContext,
  ids: readonly string[],
  targetState: LifecycleState,
): void {
  for (const id of ids) {
    transitionComponent(ctx, id, targetState);
  }
}

/**
 * Emits a component failure event with error and duration details.
 */
export function emitComponentFailed(
  ctx: LifecycleManagerContext,
  result: { id: string; error?: unknown; duration: number },
): void {
  ctx.events.emit("component:failed", {
    component: {
      componentId: result.id,
      error: result.error,
      duration: result.duration,
    },
  });
}
