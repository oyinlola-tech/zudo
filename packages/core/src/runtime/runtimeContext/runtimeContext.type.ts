import type { ExecutionContext } from "../../context/core/executionContext.context.js";

import type { RuntimeMode, RuntimeRole } from "../runtimeOptions/index.js";

/**
 * Runtime identity.
 */
export interface RuntimeIdentity {
  readonly id: string;
  readonly name: string;
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly createdAt: Date;
  readonly processId?: number;
}

/**
 * Metadata carried by a runtime's execution context.
 *
 * The identity fields are always present; `RuntimeOptions.metadata`
 * is merged in (identity fields cannot be overridden) so
 * user-supplied values are reachable as `context.metadata[key]`.
 */
export interface RuntimeExecutionMetadata {
  readonly runtimeId: string;
  readonly runtimeName: string;
  readonly runtimeMode: RuntimeMode;
  readonly runtimeRole: RuntimeRole;
  readonly processId?: number;
  readonly [key: string]: unknown;
}

/**
 * The execution context of a runtime.
 *
 * A runtime is single-use, so its whole lifetime is one execution:
 * `executionId` is the runtime id, `service` is the runtime name,
 * `startedAt` is the runtime's creation time, and `transport` /
 * `operation` are `"runtime"`. The runtime establishes this context
 * (via its ContextStorage) around bootstrap, shutdown, every module
 * lifecycle hook, and application start/stop, so
 * `contextStorage.get()` inside those returns it or a context
 * derived from it.
 *
 * It is immutable. Mutable runtime state (state, timing, failure)
 * lives on the Runtime object.
 */
export interface RuntimeExecutionContext extends ExecutionContext {
  readonly service: string;
  readonly transport: "runtime";
  readonly operation: "runtime";
  readonly metadata: RuntimeExecutionMetadata;
}

/**
 * @deprecated Use RuntimeExecutionContext. The former mutable
 * runtime context (state, timing, service references) no longer
 * exists: state and timing live on the Runtime, and services are
 * reached through the Runtime accessors.
 */
export type RuntimeContext = RuntimeExecutionContext;
