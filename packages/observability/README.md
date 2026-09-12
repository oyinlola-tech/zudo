# @zudojs/observability

Structured logging, metrics, tracing, context propagation, and telemetry exporters for Zudojs applications.

## Installation

```bash
npm install @zudojs/observability
```

## Quick Start

`createObservability` is the entry point. It wires the logger, the metrics
registry, the tracer and the propagation manager into one object, and owns
their shutdown.

```typescript
import {
  createObservability,
  createProbabilitySampler,
  LogLevel,
} from "@zudojs/observability";

const obs = createObservability({
  serviceName: "checkout-api",
  serviceVersion: "1.4.0",
  environment: "production",
  logLevel: LogLevel.INFO,

  // Opt in to redaction — see "Redaction" below.
  redaction: {},

  // Sample 10% of traces. The decision is derived from the trace ID, so a
  // trace is never sampled in half across services.
  sampler: createProbabilitySampler(0.1),

  // Console exporters are the development default; turn them off in
  // production and supply real ones.
  useConsoleExporters: false,
});

obs.logger.info("server started", { port: 3000 });
obs.metrics.counter("http.requests.total", { route: "/checkout" }).increment();

const span = obs.tracer.startSpan("handle-request");
span.setAttribute("http.method", "POST");
span.end();

await obs.shutdown(); // drains every buffer, then closes the exporters
```

## Logging

Records are structured, level-filtered, and stamped with the ambient trace.

```typescript
obs.logger.info("order placed", { orderId: 42 });

// An Error goes in the third parameter. Putting it in the context would
// serialize to {} — Error's fields are non-enumerable.
obs.logger.error("charge failed", { orderId: 42 }, error);

const child = obs.logger.child("payments", { provider: "stripe" });
child.setLevel(LogLevel.DEBUG); // adjustable at runtime
await obs.logger.flush();
```

Every record carries `traceId` and `spanId` when a propagation context is
active, so logs and traces line up without threading IDs by hand.

## Redaction

Redaction is off unless you configure it, and on once you do. The logger
applies it to every record before any transport sees it, and the tracer
applies it to every span attribute and span event attribute before any
processor or exporter sees it — a `Bearer` token attached to a span is
redacted the same way one written to a log field is.

```typescript
const obs = createObservability({
  serviceName: "api",
  redaction: {
    // Defaults cover passwords, tokens, cookies, keys and card numbers.
    fields: ["password", "token", "ssn"],
    patterns: [/^x-.*-secret$/i],
    // "contains" (the default) matches on word boundaries: "userPassword"
    // and "x-api-key" match, "shippingAddress" and "authorId" do not.
    matchMode: "contains",
    replacement: "[REDACTED]",
  },
});

obs.logger.info("login", {
  username: "ada",
  password: "hunter2", // → "[REDACTED]"
  headers: [{ authorization: "…" }], // arrays are traversed too
});
```

Traversal handles the shapes secrets actually arrive in: arrays, nested
objects, instances of your own classes (a DTO carrying a `password` field is
redacted and keeps its prototype), and cyclic graphs (a request object in a log
context becomes `[CIRCULAR]` rather than a stack overflow). Built-ins —
`Error`, `Date`, `Map`, `Set`, typed arrays, `URL` — are left intact instead of
being flattened to `{}`.

`redactObject`, `redactValue` and `createStructureRedactor` are exported for
use outside the logger.

## Metrics

Counters, gauges and histograms, keyed by name **and** labels.

```typescript
obs.metrics.counter("jobs.processed", { queue: "email" }).increment();
obs.metrics.gauge("queue.depth", { queue: "email" }).setValue(17);

const latency = obs.metrics.histogram("http.duration", { route: "/checkout" });
latency.record(87);

const value = latency.getValue();
value.p95; // interpolated from the bucket boundaries
value.mean;
```

Histograms keep cumulative buckets, so `p50`/`p90`/`p95`/`p99` are real
answers rather than something you have to reconstruct from count and sum.
Pass your own boundaries when the unit is not milliseconds.

Values that cannot be aggregated — `NaN`, `Infinity`, a negative counter
increment — throw a `MetricValueError` rather than being silently dropped.

**Cardinality.** The registry caps the number of distinct series (default
10,000). A label carrying a user ID is the usual way to blow past that, and
the cap turns an unbounded memory leak into a reported error. Lower it — or
set the histogram boundaries used registry-wide — through `metrics`:

```typescript
const obs = createObservability({
  serviceName: "api",
  metrics: { maxSeries: 2_000 },
  onError: (error, source) => report(error, source), // cardinality is reported here
});
```

One metric name may only ever be one type: registering `counter("latency")`
and then `histogram("latency")` throws, because a document carrying the same
name as two types is rejected wholesale by OTLP and Prometheus.

Metrics are exported by a `PeriodicMetricReader`, which the facade starts for
you when a `metricExporter` is configured. `metricExportIntervalMs: 0`
disables the periodic export while still collecting a final snapshot on
`flush()` and `shutdown()`:

```typescript
const obs = createObservability({
  serviceName: "api",
  metricExporter: myExporter,
  metricExportIntervalMs: 30_000,
});
```

## Tracing

```typescript
const span = obs.tracer.startSpan("db.query", { kind: SpanKind.CLIENT });
try {
  span.setAttribute("db.statement", sql);
  return await run(sql);
} catch (error) {
  span.recordError(error as Error);
  throw error;
} finally {
  span.end();
}
```

Spans are capped: 128 attributes, 128 events, 4096-character values by
default, with the overflow counted in `droppedAttributes` / `droppedEvents`.
Durations use a monotonic clock, so a clock adjustment cannot produce a
negative one. `setStatus(status, message)` keeps the message — it is exported
alongside the status.

Stack traces recorded by `recordError` reach the backend unredacted; set
`captureStackTraces: false` to omit them.

### Sampling

```typescript
import {
  createAlwaysOnSampler,
  createParentBasedSampler,
  createProbabilitySampler,
} from "@zudojs/observability";

createObservability({
  serviceName: "api",
  sampler: createParentBasedSampler({ root: createProbabilitySampler(0.05) }),
});
```

The decision is stamped into `SpanContext.traceFlags` and inherited by every
child, which is what keeps a sampled trace whole across services.

## Context propagation

```typescript
import { createPropagationContext } from "@zudojs/observability";

await obs.propagation.run(createPropagationContext({ requestId }), async () => {
  obs.logger.info("handling"); // carries traceId, spanId
  await handle();
});

obs.propagation.current(); // undefined outside a run() scope
```

`current()` returns `undefined` when there is no active context, so "no trace"
stays distinguishable from a real one.

## Exporters

Console exporters ship for development. They serialize defensively — a
circular attribute or a BigInt cannot make an exporter throw inside the
logging path — and emit one line per record by default, which is what log
shippers parse.

```typescript
import {
  createConsoleSpanExporter,
  createBatchSpanProcessor,
  createSimpleSpanProcessor,
} from "@zudojs/observability";

createObservability({
  serviceName: "api",
  processors: [
    createBatchSpanProcessor({
      exporter: createConsoleSpanExporter({ pretty: true }),
      batchSize: 512,
      maxQueueSize: 2048,
      onError: (error, source) => console.error(source, error),
    }),
  ],
});
```

Both the span and log processors have a hard queue cap: past it, records are
dropped and counted rather than growing the process until it dies. Export
failures go to `onError` instead of vanishing.

Exporters for OpenTelemetry, Prometheus or Datadog belong in separate
packages; implement `SpanExporter`, `LogExporter` or `MetricExporter`.

## Scopes

`resource()` creates a view that differs only in its resource attributes,
sharing the parent's logger, registry, processors and exporters:

```typescript
const podScoped = obs.resource({ "k8s.pod": process.env.POD_NAME });
```

Shut down the root; a scope does not own the pipeline. `flush()` works from
either, because the buffers it drains are the shared ones.

## Disabling telemetry

```typescript
import { createNoopObservability } from "@zudojs/observability";

const obs = enabled ? createObservability(config) : createNoopObservability();
```

## Errors

`ObservabilityError` and its subclasses — `ExporterError`,
`ObservabilityConfigError`, `MetricValueError` — cover the cases where this
package throws. Transport failures never throw; they are reported through
`onError`.

## Use Cases

- Distributed tracing
- Performance monitoring
- Error tracking
- SLA and SLO monitoring
