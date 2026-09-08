import type {
  CreateExecutionContextInput,
  ExecutionContext,
} from "./executionContext.context.js";
import { createExecutionContext } from "./executionContext.context.js";

/**
 * Deprecated names kept for source compatibility.
 *
 * The framework has a single execution-context model: the
 * immutable ExecutionContext propagated by ContextStorage. The
 * former mutable `Context` class no longer exists; every alias
 * below resolves to the canonical type or function so there is no
 * second implementation to keep in sync.
 */

/**
 * Known execution transports.
 *
 * @deprecated Use ExecutionContext.transport (a free-form string);
 * this union is kept only as documentation of the conventional
 * values.
 */
export type ContextType =
  "http" | "rpc" | "message" | "job" | "cli" | "worker" | "unknown";

/**
 * @deprecated Use ExecutionContext.
 */
export type Context = ExecutionContext;

/**
 * @deprecated Use CreateExecutionContextInput.
 */
export type CreateContextOptions = CreateExecutionContextInput;

/**
 * @deprecated Use createExecutionContext.
 */
export const createContext: typeof createExecutionContext =
  createExecutionContext;
