/**
 * Readiness state of the runtime.
 *
 * `shutting_down` is sticky: once entered (the runtime does so in
 * `stop()`), automatic evaluation and `markReady()` never report ready
 * again; only `setState()` leaves it.
 */
export type ReadinessState =
  "not_ready" | "initializing" | "ready" | "degraded" | "shutting_down";

/**
 * Readiness check result.
 */
export interface ReadinessCheck {
  readonly name: string;
  readonly ready: boolean;
  /**
   * Why the check is not ready: the error it threw, the timeout it hit,
   * or `"Check returned false."`. Absent while it passes.
   */
  readonly message?: string;
  readonly lastCheckedAt: Date;

  /**
   * How long the last evaluation of this check took, in milliseconds.
   * `0` for a check that has been registered but not yet run.
   */
  readonly durationMs: number;

  /**
   * Whether a failure of this check makes the runtime not ready.
   *
   * A non-critical check is still evaluated and reported — health shows
   * it as `degraded` — but never gates `ready`. Defaults to true.
   */
  readonly critical: boolean;
}

/**
 * A readiness check function.
 */
export type ReadinessCheckFn = () => boolean | Promise<boolean>;

/**
 * Options for a single readiness check.
 */
export interface ReadinessCheckOptions {
  /** See {@link ReadinessCheck.critical}. Defaults to true. */
  readonly critical?: boolean;
}

/**
 * Readiness tracker state.
 */
export interface ReadinessTrackerState {
  readonly state: ReadinessState;
  readonly checks: ReadonlyMap<string, ReadinessCheck>;
  readonly ready: boolean;
  readonly reason?: string;
}

/**
 * A check registered through {@link ReadinessOptions.initialChecks}.
 */
export interface ReadinessInitialCheck extends ReadinessCheckOptions {
  readonly name: string;
  readonly check: ReadinessCheckFn;
}

/**
 * Options for readiness tracking.
 */
export interface ReadinessOptions {
  /**
   * Initial readiness checks to register.
   */
  readonly initialChecks?: ReadonlyArray<ReadinessInitialCheck>;

  /**
   * Whether to automatically mark as ready when all checks pass.
   * @default true
   */
  readonly autoMarkReady?: boolean;
  /**
   * How long a single check may run before it is recorded as failed, in
   * milliseconds. Defaults to 5000; set to `0` to disable the bound.
   */
  readonly checkTimeout?: number;
}
