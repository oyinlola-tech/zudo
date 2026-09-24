---
title: "Observability"
description: "See inside a running Task API. Metrics count what happens, traces show where the time goes, and logs, metrics and traces share one trace id across requests and services, with @zudojs/observability."
source: https://zudojs.oyinlola.site/learn/zudo-observability
---

LESSON 75 OF 84

Testing and observability Production

# Observability

See inside a running Task API. Metrics count what happens, traces show where the time goes, and logs, metrics and traces share one trace id across requests and services, with @zudojs/observability.

- **45 min** to read and try
- **You need:** The Task API project and the logging lesson
- **You build:** A Task API that measures every request, traces slow ones step by step, and links every log line to its trace

  [Test yourself](#test)

## Three questions, three signals

Your Task API is in production and a user writes: "the app is slow today". Logs alone cannot answer that. You need to know *how* slow, for *how many* users, and *which step* is slow. **Observability** means that a running system tells you enough about itself to answer questions like these without adding new code first. It rests on three kinds of data, called **signals**:

| Signal | Answers | Task API example |
| --- | --- | --- |
| **Logs** | What happened, in detail? | "task 7 could not be saved: connection refused" |
| **Metrics** | How much, how often, how fast, over time? | "1,204 requests per minute, 95% faster than 80 ms" |
| **Traces** | Where did the time of one request go? | "GET /tasks took 900 ms, 850 of them in one database query" |

You met logs in [the logging lesson](https://zudojs.oyinlola.site/learn/zudo-logging). This lesson adds metrics and traces, and connects all three with one id.

Terminal on your computer

```bash
$ npm install @zudojs/observability

added 1 package, and audited 73 packages in 2s
…
```

The `…` hides the funding, audit and esbuild notes you know from earlier lessons. Every example here uses Node.js features, so run them on your computer: save them in `src/` and run `npx tsx src/<file>.ts`.

## One object for all three

`createObservability` creates everything at once: a `logger`, a `metrics` registry, a `tracer` and a `propagation` manager. It also owns the **exporters**, the parts that send the data somewhere. By default they print to the console, one JSON object per line:

first.tsNode.js only

```ts
import { createObservability } from "@zudojs/observability";

const obs = createObservability({
  serviceName: "task-api",
  serviceVersion: "0.1.0",
  environment: "development",
});

obs.logger.info("server started", { port: 3000 });
obs.logger.info("login", { userId: "ada", password: "hunter2" });
obs.logger.child("db", { pool: 10 }).info("connected");

await obs.shutdown();
```

Output of `npx tsx first.ts`

```json
{"timestamp":"2026-09-23T14:10:12.944Z","level":"info","logger":"task-api","message":"server started","context":{"port":3000}}
{"timestamp":"2026-09-23T14:10:12.945Z","level":"info","logger":"task-api","message":"login","context":{"userId":"ada","password":"[REDACTED]"}}
{"timestamp":"2026-09-23T14:10:12.945Z","level":"info","logger":"task-api.db","message":"connected","context":{"pool":10}}
```

- The logger works like the one from the logging lesson. Its metadata is called `context` here, and `child(name, context)` takes the name first.
- Secret redaction is on by default, with the same field list as @zudojs/logger: `password` became `[REDACTED]`. (Since @zudojs/observability 1.2.0. `redaction: false` switches it off; never do that in production.)
- Exporters work in **batches**: they collect records and send many at once, which is much cheaper than one network call per line. `await obs.shutdown()` sends what is left and closes the exporters. Without it, the last records are lost when the process exits.

## Metrics: counters, gauges, histograms

A **metric** is a number that you update in your code and a monitoring system collects every few seconds, to draw graphs and send alerts. There are three kinds:

- A **counter** only goes up: requests served, tasks created, errors.
- A **gauge** goes up and down: jobs waiting in a queue, open database connections.
- A **histogram** records many measurements, like request durations, so you can ask for averages and **percentiles**.

metrics.tsNode.js only

```ts
import { createObservability, MetricValueError } from "@zudojs/observability";

const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false });

obs.metrics.counter("tasks.created").increment();
obs.metrics.counter("tasks.created").increment();
obs.metrics.counter("http.requests", { route: "/tasks", status: "200" }).increment(3);
obs.metrics.counter("http.requests", { route: "/tasks", status: "500" }).increment();

const queue = obs.metrics.gauge("queue.waiting", { queue: "email" });
queue.setValue(12);
queue.decrement(2);

const latency = obs.metrics.histogram("http.duration_ms", { route: "/tasks" });
for (const ms of [12, 15, 18, 20, 22, 25, 30, 35, 40, 900]) latency.record(ms);

console.log("tasks created:", obs.metrics.counter("tasks.created").getValue());
console.log("500s:", obs.metrics.counter("http.requests", { route: "/tasks", status: "500" }).getValue());
console.log("queue:", queue.getValue());
const { count, mean, p50, p95 } = latency.getValue();
console.log({ count, mean, p50: Math.round(p50), p95: Math.round(p95) });

try {
  obs.metrics.counter("tasks.created").increment(-1);
} catch (error) {
  if (error instanceof MetricValueError) console.log(error.message);
}
await obs.shutdown();
```

Output of `npx tsx metrics.ts`

```ts
tasks created: 2
500s: 1
queue: 10
{ count: 10, mean: 111.7, p50: 23, p95: 700 }
Metric "tasks.created" rejected value -1: a counter cannot decrease; use a gauge
```

A metric is identified by its name **and** its **labels**, the small key-value pairs like `{ route, status }`. Asking for the same name and labels again returns the same counter. That is why the two `increment()` calls on `tasks.created` added up.

Look at the histogram. Nine requests took 12 to 40 ms, and one took 900 ms. The **mean** (average) is 111.7 ms, which describes none of the requests. The **p50** (the 50th percentile, or median) says half the requests were faster than 23 ms. The **p95** says 95% were faster than 700 ms. Percentiles show what users actually feel, so alert on p95 or p99, never on the mean. The values are estimated from buckets, so they are close, not exact.

> NEVER PUT A USER ID IN A LABEL
>
> Each different set of labels is a separate **series** that the monitoring system stores forever. `{ route, status }` gives a few dozen series. `{ userId }` gives one per user, and a million users means a million series: this is called a **cardinality explosion**, and it can take the monitoring system down. The registry stops at 10,000 series by default and reports the problem to `onError`. Put ids in logs and traces, never in metric labels.

## Traces and spans

A **trace** is the story of one request. It is made of **spans**: one span per step, each with a name, a start, an end and **attributes** (details, like the SQL table). Spans nest: a span started inside another becomes its **child**. All spans of one trace share one **trace id**.

To see the spans, this project uses a small exporter of its own that prints them as an indented tree. An exporter is just an object with `export` and `shutdown`:

print.tsNode.js only

```ts
import type { LogExporter, ReadableSpan, SpanExporter } from "@zudojs/observability";

export const logLines: LogExporter = {
  async export(records) {
    for (const r of records) {
      const error = r.error ? ` error=${r.error.message}` : "";
      console.log(`${r.levelName} ${r.message} trace=${r.traceId ?? "-"}${error}`);
    }
  },
  async shutdown() {},
};

export const spanTree: SpanExporter = {
  async export(spans) {
    const byStart = [...spans].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const print = (span: ReadableSpan, depth: number): void => {
      const error = span.status === "ERROR" ? `  ERROR: ${span.statusMessage}` : "";
      const trace = depth === 0 ? `  trace=${span.context.traceId}` : "";
      console.log(`${"  ".repeat(depth)}${span.name} ${Math.round(span.duration)}ms${error}${trace}`);
      for (const child of byStart.filter((s) => s.context.parentSpanId === span.context.spanId)) {
        print(child, depth + 1);
      }
    };
    const isRoot = (s: ReadableSpan) => !spans.some((p) => p.context.spanId === s.context.parentSpanId);
    for (const root of byStart.filter(isRoot)) print(root, 0);
  },
  async shutdown() {},
};
```

`withSpan(tracer, name, fn)` starts a span, makes it the **active** span while `fn` runs, and ends it when `fn` finishes. If `fn` throws, the span is marked as an error:

traces.tsNode.js only

```ts
import { createObservability, SpanKind, withSpan } from "@zudojs/observability";
import { spanTree } from "./print.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false, spanExporter: spanTree });

await withSpan(obs.tracer, "GET /tasks", async (request) => {
  request.setAttribute("http.route", "/tasks");
  await withSpan(obs.tracer, "cache.get", () => wait(2));
  await withSpan(obs.tracer, "db.query", async (query) => {
    query.setAttribute("db.table", "tasks");
    await wait(120);
  });
  await withSpan(obs.tracer, "serialize", () => wait(3));
}, { kind: SpanKind.SERVER });

await withSpan(obs.tracer, "POST /tasks", async () => {
  await withSpan(obs.tracer, "db.insert", async () => {
    throw new Error("duplicate key");
  });
}).catch((error: Error) => console.log("request failed:", error.message));

await obs.shutdown();
```

Output of `npx tsx traces.ts`

```ts
request failed: duplicate key
GET /tasks 152ms  trace=0797ba183f7d1fd2bdd9375137dd8e11
  cache.get 23ms
  db.query 123ms
  serialize 3ms
POST /tasks 6ms  ERROR: duplicate key  trace=a30054d3bdb52b666040aa2fdb911ba6
  db.insert 5ms  ERROR: duplicate key
```

This is what makes traces so useful. The request took about 150 ms, and the tree shows at once that the database query used most of it. Your numbers will differ a little on every run. Without a trace you would guess, or add timing code everywhere. The spans were printed last because the exporter sends them in a batch, at `shutdown`. Each trace got its own random trace id: 32 hexadecimal characters.

The error was recorded on both spans, because it went up through both. `SpanKind.SERVER` marks a span that handles an incoming request. Calls to other systems use `SpanKind.CLIENT`.

## Context propagation

How did `db.query` know that `GET /tasks` was its parent? Nobody passed the parent span as a parameter. The tracer keeps the active span in an **AsyncLocalStorage**, a Node.js feature that stores a value for one chain of async calls. Everything that runs inside that chain, after any number of `await`s and function calls, can read it. Two requests that run at the same time each see their own value.

The **propagation context** is that value. It holds the trace id, the current span id and, optionally, a `requestId` and `userId`. `obs.propagation.run(context, fn)` runs `fn` inside a context, and every log record written inside gets the trace id automatically:

context.tsNode.js only

```ts
import { createObservability, createPropagationContext, getCurrentContext } from "@zudojs/observability";
import type { LogExporter } from "@zudojs/observability";

const printLogs: LogExporter = {
  async export(records) {
    for (const r of records) console.log(`${r.levelName} ${r.message} trace=${r.traceId ?? "-"}`);
  },
  async shutdown() {},
};
const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false, logExporter: printLogs });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadTasks(userId: string): Promise<void> {
  await wait(userId === "ada" ? 20 : 5);
  obs.logger.info(`tasks loaded for ${userId}`);
  console.log(userId, "sees request", getCurrentContext()?.requestId);
}

const ada = createPropagationContext({ requestId: "req-1", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" });
const linus = createPropagationContext({ requestId: "req-2", traceId: "0af7651916cd43dd8448eb211c80319c" });
await Promise.all([
  obs.propagation.run(ada, () => loadTasks("ada")),
  obs.propagation.run(linus, () => loadTasks("linus")),
]);
obs.logger.info("outside any request");
await obs.shutdown();
```

Output of `npx tsx context.ts`

```ts
linus sees request req-2
ada sees request req-1
info tasks loaded for linus trace=0af7651916cd43dd8448eb211c80319c
info tasks loaded for ada trace=4bf92f3577b34da6a3ce929d0e0e4736
info outside any request trace=-
```

Both requests ran at the same time and finished in the opposite order, yet each `loadTasks` saw its own request, and each log line carries its own trace id. `loadTasks` has no request parameter. Outside a `run`, there is no context. This example sets fixed trace ids so the output stays the same on every run. Normally `createPropagationContext()` creates a random one.

A trace id that you put on every log line, every span and every error report is a **correlation id**: with one id you can find everything that belongs to one request. Put it in your error responses too, for example as a `traceId` field. When a user reports a problem, they can send you that id.

## Across services: the traceparent header

In [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc) the Task API called other services. A trace should follow the request there too. The W3C standard for this is the `traceparent` header: `00-<trace id>-<span id>-<flags>`. The caller sends its current span in it, and the receiver starts its spans as children:

traceparent.tsNode.js only

```ts
import { createObservability, formatTraceparent, parseTraceparent, SpanKind } from "@zudojs/observability";

const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false });

const outgoing = obs.tracer.startSpan("call notifications", { kind: SpanKind.CLIENT });
const header = formatTraceparent(outgoing.context);
console.log("sent:", header === `00-${outgoing.context.traceId}-${outgoing.context.spanId}-01`);

const parent = parseTraceparent(header);
const incoming = obs.tracer.startSpan("POST /notify", { kind: SpanKind.SERVER, parent });
console.log("same trace:", incoming.context.traceId === outgoing.context.traceId);
console.log("child of caller:", incoming.context.parentSpanId === outgoing.context.spanId);

console.log("bad header:", parseTraceparent("00-not-a-real-id-01"));
const fresh = obs.tracer.startSpan("POST /notify", { parent: parseTraceparent("garbage") });
console.log("fresh trace:", fresh.context.traceId !== outgoing.context.traceId);

for (const span of [incoming, fresh, outgoing]) span.end();
await obs.shutdown();
```

Output of `npx tsx traceparent.ts`

```ts
sent: true
same trace: true
child of caller: true
bad header: undefined
fresh trace: true
```

`parseTraceparent` checks the header and returns `undefined` for anything malformed, so a broken or hostile header simply starts a fresh trace. The header comes from outside, so treat it as untrusted: it only links spans together, and it must never decide what a caller may do.

## Put it together: instrument the Task API

One wrapper around the request handler gives every request all three signals. It reads `traceparent`, starts a server span, counts the request, records its duration and logs with the trace id. Handlers only add spans for the steps they care about:

instrument.tsNode.js only

```ts
import { createResponseContext } from "@zudojs/http";
import type { HttpRequestContext, HttpResponseContext } from "@zudojs/http";
import { parseTraceparent, SpanKind, withSpan } from "@zudojs/observability";
import type { Observability } from "@zudojs/observability";

type Handler = (request: HttpRequestContext) => Promise<HttpResponseContext>;

export function instrument(obs: Observability, route: string, handler: Handler) {
  return async (request: HttpRequestContext): Promise<HttpResponseContext> => {
    const started = performance.now();
    const parent = parseTraceparent(request.getHeader("traceparent"));
    const response = await withSpan(obs.tracer, `${request.method} ${route}`, async (span) => {
      try {
        return await handler(request);
      } catch (error) {
        if (error instanceof Error) span.recordError(error);
        obs.logger.error("request failed", { route }, error);
        return createResponseContext({ status: 500 }).json({ error: "Internal Server Error" });
      }
    }, { kind: SpanKind.SERVER, parent });
    const status = String(response.status);
    obs.metrics.counter("http.requests", { route, status }).increment();
    obs.metrics.histogram("http.duration_ms", { route }).record(performance.now() - started);
    return response;
  };
}
```

The handler for `GET /tasks` wraps its database call in a span, and logs inside it. A second route fails on purpose. The script starts the server, sends two requests as a client would, then prints the metrics:

server.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type { HttpRequestContext } from "@zudojs/http";
import { createObservability, withSpan } from "@zudojs/observability";
import { instrument } from "./instrument.js";
import { logLines, spanTree } from "./print.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const obs = createObservability({
  serviceName: "task-api", useConsoleExporters: false, spanExporter: spanTree, logExporter: logLines,
});

const listTasks = instrument(obs, "/tasks", async () => {
  const rows = await withSpan(obs.tracer, "db.query tasks", async () => {
    await wait(60);
    return [{ id: 7, title: "Buy milk" }];
  });
  obs.logger.info("tasks loaded", { count: rows.length });
  return createResponseContext().json(rows);
});
const report = instrument(obs, "/report", async () => {
  throw new Error("report service unreachable");
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0 }),
  handler: (request: HttpRequestContext) => (request.path === "/tasks" ? listTasks(request) : report(request)),
});
await server.start();
const base = `http://localhost:${server.address?.port}`;

const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
console.log("GET /tasks ->", (await fetch(`${base}/tasks`, { headers: { traceparent } })).status);
console.log("GET /report ->", (await fetch(`${base}/report`)).status);

for (const series of obs.metrics.getAll()) {
  const value = typeof series.value === "number" ? series.value : `count=${series.value.count}`;
  console.log("metric", series.name, JSON.stringify(series.labels), value);
}
await server.stop();
await obs.shutdown();
```

Output of `npx tsx server.ts`

```ts
GET /tasks -> 200
GET /report -> 500
metric http.requests {"route":"/tasks","status":"200"} 1
metric http.duration_ms {"route":"/tasks"} count=1
metric http.requests {"route":"/report","status":"500"} 1
metric http.duration_ms {"route":"/report"} count=1
info tasks loaded trace=4bf92f3577b34da6a3ce929d0e0e4736
error request failed trace=403689023de9f4b2150aa1a746a597b0 error=report service unreachable
GET /tasks 70ms  trace=4bf92f3577b34da6a3ce929d0e0e4736
  db.query tasks 60ms
GET /report 7ms  ERROR: report service unreachable  trace=403689023de9f4b2150aa1a746a597b0
```

- The metrics use the `route` you pass to `instrument`, like `/tasks/:id`, never the real path. A path such as `/tasks/7` contains an id, and each id would become a new series.
- The client got a plain 500 without details. The error message stays in the log and on the span, as [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors) taught.
- The log line "tasks loaded" and the `GET /tasks` span have the same trace id, the one from the `traceparent` header. The failed request's error log and its span share another one.

## Debugging production with the three signals

Read the output of the last example the way you would read a dashboard during an incident. The usual path goes from the big picture down to one request:

1. **Metrics tell you that something is wrong.** `http.requests` with `status="500"` went up for `/report`. In production, an alert on "more than 1% of requests answer 5xx" or "p95 above 500 ms" wakes you up.
2. **Logs tell you what went wrong.** Search for `level=error` and `route=/report`: "report service unreachable". The line has a trace id.
3. **The trace tells you where.** Open the trace with that id: `GET /report` failed after a few milliseconds, with the error on the span. For a slow request, the span tree shows which step took the time, like `db.query tasks` above.

And the first request shows context propagation across services: its trace id `4bf92f35…` came from the `traceparent` header. A trace viewer would show the calling service's spans and the Task API's spans as one tree.

## Production: exporters and sampling

Two settings change before you deploy.

### Send the data somewhere

The console exporters are for development. `useConsoleExporters` is `true` by default, so a deployed service prints JSON until you give it real exporters. In production you pass exporters that send to your monitoring system, usually an **OpenTelemetry collector**: a program that receives telemetry in a standard format and forwards it to tools like Grafana, Jaeger or Datadog. This package does not include such exporters. You implement the `SpanExporter`, `LogExporter` and `MetricExporter` interfaces, two methods each, exactly like `spanTree` and `logLines` above, or install a package that does.

### Keep only some traces

Recording every span of every request costs memory, network and money. **Sampling** keeps a share of the traces. The decision is made once, for the first span of a trace, and every child span follows it, so you never get half a trace:

sampling.tsNode.js only

```ts
import { createObservability, createParentBasedSampler, createProbabilitySampler, parseTraceparent } from "@zudojs/observability";

const obs = createObservability({
  serviceName: "task-api",
  useConsoleExporters: false,
  sampler: createParentBasedSampler({ root: createProbabilitySampler(0.1) }),
});

let recorded = 0;
for (let i = 0; i < 1000; i++) {
  const span = obs.tracer.startSpan("GET /tasks");
  if (span.isRecording()) recorded += 1;
  span.end();
}
console.log("about 10% recorded:", recorded > 50 && recorded < 150);

const sampled = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
const notSampled = parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00");
for (const parent of [sampled, notSampled]) {
  const span = obs.tracer.startSpan("POST /notify", { parent });
  console.log("caller flag", parent?.traceFlags, "-> recording:", span.isRecording());
  span.end();
}
await obs.shutdown();
```

Output of `npx tsx sampling.ts`

```ts
about 10% recorded: true
caller flag 1 -> recording: true
caller flag 0 -> recording: false
```

`createProbabilitySampler(0.1)` keeps about one trace in ten, chosen from the trace id. `createParentBasedSampler` follows the caller when there is one: the last number of `traceparent` (`01` or `00`) says whether the caller kept the trace. Metrics are not sampled: every request still counts.

Finally, call `await obs.shutdown()` in the Task API's `SIGTERM` handler, after the HTTP server has stopped, just like `runtime.stop()` in [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime). In unit tests, `createNoopObservability()` gives an object with the same methods that records nothing.

## Practice

TRY IT YOURSELF

### Count tasks by priority

Add a counter `tasks.created` with a `priority` label. Create two `high` tasks and one `low` task, then print every series with `obs.metrics.getSeries("tasks.created")`. Would a `title` label be a good idea?

**Show a solution**

priority.tsNode.js only

```ts
import { createObservability } from "@zudojs/observability";

const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false });

for (const priority of ["high", "high", "low"]) {
  obs.metrics.counter("tasks.created", { priority }).increment();
}
for (const series of obs.metrics.getSeries("tasks.created")) {
  console.log(series.labels, series.value);
}
await obs.shutdown();
```

Output of `npx tsx priority.ts`

```json
{ priority: 'high' } 2
{ priority: 'low' } 1
```

A priority has three possible values, so it makes three series at most. A title can be anything a user types: one series per title is a cardinality explosion. Put the title in a log line or a span attribute instead.

TRY IT YOURSELF

### Find the slow step

Using `spanTree` from `print.ts`, trace a `POST /tasks` request with three steps: `validate` (1 ms), `db.insert` (40 ms) and `events.publish` (5 ms). Which step would you optimize first?

**Show a solution**

slow-step.tsNode.js only

```ts
import { createObservability, withSpan } from "@zudojs/observability";
import { spanTree } from "./print.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false, spanExporter: spanTree });

await withSpan(obs.tracer, "POST /tasks", async () => {
  await withSpan(obs.tracer, "validate", () => wait(1));
  await withSpan(obs.tracer, "db.insert", () => wait(40));
  await withSpan(obs.tracer, "events.publish", () => wait(5));
});
await obs.shutdown();
```

Output of `npx tsx slow-step.ts`

```ts
POST /tasks 65ms  trace=444c92b07bd4e081c4d859fec64ab6ab
  validate 2ms
  db.insert 45ms
  events.publish 13ms
```

`db.insert`: it is most of the request. Making `validate` ten times faster would save almost nothing. Always measure before you optimize.

TRY IT YOURSELF

### Is this header safe?

A client sends `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` and `x-user-role: admin`. The Task API joins the trace. Should it also trust the role?

**Show a solution**

No. Joining a trace only links spans together: at worst, a client makes its request appear inside someone else's trace. A role decides what the caller may do, so it must come from your own authentication (a verified session or token, as in [the auth lesson](https://zudojs.oyinlola.site/learn/zudo-auth)), never from a header the client can type. Treat every incoming header as untrusted, and give each one only as much power as it can safely have.

## Recap

- Logs say what happened, metrics say how much and how fast, traces say where the time of one request went.
- `createObservability` gives a logger, metrics, a tracer and propagation. Secret fields are redacted by default.
- Counters go up, gauges go up and down, histograms give percentiles. Alert on p95, not the mean. Never put ids in labels.
- A trace is a tree of spans. `withSpan` makes a span active, so nested spans and log lines join it.
- AsyncLocalStorage carries the context through `await`s, so logs get the trace id without extra parameters.
- The `traceparent` header carries the trace to other services. A malformed one starts a fresh trace.
- Exporters send batches: always `await obs.shutdown()`. In production, use real exporters and sample traces.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
