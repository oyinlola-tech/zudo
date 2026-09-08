/**
 * Built-in middleware for common concerns.
 *
 * @module middlewareUtils/middlewareUtils
 */

import type { NamedMiddleware } from "../middlewareTypes/middlewareDefinition.type.js";
import {
  MiddlewareError,
  MiddlewareRateLimitError,
  MiddlewareTimeoutError,
} from "../middlewareErrors/middlewareError.base.js";

export interface LoggingContext {
  readonly requestId?: string;
  readonly path?: string;
  readonly method?: string;
}

/** Longest field value written into a log line before truncation. */
const MAX_LOG_FIELD_LENGTH = 256;

/** Control characters, which are what let a value break out of its log line. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Make a caller-supplied value safe to write into a single-line log.
 *
 * CR and LF above all are what let a request path forge extra log lines, so
 * control characters are escaped rather than dropped — the original stays
 * visible without being able to break out of its line.
 */
export function sanitizeLogValue(
  value: unknown,
  maxLength: number = MAX_LOG_FIELD_LENGTH,
): string {
  const text = typeof value === "string" ? value : String(value);
  const escaped = text.replace(CONTROL_CHARACTERS, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
  return escaped.length > maxLength
    ? `${escaped.slice(0, maxLength)}…`
    : escaped;
}

/** Options for {@link loggingMiddleware}. */
export interface LoggingOptions {
  /**
   * Include the failing error's message in the completion line.
   * Defaults to `false`: error messages routinely carry connection strings,
   * tokens and user data, and the pipeline already surfaces the error object
   * to the caller.
   */
  readonly includeErrorMessage?: boolean;
  /** Longest field value written before truncation. Default: 256. */
  readonly maxFieldLength?: number;
}

/**
 * Create a logging middleware.
 *
 * Logs request start, completion, and errors. Every interpolated field is
 * escaped, so a path containing newlines cannot forge log lines.
 */
export function loggingMiddleware<TResult = void>(
  logger?: (msg: string) => void,
  options?: LoggingOptions,
): NamedMiddleware<LoggingContext, TResult> {
  const log = logger ?? ((msg: string) => console.log(msg));
  const maxFieldLength = options?.maxFieldLength ?? MAX_LOG_FIELD_LENGTH;
  const includeErrorMessage = options?.includeErrorMessage ?? false;

  return {
    name: "logging",
    handler: async (ctx, next) => {
      const start = performance.now();
      const method = sanitizeLogValue(ctx.method ?? "UNKNOWN", maxFieldLength);
      const path = sanitizeLogValue(ctx.path ?? "/", maxFieldLength);
      log(`[middleware] → ${method} ${path}`);
      try {
        const result = await next();
        const ms = (performance.now() - start).toFixed(1);
        log(`[middleware] ✓ completed in ${ms}ms`);
        return result;
      } catch (error) {
        const ms = (performance.now() - start).toFixed(1);
        const detail = includeErrorMessage
          ? `: ${sanitizeLogValue(
              error instanceof Error ? error.message : error,
              maxFieldLength,
            )}`
          : "";
        log(`[middleware] ✗ failed in ${ms}ms${detail}`);
        throw error;
      }
    },
  };
}

/**
 * Create an error-handling middleware.
 *
 * Reports errors through `onError` and rethrows them. A reporter that throws
 * cannot replace the error it was reporting — its own failure goes to
 * `onReporterError` instead.
 */
export function errorMiddleware<TResult = void>(
  onError?: (error: unknown, ctx: unknown) => void,
  onReporterError?: (error: unknown) => void,
): NamedMiddleware<unknown, TResult> {
  return {
    name: "error-handler",
    priority: 0,
    handler: async (ctx, next) => {
      try {
        return await next();
      } catch (error) {
        try {
          onError?.(error, ctx);
        } catch (reporterError) {
          onReporterError?.(reporterError);
        }
        throw error;
      }
    },
  };
}

/** Options for {@link timeoutMiddleware}. */
export interface TimeoutOptions {
  /** Name reported in the timeout error. Default: `"timeout"`. */
  readonly name?: string;
}

/**
 * Create a timeout middleware.
 *
 * Rejects with a {@link MiddlewareTimeoutError} if the rest of the pipeline
 * takes too long. The timer is always cleared, so a fast request leaves
 * nothing pending on the event loop, and the losing promise stays handled so
 * a late rejection cannot surface as an unhandled rejection.
 *
 * The downstream work is not cancelled — nothing in the middleware contract
 * can cancel it. Use the pipeline's `signal` option, or carry an
 * `AbortSignal` on your own context, when the work itself needs to stop.
 */
export function timeoutMiddleware<TContext, TResult = void>(
  timeoutMs: number,
  options?: TimeoutOptions,
): NamedMiddleware<TContext, TResult> {
  const name = options?.name ?? "timeout";

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new MiddlewareError(
      `Timeout must be a positive, finite number of milliseconds; received ${timeoutMs}`,
      { middlewareName: name },
    );
  }

  return {
    name: "timeout",
    handler: async (_ctx, next) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const pending = next();
      // Keep the loser of the race handled: if the timeout wins and the
      // downstream work rejects later, that rejection must not escape.
      void pending.catch(() => {});

      try {
        return await Promise.race([
          pending,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new MiddlewareTimeoutError(name, timeoutMs));
            }, timeoutMs);
            if (typeof timer === "object" && "unref" in timer) {
              timer.unref();
            }
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}

/** Options for {@link rateLimitMiddleware}. */
export interface RateLimitOptions {
  /**
   * Maximum number of distinct keys tracked at once. When the limit is
   * reached, expired keys are swept and — if that is not enough — the
   * least-recently-seen keys are evicted. Default: 10,000.
   *
   * Keys are usually caller-controlled (an IP, an API key, a tenant), so an
   * unbounded map is a memory sink an attacker can drive.
   */
  readonly maxKeys?: number;
  /** How often expired keys are swept, in milliseconds. Default: 60,000. */
  readonly sweepIntervalMs?: number;
  /**
   * Reject requests that arrive with no key instead of pooling them into a
   * single shared bucket. Default: `false`, preserving the shared bucket.
   */
  readonly rejectUnkeyed?: boolean;
}

/** A rate limiter's live view of one key. */
export interface RateLimitState {
  /** Requests counted in the current window. */
  readonly count: number;
  /** Milliseconds until the oldest request leaves the window. */
  readonly retryAfterMs: number;
}

/** The middleware returned by {@link rateLimitMiddleware}. */
export interface RateLimitMiddleware<
  TContext,
  TResult = void,
> extends NamedMiddleware<TContext, TResult> {
  /** Inspect a key's current window. Exposed for metrics and tests. */
  readonly inspect: (key: string) => RateLimitState | undefined;
  /** Number of keys currently tracked. */
  readonly size: () => number;
  /** Drop all tracked keys. */
  readonly reset: () => void;
}

/**
 * Create a rate-limiting middleware.
 *
 * Implements a true sliding window: each key keeps the timestamps of its
 * requests within `windowMs`, so a client cannot burst `2 × maxRequests`
 * across a window boundary the way a fixed-window counter allows.
 *
 * Rejections throw {@link MiddlewareRateLimitError}, which carries
 * `retryAfterMs` for an HTTP adapter to turn into a 429 with `Retry-After`.
 *
 * State is per-instance and in-process. Behind more than one instance of a
 * service, each process enforces its own limit; use a shared store for a
 * cluster-wide one.
 */
export function rateLimitMiddleware<
  TContext extends { readonly key?: string },
  TResult = void,
>(
  maxRequests: number,
  windowMs: number,
  options?: RateLimitOptions,
): RateLimitMiddleware<TContext, TResult> {
  if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
    throw new MiddlewareError(
      `maxRequests must be a positive integer; received ${maxRequests}`,
      { middlewareName: "rate-limit" },
    );
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new MiddlewareError(
      `windowMs must be a positive, finite number; received ${windowMs}`,
      { middlewareName: "rate-limit" },
    );
  }

  const maxKeys = options?.maxKeys ?? 10_000;
  const sweepIntervalMs = options?.sweepIntervalMs ?? 60_000;
  const rejectUnkeyed = options?.rejectUnkeyed ?? false;

  /** key → request timestamps inside the current window, oldest first. */
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();

  function prune(timestamps: readonly number[], now: number): number[] {
    const cutoff = now - windowMs;
    let firstLive = 0;
    while (firstLive < timestamps.length && timestamps[firstLive]! <= cutoff) {
      firstLive++;
    }
    return timestamps.slice(firstLive);
  }

  function sweep(now: number): void {
    for (const [key, timestamps] of hits) {
      const live = prune(timestamps, now);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
    lastSweep = now;
  }

  function enforceKeyBudget(now: number): void {
    if (hits.size <= maxKeys) return;
    sweep(now);
    // Map preserves insertion order and every touch re-inserts, so the head
    // of the iteration order is the least recently seen key.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next();
      if (oldest.done === true) break;
      hits.delete(oldest.value);
    }
  }

  return {
    name: "rate-limit",

    inspect(key: string): RateLimitState | undefined {
      const now = Date.now();
      const live = prune(hits.get(key) ?? [], now);
      if (live.length === 0) return undefined;
      return {
        count: live.length,
        retryAfterMs: Math.max(0, live[0]! + windowMs - now),
      };
    },

    size(): number {
      return hits.size;
    },

    reset(): void {
      hits.clear();
    },

    handler: async (ctx, next) => {
      const now = Date.now();

      if (ctx.key === undefined && rejectUnkeyed) {
        throw new MiddlewareError(
          "Rate-limited request carried no key and unkeyed requests are rejected",
          { middlewareName: "rate-limit" },
        );
      }
      const key = ctx.key ?? "global";

      if (now - lastSweep >= sweepIntervalMs) sweep(now);

      const live = prune(hits.get(key) ?? [], now);

      if (live.length >= maxRequests) {
        hits.set(key, live);
        const retryAfterMs = Math.max(1, live[0]! + windowMs - now);
        throw new MiddlewareRateLimitError(maxRequests, windowMs, retryAfterMs);
      }

      live.push(now);
      // Delete first so the re-insert moves the key to the end of the
      // iteration order, which is what makes eviction least-recently-seen.
      hits.delete(key);
      hits.set(key, live);
      enforceKeyBudget(now);

      return next();
    },
  };
}
