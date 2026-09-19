---
"@zudojs/observability": minor
---

Round 10 audit fixes.

- OBS-01: `tracer.startSpan()` without an explicit `parent` now joins the active propagation context, so logs and spans in one request share a `traceId`. New `withSpan(tracer, name, fn, options?)` and `DefaultTracer.startActiveSpan(name, fn, options?)` run a callback with the span as the active context and end it (recording a throw or rejection).
- OBS-02: `createSpanContext`, `createChildSpanContext`, `createPropagationContext` and `startSpan` now validate trace and span IDs. An invalid `traceId`/`parentSpanId` (or an invalid parent) starts a fresh trace and drops its trace flags; an invalid `spanId` is replaced. New `parseTraceparent`, `formatTraceparent`, `TRACEPARENT_HEADER` and `isValidSpanContext`.
- OBS-03: redaction rebuilds objects with `Object.defineProperty`, so an own `__proto__` key stays a data property instead of replacing the output's prototype.
- OBS-04: `onCardinalityLimit` fires once per rejected series (tracked in a bounded seen-set, separate from the overflow cache); the facade raises `onError` once per over-cardinality metric name.
- XP-02: new `toLoggerLevel` / `fromLoggerLevel` convert between this package's `LogLevel` (higher = more severe) and `@zudojs/logger`'s inverted `LoggerLevel` numbers.

Behaviour changes: spans started inside `propagation.run()` are now children of the ambient context (previously a new trace); non-W3C trace/span IDs passed to the context factories are no longer kept verbatim; the facade's `onError` reports cardinality once per metric name instead of once per rejected series.
