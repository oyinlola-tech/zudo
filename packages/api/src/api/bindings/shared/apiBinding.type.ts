import type { APIExecutor } from "../../executor/executor.core.js";

import type { APIOperationRegistry } from "../../registry/operationRegistry.core.js";

import type { AnyAPIOperation, APIOperation } from "../../operation/operation.type.js";

import type { APIError } from "../../errors/index.js";

/**
 * The operations a binding exposes: a registry (freeze it first so the
 * set cannot change underneath a live binding) or a plain list.
 */
export type APIOperationSource = APIOperationRegistry | readonly AnyAPIOperation[];

/**
 * Options every binding accepts.
 *
 * `TSource` is what the transport hands the binding for one call: the
 * `Request` for HTTP, the `RPCContext` for RPC, the `Job` for a queue, the
 * parsed invocation for the CLI.
 */
export interface APIBindingOptions<TSource> {
  /**
   * Executor that runs every operation. Configure interceptors on it; they
   * apply identically over every binding. Defaults to `new APIExecutor()`.
   */
  readonly executor?: APIExecutor;

  /**
   * Builds `context.state` for one call — typically the authenticated
   * principal derived from the transport. Throw an `APIError` (for example
   * `APIAuthenticationError`) to refuse the call with that error; any
   * other thrown value becomes an internal error. Defaults to `{}`.
   */
  readonly state?: (source: TSource, operation: APIOperation) => unknown;

  /**
   * Receives every failure that was not exposed to the caller (the error
   * still carries its `cause`), with the call's request id — the place to
   * log what the caller was only told was "an internal error".
   */
  readonly onInternalError?: (error: APIError, requestId: string) => void;
}
