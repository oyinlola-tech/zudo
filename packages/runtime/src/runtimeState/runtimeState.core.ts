import type { RuntimeState, RuntimeStatus } from "./runtimeState.type.js";

/**
 * Defines valid runtime state transitions.
 */
export const RUNTIME_STATE_TRANSITIONS: Readonly<
  Record<RuntimeState, readonly RuntimeState[]>
> = Object.freeze({
  created: ["initializing", "stopped", "failed"],
  initializing: ["initialized", "running", "failed"],
  initialized: ["starting", "running", "failed"],
  starting: ["running", "failed"],
  running: ["stopping", "failed"],
  stopping: ["stopped", "failed"],
  stopped: [],
  // A failed runtime must still be stoppable: startup rollback only
  // reaches modules that were started, so the operator needs a way to
  // release everything else. Without this the failure path — the one
  // most in need of cleanup — is the one with none available.
  failed: ["stopping", "stopped"],
});

/**
 * Terminal runtime states.
 */
export const TERMINAL_STATES: readonly RuntimeState[] = Object.freeze([
  "stopped",
  "failed",
]);

/**
 * Runtime states from which startup is allowed.
 */
export const STARTABLE_STATES: readonly RuntimeState[] = Object.freeze([
  "created",
]);

/**
 * Runtime states from which shutdown is allowed.
 */
export const STOPPABLE_STATES: readonly RuntimeState[] = Object.freeze([
  "running",
  "failed",
]);

/**
 * Checks whether a state transition is valid.
 */
export function canTransition(from: RuntimeState, to: RuntimeState): boolean {
  const allowed = RUNTIME_STATE_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

/**
 * Asserts that a state transition is valid.
 */
export function assertTransition(from: RuntimeState, to: RuntimeState): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid runtime state transition from "${from}" to "${to}".`,
    );
  }
}

/**
 * Returns whether the runtime is in a terminal state.
 */
export function isTerminalState(state: RuntimeState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Returns whether the runtime can start.
 */
export function canStart(state: RuntimeState): boolean {
  return STARTABLE_STATES.includes(state);
}

/**
 * Returns whether the runtime can stop.
 */
export function canStop(state: RuntimeState): boolean {
  return STOPPABLE_STATES.includes(state);
}

/**
 * Returns whether the runtime is currently running.
 */
export function isRunning(state: RuntimeState): boolean {
  return state === "running";
}

/**
 * Returns whether the runtime has failed.
 */
export function hasFailed(state: RuntimeState): boolean {
  return state === "failed";
}

/**
 * Creates a runtime status snapshot.
 */
export function createStatus(state: RuntimeState): RuntimeStatus {
  return Object.freeze({
    state,
    ready: state === "running",
    running: state === "running",
  });
}
