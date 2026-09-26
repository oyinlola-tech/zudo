---
title: "@zudojs/observability — Structured Logging, Metrics & Tracing"
description: "Complete documentation for @zudojs/observability — structured logging, metrics, distributed tracing, context propagation, and telemetry exporters."
source: https://zudojs.oyinlola.site/docs/packages-observability
---

v1.2.1

# @zudojs/observability

Logs, metrics and traces for a Zudojs application, behind one small facade you can point at any backend.

OBSERVABILITY LOGGING METRICS TRACING EXPORTERS

## OVERVIEW

When your program runs on your laptop you can read the screen. When it runs on a server you cannot. *Observability* is the practice of making a running program explain itself from the outside, and this package gives you the three standard ways to do that.

- **Structured logs** are messages with named fields instead of one glued-together sentence. `{ "message": "order paid", "orderId": "o_9" }` can be searched and filtered; `"order o_9 paid"` cannot.
- **Metrics** are numbers measured over time — requests per minute, queue depth, response time. They answer "how much" and "how often", cheaply, forever.
- **Traces** follow one request through every step it touches, so you can see which step was slow. A **span** is one of those steps: a named piece of work with a start time, an end time and some labelled facts attached.

This package does not talk to Datadog, Prometheus or OpenTelemetry itself. It defines the shapes — `LogExporter`, `SpanExporter`, `MetricExporter` — and ships console implementations. A provider package supplies a real one later, and your application code never changes.

USE IT WHEN

- Your code runs somewhere you cannot watch it.
- You need to know why one request out of a thousand was slow.
- You want counts and latencies you can graph.
- You are writing a library and want telemetry without picking a vendor for your users.

SKIP IT WHEN

- A script runs once on your machine and prints its result.
- Your host already collects everything you need and you are happy with plain `console.log`.
- You are inside a unit test — use `createNoopObservability()` instead.

## INSTALLATION

```bash
$ npm install @zudojs/observability
```

The runtime dependencies are `@zudojs/errors` and `@zudojs/logger` (whose secret-field rules the redactor reuses), which npm installs for you. Node 24 or newer is required — context propagation uses Node's built-in `AsyncLocalStorage`, so this package does not run in a browser.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## QUICK START

`createObservability()` builds one object holding a logger, a metrics registry, a tracer and a propagation manager. This is the only thing most applications create, and they create it once at startup.

This program logs a line, counts a request, times a span, and shuts everything down.

```ts
import { createObservability, LogLevel } from "@zudojs/observability";

const obs = createObservability({
  serviceName: "orders-api",
  logLevel: LogLevel.INFO,
  // Redaction is on by default; see Redaction.
});

obs.logger.info("server started", { port: 3000 });

obs.metrics.counter("http.requests", { route: "/orders" }).increment();

const span = obs.tracer.startSpan("load-orders");
span.setAttribute("customer.tier", "gold");
span.end();

// Pushes everything still buffered, then closes the exporters.
await obs.shutdown();
```

**What you should see.** Three JSON lines on stdout: one log record, one span, and one metric snapshot. The log line looks like this (formatted here for reading; it prints on a single line):

```json
{
  "timestamp": "2026-09-09T10:15:00.412Z",
  "level": "info",
  "logger": "orders-api",
  "message": "server started",
  "context": { "port": 3000 }
}
```

> WATCH OUT
>
>
>
> Printing to the console is the default, not a choice you made. `useConsoleExporters` defaults to `true`, so a deployed service will spray JSON at stdout until you pass real exporters or set it to `false`.

> CHANGED IN 1.2.0
>
>
>
> `shutdown()` exports the final metric snapshot once. Up to 1.1.x it exported it twice, with the same value and timestamp, so a backend that adds up counter exports counted the last interval double. If you added deduplication in your exporter for that, you can remove it. `flush()` is unchanged.

> TIP
>
>
>
> Always `await obs.shutdown()` before the process exits. Logs, spans and metrics are batched in memory, so anything not yet flushed is lost if you skip it. `obs.flush()` drains the buffers without closing anything.

## LOGGING

A *log level* is a severity dial. Every message carries one, and the logger drops anything less severe than its threshold. `LogLevel` runs `TRACE` (0), `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, `OFF` (6).

Every logging method takes the same three arguments: a message, an optional context object of named fields, and an optional error. Nothing is formatted into the message — the fields stay separate so a log tool can filter on them.

This creates a logger directly (no facade), writes at three levels, and shows what the threshold does.

```ts
import {
  createStructuredLogger,
  createConsoleLogExporter,
  createBatchLogProcessor,
  LogLevel,
} from "@zudojs/observability";

// A transport is where records go. This one batches them into an exporter.
const transport = createBatchLogProcessor({
  exporter: createConsoleLogExporter(),
});

const logger = createStructuredLogger({
  name: "orders",
  level: LogLevel.INFO,
  transport,
});

logger.debug("cache miss", { key: "o_9" });   // dropped: DEBUG < INFO
logger.info("order paid", { orderId: "o_9", amount: 4200 });
logger.error("charge failed", { orderId: "o_9" }, new Error("card declined"));

await logger.flush();
```

**What you should see.** Two lines, not three. The `info` line goes to `console.log`; the `error` line goes to `console.error` and carries an `error` field with the name, message and stack.

### Child loggers

`logger.child(name, context)` returns a new logger whose name is `parent.child` and whose context is merged into every record it writes. Use it to stamp a request ID once instead of on every call.

```ts
const requestLog = logger.child("request", { requestId: "req_17" });
requestLog.info("handled", { status: 200 });
// logger: "orders.request", context: { requestId: "req_17", status: 200 }
```

> WATCH OUT
>
>
>
> A child copies the parent's level at the moment it is created. Calling `setLevel()` on the parent afterwards does not reach children that already exist.

> IN PLAIN WORDS
>
>
>
> Logging never throws. If a transport fails, the failure is swallowed rather than crashing the code that was trying to log — so a broken log sink shows up as silence, not as an error.

## METRICS

There are three kinds of metric, and picking the right one is most of the work:

- A **counter** only ever goes up, and counts how many times something happened.
- A **gauge** goes up and down, and holds a current value like "connections open right now".
- A **histogram** records many individual measurements and reports their spread — count, sum, min, max, and estimated percentiles.

*Labels* are the extra key/value pairs you pass alongside the name. Each distinct combination of name and labels is its own *series*, tracked separately.

This records all three kinds and prints what each one holds.

```ts
import { createMetricsRegistry } from "@zudojs/observability";

const registry = createMetricsRegistry({ maxSeries: 1000 });

const requests = registry.counter("http.requests", { route: "/orders" });
requests.increment();
requests.increment(5);
console.log(requests.getValue()); // 6

const connections = registry.gauge("db.connections");
connections.setValue(10);
connections.decrement();
console.log(connections.getValue()); // 9

const latency = registry.histogram("http.duration.ms");
latency.record(120);
latency.record(340);
latency.record(85);
const spread = latency.getValue();
console.log(spread.count, spread.sum, spread.min, spread.max); // 3 545 85 340
console.log(registry.size()); // 3 — three series are registered
```

Percentiles are estimated from bucket boundaries, not from the raw values, so `spread.p95` and `latency.percentile(0.95)` are approximations. The default boundaries are exported as `DEFAULT_BUCKET_BOUNDARIES` (1 through 10,000); pass your own through `histogramBoundaries` when your values live on a different scale.

### Cardinality: the mistake that takes a backend down

*Cardinality* means how many distinct series a metric produces. A label holding a user ID, an order ID or a raw URL path produces one new series per value, forever. That is a memory leak in your process and a bill in your monitoring vendor.

The registry caps itself at **10,000 series** by default. Past the cap it stops registering new ones and calls `onCardinalityLimit` with the offending metric name, once per rejected series; the facade's `onError` hears about each metric name once. Lower the cap and watch that callback.

```ts
import { createObservability } from "@zudojs/observability";

const obs = createObservability({
  serviceName: "orders-api",
  useConsoleExporters: false,
  metrics: { maxSeries: 3 },
  onError: (error, source) => console.error(source, String(error)),
});

for (let i = 0; i < 100; i++) {
  obs.metrics.counter("by.path", { path: `/orders/${i}` }).increment();
}

console.log(obs.metrics.size()); // 3 — the other 97 were refused
await obs.shutdown();
```

**What you should see.** `3`, plus repeated `MetricsRegistry` lines on stderr saying `check for a high-cardinality label`. The fix is the label, not the cap: use `/orders/{id}` as the route template.

> DANGER
>
>
>
> One metric name can only be one type. `registry.counter("latency")` followed by `registry.histogram("latency")` throws `ObservabilityConfigError`, because a backend that received both would reject the whole scrape.

> WATCH OUT
>
>
>
> `counter.increment()` throws `MetricValueError` on a negative, `NaN` or infinite value, and `histogram.record()` throws on `NaN` or infinity. A metric that silently ignored bad input would report a number nobody can reconcile with the code.

## TRACING

A *trace* is the story of one request. A *span* is one chapter: a named piece of work with a start, an end, and attached facts. Spans nest — the span for "handle request" is the parent of the span for "query database".

Every span carries a `context` with a `traceId` (shared by every span in the request) and a `spanId` (unique to it). Passing a parent's context into `startSpan` links the two; with no parent, `startSpan` joins the active propagation context, and `withSpan(tracer, name, fn)` makes the span itself the active context.

This traces a request with one child step, records an error on the child, and exports both spans.

```ts
import {
  createObservability,
  SpanKind,
  SpanStatus,
} from "@zudojs/observability";

const obs = createObservability({ serviceName: "orders-api" });

const parent = obs.tracer.startSpan("POST /orders", {
  kind: SpanKind.SERVER,
  attributes: { "http.route": "/orders" },
});

const child = obs.tracer.startSpan("db.insert", {
  parent: parent.context,
  kind: SpanKind.CLIENT,
});
child.addEvent("retry", { attempt: 2 });
child.recordError(new Error("deadlock detected"));
child.end();

parent.setStatus(SpanStatus.OK);
parent.end();

console.log(child.context.traceId === parent.context.traceId); // true
console.log(parent.getDuration() >= 0);                        // true (milliseconds)

await obs.shutdown();
```

**What you should see.** `true` twice, then two JSON span lines. The child's `parentSpanId` equals the parent's `spanId`, its `status` is `"ERROR"`, and it carries an `"exception"` event holding `exception.type`, `exception.message` and `exception.stacktrace`.

`SpanKind` says what the work was: `INTERNAL` (the default), `SERVER`, `CLIENT`, `PRODUCER`, `CONSUMER`. `SpanStatus` is `UNSET`, `OK` or `ERROR`; `recordError()` sets it to `ERROR` for you.

> DANGER
>
>
>
> A span you never `end()` is never exported and never freed. Put `span.end()` in a `finally` block so a thrown error cannot skip it.

> IN PLAIN WORDS
>
>
>
> Spans are capped so one runaway request cannot eat memory: 128 attributes, 128 events, 128 attributes per event, and attribute strings truncated at 4096 characters. Anything discarded is reported as `droppedAttributes` and `droppedEvents` on the exported span. Change the caps with `spanLimits`.

## SAMPLING

Tracing every request in a busy service costs more than the service does. *Sampling* keeps a fraction of traces and drops the rest. A sampler makes that decision once, when the first span of a trace starts.

Four samplers ship in the box:

- `createAlwaysOnSampler()` — keep everything. The default.
- `createAlwaysOffSampler()` — keep nothing.
- `createProbabilitySampler(p)` — keep roughly `p` of traces, decided from the trace ID so every service in the request agrees.
- `createParentBasedSampler(rootOrOptions?)` — follow the incoming parent's decision, and use a root sampler only when there is no parent.

This keeps ten percent of new traces but always follows a decision already made upstream.

```ts
import {
  createObservability,
  createParentBasedSampler,
  createProbabilitySampler,
} from "@zudojs/observability";

const obs = createObservability({
  serviceName: "orders-api",
  sampler: createParentBasedSampler({
    root: createProbabilitySampler(0.1),
  }),
});

const span = obs.tracer.startSpan("GET /orders");
console.log(span.isRecording()); // true for ~10% of runs, false otherwise
span.end();

await obs.shutdown();
```

**What you should see.** About one run in ten prints `true` and emits a span line; the rest print `false` and emit nothing. The span still has a real `traceId` either way, so child services stay correlated.

> WATCH OUT
>
>
>
> The probability is a fraction, not a percentage. Pass `0.1` for ten percent. A value outside `0`–`1` is silently clamped, so `10` quietly means "sample everything"; only `NaN` or infinity throws `ObservabilityConfigError`.

## CONTEXT PROPAGATION

Passing a request ID down through twelve function calls is miserable. *Propagation* stores it once, at the top, and every function underneath can read it without being handed it — including across `await`. Node's `AsyncLocalStorage` does the work.

The stored value is a `PropagationContext`: `traceId`, `spanId`, and optional `parentSpanId`, `requestId`, `correlationId`, `userId`, `service`, `traceFlags` and `baggage`. Since v1.3.0 every log record written inside the scope carries the context's `requestId` and `correlationId` next to `traceId`/`spanId`, so a request's lines can be joined without re-attaching the ids by hand.

This runs a handler inside a context and shows the logger picking it up automatically.

```ts
import {
  createObservability,
  createPropagationContext,
} from "@zudojs/observability";

const obs = createObservability({ serviceName: "orders-api" });

async function handle() {
  // Nothing was passed in, yet the ID is here.
  const current = obs.propagation.current();
  console.log(current?.requestId); // "req_17"

  obs.logger.info("handled", { status: 200 });
}

const context = createPropagationContext({ requestId: "req_17" });
await obs.propagation.run(context, handle);

await obs.shutdown();
```

**What you should see.** `req_17`, then a log line that carries `traceId` and `spanId` fields you never wrote — the logger stamps them from the active context. Set `correlate: false` on a logger to turn that off.

Use `runSync` for synchronous work, and `derive()` to make a child context that keeps the trace ID and sampling flags but gets a fresh span ID.

> WATCH OUT
>
>
>
> `current()` returns `undefined` outside a `run()` scope. That is deliberate — inventing a context would make "no active trace" look like a real one. Use `requireCurrentContext()` only where starting a brand-new trace is an acceptable answer.

## REDACTION

*Redaction* means replacing a sensitive value with a placeholder before it leaves the process. Telemetry is the classic accidental leak: a request body lands in a log context, the log ships to a vendor, and a password is now in someone else's database.

Redaction is **on by default**, as it is in [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md). With no `redaction` option, every field name the logger redacts by default (`password`, `passphrase`, `token`, `jwt`, `bearer`, `authorization`, `cookie`, `sid`, `pwd`, API keys, card numbers and more) is redacted, along with this package's own `DEFAULT_SENSITIVE_FIELDS`. It is applied inside the logger and inside the span, so every processor and exporter downstream sees the already-redacted value.

> CHANGED IN 1.2.0
>
>
>
> Up to 1.1.x redaction was off unless you passed `redaction`, so `obs.logger.info("login", { password })` exported the password in clear text. You no longer need `redaction: {}`; it still works and means the same as leaving the option out. To turn redaction off, pass `redaction: false`.

This uses the defaults and shows what they catch in both a log and a span.

```ts
import { createObservability } from "@zudojs/observability";

const obs = createObservability({
  serviceName: "orders-api",
  // No redaction option: the default rules apply. redaction: false turns them off.
});

obs.logger.info("login attempt", {
  email: "ada@example.com",
  userPassword: "hunter2",
  headers: { "x-api-key": "ak_live_42" },
});

const span = obs.tracer.startSpan("handle-request");
span.setAttribute("authorization", "Bearer sk-live-42");
span.setAttribute("http.route", "/orders/{id}");
span.end();

await obs.shutdown();
```

**What you should see.** The log context prints as `{ email: "ada@example.com", userPassword: "[REDACTED]", headers: { "x-api-key": "[REDACTED]" } }`, and the span prints `authorization: "[REDACTED]"` while `http.route` is untouched.

### What is covered, and what is not

| Data | Redacted? | Notes |
| --- | --- | --- |
| Log context fields | **Yes**, by default | Nested objects, arrays and instances of your own classes are walked too; built-ins such as `Error`, `Date`, `Map` and `Set` are left intact. |
| Span attributes | **Yes**, by default | Applied on `setAttribute`, before any processor sees it. |
| Span event attributes | **Yes**, by default | Covers `addEvent`. |
| The log message string | **No** | Only named fields are examined. Never interpolate a secret into the message. |
| The error you pass to a log method | **No** | Its name, message and stack reach the exporter as written. |
| Error message and stack on a span | **No** | `recordError` stores them as strings under non-sensitive keys, so the field rules never fire. Set `captureStackTraces: false` to drop the stack. |
| Metric names and labels | **No** | Keep secrets and user IDs out of labels — see cardinality above. |
| Resource attributes | **No** | You write these once at startup; do not put credentials in them. |

### Tuning the rules

Matching is case-insensitive and, by default, word-aware. `userPassword`, `x-api-key` and `accessToken` all match; `shippingAddress` and `authorId` do not, even though they contain the letters `pin` and `auth`. Pass `matchMode: "exact"` to match whole names only.

This adds a field, a pattern and a custom rule on top of the defaults. `fields`, `patterns` and `customRedactor` all add to the default rules, so they can only redact more.

```ts
import { redactObject, type RedactionConfig } from "@zudojs/observability";

const config: RedactionConfig = {
  // fields and patterns both add to the defaults
  fields: ["nationalId"],
  patterns: [/^x-.*-token$/i],
  replacement: "***",
  customRedactor: (key, value) =>
    key === "email" && typeof value === "string"
      ? value.replace(/^[^@]+/, "***")
      : value,
};

console.log(redactObject({
  email: "ada@example.com",
  nationalId: "A123",
  "x-refresh-token": "rt_1",
  jwt: "eyJhbGciOi",
  orderId: "o_9",
}, config));
// { email: "***@example.com", nationalId: "***",
//   "x-refresh-token": "***", jwt: "***", orderId: "o_9" }
```

Traversal stops at depth 8 by default (raise it with `maxDepth`) and is cycle-aware. Anything cut off is replaced with `MAX_DEPTH_MARKER` or `CIRCULAR_MARKER`, both exported so you can recognise them.

`DEFAULT_SENSITIVE_FIELDS` is the whole default list: `@zudojs/logger`'s `DEFAULT_LOGGER_SECRET_FIELDS` plus this package's extra spellings, frozen. You do not need to spread it into `fields`; `fields: ["nationalId"]` already redacts `nationalId` and every default name. To use your list *alone*, pass `replaceDefaults: true`:

```ts
import { redactObject } from "@zudojs/observability";

const input = { ssn: "078-05-1120", password: "hunter2", jwt: "eyJhbGciOi" };

console.log(redactObject(input, { fields: ["ssn"] }));
// { ssn: "[REDACTED]", password: "[REDACTED]", jwt: "[REDACTED]" }
console.log(redactObject(input, { fields: ["ssn"], replaceDefaults: true }));
// { ssn: "[REDACTED]", password: "hunter2", jwt: "eyJhbGciOi" }
```

> CHANGED IN 1.2.1 (BEHAVIOUR CHANGE, SECURITY)
>
>
>
> Up to 1.2.0, `fields` *replaced* the default rules, and `DEFAULT_SENSITIVE_FIELDS` lacked `jwt`, `sid`, `pwd`, `passphrase` and `bearer`, so the old advice to write `fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"]` left `jwt` in clear text. `fields` now extends the defaults, and that spread (or spreading `DEFAULT_LOGGER_SECRET_FIELDS` too) is harmless but no longer needed. If you relied on `fields` to redact *less* than the default, add `replaceDefaults: true`, and only for data you are sure is safe to export.

## EXPORTERS & PROCESSORS

An *exporter* is the thing that actually sends telemetry somewhere. A *processor* sits in front of it and decides when: `BatchSpanProcessor` collects spans and ships them in groups, `SimpleSpanProcessor` ships each one immediately.

Batching exists because one network call per span is unaffordable. The cost is that a crash loses whatever is still queued — which is why `shutdown()` matters.

This writes spans into your own exporter instead of the console, and proves the span arrived.

```ts
import {
  createObservability,
  type ReadableSpan,
  type SpanExporter,
} from "@zudojs/observability";

const collected: ReadableSpan[] = [];

const exporter: SpanExporter = {
  async export(spans) {
    collected.push(...spans);
  },
  async shutdown() {},
};

const obs = createObservability({
  serviceName: "orders-api",
  useConsoleExporters: false,
  spanExporter: exporter,
});

obs.tracer.startSpan("work").end();
await obs.shutdown();

console.log(collected.length, collected[0]?.name); // 1 work
console.log(collected[0]?.resource["service.name"]);   // orders-api
```

The same shape works for logs (`LogExporter` with `export(records)`) and metrics (`MetricExporter` with `export(snapshots)`). Metrics are pulled on a timer rather than pushed: `metricExportIntervalMs` defaults to 60,000, and `0` disables the timer while still exporting once on flush and shutdown.

Pass `processors` yourself when you want full control of batching. Do so and the facade stops building its own — which also means **you** own the exporter's lifecycle.

### Resource attributes and scopes

*Resource attributes* describe who emitted the telemetry. `serviceName`, `serviceVersion` and `environment` become `service.name`, `service.version` and `deployment.environment` on every span.

```ts
const billing = obs.resource({ "module.name": "billing" });
billing.tracer.startSpan("charge").end();
// This span carries module.name; spans from `obs` do not.
```

> WATCH OUT
>
>
>
> A scope shares the parent's logger, registry and exporters — only the span resource differs. `shutdown()` on a scope is a no-op; shut down the root instance instead. `flush()` on a scope does work.

## CONFIGURATION

Every field of `ObservabilityConfig`. Only `serviceName` is required.

| Field | What it does | Default |
| --- | --- | --- |
| `serviceName` | Names the service on every log and span. | required |
| `serviceVersion`, `environment` | Extra resource attributes. | omitted |
| `logLevel` | Threshold for the facade's logger. | `LogLevel.INFO` |
| `logExporter`, `spanExporter`, `metricExporter` | Where each signal is sent. | console, or noop when console exporters are off |
| `useConsoleExporters` | Fall back to console exporters when none is supplied. | `true` |
| `sampler` | Which traces to record. | `AlwaysOnSampler` |
| `processors` | Your own span processors. Supplying them disables the built-in batch processor. | one `BatchSpanProcessor` |
| `redaction` | Redaction rules for log contexts and span attributes (`RedactionConfig`), or `false` to turn redaction off. | on, with the default rules |
| `metrics` | `MetricsRegistryOptions`: `maxSeries`, `histogramBoundaries`, `onCardinalityLimit`. | cap 10,000 |
| `spanLimits` | Per-span caps on attributes, events and string length. | 128 / 128 / 128 / 4096 |
| `resource` | Extra attributes stamped on every span. | `{}` |
| `metricExportIntervalMs` | How often metrics are exported. `0` disables the timer. | `60000` |
| `logFlushIntervalMs`, `logBatchSize` | Log buffering behaviour. | `1000` / `256` |
| `captureStackTraces` | Record `exception.stacktrace` on spans. Stacks are not redacted. | `true` |
| `onError` | Called with `(error, source)` for telemetry failures that are otherwise swallowed. | none |

> TIP
>
>
>
> Set `onError` in every real deployment. Without it a failing exporter, a full queue or a cardinality blow-up is completely silent.

## API REFERENCE

Everything below is exported from `@zudojs/observability`. Most applications only need `createObservability` and the four things it hands back.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createObservability(config)` | Builds the facade: logger, metrics, tracer, propagation. | The main entry point. Returns `DefaultObservability`. |
| `createNoopObservability()` | A facade that records nothing. | For tests and for libraries with no telemetry configured. |
| `createStructuredLogger(options)` | A logger on its own, without the facade. | Takes `LoggerOptions`. |
| `createMetricsRegistry(options?)` | A metrics registry on its own. | Takes `MetricsRegistryOptions`. |
| `createCounter`, `createGauge`, `createHistogram` | Single, unregistered metric instruments. | `(name, labels?)`; histogram also takes `boundaries?`. |
| `createPeriodicMetricReader(options)` | Snapshots a registry on a timer and exports it. | The facade builds one for you. |
| `metricKey(type, name, labels?)` | The cache key for one series. | Useful when mirroring the registry's identity rules. |
| `createTracer(options?)` | A tracer on its own. | Takes `TracerOptions`, including `redactAttribute`. |
| `createSpan(name, options?)` | A span without a tracer. | No sampling, no processors. |
| `createSpanContext`, `createChildSpanContext`, `isSampledContext` | Build and inspect span contexts; IDs are validated and an invalid parent starts a fresh trace (`isValidSpanContext`). | For wiring trace headers by hand. |
| `createAlwaysOnSampler`, `createAlwaysOffSampler`, `createProbabilitySampler(p)`, `createParentBasedSampler(rootOrOptions?)` | The four built-in samplers. | `p` is a fraction in `0`–`1`. |
| `isSampled(result)`, `isRecording(result)` | Read a `SamplingResult`. | For custom samplers. |
| `createPropagationContext`, `derivePropagationContext`, `createPropagationManager` | Build contexts and the manager that stores them. | The facade exposes a manager as `obs.propagation`. |
| `getCurrentContext()`, `requireCurrentContext()` | Read the active context. | The first may return `undefined`; the second invents a new trace. |
| `createConsoleLogExporter`, `createConsoleSpanExporter`, `createConsoleMetricExporter` | Print telemetry as JSON. | Take `ConsoleExporterOptions` (`pretty`, `console`). |
| `createBatchSpanProcessor`, `createSimpleSpanProcessor`, `createBatchLogProcessor` | Buffer or forward telemetry to an exporter. | Batch options: `batchSize`, `flushIntervalMs`, `maxQueueSize`, `onError`, `onDrop`. |
| `createRedactor(config?)`, `createStructureRedactor(config?)` | Redact one field, or walk a whole structure. | Used internally unless `redaction` is `false`. |
| `redactObject(object, config?)`, `redactValue(value, config?)`, `isSensitiveField(key, config?)` | One-shot redaction helpers. | Handy in tests and in your own sinks. |
| `generateTraceId()`, `generateSpanId()`, `isValidTraceId`, `isValidSpanId` | W3C-shaped IDs: 32 and 16 hex characters. | Applied by every context factory: an invalid inbound ID starts a fresh trace. Use `parseTraceparent` / `formatTraceparent` for W3C headers. |
| `logLevelToName`, `logLevelFromName`, `parseLogLevel`, `shouldLog`, `getLogLevelNames` | Convert between levels and names. | `parseLogLevel` returns `undefined` on junk — good for env vars. |
| `createLogRecord`, `createErrorLogRecord`, `serializeError` | Build records and serialise thrown values. | For custom transports. |
| `safeStringify(value, pretty?)` | `JSON.stringify` that cannot throw. | Handles cycles, BigInt, functions, symbols, errors. |
| `isObservabilityError(value)` | Type guard for this package's errors. | Use in `catch` blocks. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `DefaultObservability` | The facade implementation. | Adds `resource()`, `flush()`, `shutdown()`. |
| `StructuredLogger` | The logger implementation. | Adds `child()`, `setLevel()`, `flush()`. |
| `DefaultMetricsRegistry` | In-memory registry with the series cap. | Throws on a name reused as another type. |
| `DefaultCounter`, `DefaultGauge`, `DefaultHistogram` | The three instruments. | Reject non-finite values. |
| `PeriodicMetricReader` | Timer that collects and exports snapshots. | `start()`, `collect()`, `shutdown()`. |
| `DefaultTracer`, `DefaultSpan` | Tracer and span implementations. | Tracer adds `forceFlush()`, `shutdown()`, `exportSpan()`. |
| `AlwaysOnSampler`, `AlwaysOffSampler`, `ProbabilitySampler`, `ParentBasedSampler` | Sampler implementations. | Prefer the `create*` factories. |
| `AsyncPropagationManager` | Context storage backed by `AsyncLocalStorage`. | `run`, `runSync`, `current`, `derive`. |
| `ConsoleSpanExporter`, `ConsoleLogExporter`, `ConsoleMetricExporter` | JSON-to-stdout exporters. | Log records at `ERROR` and above go to `console.error`. |
| `BatchSpanProcessor`, `SimpleSpanProcessor`, `BatchLogProcessor` | Buffering and forwarding. | Batch versions expose `getQueueSize()` and `getDroppedCount()`. |
| `NoopObservability` | Facade that discards everything. | Paired with `noopLogger`, `noopTracer` and friends. |

### Types & enums

| Name | What it does | Notes |
| --- | --- | --- |
| `LogLevel`, `LogLevelName` | Severity, numeric and by name. | `TRACE` 0 … `OFF` 6. |
| `SpanStatus`, `SpanKind`, `TraceFlags` | Span outcome, role, and the sampling bit. | `TraceFlags.SAMPLED` is `1`. |
| `ObservabilityConfig`, `Observability` | What you pass in and what you get back. | See Configuration above. |
| `Logger`, `LoggerOptions`, `LogRecord`, `LogRecordError`, `LogTransport` | The logging contract. | Implement `LogTransport` for a custom sink. |
| `Counter`, `Gauge`, `Histogram`, `HistogramValue`, `MetricsRegistry`, `MetricSnapshot` | The metrics contract. | `HistogramValue` carries `p50`–`p99` and cumulative buckets. |
| `MetricsRegistryOptions`, `PeriodicMetricReaderOptions` | Registry and reader tuning. | `metrics` in the config takes the former. |
| `Span`, `SpanContext`, `SpanEvent`, `SpanOptions`, `SpanLimits`, `ReadableSpan`, `Tracer`, `TracerOptions` | The tracing contract. | `TracerOptions.redactAttribute` redacts every attribute a span records. |
| `Sampler`, `SamplingResult`, `ParentBasedSamplerOptions` | The sampling contract. | Decision is one of three strings. |
| `PropagationContext`, `PropagationContextOptions`, `PropagationManager` | The propagation contract. | `current()` may be `undefined`. |
| `SpanExporter`, `LogExporter`, `MetricExporter`, `SpanProcessor` | What a backend package implements. | Two methods each: `export` and `shutdown`. |
| `ConsoleExporterOptions`, `ConsoleLike` | Console exporter tuning. | `console` lets tests capture output. |
| `BatchSpanProcessorOptions`, `BatchLogProcessorOptions` | Batching tuning. | Include `onDrop` for queue overflow. |
| `RedactionConfig`, `RedactionMatchMode` | Redaction rules. | `"contains"` (default) or `"exact"`. |

### Errors

| Name | Thrown when | Notes |
| --- | --- | --- |
| `ObservabilityError` | Base class for everything below (defined in `@zudojs/errors` and re-exported). | Test with `isObservabilityError(value)`. |
| `ObservabilityConfigError` | A name is reused as another metric type, or a sampler probability is out of range. | A programming mistake — fix the call, do not catch it. |
| `MetricValueError` | A metric receives a negative, `NaN` or infinite value, or invalid histogram boundaries. | Carries the metric name and the offending value. |
| `ExporterError` | An exporter fails. | Surfaces through `onError` rather than at your call site. |

### Constants & singletons

| Name | What it is | Notes |
| --- | --- | --- |
| `DEFAULT_SENSITIVE_FIELDS` | The effective default redaction field list. | The logger's `DEFAULT_LOGGER_SECRET_FIELDS` plus this package's extra spellings; frozen. `fields` adds to it unless `replaceDefaults: true`. |
| `DEFAULT_BUCKET_BOUNDARIES` | Default histogram buckets, 1 to 10,000. | Tuned for millisecond latencies. |
| `CIRCULAR_MARKER`, `MAX_DEPTH_MARKER` | Placeholders left by the redactor. | `"[CIRCULAR]"` and `"[MAX_DEPTH]"`. |
| `INVALID_PROPAGATION_CONTEXT` | All-zero context used by the noop manager. | Frozen. |
| `noopLogger`, `noopCounter`, `noopGauge`, `noopHistogram`, `noopMetricsRegistry`, `noopSpan`, `noopTracer`, `noopPropagationManager` | Do-nothing implementations of each interface. | Useful as defaults in library code. |
| `noopSpanExporter`, `noopLogExporter`, `noopMetricExporter` | Exporters that discard everything. | What the facade uses when console exporters are off. |

## COMMON MISTAKES

- **Exiting without `await obs.shutdown()`.** Buffered logs, spans and the final metric snapshot are dropped, and the process may hang on the metric timer. Await `shutdown()` in your termination handler.
- **Assuming every secret is stripped.** Redaction covers named fields in log contexts and span attributes. Log messages, error messages and stacks, and metric labels are not covered, so keep secrets out of them. And never ship `redaction: false` outside a local debugging session.
- **Putting an ID in a metric label.** `{ path: "/orders/9182" }` creates one series per order. You hit the 10,000-series cap, new series are refused, and your graphs go flat. Use the route template.
- **Deploying with the console exporters.** `useConsoleExporters` defaults to `true`, so production writes JSON to stdout. Pass real exporters or set it to `false`.
- **Forgetting `span.end()` on the error path.** The span is never exported and never released. End it in a `finally`.
- **Reaching for `replaceDefaults: true` to add a name.** Since 1.2.1, `redaction: { fields: ["myToken"] }` adds `myToken` to the defaults. `replaceDefaults: true` throws the defaults away, so `password` stops being redacted. Leave it off unless you mean to redact less.
- **Leaving `onError` unset.** Dropped batches, failing exporters and cardinality warnings all go nowhere. Wire it to your own logger.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the base class every error here extends; reach for it when defining your own.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the HTTP layer; start a `SERVER` span and a propagation context once per request there.
- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — operations and interceptors, a natural place to wrap each call in a span.
- [@zudojs/cache](https://zudojs.oyinlola.site/docs/packages-cache.md) — pair its hit and miss counts with a histogram here to see what caching bought you.

## COMPLETE EXPORT INDEX

Every name `@zudojs/observability` exports from its package root at v1.3.0 — **142** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 142 exports**

Classes (25)

`AlwaysOffSampler` `AlwaysOnSampler` `AsyncPropagationManager` `BatchLogProcessor` `BatchSpanProcessor` `ConsoleLogExporter` `ConsoleMetricExporter` `ConsoleSpanExporter` `DefaultCounter` `DefaultGauge` `DefaultHistogram` `DefaultMetricsRegistry` `DefaultObservability` `DefaultSpan` `DefaultTracer` `ExporterError` `MetricValueError` `NoopObservability` `ObservabilityConfigError` `ObservabilityError` `ParentBasedSampler` `PeriodicMetricReader` `ProbabilitySampler` `SimpleSpanProcessor` `StructuredLogger`

Functions (56)

`createAlwaysOffSampler` `createAlwaysOnSampler` `createBatchLogProcessor` `createBatchSpanProcessor` `createChildSpanContext` `createConsoleLogExporter` `createConsoleMetricExporter` `createConsoleSpanExporter` `createCounter` `createErrorLogRecord` `createGauge` `createHistogram` `createLogRecord` `createMetricsRegistry` `createNoopObservability` `createObservability` `createParentBasedSampler` `createPeriodicMetricReader` `createProbabilitySampler` `createPropagationContext` `createPropagationManager` `createRedactor` `createSimpleSpanProcessor` `createSpan` `createSpanContext` `createStructuredLogger` `createStructureRedactor` `createTracer` `derivePropagationContext` `formatTraceparent` `fromLoggerLevel` `generateSpanId` `generateTraceId` `getCurrentContext` `getLogLevelNames` `isObservabilityError` `isRecording` `isSampled` `isSampledContext` `isSensitiveField` `isValidSpanContext` `isValidSpanId` `isValidTraceId` `logLevelFromName` `logLevelToName` `metricKey` `parseLogLevel` `parseTraceparent` `redactObject` `redactValue` `requireCurrentContext` `safeStringify` `serializeError` `shouldLog` `toLoggerLevel` `withSpan`

Interfaces (38)

`BatchLogProcessorOptions` `BatchSpanProcessorOptions` `ConsoleExporterOptions` `ConsoleLike` `Counter` `Gauge` `Histogram` `HistogramValue` `LogExporter` `Logger` `LoggerOptions` `LogRecord` `LogRecordError` `LogTransport` `MetricExporter` `MetricSnapshot` `MetricsRegistry` `MetricsRegistryOptions` `Observability` `ObservabilityConfig` `ParentBasedSamplerOptions` `PeriodicMetricReaderOptions` `PropagationContext` `PropagationContextOptions` `PropagationManager` `ReadableSpan` `RedactionConfig` `Sampler` `SamplingResult` `Span` `SpanContext` `SpanEvent` `SpanExporter` `SpanLimits` `SpanOptions` `SpanProcessor` `Tracer` `TracerOptions`

Type aliases (2)

`LogLevelName` `RedactionMatchMode`

Constants (18)

`CIRCULAR_MARKER` `DEFAULT_BUCKET_BOUNDARIES` `DEFAULT_SENSITIVE_FIELDS` `INVALID_PROPAGATION_CONTEXT` `MAX_DEPTH_MARKER` `noopCounter` `noopGauge` `noopHistogram` `noopLogExporter` `noopLogger` `noopMetricExporter` `noopMetricsRegistry` `noopPropagationManager` `noopSpan` `noopSpanExporter` `noopTracer` `TraceFlags` `TRACEPARENT_HEADER`

Enums (3)

`LogLevel` `SpanKind` `SpanStatus`
