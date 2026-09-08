/**
 * @zudojs/observability — Identifier generation
 *
 * One generator, used by both the propagation context and the span context.
 * IDs come from `node:crypto`, not `Math.random()`: trace, span, request and
 * correlation IDs routinely end up in idempotency keys, log correlation and
 * access decisions, and a predictable stream of them is a liability that a
 * CSPRNG costs nothing to avoid.
 */

import { randomBytes } from "node:crypto";

/** Bytes in a W3C trace ID. */
export const TRACE_ID_BYTES = 16;

/** Bytes in a W3C span ID. */
export const SPAN_ID_BYTES = 8;

const INVALID_TRACE_ID = "0".repeat(TRACE_ID_BYTES * 2);
const INVALID_SPAN_ID = "0".repeat(SPAN_ID_BYTES * 2);

/** Generates a cryptographically random lowercase hex ID. */
export function generateHexId(byteLength: number): string {
  return randomBytes(byteLength).toString("hex");
}

/** Generates a 16-byte trace ID, never the all-zero (invalid) value. */
export function generateTraceId(): string {
  let id = generateHexId(TRACE_ID_BYTES);
  while (id === INVALID_TRACE_ID) id = generateHexId(TRACE_ID_BYTES);
  return id;
}

/** Generates an 8-byte span ID, never the all-zero (invalid) value. */
export function generateSpanId(): string {
  let id = generateHexId(SPAN_ID_BYTES);
  while (id === INVALID_SPAN_ID) id = generateHexId(SPAN_ID_BYTES);
  return id;
}

/** True when `id` is valid lowercase hex of the expected width and non-zero. */
export function isValidId(id: string, byteLength: number): boolean {
  if (id.length !== byteLength * 2) return false;
  if (!/^[0-9a-f]+$/.test(id)) return false;
  return !/^0+$/.test(id);
}

/** True when `traceId` is a valid W3C trace ID. */
export function isValidTraceId(traceId: string): boolean {
  return isValidId(traceId, TRACE_ID_BYTES);
}

/** True when `spanId` is a valid W3C span ID. */
export function isValidSpanId(spanId: string): boolean {
  return isValidId(spanId, SPAN_ID_BYTES);
}
