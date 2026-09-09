/**
 * Runtime state types and state machine.
 */

export {
  RUNTIME_STATE_TRANSITIONS,
  TERMINAL_STATES,
  STARTABLE_STATES,
  STOPPABLE_STATES,
  canTransition,
  assertTransition,
  isTerminalState,
  canStart,
  canStop,
  isRunning,
  hasFailed,
  createStatus,
} from "./runtimeState.core.js";

export type {
  RuntimeState,
  RuntimeFailureState,
  RuntimeId,
  RuntimeStatus,
  RuntimeShutdownFailure,
  RuntimeHealthState,
  RuntimeHealth,
  RuntimeHealthCheck,
} from "./runtimeState.type.js";
