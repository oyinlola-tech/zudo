# @zudojs/observability

Structured logging, metrics, tracing, context propagation, and telemetry exporters for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-observability](https://zudojs.oyinlola.site/docs/packages-observability) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-observability.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

  // Redaction is on by default — see "Redaction" below.

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

`LogLevel` here counts upward in severity (`TRACE = 0 … FATAL = 5`), the
opposite of `@zudojs/logger`'s `LoggerLevel` (`FATAL = 0 … TRACE = 5`).
Never pass a raw level number between the two; convert with
`toLoggerLevel(LogLevel.ERROR)` (→ `1`) and `fromLoggerLevel(1)`
(→ `LogLevel.ERROR`).

## Redaction

Redaction is **on by default**, as it is in `@zudojs/logger`: with no
`redaction` option, every name the logger's default matcher redacts
(`DEFAULT_LOGGER_SECRET_FIELDS` — password, passphrase, secret, token, jwt,
bearer, auth, authorization, cookie, session, sid, credential, api key,
private key, client secret, card number, cvv, ssn, pin, otp and more) is
redacted here too, along with this package's own `DEFAULT_SENSITIVE_FIELDS`.
Pass a config to change the rules, or `redaction: false` to turn it off.
Before 1.2 redaction was off unless configured, so a `password` field was
exported in the clear.

The logger applies it to every record before any transport sees it, and the tracer
applies it to every span attribute and span event attribute before any
processor or exporter sees it — a `Bearer` token attached to a span is
redacted the same way one written to a log field is.

```typescript
const obs = createObservability({
  serviceName: "api",
  redaction: {
    // Setting `fields` replaces the default list (and the logger's rules).
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

```typescript
createObservability({ serviceName: "api", redaction: false }); // opt out
```

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

`metrics.onCardinalityLimit` fires once per rejected series, and the facade
raises `onError` once per metric name, so a label explosion is one report
rather than one per metric call.

One metric name may only ever be one type: registering `counter("latency")`
and then `histogram("latency")` throws, because a document carrying the same
name as two types is rejected wholesale by OTLP and Prometheus.

Metrics are exported by a `PeriodicMetricReader`, which the facade starts for
you when a `metricExporter` is configured. `metricExportIntervalMs: 0`
disables the periodic export while still collecting a snapshot on `flush()`
and a final one on `shutdown()`. `shutdown()` exports that final snapshot
exactly once (before 1.2 it was exported twice):

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

A span started without an explicit `parent` joins the active context, so the
span and the log records written in the same scope share one `traceId`. To
make a span itself the active context — so logs inside it carry its `spanId`
and nested spans become its children — use `withSpan` (or
`tracer.startActiveSpan` on a `DefaultTracer`). It ends the span when the
callback returns or its promise settles, and records a throw or rejection:

```typescript
import { withSpan } from "@zudojs/observability";

const rows = await withSpan(obs.tracer, "db.query", async (span) => {
  span.setAttribute("db.system", "postgresql");
  obs.logger.info("querying"); // carries this span's traceId and spanId
  return [1, 2, 3];
});
```

Inbound trace IDs are validated. `parseTraceparent` reads a W3C
`traceparent` header and returns `undefined` for anything malformed;
`formatTraceparent` writes one for an outgoing request. A parent or
propagation context whose trace or span ID is not valid W3C hex is never
joined — the span starts a fresh trace instead:

```typescript
import { formatTraceparent, parseTraceparent } from "@zudojs/observability";

const parent = parseTraceparent(request.headers["traceparent"]);
const span = obs.tracer.startSpan("handle", { parent }); // fresh trace if absent
const outgoing = formatTraceparent(span.context); // "00-<trace>-<span>-01"
span.end();
```

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
