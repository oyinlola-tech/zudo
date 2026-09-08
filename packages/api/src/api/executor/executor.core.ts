import type { APIContext } from "../context/context.type.js";

import type { APIResult } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

import type {
  APIInterceptor,
  APIExecutionContext,
} from "../interceptors/interceptor.type.js";

import {
  APIError,
  APIInternalError,
  APITimeoutError,
  APIValidationError,
  createAPIError,
  isAPIError,
} from "../errors/index.js";

import { DEFAULT_OPERATION_TIMEOUT, MAX_INTERCEPTORS } from "../constants.js";

export type { APIExecutionContext } from "../interceptors/interceptor.type.js";

/**
 * Error normalizer for converting unknown errors into APIError instances.
 *
 * APIErrors pass through untouched. Other errors are wrapped in
 * APIInternalError (`expose: false`), preserving the original message and
 * error for logging via `cause` while keeping internals out of anything
 * a transport would serialize to a client.
 */
export function normalizeAPIError(
  error: unknown,
  operationName?: string,
): APIError {
  if (isAPIError(error)) {
    return error;
  }
  if (error instanceof Error) {
    const wrapped = new APIInternalError(error.message);
    // The published @zudojs/errors 0.1.0 constructor doesn't accept
    // `cause`; the field is a plain writable property on BaseError.
    // Switch to `new APIInternalError(msg, { cause })` once this package
    // depends on the next @zudojs/errors release.
    (wrapped as { cause?: unknown }).cause = error;
    return wrapped;
  }
  return new APIInternalError(
    `Unexpected non-error thrown in operation "${operationName}": ${String(error)}`,
  );
}

/**
 * Minimal Standard Schema (https://standardschema.dev) shape.
 *
 * Zod, Valibot, ArkType, and other libraries implement this interface,
 * so operation input schemas from any of them validate without the api
 * package depending on a specific validation library.
 */
interface StandardSchemaLike {
  readonly "~standard": {
    readonly version: number;
    readonly vendor: string;
    validate(
      value: unknown,
    ): StandardSchemaResult | Promise<StandardSchemaResult>;
  };
}

type StandardSchemaResult =
  | { readonly value: unknown; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

function isStandardSchema(value: unknown): value is StandardSchemaLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, { validate?: unknown }>)["~standard"]
      ?.validate === "function"
  );
}

type MutableExecutionContext<TInput, TOutput> = Omit<
  APIExecutionContext<TInput, TOutput>,
  "result"
> & { result?: APIResult<TOutput> };

/**
 * Executes an API operation through its interceptor pipeline.
 *
 * Enforces the operation timeout, honors the context AbortSignal, and
 * validates input when the operation's `input` is a Standard Schema.
 */
export class APIExecutor {
  private readonly interceptors: readonly APIInterceptor[];

  constructor(interceptors: readonly APIInterceptor[] = []) {
    if (interceptors.length > MAX_INTERCEPTORS) {
      throw new RangeError(
        `Interceptor pipeline exceeds MAX_INTERCEPTORS (${MAX_INTERCEPTORS}).`,
      );
    }
    this.interceptors = Object.freeze([...interceptors]);
  }

  /**
   * Executes an operation with the given input and context.
   */
  async execute<TInput = unknown, TOutput = unknown>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return { ok: false, error: abortedError(operation.name) };
    }

    let effectiveInput = input;
    if (isStandardSchema(operation.input)) {
      try {
        const validation = await operation.input["~standard"].validate(input);
        if (validation.issues) {
          return {
            ok: false,
            error: new APIValidationError(
              `Invalid input for operation "${operation.name}".`,
              validation.issues.map((issue) => issue.message),
            ),
          };
        }
        effectiveInput = validation.value as TInput;
      } catch (error) {
        return { ok: false, error: normalizeAPIError(error, operation.name) };
      }
    }

    const executionContext: MutableExecutionContext<TInput, TOutput> = {
      operation,
      input: effectiveInput,
      context,
    };

    const executeHandler = async (): Promise<APIResult<TOutput>> => {
      const result = await this.invokeHandler(
        operation,
        effectiveInput,
        context,
      );
      executionContext.result = result;
      return result;
    };

    try {
      const result = await this.runPipeline(executionContext, executeHandler);
      executionContext.result = result;
      return result;
    } catch (error) {
      return { ok: false, error: normalizeAPIError(error, operation.name) };
    }
  }

  /**
   * Invokes the operation handler under its timeout and abort signal.
   */
  private async invokeHandler<TInput, TOutput>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return { ok: false, error: abortedError(operation.name) };
    }

    const timeoutMs =
      operation.timeout ??
      operation.metadata?.timeout ??
      DEFAULT_OPERATION_TIMEOUT;

    try {
      const output = await withDeadline(
        operation.handler(input, context),
        timeoutMs,
        operation.name,
        context.signal,
      );
      return { ok: true, data: output };
    } catch (error) {
      return { ok: false, error: normalizeAPIError(error, operation.name) };
    }
  }

  /**
   * Runs the interceptor pipeline (Koa-style dispatch).
   *
   * Each interceptor's `next()` may be awaited at most once; a second
   * call rejects instead of silently re-executing the handler while
   * bypassing downstream interceptors.
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
        return terminal();
      }

      const interceptor = interceptors[index]!;
      return interceptor.intercept(context, () => dispatch(index + 1));
    };

    return dispatch(0);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function abortedError(operationName: string): APIError {
  return createAPIError(`Operation "${operationName}" was aborted.`, {
    statusCode: 499,
    expose: true,
  });
}

/**
 * Awaits a handler promise, rejecting when the timeout elapses or the
 * abort signal fires. The handler itself keeps running (promises are not
 * cancellable), but the caller stops waiting and resources are released.
 */
function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  signal?: AbortSignal,
): Promise<T> {
  const useTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  if (!useTimeout && !signal) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(abortedError(operationName));
    };

    if (useTimeout) {
      timer = setTimeout(() => {
        cleanup();
        reject(new APITimeoutError(timeoutMs));
      }, timeoutMs);
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
