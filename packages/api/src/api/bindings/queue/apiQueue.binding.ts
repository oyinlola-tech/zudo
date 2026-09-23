import { createJobResult } from "@zudojs/queue";
import type { Job, JobResult, Processor } from "@zudojs/queue";

import type { AnyAPIOperation, APIOperation } from "../../operation/operation.type.js";

import type { APIBindingOptions, APIOperationSource } from "../shared/apiBinding.type.js";

import type { APIBoundCall, APIBoundOutcome } from "../shared/apiBinding.helper.js";

import { createOperationRunner, listOperations } from "../shared/apiBinding.helper.js";

import { toApiWireError } from "../shared/apiWireResult.helper.js";

import { createAPIError } from "../../errors/index.js";

/**
 * Options for the queue binding. `state` receives the `Job` being run.
 */
export type APIQueueBindingOptions = APIBindingOptions<Job<unknown>>;

/**
 * Anything a processor can be registered on — a `Queue` from
 * `@zudojs/queue`, such as `createInMemoryQueue(...)`.
 */
export interface APIQueueTarget<TData> {
  process(name: string, processor: Processor<TData>): void;
}

type Runner = (call: APIBoundCall<Job<unknown>>) => Promise<APIBoundOutcome>;

/**
 * Wraps one operation as a queue processor.
 *
 * `job.data` is the operation input. The operation runs through the
 * executor — validation, interceptors, timeout — under the job's abort
 * signal, with the job id as request id and `job.metadata.correlationId`
 * as correlation id. Success completes the job with the operation's
 * output as its result. A failure throws an `APIError` carrying the same
 * client-safe message and code the other bindings expose (the original
 * is its `cause`), so the queue retries and dead-letters it as usual and
 * `job.error` never holds internal detail; the original error also goes
 * to `onInternalError`.
 *
 * Every failure is retried up to the job's `attempts`, validation
 * failures included — enqueue with `attempts: 1` when input is not
 * already known to be valid.
 */
export function createApiQueueProcessor<TData = unknown>(
  operation: AnyAPIOperation,
  options: APIQueueBindingOptions = {},
): Processor<TData> {
  return buildProcessor<TData>(operation as APIOperation, createOperationRunner(options));
}

/**
 * Registers a processor for every operation, under the operation's name
 * as job name, and returns the job names. Enqueue work with
 * `queue.add(operation.name, input)`.
 */
export function bindApiQueue<TData = unknown>(
  queue: APIQueueTarget<TData>,
  operations: APIOperationSource,
  options: APIQueueBindingOptions = {},
): readonly string[] {
  const run = createOperationRunner(options);
  const names: string[] = [];
  for (const operation of listOperations(operations)) {
    queue.process(operation.name, buildProcessor<TData>(operation, run));
    names.push(operation.name);
  }
  return Object.freeze(names);
}

function buildProcessor<TData>(operation: APIOperation, run: Runner): Processor<TData> {
  return async (job, context): Promise<JobResult<unknown>> => {
    const started = Date.now();
    const { result, requestId } = await run({
      operation,
      input: job.data,
      source: job as Job<unknown>,
      transport: "queue",
      requestId: job.id,
      correlationId: job.metadata?.["correlationId"],
      signal: context.signal,
    });

    if (!result.ok) {
      const wire = toApiWireError(result.error, requestId);
      throw createAPIError(wire.message, {
        code: wire.code,
        statusCode: wire.statusCode,
        expose: result.error.expose,
        cause: result.error,
      });
    }

    // Wrapped in a JobResult so an output that happens to carry a
    // `success` field is not mistaken for a JobResult by the queue.
    return createJobResult(result.data, Date.now() - started);
  };
}
