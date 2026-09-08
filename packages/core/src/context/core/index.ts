/**
 * @zudojs/core/context/core
 *
 * Core context types and key management.
 */

export {
  createExecutionContext,
  deriveExecutionContext,
  withExecutionMetadata,
  getExecutionDuration,
  createExecutionId,
  type ExecutionContext,
  type CreateExecutionContextInput,
} from "./executionContext.context.js";

export {
  createContextKey,
  setContextValue,
  getContextValue,
  requireContextValue,
  hasContextValue,
  deleteContextValue,
  type ContextKey,
  type ContextValueStore,
} from "./contextKey.key.js";

export {
  createContext,
  type Context,
  type ContextType,
  type CreateContextOptions,
} from "./contextAliases.deprecated.js";
