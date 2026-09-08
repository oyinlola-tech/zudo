import {
  InvalidRuntimeStateError,
  InvalidRuntimeTransitionError,
} from "./runtimeError/runtimeError.lifecycle.js";

export {
  InvalidRuntimeStateError,
  InvalidRuntimeTransitionError,
} from "./runtimeError/runtimeError.lifecycle.js";

/** Runtime lifecycle states. */
export enum RuntimeState {
  CREATED = "created",
  BOOTSTRAPPING = "bootstrapping",
  READY = "ready",
  STOPPING = "stopping",
  STOPPED = "stopped",
  FAILED = "failed",
}

/** Terminal runtime states: no further transitions are possible. */
export const TERMINAL_RUNTIME_STATES: readonly RuntimeState[] = Object.freeze([
  RuntimeState.STOPPED,
  RuntimeState.FAILED,
]);

/** Runtime states from which startup is allowed. */
export const STARTABLE_RUNTIME_STATES: readonly RuntimeState[] = Object.freeze([
  RuntimeState.CREATED,
]);

/**
 * Runtime states from which shutdown is allowed.
 *
 * CREATED is included because stopping a runtime that never started
 * is a valid soft stop (no modules to unwind).
 */
export const STOPPABLE_RUNTIME_STATES: readonly RuntimeState[] = Object.freeze([
  RuntimeState.CREATED,
  RuntimeState.READY,
]);

/** Runtime states that indicate a lifecycle operation is in progress. */
export const TRANSITIONAL_RUNTIME_STATES: readonly RuntimeState[] =
  Object.freeze([RuntimeState.BOOTSTRAPPING, RuntimeState.STOPPING]);

/** Runtime status information. */
export interface RuntimeStateSnapshot {
  readonly state: RuntimeState;
  readonly ready: boolean;
  readonly terminal: boolean;
  readonly transitioning: boolean;
  readonly failed: boolean;
}

/**
 * Timestamps recorded by the runtime as it moves through its
 * states. Owned by the Runtime object (never by the execution
 * context, which is immutable).
 */
export interface RuntimeTiming {
  readonly createdAt: Date;
  readonly startupStartedAt?: Date;
  readonly readyAt?: Date;
  readonly shutdownStartedAt?: Date;
  readonly stoppedAt?: Date;
  readonly failedAt?: Date;
}

/** Describes a runtime state transition. */
export interface RuntimeStateTransition {
  readonly from: RuntimeState;
  readonly to: RuntimeState;
  readonly timestamp: Date;
  readonly reason?: string;
}

export function isRuntimeState(value: unknown): value is RuntimeState {
  return (
    value === RuntimeState.CREATED ||
    value === RuntimeState.BOOTSTRAPPING ||
    value === RuntimeState.READY ||
    value === RuntimeState.STOPPING ||
    value === RuntimeState.STOPPED ||
    value === RuntimeState.FAILED
  );
}

export function isRuntimeReady(state: RuntimeState): boolean {
  return state === RuntimeState.READY;
}
export function isRuntimeFailed(state: RuntimeState): boolean {
  return state === RuntimeState.FAILED;
}
export function isRuntimeTransitioning(state: RuntimeState): boolean {
  return (
    state === RuntimeState.BOOTSTRAPPING || state === RuntimeState.STOPPING
  );
}
export function isRuntimeTerminal(state: RuntimeState): boolean {
  return TERMINAL_RUNTIME_STATES.includes(state);
}
export function canStartRuntime(state: RuntimeState): boolean {
  return STARTABLE_RUNTIME_STATES.includes(state);
}
export function canStopRuntime(state: RuntimeState): boolean {
  return STOPPABLE_RUNTIME_STATES.includes(state);
}

/**
 * Determines whether a runtime state transition is valid.
 *
 * Rules:
 * - Self transitions are never valid.
 * - FAILED is reachable from every non-terminal state
 *   (CREATED, BOOTSTRAPPING, READY, STOPPING).
 * - CREATED → STOPPED is a valid "soft stop": a runtime that
 *   never started can be stopped as a no-op.
 * - STOPPED and FAILED are terminal for transitions.
 */
export function canTransitionRuntime(
  from: RuntimeState,
  to: RuntimeState,
): boolean {
  if (from === to) return false;
  switch (from) {
    case RuntimeState.CREATED:
      return (
        to === RuntimeState.BOOTSTRAPPING ||
        to === RuntimeState.STOPPED ||
        to === RuntimeState.FAILED
      );
    case RuntimeState.BOOTSTRAPPING:
      return to === RuntimeState.READY || to === RuntimeState.FAILED;
    case RuntimeState.READY:
      return to === RuntimeState.STOPPING || to === RuntimeState.FAILED;
    case RuntimeState.STOPPING:
      return to === RuntimeState.STOPPED || to === RuntimeState.FAILED;
    case RuntimeState.FAILED:
      return false;
    case RuntimeState.STOPPED:
      return false;
    default:
      return false;
  }
}

export function assertRuntimeState(
  value: unknown,
): asserts value is RuntimeState {
  if (!isRuntimeState(value))
    throw new InvalidRuntimeStateError(
      `Invalid runtime state: "${String(value)}".`,
      { state: String(value) },
    );
}

export function assertRuntimeTransition(
  from: RuntimeState,
  to: RuntimeState,
): void {
  if (!canTransitionRuntime(from, to))
    throw new InvalidRuntimeTransitionError(from, to);
}

export function createRuntimeStateSnapshot(
  state: RuntimeState,
): RuntimeStateSnapshot {
  return Object.freeze({
    state,
    ready: isRuntimeReady(state),
    terminal: isRuntimeTerminal(state),
    transitioning: isRuntimeTransitioning(state),
    failed: isRuntimeFailed(state),
  });
}

export function createRuntimeStateTransition(
  from: RuntimeState,
  to: RuntimeState,
  reason?: string,
): RuntimeStateTransition {
  assertRuntimeTransition(from, to);
  return Object.freeze({ from, to, timestamp: new Date(), reason });
}

export function getRuntimeStateLabel(state: RuntimeState): string {
  switch (state) {
    case RuntimeState.CREATED:
      return "Created";
    case RuntimeState.BOOTSTRAPPING:
      return "Bootstrapping";
    case RuntimeState.READY:
      return "Ready";
    case RuntimeState.STOPPING:
      return "Stopping";
    case RuntimeState.STOPPED:
      return "Stopped";
    case RuntimeState.FAILED:
      return "Failed";
    default:
      return "Unknown";
  }
}

export function getRuntimeStates(): readonly RuntimeState[] {
  return Object.freeze([
    RuntimeState.CREATED,
    RuntimeState.BOOTSTRAPPING,
    RuntimeState.READY,
    RuntimeState.STOPPING,
    RuntimeState.STOPPED,
    RuntimeState.FAILED,
  ]);
}

export function getNextRuntimeStates(
  state: RuntimeState,
): readonly RuntimeState[] {
  switch (state) {
    case RuntimeState.CREATED:
      return Object.freeze([
        RuntimeState.BOOTSTRAPPING,
        RuntimeState.STOPPED,
        RuntimeState.FAILED,
      ]);
    case RuntimeState.BOOTSTRAPPING:
      return Object.freeze([RuntimeState.READY, RuntimeState.FAILED]);
    case RuntimeState.READY:
      return Object.freeze([RuntimeState.STOPPING, RuntimeState.FAILED]);
    case RuntimeState.STOPPING:
      return Object.freeze([RuntimeState.STOPPED, RuntimeState.FAILED]);
    case RuntimeState.FAILED:
      return Object.freeze([]);
    case RuntimeState.STOPPED:
      return Object.freeze([]);
    default:
      return Object.freeze([]);
  }
}
