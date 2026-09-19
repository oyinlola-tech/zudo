/**
 * @zudojs/observability — W3C `traceparent` header
 *
 * Parses and formats the W3C Trace Context `traceparent` header, using the
 * same ID validators as the span and propagation factories so an inbound
 * header can never smuggle a malformed ID into a trace.
 */

import type { SpanContext } from "../types.js";
import { isValidSpanId, isValidTraceId } from "../internal/index.js";

/** Name of the W3C trace context header. */
export const TRACEPARENT_HEADER = "traceparent";

const HEX2 = /^[0-9a-f]{2}$/;

/**
 * Parses a `traceparent` header value.
 *
 * Returns the remote span context (its `spanId` is the caller's span, to be
 * used as `parent` when starting the local span), or `undefined` when the
 * header is missing or malformed in any way — including an all-zero trace or
 * span ID, uppercase hex, the forbidden version `ff`, or extra fields on
 * version `00`.
 */
export function parseTraceparent(
  header: string | readonly string[] | undefined | null,
): SpanContext | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return undefined;
  const parts = value.trim().split("-");
  if (parts.length < 4) return undefined;
  const [version, traceId, spanId, flags] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (!HEX2.test(version) || version === "ff") return undefined;
  if (version === "00" && parts.length !== 4) return undefined;
  if (!HEX2.test(flags)) return undefined;
  if (!isValidTraceId(traceId) || !isValidSpanId(spanId)) return undefined;
  return Object.freeze({
    traceId,
    spanId,
    traceFlags: Number.parseInt(flags, 16),
  });
}

/**
 * Formats a span context as a version-`00` `traceparent` header value.
 *
 * Returns `undefined` when the context's trace or span ID is invalid, so a
 * malformed context is never propagated downstream.
 */
export function formatTraceparent(
  context: Pick<SpanContext, "traceId" | "spanId" | "traceFlags">,
): string | undefined {
  if (!isValidTraceId(context.traceId) || !isValidSpanId(context.spanId)) {
    return undefined;
  }
  const flags = (context.traceFlags ?? 0) & 0xff;
  return `00-${context.traceId}-${context.spanId}-${flags
    .toString(16)
    .padStart(2, "0")}`;
}
