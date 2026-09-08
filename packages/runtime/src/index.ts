/**
 * @zudojs/runtime
 *
 * Application runtime orchestrator for the Zudojs framework.
 *
 * The runtime manages the complete application lifecycle:
 * - Deterministic startup with dependency ordering
 * - Graceful shutdown with timeout
 * - Process signal handling
 * - Runtime events and observability
 * - Module lifecycle orchestration
 */

export { DefaultRuntime, createRuntime } from "./runtime/runtime.core.js";

export type { Runtime, RuntimeDependencies } from "./runtime/runtime.core.js";

export * from "./runtimeState/index.js";
export * from "./runtimeOptions/index.js";
export * from "./runtimeEvents/index.js";
export * from "./runtimeContext/index.js";
export * from "./dependencyGraph/index.js";
export * from "./readiness/index.js";
export * from "./health/index.js";
export * from "./lifecycle/index.js";
export * from "./startup/index.js";
export * from "./shutdown/index.js";
export * from "./signalHandler/index.js";
export * from "./runtimeError/index.js";
export * from "./registry/index.js";
export * from "./testRuntime/index.js";
