/**
 * @zudojs/lifecycle/executor/types
 *
 * Result and option types for the lifecycle executor.
 */

import type { LifecyclePhase } from "@zudojs/constants";

/** Result of executing a component hook. */
export interface ExecutionResult {
  /** Component ID. */
  readonly id: string;
  /** The phase that was executed. */
  readonly phase: LifecyclePhase;
  /** Duration in ms. */
  readonly duration: number;
  /** Error if the hook failed. */
  readonly error?: unknown;
  /** Whether the operation succeeded. */
  readonly success: boolean;
  /**
   * True when the operation exceeded the component's `timeout`.
   *
   * For a startup phase that is the hook itself; for `stop`/`dispose`
   * it also covers the wait for the component's own earlier hook that
   * is still running after its timeout. A timed-out hook keeps running
   * (it cannot be cancelled), is never retried, and is tracked so the
   * component's next hook does not overlap it.
   */
  readonly timedOut?: boolean;
}

/** Details of a retry the executor is about to perform. */
export interface LifecycleRetryNotice {
  /** Component ID. */
  readonly id: string;
  /** The phase being retried. */
  readonly phase: LifecyclePhase;
  /** 1-based number of the retry about to run (1 = first retry). */
  readonly attempt: number;
  /** Milliseconds the executor waits before that retry. */
  readonly delay: number;
  /** The error that triggered the retry. */
  readonly error: unknown;
}

/** Options for creating a lifecycle executor. */
export interface LifecycleExecutorOptions {
  /**
   * Called before each retry delay. The lifecycle manager forwards it
   * as the `component:retrying` event. Exceptions are swallowed.
   */
  readonly onRetry?: (notice: LifecycleRetryNotice) => void;
}
