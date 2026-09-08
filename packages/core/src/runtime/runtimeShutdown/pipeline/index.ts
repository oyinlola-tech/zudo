/**
 * Shutdown Pipeline
 *
 * Module stopping and destruction stages.
 */

export {
  executeShutdownPipeline,
  createShutdownPipelineState,
  createShutdownResult,
} from "./runtimeShutdown.pipeline.js";

export type {
  ShutdownCounters,
  ShutdownLogFn,
  ShutdownPipelineServices,
  ShutdownPipelineState,
} from "./runtimeShutdown.pipeline.js";
