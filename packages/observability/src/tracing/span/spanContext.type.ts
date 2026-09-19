/**
 * @zudojs/observability — Span Context
 *
 * Factory for creating span context identifiers.
 */

import type { SpanContext } from "../../types.js";
import { TraceFlags } from "../../types.js";
import {
  generateSpanId,
  generateTraceId,
  isValidSpanId,
  isValidTraceId,
} from "../../internal/index.js";

/**
 * True when `context` carries a valid W3C trace ID and span ID.
 *
 * A context that fails this check must never be adopted as a parent: its IDs
 * usually come from an inbound header and would otherwise flow verbatim into
 * every span, log record and exporter.
 */
export function isValidSpanContext(
  context: Pick<SpanContext, "traceId" | "spanId"> | undefined,
): boolean {
  if (context === undefined || context === null) return false;
  return (
    typeof context.traceId === "string" &&
    typeof context.spanId === "string" &&
    isValidTraceId(context.traceId) &&
    isValidSpanId(context.spanId)
  );
}

/**
 * Creates a new span context with cryptographically random IDs.
 *
 * Supplied IDs are validated. An invalid `traceId` or `parentSpanId` starts
 * a fresh trace (new trace ID, no parent) instead of joining a trace the
 * caller cannot vouch for; an invalid `spanId` is replaced with a new one.
 */
export function createSpanContext(options?: {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly traceFlags?: number;
}): SpanContext {
  const traceOk =
    options?.traceId === undefined || isValidTraceId(options.traceId);
  const parentOk =
    options?.parentSpanId === undefined || isValidSpanId(options.parentSpanId);
  const joins = traceOk && parentOk;
  const spanId = options?.spanId;
  return {
    traceId: (joins ? options?.traceId : undefined) ?? generateTraceId(),
    spanId:
      spanId !== undefined && isValidSpanId(spanId) ? spanId : generateSpanId(),
    parentSpanId: joins ? options?.parentSpanId : undefined,
    traceFlags: (joins ? options?.traceFlags : undefined) ?? TraceFlags.NONE,
  };
}

/**
 * Creates a child span context from a parent.
 *
 * The trace ID and the trace flags both carry over: dropping the flags is
 * what makes a parent-based sampler discard every child of a sampled trace.
 * A parent with an invalid trace or span ID is not joined: the result is the
 * root of a fresh trace.
 */
export function createChildSpanContext(
  parent: SpanContext,
  overrides?: { readonly traceFlags?: number },
): SpanContext {
  if (!isValidSpanContext(parent)) {
    return createSpanContext({ traceFlags: overrides?.traceFlags });
  }
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
