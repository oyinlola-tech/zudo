import type {
  RuntimeContext,
  RuntimeContextDependencies,
  RuntimeContextState,
} from "./runtimeContext.type.js";

import { createStatus } from "../runtimeState/runtimeState.core.js";

/**
 * Creates a runtime context.
 */
export function createRuntimeContext(
  dependencies: RuntimeContextDependencies,
): RuntimeContext {
  const status = createStatus("created");

  return Object.freeze({
    runtimeId: dependencies.runtimeId,
    environment: dependencies.environment,
    applicationName: dependencies.applicationName,
    applicationVersion: dependencies.applicationVersion,
    state: "created",
    status,
    logger: dependencies.logger,
    container: dependencies.container,
    eventBus: dependencies.eventBus,
    health: {
      state: "unknown" as const,
      checks: [],
      timestamp: new Date(),
    },
    ready: false,
    metadata: dependencies.metadata ?? Object.freeze({}),
  });
}

/**
 * Returns a context reflecting the current runtime state.
 *
 * `createRuntimeContext` captures the dependencies that never change for
 * the life of a runtime; the lifecycle-dependent fields are layered on top
 * of that base each time the context is read, so callers never observe a
 * stale snapshot.
 *
 * Every field of {@link RuntimeContextState} is applied. Previously only
 * `startedAt` was, so `stoppedAt`, `failedAt` and `error` were computed by
 * the runtime, passed in here, and silently dropped — the context claimed
 * a clean runtime on the failure path.
 */
export function withRuntimeContextState(
  base: RuntimeContext,
  state: RuntimeContextState,
): RuntimeContext {
  return Object.freeze({
    ...base,
    state: state.status.state,
    status: state.status,
    health: state.health,
    ready: state.ready,
    ...(state.startedAt !== undefined && { startedAt: state.startedAt }),
    ...(state.stoppedAt !== undefined && { stoppedAt: state.stoppedAt }),
    ...(state.failedAt !== undefined && { failedAt: state.failedAt }),
    ...(state.error !== undefined && { error: state.error }),
  });
}
