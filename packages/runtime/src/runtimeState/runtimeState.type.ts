import type { EntityId } from "@zudojs/constants";

import type { RuntimeError } from "@zudojs/errors";

/**
 * Extended runtime lifecycle states.
 *
 * Extends the core runtime states with additional granularity
 * for initialization and startup phases.
 */
export type RuntimeState =
  | "created"
  | "initializing"
  | "initialized"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

/**
 * Failure-specific runtime states.
 */
export type RuntimeFailureState =
  "initialization_failed" | "startup_failed" | "shutdown_failed";

/**
 * All possible runtime states including failure variants.
 */
export type RuntimeStateFull = RuntimeState | RuntimeFailureState;

/**
 * Unique runtime identifier.
 */
export type RuntimeId = EntityId;

/**
 * Runtime status snapshot.
 */
export interface RuntimeStatus {
  readonly state: RuntimeState;
  readonly ready: boolean;
  readonly running: boolean;
  readonly startedAt?: Date;
  readonly stoppedAt?: Date;
  readonly failedAt?: Date;
  readonly error?: RuntimeError;
  /**
   * Modules that failed to stop or destroy during the last shutdown.
   *
   * A non-empty list means the runtime reached `stopped` without fully
   * releasing its resources — a state that would otherwise be
   * indistinguishable from a clean shutdown.
   */
  readonly shutdownFailures?: readonly RuntimeShutdownFailure[];
}

/**
 * A module that failed during shutdown.
 */
export interface RuntimeShutdownFailure {
  readonly moduleId: string;
  readonly phase: string;
  readonly error: Error;
  readonly durationMs: number;
}

/**
 * A record of a runtime state transition.
 */
export interface RuntimeStateTransition {
  readonly from: RuntimeState;
  readonly to: RuntimeState;
  readonly timestamp: Date;
  readonly reason?: string;
}

/**
 * Defines valid state transitions.
 */
export type RuntimeStateTransitions = {
  [K in RuntimeState]: readonly RuntimeState[];
};

/**
 * Runtime health state.
 */
export type RuntimeHealthState =
  "healthy" | "degraded" | "unhealthy" | "starting" | "stopping" | "unknown";

/**
 * Runtime health status with details.
 */
export interface RuntimeHealth {
  readonly state: RuntimeHealthState;
  readonly checks: readonly RuntimeHealthCheck[];
  readonly timestamp: Date;
}

/**
 * Individual health check result.
 */
export interface RuntimeHealthCheck {
  readonly name: string;
  readonly healthy: boolean;
  readonly message?: string;
  readonly durationMs: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
