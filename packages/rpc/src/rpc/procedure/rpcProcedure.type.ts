import type { RPCProcedureName } from "../types/rpcProcedureName.type.js";

import type { RPCContext } from "../context/rpcContext.type.js";

import type { RPCSchema } from "../validation/rpcValidation.core.js";

import { assertValidProcedureName } from "../validation/rpcValidation.core.js";

/**
 * Handler for an RPC procedure.
 */
export type RPCHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: RPCContext,
) => Promise<TOutput> | TOutput;

/**
 * Options for an RPC procedure.
 */
export interface RPCProcedureOptions<TInput = unknown, TOutput = unknown> {
  /**
   * Whether calling this procedure more than once is safe.
   *
   * Advisory: the server does not deduplicate or auto-retry on this
   * flag. It is exposed through the registry so a caller's retry policy
   * can consult it before replaying a failed call.
   */
  readonly idempotent?: boolean;

  /**
   * Maximum time the handler may run, in milliseconds. Enforced by the
   * dispatcher, which aborts the context signal when it elapses.
   */
  readonly timeout?: number;

  /** Human-readable description, surfaced by registry introspection. */
  readonly description?: string;

  /**
   * Schema the request payload is parsed against before the handler
   * runs. Without one, the handler receives the raw untrusted payload.
   */
  readonly input?: RPCSchema<TInput>;

  /**
   * Schema the handler's result is checked against before it is sent.
   */
  readonly output?: RPCSchema<TOutput>;
}

/**
 * An RPC procedure definition.
 */
export interface RPCProcedure<TInput = unknown, TOutput = unknown> {
  readonly name: RPCProcedureName;

  readonly handler: RPCHandler<TInput, TOutput>;

  readonly options?: RPCProcedureOptions<TInput, TOutput>;
}

/**
 * Creates a new RPC procedure.
 */
export function createRPCProcedure<TInput = unknown, TOutput = unknown>(
  name: RPCProcedureName,
  handler: RPCHandler<TInput, TOutput>,
  options: RPCProcedureOptions<TInput, TOutput> = {},
): RPCProcedure<TInput, TOutput> {
  // Names are validated at definition time so a malformed name is a
  // startup error rather than a request that can never be routed.
  assertValidProcedureName(name);

  if (options.timeout !== undefined) {
    if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
      throw new TypeError(
        `Procedure "${name}" declares a non-positive timeout.`,
      );
    }
  }

  return Object.freeze({
    name,
    handler,
    options: Object.freeze(options),
  });
}
