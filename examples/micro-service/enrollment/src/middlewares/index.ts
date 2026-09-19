import type { Logger } from "@zudojs/logger";

/** Context passed to each middleware invocation. */
export interface MiddlewareContext {
  /** HTTP method. */
  readonly method: string;
  /** Request path. */
  readonly path: string;
  /** Unique request identifier. */
  readonly requestId: string;
  /** Request start timestamp. */
  readonly startTime: number;
}

/** Next function that continues the middleware chain. */
export type NextFunction = () => Promise<void>;

/** Middleware function signature. */
export type Middleware = (
  ctx: MiddlewareContext & { logger?: Logger },
  next: NextFunction,
) => Promise<void>;

/**
 * Creates a logging middleware that logs request start and completion.
 * @param logger - The logger instance.
 * @returns A middleware function.
 */
export function createLoggingMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    logger.info(`${ctx.method} ${ctx.path}`, { requestId: ctx.requestId });
    await next();
    const duration = Date.now() - ctx.startTime;
    logger.info(`${ctx.method} ${ctx.path} completed`, {
      requestId: ctx.requestId,
      duration,
    });
  };
}

/**
 * Creates an error-handling middleware that catches and logs errors.
 * @param logger - The logger instance.
 * @returns A middleware function.
 */
export function createErrorMiddleware(logger: Logger): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const err = error as Error;
      logger.error(`${ctx.method} ${ctx.path} failed`, {
        requestId: ctx.requestId,
        error: err.message,
        stack: err.stack,
      });
      throw error;
    }
  };
}

/**
 * Creates a request ID middleware that assigns a unique ID to each request.
 * @returns A middleware function.
 */
export function createRequestIdMiddleware(): Middleware {
  return async (ctx, next) => {
    (ctx as any).requestId =
      `req:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await next();
  };
}
