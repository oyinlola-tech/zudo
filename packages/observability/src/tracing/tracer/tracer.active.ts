/**
 * @zudojs/observability — Active spans
 *
 * Runs a callback with a span as the active propagation context, so logs
 * and child spans created inside it join the span's trace automatically.
 */

import type { Span, SpanOptions, Tracer } from "../../types.js";
import { SpanStatus } from "../../types.js";
import {
  createPropagationContext,
  createPropagationManager,
  getCurrentContext,
} from "../../propagation/index.js";

const manager = createPropagationManager();

function fail(span: Span, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordError(err);
  span.setStatus(SpanStatus.ERROR, err.message);
  span.end();
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Starts a span, runs `fn` with it as the active context, and ends it.
 *
 * Inside `fn`, `getCurrentContext()` returns a context carrying the span's
 * trace and span IDs (plus the request, correlation, user and baggage of
 * the surrounding context), so log records are correlated with the span and
 * spans started without an explicit parent become its children. The span
 * ends when `fn` returns or, for a promise, when it settles; a throw or a
 * rejection is recorded on the span and re-thrown.
 */
export function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions,
): T {
  const span = tracer.startSpan(name, options);
  const ambient = getCurrentContext();
  const context = createPropagationContext({
    requestId: ambient?.requestId,
    correlationId: ambient?.correlationId,
    userId: ambient?.userId,
    service: ambient?.service,
    baggage: ambient?.baggage,
    traceId: span.context.traceId,
    spanId: span.context.spanId,
    parentSpanId: span.context.parentSpanId,
    traceFlags: span.context.traceFlags,
  });
  return manager.runSync(context, () => {
    let result: T;
    try {
      result = fn(span);
    } catch (error) {
      fail(span, error);
      throw error;
    }
    if (!isThenable(result)) {
      span.end();
      return result;
    }
    return Promise.resolve(result).then(
      (value) => {
        span.end();
        return value;
      },
      (error: unknown) => {
        fail(span, error);
        throw error;
      },
    ) as T;
  });
}
