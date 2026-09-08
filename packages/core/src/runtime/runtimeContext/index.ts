/**
 * Runtime Context
 *
 * The runtime's identity and its immutable ExecutionContext.
 */

export {
  createRuntimeId,
  createRuntimeIdentity,
  createRuntimeExecutionContext,
  createRuntimeContext,
} from "./runtimeContext.factory.js";

export type {
  RuntimeIdentity,
  RuntimeExecutionMetadata,
  RuntimeExecutionContext,
  RuntimeContext,
} from "./runtimeContext.type.js";
