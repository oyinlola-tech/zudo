/**
 * @zudojs/observability — Tracer parent resolution
 *
 * Decides which context a new span joins: the explicit `parent` when it is
 * valid, otherwise the ambient propagation context, otherwise none.
 */

import type { SpanContext } from "../../types.js";
import { getCurrentContext } from "../../propagation/index.js";
import { isValidSpanContext } from "../span/spanContext.type.js";

/** The parent a span joins, and the parent the sampler should consult. */
export interface ResolvedSpanParent {
  /** Context the new span becomes a child of; `undefined` starts a trace. */
  readonly parent?: SpanContext;
  /**
   * Context handed to the sampler. `undefined` when no upstream sampling
   * decision exists, so the root sampler decides — an ambient context
   * created without trace flags is not a "not sampled" parent.
   */
  readonly samplerParent?: SpanContext;
}

/**
 * Resolves the parent for a new span.
 *
 * An explicit parent with invalid IDs is never joined (the span starts a
 * fresh trace). Without an explicit parent, the span joins the active
 * propagation context so logs and spans written in one request share one
 * trace ID.
 */
export function resolveSpanParent(explicit?: SpanContext): ResolvedSpanParent {
  if (explicit !== undefined) {
    return isValidSpanContext(explicit)
      ? { parent: explicit, samplerParent: explicit }
      : {};
  }
  const ambient = getCurrentContext();
  if (!ambient || !isValidSpanContext(ambient)) return {};
  const parent: SpanContext = {
    traceId: ambient.traceId,
    spanId: ambient.spanId,
    traceFlags: ambient.traceFlags,
  };
  return {
    parent,
    samplerParent: ambient.traceFlags === undefined ? undefined : parent,
  };
}
