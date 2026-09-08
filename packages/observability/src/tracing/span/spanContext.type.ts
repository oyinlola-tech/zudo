/**
 * @zudojs/observability — Span Context
 *
 * Factory for creating span context identifiers.
 */

import type { SpanContext } from "../../types.js";
import { TraceFlags } from "../../types.js";
import { generateSpanId, generateTraceId } from "../../internal/index.js";

/** Creates a new span context with cryptographically random IDs. */
export function createSpanContext(options?: {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly traceFlags?: number;
}): SpanContext {
  return {
    traceId: options?.traceId ?? generateTraceId(),
    spanId: options?.spanId ?? generateSpanId(),
    parentSpanId: options?.parentSpanId,
    traceFlags: options?.traceFlags ?? TraceFlags.NONE,
  };
}

/**
 * Creates a child span context from a parent.
 *
 * The trace ID and the trace flags both carry over: dropping the flags is
 * what makes a parent-based sampler discard every child of a sampled trace.
 */
export function createChildSpanContext(
  parent: SpanContext,
  overrides?: { readonly traceFlags?: number },
): SpanContext {
  return createSpanContext({
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    traceFlags: overrides?.traceFlags ?? parent.traceFlags ?? TraceFlags.NONE,
  });
}

/** True when the context carries the W3C sampled flag. */
export function isSampledContext(context: SpanContext): boolean {
  return (
    ((context.traceFlags ?? TraceFlags.NONE) & TraceFlags.SAMPLED) ===
    TraceFlags.SAMPLED
  );
}
