/**
 * Readiness state of the runtime.
 */
export type ReadinessState =
  "not_ready" | "initializing" | "ready" | "degraded" | "shutting_down";

/**
 * Readiness check result.
 */
export interface ReadinessCheck {
  readonly name: string;
  readonly ready: boolean;
  readonly message?: string;
  readonly lastCheckedAt: Date;

  /**
   * How long the last evaluation of this check took, in milliseconds.
   * `0` for a check that has been registered but not yet run.
   */
  readonly durationMs: number;
}

/**
 * A readiness check function.
 */
export type ReadinessCheckFn = () => boolean | Promise<boolean>;

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
 * Options for readiness tracking.
 */
export interface ReadinessOptions {
  /**
   * Initial readiness checks to register.
   */
  readonly initialChecks?: ReadonlyArray<{
    readonly name: string;
    readonly check: ReadinessCheckFn;
  }>;

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
