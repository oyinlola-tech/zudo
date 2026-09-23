import { findUnsafeKey } from "@zudojs/security";

import type { APIOperation } from "../../operation/operation.type.js";

import type { APIResult } from "../../result/apiResult.type.js";

import type { APITransportKind } from "../../context/contextKey.type.js";

import type { APIBindingOptions, APIOperationSource } from "./apiBinding.type.js";

import { APIExecutor } from "../../executor/executor.core.js";

import { normalizeAPIError } from "../../executor/executor.core.js";

import { APIOperationRegistry } from "../../registry/operationRegistry.core.js";

import { assertValidOperationShape } from "../../operation/operation.type.js";

import { apiFailure } from "../../result/apiResult.type.js";

import { APIValidationError } from "../../errors/index.js";

import {
  createAPIContext,
  isValidRequestId,
  normalizeRequestId,
} from "../../context/context.type.js";

import {
  CorrelationIdContextKey,
  TransportContextKey,
} from "../../context/contextKey.type.js";

/**
 * Lists the operations of a source, validating a plain list the way the
 * registry validates on `register`.
 *
 * @throws {TypeError | RangeError} for a malformed operation or a
 * duplicated name in a list.
 */
export function listOperations(source: APIOperationSource): readonly APIOperation[] {
  if (source instanceof APIOperationRegistry) {
    return source.getAll();
  }
  const seen = new Set<string>();
  for (const operation of source) {
    assertValidOperationShape(operation);
    if (seen.has(operation.name)) {
      throw new RangeError(`Operation "${operation.name}" is listed more than once.`);
    }
    seen.add(operation.name);
  }
  return source as readonly APIOperation[];
}

/**
 * One call as a binding describes it to the runner.
 */
export interface APIBoundCall<TSource> {
  readonly operation: APIOperation;
  readonly input: unknown;
  readonly source: TSource;
  readonly transport: APITransportKind;
  /** Untrusted request id from the transport; normalized before use. */
  readonly requestId?: unknown;
  /** Untrusted correlation id; recorded only when it is a safe id. */
  readonly correlationId?: unknown;
  readonly signal?: AbortSignal;
}

/**
 * Outcome of {@link createOperationRunner}'s `run`: the executor's result
 * and the request id the call ran under.
 */
export interface APIBoundOutcome {
  readonly result: APIResult<unknown>;
  readonly requestId: string;
}

/**
 * Creates the function every binding runs calls through, so the context,
 * interceptors, error normalization and internal-error reporting are
 * identical over HTTP, RPC, queues and the CLI. Input carrying a
 * `__proto__`, `constructor` or `prototype` key anywhere is refused with
 * an `APIValidationError` after `state` runs and before the operation
 * does. `run` never throws.
 */
export function createOperationRunner<TSource>(
  options: APIBindingOptions<TSource>,
): (call: APIBoundCall<TSource>) => Promise<APIBoundOutcome> {
  const executor = options.executor ?? new APIExecutor();

  return async (call) => {
    const requestId = normalizeRequestId(call.requestId);
    let result: APIResult<unknown>;

    try {
      const state =
        options.state === undefined ? {} : await options.state(call.source, call.operation);
      const context = createAPIContext(requestId, state, call.signal);
      context.set(TransportContextKey, call.transport);
      if (isValidRequestId(call.correlationId)) {
        context.set(CorrelationIdContextKey, call.correlationId);
      }
      const unsafe = findUnsafeKey(call.input);
      result =
        unsafe === undefined
          ? await executor.execute(call.operation, call.input, context)
          : apiFailure(new APIValidationError(`Input contains the forbidden key "${unsafe}".`));
    } catch (error) {
      result = apiFailure(normalizeAPIError(error, call.operation.name));
    }

    if (!result.ok && !result.error.expose) {
      options.onInternalError?.(result.error, requestId);
    }

    return { result, requestId };
  };
}
