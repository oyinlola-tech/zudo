import type { JobResult } from "../jobResult/jobResult.type.js";

import type { QueueMiddleware } from "./middleware.type.js";

import { JobTimeoutError } from "@zudojs/errors";

import { MAX_TIMER_DELAY } from "../retryPolicy/retryPolicy.core.js";

/**
 * Creates a middleware chain from an array of middleware.
 *
 * Each middleware may call `next()` exactly once. A second call throws
 * rather than silently re-entering the chain and running the processor
 * twice.
 */
export function createMiddlewareChain(
  middleware: QueueMiddleware[],
): QueueMiddleware {
  return async (ctx) => {
    let index = -1;

    const dispatch = async (position: number): Promise<JobResult | void> => {
      if (position <= index) {
        throw new Error(
          `Queue middleware at index ${position} called next() more than once.`,
        );
      }

      index = position;

      if (position < middleware.length) {
        const current = middleware[position]!;
        return current({
          ...ctx,
          next: () => dispatch(position + 1),
        });
      }

      return ctx.next();
    };

    return dispatch(0);
  };
}

/**
 * Logging middleware for queue processing.
 */
export function createLoggingMiddleware(logger?: {
  info: (message: string, data?: Record<string, unknown>) => void;
}): QueueMiddleware {
  return async (ctx) => {
    const startTime = Date.now();

    logger?.info("Job processing started", {
      jobId: ctx.job.id,
      jobName: ctx.job.name,
      queueName: ctx.job.queueName,
      attempt: ctx.job.attempt,
    });

    try {
      const result = await ctx.next();
      const duration = Date.now() - startTime;

      logger?.info("Job processing completed", {
        jobId: ctx.job.id,
        jobName: ctx.job.name,
        queueName: ctx.job.queueName,
        duration,
        success: result?.success ?? true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger?.info("Job processing failed", {
        jobId: ctx.job.id,
        jobName: ctx.job.name,
        queueName: ctx.job.queueName,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

/**
 * Timeout middleware for queue processing.
 *
 * The timer is always cleared once the race settles, so a completed job
 * never leaves an armed timer holding the event loop open. When the
 * timeout wins, `onTimeout` is invoked so the caller can abort the job's
 * `AbortSignal` and let a cooperative processor stop its own work.
 */
export function createTimeoutMiddleware(
  timeoutMs: number,
  onTimeout?: () => void,
): QueueMiddleware {
  const delay = Math.min(Math.max(0, timeoutMs), MAX_TIMER_DELAY);

  return async (ctx) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        ctx.next(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            onTimeout?.();
            reject(
              new JobTimeoutError(ctx.job.id, timeoutMs, {
                queueName: ctx.job.queueName,
              }),
            );
          }, delay);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  };
}
