/**
 * Runtime context providing access to running application state.
 */

export {
  createRuntimeContext,
  withRuntimeContextState,
} from "./runtimeContext.core.js";

export {
  createRuntimeId,
  createCorrelationId,
  createRequestId,
} from "./runtimeContext.factory.js";

export type {
  RuntimeContext,
  RuntimeContextDependencies,
  RuntimeContextState,
} from "./runtimeContext.type.js";
