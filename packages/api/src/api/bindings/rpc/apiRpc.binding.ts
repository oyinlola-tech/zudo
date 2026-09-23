import { createRPCProcedure } from "@zudojs/rpc";
import type { RPCContext, RPCProcedure } from "@zudojs/rpc";

import type { AnyAPIOperation, APIOperation } from "../../operation/operation.type.js";

import type { APIBindingOptions, APIOperationSource } from "../shared/apiBinding.type.js";

import type { APIBoundCall, APIBoundOutcome } from "../shared/apiBinding.helper.js";

import { createOperationRunner, listOperations } from "../shared/apiBinding.helper.js";

import { resolveOperationTimeout } from "../../operation/operation.type.js";

import { apiErrorToRPCError } from "./apiRpc.errors.js";

/**
 * Extra time the RPC dispatcher allows beyond an operation's own
 * deadline, so the executor's `APITimeoutError` (mapped to
 * `RPC_TIMEOUT`) is what a slow call reports.
 */
export const API_RPC_TIMEOUT_MARGIN_MS = 1_000;

/**
 * Options for the RPC binding. `state` receives the `RPCContext` — read
 * the transport-verified `context.auth` there, never frame `metadata`.
 */
export interface APIRpcBindingOptions extends APIBindingOptions<RPCContext> {
  /**
   * Maps an operation to its procedure name. Defaults to the operation
   * name, which must then satisfy the RPC name rule (`"users.get"`).
   */
  readonly procedureName?: (operation: APIOperation) => string;
}

/**
 * Anything procedures can be registered on: an `RPCServer`, an
 * `RPCProcedureRegistry`, or an `RPCProcedureRouter`.
 */
export interface APIRpcProcedureTarget {
  register(procedure: RPCProcedure): unknown;
}

type Runner = (call: APIBoundCall<RPCContext>) => Promise<APIBoundOutcome>;

/**
 * Wraps one operation as an RPC procedure.
 *
 * The handler runs the operation through the executor — schema
 * validation, interceptors and the operation timeout all apply — under
 * the RPC call's abort signal, with the frame's request id and
 * correlation id. A failed result is thrown as the matching RPC error
 * (see `apiErrorToRPCError`), so the RPC server maps it to a wire code.
 *
 * @throws {RPCInvalidRequestError} if the procedure name is not a valid
 * RPC name.
 */
export function createApiRpcProcedure(
  operation: AnyAPIOperation,
  options: APIRpcBindingOptions = {},
): RPCProcedure {
  return buildProcedure(operation as APIOperation, options, createOperationRunner(options));
}

/**
 * Registers every operation as an RPC procedure and returns the
 * procedure names, in registration order.
 */
export function registerApiRpcProcedures(
  target: APIRpcProcedureTarget,
  operations: APIOperationSource,
  options: APIRpcBindingOptions = {},
): readonly string[] {
  const run = createOperationRunner(options);
  const names: string[] = [];
  for (const operation of listOperations(operations)) {
    const procedure = buildProcedure(operation, options, run);
    target.register(procedure);
    names.push(procedure.name);
  }
  return Object.freeze(names);
}

function buildProcedure(
  operation: APIOperation,
  options: APIRpcBindingOptions,
  run: Runner,
): RPCProcedure {
  const name = options.procedureName?.(operation) ?? operation.name;
  const metadata = operation.metadata;

  return createRPCProcedure(
    name,
    async (input: unknown, context: RPCContext): Promise<unknown> => {
      const { result } = await run({
        operation,
        input,
        source: context,
        transport: "rpc",
        requestId: context.metadata.requestId ?? context.request.id,
        correlationId: context.metadata.correlationId,
        signal: context.signal,
      });
      if (!result.ok) {
        throw apiErrorToRPCError(result.error, name);
      }
      return result.data;
    },
    {
      timeout: resolveOperationTimeout(operation) + API_RPC_TIMEOUT_MARGIN_MS,
      ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
      ...(metadata?.idempotent !== undefined ? { idempotent: metadata.idempotent } : {}),
    },
  );
}
