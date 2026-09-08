/**
 * Execution context.
 *
 * The framework has one execution-context model:
 *
 * - ExecutionContext (core/) is an immutable description of one
 *   execution (ids, tracing, principal, metadata). New contexts are
 *   created with createExecutionContext and refined with
 *   deriveExecutionContext / withExecutionMetadata.
 * - ContextStorage (provider/) propagates the current
 *   ExecutionContext across async boundaries via AsyncLocalStorage.
 *   getDefaultContextStorage() is the shared instance the runtime,
 *   module lifecycle, application, container, and logger use unless
 *   another storage is injected.
 * - ContextValues (values/) carries strongly typed per-execution
 *   values; ContextStorage.runWithValues / getValues / capture /
 *   runSnapshot connect them to the storage, and ContextSnapshot
 *   (snapshot/) carries both across scheduling boundaries.
 *
 * The runtime runs its bootstrap and shutdown pipelines, every
 * module lifecycle hook, and application start/stop inside the
 * runtime's own ExecutionContext (see RuntimeExecutionContext).
 */
export * from "./core/index.js";

export * from "./provider/index.js";

export * from "./values/index.js";

export * from "./snapshot/index.js";
