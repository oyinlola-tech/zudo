import { BaseError } from "@zudojs/errors";

import type {
  Command,
  Query,
  CqrsContext,
  CqrsMiddleware,
  CommandMiddleware,
  QueryMiddleware,
} from "../cqrsTypes/cqrsTypes.type.js";

import {
  CqrsError,
  CqrsValidationError,
  InvalidMiddlewareError,
  MiddlewareExecutionError,
} from "../cqrsErrors/cqrsError.base.js";

/**
 * Next function used by middleware.
 */
export type CqrsNext = <TRequest extends Command | Query>(
  request: TRequest,
  context?: CqrsContext,
) => Promise<unknown>;

/**
 * Configuration for middleware execution.
 */
export interface MiddlewareOptions {
  readonly name?: string;
  readonly enabled?: boolean;
}

/**
 * Measurement reported by `timingMiddleware` after every execution.
 */
export interface CqrsTiming {
  /**
   * Name given to the middleware (`options.name`, default `"timing"`).
   */
  readonly name: string;

  /**
   * The request that was executed.
   */
  readonly request: Command | Query;

  /**
   * The execution context the middleware received.
   */
  readonly context: CqrsContext | undefined;

  /**
   * Wall-clock duration of everything downstream of the middleware.
   */
  readonly durationMs: number;

  /**
   * Whether the downstream execution resolved (`true`) or threw.
   */
  readonly succeeded: boolean;

  /**
   * The error thrown downstream, when `succeeded` is `false`.
   */
  readonly error?: unknown;
}

/**
 * Options for `timingMiddleware`.
 */
export interface TimingMiddlewareOptions extends MiddlewareOptions {
  /**
   * Receives the measurement after each execution (success or failure).
   * Errors thrown by the callback propagate to the caller.
   *
   * Optional: measurements are always exposed through
   * `TimingMiddleware.lastTiming` as well.
   */
  readonly onTiming?: (timing: CqrsTiming) => void | Promise<void>;

  /**
   * Monotonic clock in milliseconds. Defaults to `performance.now()`.
   */
  readonly now?: () => number;
}

/**
 * Middleware returned by `timingMiddleware`.
 *
 * Besides acting as ordinary middleware it exposes the most recent
 * measurement, so timings are observable even without an `onTiming`
 * callback.
 */
export interface TimingMiddleware extends CqrsMiddleware {
  /**
   * Measurement of the most recent execution, or `undefined` before the
   * first execution completes.
   */
  readonly lastTiming: CqrsTiming | undefined;

  /**
   * Number of executions measured so far.
   */
  readonly count: number;
}

/**
 * Middleware that measures command or query execution time.
 *
 * Every measurement is reported through `options.onTiming` (when given)
 * and stored on the returned middleware as `lastTiming`.
 */
export function timingMiddleware(
  options: TimingMiddlewareOptions = {},
): TimingMiddleware {
  if (options.onTiming !== undefined && typeof options.onTiming !== "function") {
    throw new InvalidMiddlewareError(
      "timingMiddleware onTiming must be a function.",
    );
  }

  if (options.now !== undefined && typeof options.now !== "function") {
    throw new InvalidMiddlewareError(
      "timingMiddleware now must be a function.",
    );
  }

  const name = options.name ?? "timing";

  const now = options.now ?? (() => performance.now());

  const onTiming = options.onTiming;

  let lastTiming: CqrsTiming | undefined;

  let count = 0;

  const record = async (timing: CqrsTiming): Promise<void> => {
    lastTiming = timing;

    count += 1;

    if (onTiming) {
      await onTiming(timing);
    }
  };

  const middleware = async (
    request: Command | Query,
    context: CqrsContext | undefined,
    next: (request: Command | Query, context?: CqrsContext) => Promise<unknown>,
  ): Promise<unknown> => {
    if (options.enabled === false) {
      return next(request, context);
    }

    const startedAt = now();

    let result: unknown;

    try {
      result = await next(request, context);
    } catch (error) {
      await record({
        name,
        request,
        context,
        durationMs: now() - startedAt,
        succeeded: false,
        error,
      });

      throw error;
    }

    await record({
      name,
      request,
      context,
      durationMs: now() - startedAt,
      succeeded: true,
    });

    return result;
  };

  Object.defineProperty(middleware, "lastTiming", {
    enumerable: true,
    get: () => lastTiming,
  });

  Object.defineProperty(middleware, "count", {
    enumerable: true,
    get: () => count,
  });

  return middleware as TimingMiddleware;
}

/**
 * Middleware that catches unknown exceptions and normalizes them
 * into `CqrsError` instances.
 *
 * `BaseError` instances (including every CQRS error) pass through
 * unchanged.
 */
export function errorMiddleware(
  options: MiddlewareOptions = {},
): CqrsMiddleware {
  return async (request, context, next) => {
    if (options.enabled === false) {
      return next(request, context);
    }

    try {
      return await next(request, context);
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }

      throw new CqrsError(
        error instanceof Error ? error.message : "CQRS execution failed.",
        {
          expose: false,
          isOperational: false,
          cause: error,
          metadata: {
            requestType: getRequestType(request),
          },
        },
      );
    }
  };
}

/**
 * Middleware that validates the basic CQRS request structure and throws
 * `CqrsValidationError` when it is malformed.
 */
export function validationMiddleware(
  options: MiddlewareOptions = {},
): CqrsMiddleware {
  return async (request, context, next) => {
    if (options.enabled === false) {
      return next(request, context);
    }

    if (
      !request ||
      typeof request !== "object" ||
      typeof request.type !== "string" ||
      request.type.trim().length === 0
    ) {
      throw new CqrsValidationError(
        "A valid CQRS request with a type is required.",
      );
    }

    return next(request, context);
  };
}

/**
 * Middleware that adds execution metadata to the CQRS context.
 */
export function contextMiddleware(
  options: MiddlewareOptions = {},
): CqrsMiddleware {
  return async (request, context, next) => {
    if (options.enabled === false) {
      return next(request, context);
    }

    const enrichedContext: CqrsContext = {
      ...(context ?? {}),
      metadata: {
        ...(context?.metadata ?? {}),
        cqrsRequestType: getRequestType(request),
      },
    };

    return next(request, enrichedContext);
  };
}

/**
 * Lock implementation used by `lockMiddleware`.
 *
 * `acquire` must resolve to a release function.
 */
export interface CqrsLock {
  acquire(key: string): (() => void) | Promise<() => void>;
}

/**
 * Options for `lockMiddleware`.
 */
export interface LockMiddlewareOptions extends MiddlewareOptions {
  /**
   * Derives the lock key from the request. Defaults to `request.type`,
   * which serialises every request of that type.
   */
  readonly key?: (request: Command | Query, context?: CqrsContext) => string;
}

/**
 * Creates locking middleware that prevents concurrent execution of
 * requests sharing the same lock key.
 */
export function lockMiddleware(
  lock: CqrsLock,
  options: LockMiddlewareOptions = {},
): CqrsMiddleware {
  if (!lock || typeof lock.acquire !== "function") {
    throw new InvalidMiddlewareError(
      "A valid CQRS lock implementation with an acquire() method is required.",
    );
  }

  if (options.key !== undefined && typeof options.key !== "function") {
    throw new InvalidMiddlewareError(
      "lockMiddleware key selector must be a function.",
    );
  }

  return async (request, context, next) => {
    if (options.enabled === false) {
      return next(request, context);
    }

    const key = options.key
      ? options.key(request, context)
      : (getRequestType(request) ?? "");

    const release = await lock.acquire(key);

    if (typeof release !== "function") {
      throw new InvalidMiddlewareError(
        `CQRS lock acquire() must resolve to a release function (key "${key}").`,
        {
          lockKey: key,
        },
      );
    }

    try {
      return await next(request, context);
    } finally {
      release();
    }
  };
}

/**
 * Adapts command-specific middleware to generic CQRS middleware.
 */
export function commandMiddleware(
  middleware: CommandMiddleware,
): CqrsMiddleware {
  return async (request, context, next) => {
    return middleware(
      request as Command,
      context,
      async (command, nextContext) => next(command, nextContext),
    );
  };
}

/**
 * Adapts query-specific middleware to generic CQRS middleware.
 */
export function queryMiddleware(middleware: QueryMiddleware): CqrsMiddleware {
  return async (request, context, next) => {
    return middleware(request as Query, context, async (query, nextContext) =>
      next(query, nextContext),
    );
  };
}

/**
 * Combines multiple middleware functions into a single middleware.
 *
 * Each middleware may call `next()` at most once per execution; a second
 * call throws `MiddlewareExecutionError`. The command and query buses
 * build their pipelines with this function, so the same rule applies
 * there.
 */
export function composeMiddleware(
  middleware: readonly CqrsMiddleware[],
): CqrsMiddleware {
  const stack = [...middleware];

  return async (request, context, terminal) => {
    let index = -1;

    const dispatch = async (
      currentIndex: number,
      currentRequest: Command | Query,
      currentContext?: CqrsContext,
    ): Promise<unknown> => {
      if (currentIndex <= index) {
        throw new MiddlewareExecutionError();
      }

      index = currentIndex;

      const current = stack[currentIndex];

      if (!current) {
        return terminal(currentRequest, currentContext);
      }

      return current(
        currentRequest,
        currentContext,
        (nextRequest, nextContext) =>
          dispatch(currentIndex + 1, nextRequest, nextContext),
      );
    };

    return dispatch(0, request, context);
  };
}

/**
 * Creates a middleware that runs a callback before execution.
 */
export function beforeMiddleware(
  callback: (
    request: Command | Query,
    context?: CqrsContext,
  ) => void | Promise<void>,
): CqrsMiddleware {
  return async (request, context, next) => {
    await callback(request, context);

    return next(request, context);
  };
}

/**
 * Creates a middleware that runs a callback after successful execution.
 */
export function afterMiddleware(
  callback: (
    request: Command | Query,
    result: unknown,
    context?: CqrsContext,
  ) => void | Promise<void>,
): CqrsMiddleware {
  return async (request, context, next) => {
    const result = await next(request, context);

    await callback(request, result, context);

    return result;
  };
}

/**
 * Creates a middleware that runs a callback when execution fails.
 */
export function onErrorMiddleware(
  callback: (
    request: Command | Query,
    error: unknown,
    context?: CqrsContext,
  ) => void | Promise<void>,
): CqrsMiddleware {
  return async (request, context, next) => {
    try {
      return await next(request, context);
    } catch (error) {
      await callback(request, error, context);

      throw error;
    }
  };
}

/**
 * Reads the request discriminator defensively.
 *
 * Validation now runs inside the pipeline, so middleware may observe a
 * malformed request before the bus rejects it.
 */
function getRequestType(request: unknown): string | undefined {
  if (typeof request !== "object" || request === null) {
    return undefined;
  }

  const type = (request as { type?: unknown }).type;

  return typeof type === "string" ? type : undefined;
}
