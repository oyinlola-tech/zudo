import type {
  RuntimeHealth,
  RuntimeHealthCheck,
  RuntimeHealthState,
  RuntimeState,
} from "../runtimeState/runtimeState.type.js";

import type { ReadinessTrackerState } from "../readiness/readiness.type.js";

/**
 * Maps the runtime lifecycle state onto a health state, for the states
 * where health is determined by the lifecycle alone.
 *
 * Returns `undefined` while the runtime is running, because health then
 * depends on the readiness checks rather than on the state.
 */
function healthStateFor(state: RuntimeState): RuntimeHealthState | undefined {
  switch (state) {
    case "created":
    case "stopped":
      return "unknown";
    case "initializing":
    case "initialized":
    case "starting":
      return "starting";
    case "stopping":
      return "stopping";
    case "failed":
      return "unhealthy";
    case "running":
      return undefined;
  }
}

/**
 * Converts readiness checks into health checks.
 */
function toHealthChecks(
  readiness: ReadinessTrackerState,
): readonly RuntimeHealthCheck[] {
  return Object.freeze(
    [...readiness.checks.values()].map((check) =>
      Object.freeze({
        name: check.name,
        healthy: check.ready,
        durationMs: check.durationMs,
        ...(check.message !== undefined && { message: check.message }),
      }),
    ),
  );
}

/**
 * Computes runtime health from the lifecycle state and readiness checks.
 *
 * A running runtime is `healthy` when every readiness check passes (a
 * runtime with no checks registered counts as healthy) and `degraded`
 * when at least one check is failing. Every other lifecycle state maps
 * directly onto a health state.
 */
export function computeRuntimeHealth(
  state: RuntimeState,
  readiness: ReadinessTrackerState,
): RuntimeHealth {
  const checks = toHealthChecks(readiness);

  const lifecycleState = healthStateFor(state);

  const healthState: RuntimeHealthState =
    lifecycleState ??
    (checks.every((check) => check.healthy) ? "healthy" : "degraded");

  return Object.freeze({
    state: healthState,
    checks,
    timestamp: new Date(),
  });
}
