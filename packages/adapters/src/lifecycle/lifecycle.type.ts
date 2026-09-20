/**
 * @zudojs/adapters/lifecycle
 *
 * Adapter lifecycle contracts — health, operation options, and lifecycle hooks.
 */

import type { Adapter } from "../adapter/adapter.type.js";

/**
 * Adapter health status.
 */
export type AdapterHealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Adapter health report.
 */
export interface AdapterHealth {
  readonly status: AdapterHealthStatus;
  readonly message?: string;
  readonly timestamp: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Options for adapter operations.
 */
export interface AdapterOperationOptions {
  /** Abort signal for cancellation. */
  readonly signal?: AbortSignal;

  /** Timeout in milliseconds. */
  readonly timeout?: number;

  /**
   * Retry configuration.
   *
   * `attempts` is the total number of tries, not the number of extra ones:
   * `1` (or anything below it) runs the operation once. `delay` is the pause
   * in milliseconds between tries, ended early by `signal`. A health check is
   * retried only while it reports `"unhealthy"`; `timeout` bounds each try.
   */
  readonly retry?: {
    readonly attempts: number;
    readonly delay?: number;
  };
}

/**
 * Extended adapter with lifecycle hooks.
 */
export interface LifecycleAdapter extends Adapter {
  /** Configure the adapter with options. */
  configure?(options: unknown): Promise<void> | void;

  /** Check adapter health. */
  health?(): Promise<AdapterHealth> | AdapterHealth;
}

/**
 * Creates a default healthy health report.
 */
export function createHealthyHealth(): AdapterHealth {
  return {
    status: "healthy",
    timestamp: Date.now(),
  };
}

/**
 * Creates a degraded health report.
 */
export function createDegradedHealth(message: string): AdapterHealth {
  return {
    status: "degraded",
    message,
    timestamp: Date.now(),
  };
}

/**
 * Creates an unhealthy health report.
 */
export function createUnhealthyHealth(message: string): AdapterHealth {
  return {
    status: "unhealthy",
    message,
    timestamp: Date.now(),
  };
}
