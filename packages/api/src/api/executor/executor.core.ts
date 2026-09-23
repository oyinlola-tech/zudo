import type { APIContext } from "../context/context.type.js";

import type { APIResult } from "../result/apiResult.type.js";

import { apiFailure } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

import { resolveOperationTimeout } from "../operation/operation.type.js";

import type {
  APIInterceptor,
  APIExecutionContext,
} from "../interceptors/interceptor.type.js";

import { APIInternalError } from "../errors/index.js";

import { MAX_INTERCEPTORS, MAX_VALIDATION_ISSUES } from "../constants.js";

import {
  abortedError,
  withContextSignal,
  withDeadline,
} from "./executor.deadline.js";

import { normalizeAPIError } from "./executor.normalize.js";

import type { APIExecutorOptions } from "./executor.type.js";

import {
  validateOperationInput,
  validateOperationOutput,
} from "./executor.validation.js";

export { normalizeAPIError } from "./executor.normalize.js";

export type { APIExecutorOptions } from "./executor.type.js";

export type { APIExecutionContext } from "../interceptors/interceptor.type.js";

type MutableExecutionContext<TInput, TOutput> = Omit<
  APIExecutionContext<TInput, TOutput>,
  "result"
> & { result?: APIResult<TOutput> };

/**
 * Executes an API operation through its interceptor pipeline.
 *
 * Enforces the operation timeout, honors the context AbortSignal, and
 * validates input and output against the operation's `input` / `output`
 * schema (a Standard Schema or a `safeParse` schema such as
 * `@zudojs/schema`). A declared schema of any other kind fails closed
 * with an `APIInternalError`; it is never skipped.
 *
 * Interceptors wrap everything, input validation included: validation
 * runs innermost, on the input the interceptors pass to the handler.
 */
export class APIExecutor {
  private readonly interceptors: readonly APIInterceptor[];

  private readonly exposeValidationMessages: boolean;

  private readonly maxValidationIssues: number;

  constructor(
    optionsOrInterceptors: readonly APIInterceptor[] | APIExecutorOptions = {},
  ) {
    const options: APIExecutorOptions = Array.isArray(optionsOrInterceptors)
      ? { interceptors: optionsOrInterceptors }
      : (optionsOrInterceptors as APIExecutorOptions);

    const interceptors = options.interceptors ?? [];
    if (interceptors.length > MAX_INTERCEPTORS) {
      throw new RangeError(
        `Interceptor pipeline exceeds MAX_INTERCEPTORS (${MAX_INTERCEPTORS}).`,
      );
    }

    const maxValidationIssues =
      options.maxValidationIssues ?? MAX_VALIDATION_ISSUES;
    if (
      !Number.isInteger(maxValidationIssues) ||
      maxValidationIssues < 1 ||
      maxValidationIssues > MAX_VALIDATION_ISSUES
    ) {
      throw new RangeError(
        `maxValidationIssues must be an integer between 1 and ${MAX_VALIDATION_ISSUES}, received ${String(maxValidationIssues)}.`,
      );
    }

    this.interceptors = Object.freeze([...interceptors]);
    this.exposeValidationMessages = options.exposeValidationMessages === true;
    this.maxValidationIssues = maxValidationIssues;
  }

  /**
   * Executes an operation with the given input and context.
   *
   * Order: the interceptors run first, outermost first; input validation
   * runs innermost, immediately before the handler, on the input the
   * interceptors finally pass. So an authentication interceptor refuses an
   * anonymous call before its input is inspected (a 401, not a 422 that
   * describes the schema), logging, metrics and rate-limit interceptors see
   * invalid calls too, and an interceptor that replaces `context.input`
   * cannot bypass the schema.
   */
  async execute<TInput = unknown, TOutput = unknown>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return apiFailure(abortedError(operation.name));
    }

    const executionContext: MutableExecutionContext<TInput, TOutput> = {
      operation,
      input,
      context,
    };

    // Reads `executionContext.input` at call time, so an interceptor that
    // replaces the input before calling `next()` changes what is validated
    // and what the handler receives.
    const executeHandler = (): Promise<APIResult<TOutput>> =>
      this.invokeHandler(operation, executionContext.input, context);

    try {
      return await this.runPipeline(executionContext, executeHandler);
    } catch (error) {
      return apiFailure(normalizeAPIError(error, operation.name));
    }
  }

  /**
   * Validates the input, then invokes the operation handler under its
   * timeout and abort signal, and validates the handler's output against
   * `operation.output`.
   *
   * The handler receives a context whose `signal` aborts when the deadline
   * elapses or the caller's signal aborts, so it can stop its work.
   */
  private async invokeHandler<TInput, TOutput>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return apiFailure(abortedError(operation.name));
    }

    const validated = await validateOperationInput(operation, input, {
      maxIssues: this.maxValidationIssues,
      exposeMessages: this.exposeValidationMessages,
    });
    if (!validated.ok) {
      return apiFailure(validated.error);
    }

    const timeoutMs = resolveOperationTimeout(operation);

    let output: TOutput;
    try {
      output = await withDeadline(
        (signal) =>
          operation.handler(validated.data, withContextSignal(context, signal)),
        timeoutMs,
        operation.name,
        context.signal,
      );
    } catch (error) {
      return apiFailure(normalizeAPIError(error, operation.name));
    }

    return validateOperationOutput(operation, output, this.maxValidationIssues);
  }

  /**
   * Runs the interceptor pipeline (Koa-style dispatch).
   *
   * Each interceptor's `next()` may be awaited at most once; a second
   * call rejects instead of silently re-executing the handler while
   * bypassing downstream interceptors.
   *
   * `context.result` is assigned as each level resolves, so an
   * interceptor reading it after `await next()` sees exactly what the
   * level below returned — including when a downstream interceptor
   * short-circuits without calling `next()`.
   */
  private runPipeline<TInput, TOutput>(
    context: MutableExecutionContext<TInput, TOutput>,
    terminal: () => Promise<APIResult<TOutput>>,
  ): Promise<APIResult<TOutput>> {
    const interceptors = this.interceptors;
    let lastDispatched = -1;

    const dispatch = async (index: number): Promise<APIResult<TOutput>> => {
      if (index <= lastDispatched) {
        throw new APIInternalError(
          "next() called multiple times in interceptor pipeline.",
        );
      }
      lastDispatched = index;

      if (index >= interceptors.length) {
        const result = await terminal();
        context.result = result;
        return result;
      }

      const interceptor = interceptors[index]!;
      const result = await interceptor.intercept(context, () =>
        dispatch(index + 1),
      );
      context.result = result;
      return result;
    };

    return dispatch(0);
  }
}
