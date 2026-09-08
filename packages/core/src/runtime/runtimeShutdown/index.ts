/**
 * Runtime Shutdown
 *
 * Handles the shutdown pipeline for stopping and
 * destroying runtime modules.
 */

export { DefaultRuntimeShutdown } from "./runtimeShutdown.core.js";

export {
  executeShutdownPipeline,
  createShutdownPipelineState,
  createShutdownResult,
} from "./pipeline/index.js";

export type {
  ShutdownCounters,
  ShutdownPipelineState,
} from "./pipeline/index.js";

export type {
  RuntimeShutdownDependencies,
  RuntimeShutdownConfig,
  RuntimeShutdownPhase,
  RuntimeShutdownErrorInfo,
  RuntimeShutdownResult,
  RuntimeShutdown,
  ResolvedShutdownOptions,
} from "./runtimeShutdown.type.js";
