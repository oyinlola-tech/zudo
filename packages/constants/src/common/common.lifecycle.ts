/**
 * @zudojs/constants/lifecycle
 *
 * Lifecycle states, phases, valid transitions, and defaults.
 */

import { DefaultRetry } from "../time/time.constant.js";
import { Limits } from "./common.constant.js";

/**
 * Lifecycle states — a strongly-typed state machine.
 *
 * Declared as a frozen `as const` object (not a TS `enum`) to match the rest
 * of the package; `LifecycleState` is also exported as the union type of its
 * values, so it can be used in both value and type positions.
 */
export const LifecycleState = Object.freeze({
  IDLE: "idle",
  INITIALIZING: "initializing",
  INITIALIZED: "initialized",
  STARTING: "starting",
  STARTED: "started",
  READY: "ready",
  STOPPING: "stopping",
  STOPPED: "stopped",
  FAILED: "failed",
  DISPOSED: "disposed",
} as const);

/** Type-safe lifecycle state — the union of all {@link LifecycleState} values. */
export type LifecycleState =
  (typeof LifecycleState)[keyof typeof LifecycleState];

/**
 * Lifecycle phases — the discrete hooks a component can implement.
 *
 * Declared as a frozen `as const` object; `LifecyclePhase` is also the union
 * type of its values.
 */
export const LifecyclePhase = Object.freeze({
  INITIALIZE: "initialize",
  START: "start",
  READY: "ready",
  STOP: "stop",
  DISPOSE: "dispose",
} as const);

/** Type-safe lifecycle phase — the union of all {@link LifecyclePhase} values. */
export type LifecyclePhase =
  (typeof LifecyclePhase)[keyof typeof LifecyclePhase];

/** Valid state transitions for the lifecycle state machine. */
export const LIFECYCLE_VALID_TRANSITIONS: Readonly<
  Record<LifecycleState, readonly LifecycleState[]>
> = Object.freeze({
  [LifecycleState.IDLE]: Object.freeze([
    LifecycleState.INITIALIZING,
    LifecycleState.DISPOSED,
  ]),
  [LifecycleState.INITIALIZING]: Object.freeze([
    LifecycleState.INITIALIZED,
    LifecycleState.FAILED,
  ]),
  [LifecycleState.INITIALIZED]: Object.freeze([
    LifecycleState.STARTING,
    LifecycleState.STOPPING,
    LifecycleState.DISPOSED,
  ]),
  [LifecycleState.STARTING]: Object.freeze([
    LifecycleState.STARTED,
    LifecycleState.FAILED,
  ]),
  [LifecycleState.STARTED]: Object.freeze([
    LifecycleState.READY,
    LifecycleState.STOPPING,
    LifecycleState.FAILED,
  ]),
  [LifecycleState.READY]: Object.freeze([
    LifecycleState.STOPPING,
    LifecycleState.FAILED,
  ]),
  [LifecycleState.STOPPING]: Object.freeze([
    LifecycleState.STOPPED,
    LifecycleState.FAILED,
  ]),
  [LifecycleState.STOPPED]: Object.freeze([LifecycleState.DISPOSED]),
  [LifecycleState.FAILED]: Object.freeze([
    LifecycleState.STOPPING,
    LifecycleState.DISPOSED,
  ]),
  [LifecycleState.DISPOSED]: Object.freeze([]),
});

/** Default timeout for lifecycle operations (ms). */
export const LIFECYCLE_DEFAULT_TIMEOUT = 30_000;

/** Default timeout for individual component start (ms). */
export const LIFECYCLE_DEFAULT_START_TIMEOUT = 30_000;

/** Default timeout for individual component stop (ms). */
export const LIFECYCLE_DEFAULT_STOP_TIMEOUT = 10_000;

/** Default global shutdown deadline (ms). */
export const LIFECYCLE_DEFAULT_SHUTDOWN_TIMEOUT = 30_000;

/**
 * Default concurrency limit for parallel component operations
 * (canonical: {@link Limits.MAX_CONCURRENCY}).
 */
export const LIFECYCLE_DEFAULT_CONCURRENCY = Limits.MAX_CONCURRENCY;

/** Default retry attempts (canonical: {@link DefaultRetry.MAX_ATTEMPTS}). */
export const LIFECYCLE_DEFAULT_RETRY_ATTEMPTS = DefaultRetry.MAX_ATTEMPTS;

/** Default retry delay (ms). */
export const LIFECYCLE_DEFAULT_RETRY_DELAY = 500;

/** Maximum retry delay (ms). */
export const LIFECYCLE_DEFAULT_RETRY_MAX_DELAY = 10_000;
