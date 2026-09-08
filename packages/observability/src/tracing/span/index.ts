/**
 * @zudojs/observability — Span
 *
 * Span implementation and context creation.
 */

export { DefaultSpan, createSpan } from "./span.core.js";
export {
  createSpanContext,
  createChildSpanContext,
  isSampledContext,
} from "./spanContext.type.js";
