/**
 * Core middleware type definitions: functions, contexts, and pipelines.
 *
 * @module middlewareTypes
 */

export {
  type Middleware,
  type NamedMiddleware,
  type MiddlewareFactory,
} from "./middlewareDefinition.type.js";
export {
  type PipelineResult,
  type PipelineSuccess,
  type PipelineFailure,
  type PipelineMiddlewareFailure,
  type PipelineErrorMode,
  type PipelineOptions,
} from "./middlewareContext.type.js";
