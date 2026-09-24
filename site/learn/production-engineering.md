---
title: "Production engineering"
description: "What changes when real users depend on your app. A checklist for configuration, secrets, logs, metrics, traces, health and readiness checks, graceful shutdown, timeouts, rate limits, caching and database performance, with a small runnable proof for each item."
source: https://zudojs.oyinlola.site/learn/production-engineering
---

LESSON 81 OF 84

Production Production

# Production engineering

What changes when real users depend on your app. A checklist for configuration, secrets, logs, metrics, traces, health and readiness checks, graceful shutdown, timeouts, rate limits, caching and database performance, with a small runnable proof for each item.

- **55 min** to read and try
- **You need:** The Task API project and the ZudoJS core, data and quality lessons
- **You build:** A production checklist for the Task API, and working proofs of health checks, graceful shutdown, rate limiting, caching and indexing

  [Test yourself](#test)

## The production checklist

On your computer, a crash means you restart `npm run dev`. In **production**, the place where real users use your app, a crash means lost orders, and nobody may notice until a customer complains. Production engineering is the set of habits that keep an app running, and tell you quickly when it is not.

This lesson is built around one checklist. Each row links to a section with a small example that proves the point. Copy the list into your project's README and tick it off before your first deployment in [the next lesson](https://zudojs.oyinlola.site/learn/deployment).

| ✓ | Item | Done when |
| --- | --- | --- |
| ☐ | [Environment](#environments) | `NODE_ENV=production` is set, and the app behaves differently because of it. |
| ☐ | [Configuration and secrets](#config) | Every setting comes from the environment, is checked at startup, and no secret is in the code or the logs. |
| ☐ | [Logs](#logs) | One JSON line per event, with a level, a request id and no secrets. |
| ☐ | [Metrics and traces](#metrics) | Request count, error count and latency are measured, and slow requests can be traced. |
| ☐ | [Health and readiness](#health) | `/health` says the process is alive; `/ready` says it can serve traffic. |
| ☐ | [Graceful shutdown](#shutdown) | On `SIGTERM`, the app stops taking new requests and finishes the ones in flight. |
| ☐ | [Timeouts and retries](#timeouts) | Every outgoing call has a timeout; only safe calls are retried. |
| ☐ | [Rate limiting](#ratelimit) | Public endpoints, and login above all, have a limit per client. |
| ☐ | [Caching](#cache) | Hot, slow reads are cached, and every write invalidates what it changed. |
| ☐ | [Database](#database) | Frequent queries use an index, and the connection pool has a sensible size. |

## Development versus production

|  | Development | Production |
| --- | --- | --- |
| Who uses it | You | Customers, all day, in parallel |
| Code | TypeScript run by `tsx watch`, restarts on save | Compiled JavaScript run by `node`, restarted by a process manager |
| Errors | Full stack traces on screen | Generic message to the client, details only in the logs |
| Logs | Pretty, easy to read | JSON lines, read by a machine |
| Data | Fake, can be thrown away | Real, backed up, never reset |
| Secrets | Throwaway values in `.env` | Real values from the host's secret store |

The app learns which world it is in from `NODE_ENV`. ZudoJS reads it with `resolveEnvironment` from `@zudojs/constants`, the same function the generated `app.ts` uses. It accepts common spellings and warns about typos, because a typo in production would silently switch on development behaviour:

environment.ts

```ts
import { resolveEnvironment } from "@zudojs/constants";

for (const value of ["production", "prod", "Production", undefined, "staging", "prodution"]) {
  console.log(String(value).padEnd(10), "->", resolveEnvironment({ NODE_ENV: value }));
}
```

Output of `npx tsx environment.ts` and of the browser terminal

```ts
production -> production
prod       -> production
Production -> production
undefined  -> development
staging    -> staging
[@zudojs/constants] Unrecognized NODE_ENV value "prodution"; falling back to "development". Expected one of: development, test, staging, production (or the aliases dev, prod).
prodution  -> development
```

An unset `NODE_ENV` means development. So the one thing every production deployment must do is set it. Pass `{ strict: true }` as a second argument to make a typo stop the app instead of only warning.

## Configuration and secrets

You met environment variables in [the Node.js runtime lesson](https://zudojs.oyinlola.site/learn/node-runtime) and `@zudojs/config` in [the configuration lesson](https://zudojs.oyinlola.site/learn/zudo-config). For production, three rules:

1. **Everything that differs between environments comes from the environment:** ports, URLs, secrets, feature switches. The same build runs everywhere.
2. **Check all of it at startup.** Fail at once, listing every problem, instead of at 3 a.m. on the first request that needs the missing value.
3. **Never print a secret.** Not in an error, not in a log, not in a health check.

A schema from [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation) does all three. It describes the settings once, turns strings into numbers, and reports problems by name only:

config.ts

```ts
import { schema, type Infer } from "@zudojs/schema";

const ConfigSchema = schema.object({
  NODE_ENV: schema.enum(["development", "test", "staging", "production"]),
  PORT: schema.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: schema.string().regex(/^postgres(ql)?:\/\/\S+$/),
  JWT_SECRET: schema.string().min(32),
});
export type Config = Infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const problems = result.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
  }
  return result.data;
}
```

start.ts

```ts
import { loadConfig } from "./config.js";

// In the app: const config = loadConfig(process.env);
try {
  loadConfig({ NODE_ENV: "production", PORT: "eighty", DATABASE_URL: "postgres://db:5432/shop" });
} catch (error) {
  console.log((error as Error).message);
}

// A stand-in for the real secret, which comes from the host's secret store.
const secret = crypto.randomUUID() + crypto.randomUUID();
const config = loadConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://db:5432/shop", JWT_SECRET: secret });
console.log(config.PORT, config.NODE_ENV, `JWT_SECRET: ${config.JWT_SECRET.length} characters`);
```

Output of `npx tsx start.ts` and of the browser terminal

```ts
Invalid configuration:
  PORT: Cannot coerce string to number
  JWT_SECRET: Required field missing: JWT_SECRET
3000 production JWT_SECRET: 72 characters
```

The first call failed at once and listed both problems, not just the first. The message names `PORT` and `JWT_SECRET`, never their values, so a wrong secret cannot leak through it. `DATABASE_URL` is checked with a regular expression because `schema.string().url()` accepts only `http` and `https` addresses. The second call worked: `PORT` fell back to its default and became a number, and the program printed only the secret's length.

### Where secrets live

- **On your computer:** a `.env` file, never committed, with throwaway values.
- **On a server:** environment variables set by the host: a systemd `EnvironmentFile` readable only by the app's user, Docker secrets, or your cloud's secret manager. The next lesson shows the first two.
- **Rotate** a secret (replace it with a new one) whenever someone who knew it leaves, and at once if it may have leaked. Code that reads it from the environment needs no change for that.

## Logs a machine can read

In production nobody watches the terminal. Logs are collected from every server into one place (Loki, Elasticsearch, CloudWatch, Datadog …), and you search them. That works when each event is **one line of JSON** with the same fields every time, so the tool can filter by `level`, `requestId` or `orderId`.

`@zudojs/logger`, from [the logging lesson](https://zudojs.oyinlola.site/learn/zudo-logging), lets you choose where entries go with a **transport**. This one writes one JSON line per entry. The structured formatter keeps `message` as the plain text you logged, without the time and level glued in front:

json-logs.ts

```ts
import { createLogger, createStructuredLoggerFormatter, LoggerLevel, type LoggerTransportFunction } from "@zudojs/logger";

const jsonLines: LoggerTransportFunction = (entry) => {
  console.log(JSON.stringify({ time: entry.timestamp, level: entry.levelName, logger: entry.logger, msg: entry.message, ...entry.metadata }));
};

const logger = createLogger({
  name: "task-api",
  level: LoggerLevel.INFO,
  formatter: createStructuredLoggerFormatter(),
  transports: [jsonLines],
});

logger.debug("cache lookup", { key: "tasks.ada" });
logger.info("task created", { requestId: "req-7", taskId: 42, password: "hunter2" });
logger.error("database timeout", { requestId: "req-8", afterMs: 5000 });
```

Output of `npx tsx json-logs.ts` and of the browser terminal

```json
{"time":"2026-09-23T13:50:02.118Z","level":"info","logger":"task-api","msg":"task created","requestId":"req-7","taskId":42,"password":"[REDACTED]"}
{"time":"2026-09-23T13:50:02.121Z","level":"error","logger":"task-api","msg":"database timeout","requestId":"req-8","afterMs":5000}
```

- The `debug` line is missing because the level is `INFO`. Use `INFO` in production, and switch one service to `DEBUG` for a while when you hunt a bug.
- The password was replaced by `[REDACTED]` before any transport saw it. The logger does this for field names that look secret. It is a safety net, not permission: still do not log request bodies whole.
- Every line carries a `requestId`. That is the correlation id from [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices), and it is what turns thousands of lines into the story of one request.

Write logs to standard output, as here. The process manager or Docker collects them; the app should not manage log files itself.

## Metrics and traces

Logs tell you what happened to one request. **Metrics** tell you how the whole system is doing: numbers collected all the time and drawn on a dashboard. Start with the four "golden signals": how many requests (**traffic**), how many fail (**errors**), how long they take (**latency**), and how full your resources are (**saturation**).

With `@zudojs/observability`, from [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability):

metrics.tsNode.js only

```ts
import { createObservability } from "@zudojs/observability";

const obs = createObservability({ serviceName: "task-api", useConsoleExporters: false });
const latency = obs.metrics.histogram("http.duration.ms", { route: "GET /tasks" });

const durations = [12, 15, 11, 14, 13, 16, 12, 480, 15, 14];
for (const ms of durations) {
  obs.metrics.counter("http.requests", { route: "GET /tasks" }).increment();
  latency.record(ms);
}
obs.metrics.counter("http.errors", { route: "GET /tasks" }).increment();

const value = latency.getValue();
console.log("requests:", durations.length, "errors: 1");
console.log("mean:", Math.round(value.mean), "ms, p50:", Math.round(value.p50), "ms, p95:", Math.round(value.p95), "ms");
await obs.shutdown();
```

Output of `npx tsx metrics.ts`

```ts
requests: 10 errors: 1
mean: 60 ms, p50: 19 ms, p95: 365 ms
```

Nine requests took about 13 ms and one took 480 ms. The **mean** (average) of 60 ms describes none of them. That is why latency is watched as **percentiles**: `p95` is the time that 95% of requests stay under, so it shows the slow tail your unluckiest users feel. The histogram estimates percentiles from buckets, so the values are approximate: good enough to see "most are fast, some are very slow".

Alert on symptoms users feel: "p95 above 500 ms for 5 minutes", "more than 1% errors". When an alert fires, a **trace** of a slow request shows where the time went: 3 ms in your code, 470 ms waiting for the database. You created spans in the observability lesson; in production, send them to a tracing backend with an exporter, and sample a percentage of requests to keep the cost down.

## Health and readiness checks

Whatever runs your app (Docker, Kubernetes, a load balancer) asks it two different questions, over HTTP, every few seconds:

- **Liveness, `/health`:** "Is the process alive?" If not, restart it. Keep this check trivial. Never check the database here: if the database is down, restarting every app server would only make things worse.
- **Readiness, `/ready`:** "Can it serve traffic right now?" If not, stop sending it requests, but do not restart it. Check what a request needs: database connected, migrations done, caches warmed.

The generated project already registers a readiness check on the runtime. Here is the pattern with a database check. The database starts "down", so the app is alive but not ready:

probes.tsNode.js only

```ts
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createHttpServer, createNodeHttpAdapter, createResponseContext, type HttpRequestContext } from "@zudojs/http";
import { createLogger, LoggerLevel } from "@zudojs/logger";
import { createRuntime } from "@zudojs/runtime";

let databaseConnected = false;
const runtime = createRuntime(
  { modules: new Map<string, Module>(), eventBus: createEventBus(), container: createContainer(), logger: createLogger({ name: "task-api", level: LoggerLevel.ERROR }) },
  { applicationName: "task-api", environment: "production", handleSignals: false },
);
runtime.registerReadinessCheck("database", () => databaseConnected);
await runtime.start();

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request: HttpRequestContext) => {
    if (request.path === "/health") return { status: "alive" };
    if (request.path === "/ready") {
      await runtime.runReadinessChecks();
      const body = { ready: runtime.ready, health: runtime.health.state };
      return runtime.ready ? body : createResponseContext({ status: 503 }).json(body);
    }
    return createResponseContext({ status: 404 }).json({ error: "Not Found" });
  },
});
await server.start();

const probe = async (path: string) => {
  const response = await fetch(`http://127.0.0.1:${server.address?.port}${path}`);
  console.log(path.padEnd(7), response.status, await response.json());
};
await probe("/health");
await probe("/ready");
databaseConnected = true;
await probe("/ready");
await server.stop();
await runtime.stop();
```

Output of `npx tsx probes.ts`

```ts
/health 200 { status: 'alive' }
/ready  503 { ready: false, health: 'degraded' }
/ready  200 { ready: true, health: 'healthy' }
```

While the database was down, `/ready` answered 503 and the runtime reported itself `degraded`, but `/health` still said 200, so nothing would restart it. When the database came back, the app became ready again by itself. Readiness checks that hang count as failed after 5 seconds, so a stuck database cannot hang the probe.

> NOTE
>
> The `/health` route of a project made by `zudojs create` is a *readiness* check: it answers 503 while the app starts or stops, and when an integration added with `zudojs add` (the database, Redis) is down. Use it as the readiness probe. If your platform also wants a liveness probe, add a trivial route like the `/health` above.

> KEEP PROBES QUIET
>
> Health endpoints are public by default. Return only a status, never versions, hostnames, connection strings or error messages that help an attacker.

## Graceful shutdown

Every deployment stops the old version of your app. The platform sends the process the `SIGTERM` signal, waits a while (30 seconds in Kubernetes by default, 10 in Docker, 90 in systemd), and then kills it. A **graceful shutdown** uses that time well: stop accepting new requests, let the ones in flight finish, close the database, then exit. Without it, every deployment cuts some customers' requests in half.

`server.stop()` from `@zudojs/http` does the HTTP part. Here a request is saving an order when the stop begins:

shutdown.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter } from "@zudojs/http";

let started!: () => void;
const handlerStarted = new Promise<void>((resolve) => (started = resolve));

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  gracefulShutdownTimeout: 10_000,
  handler: async () => {
    console.log("handler: saving order…");
    started();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("handler: order saved");
    return { saved: true };
  },
});
await server.start();
const url = `http://127.0.0.1:${server.address?.port}/orders`;

const inFlight = fetch(url, { method: "POST" }).then(async (response) => console.log("client:", response.status, await response.json()));
await handlerStarted;

console.log("SIGTERM received: stopping");
const stopped = server.stop().then(() => console.log("server:", server.state));
await new Promise((resolve) => setTimeout(resolve, 100));
await fetch(url).catch((error: Error) => console.log("new request:", error.message));
await Promise.all([inFlight, stopped]);
```

Output of `npx tsx shutdown.ts`

```ts
handler: saving order…
SIGTERM received: stopping
new request: fetch failed
handler: order saved
client: 200 { saved: true }
server: stopped
```

Read the order of the lines. After the stop began, a new request was refused at once, so a load balancer sends it to another server. The order already being saved finished, and its client got a normal 200. Only then did the server report `stopped`.

In the generated `src/server.ts` the same thing is wired to the real signals: on `SIGINT` or `SIGTERM` it first lets the integrations close long-lived connections such as WebSockets, then calls `server.stop()`, then `runtime.stop()`, which shuts the modules down in reverse order (closing database pools, flushing logs), then exits. Keep your `gracefulShutdownTimeout` shorter than the platform's wait, or the platform kills the process mid-shutdown.

## Timeouts and retries

A request that waits forever is worse than one that fails: it holds memory, a connection and a customer. Set a limit at every edge:

- **Incoming:** the Node adapter already has tighter defaults than Node itself: 10 s to receive the headers, 30 s for the whole request (`headersTimeout`, `requestTimeout`). Lower them if your API should never take that long.
- **Outgoing:** every `HttpClient` gets a `timeout`, and `retry` only for safe methods, as in [the microservices lesson](https://zudojs.oyinlola.site/learn/zudo-microservices).
- **Database:** set a statement timeout (`SET statement_timeout = '5s'` in PostgreSQL) so one bad query cannot hold a connection for minutes.

## Rate limiting

A **rate limit** caps how many requests one client may make in a time window. It protects you from bugs in someone's script, from scraping, and from password guessing. `@zudojs/security`, from [the security lesson](https://zudojs.oyinlola.site/learn/zudo-security), counts per client:

rate-limit.tsNode.js only

```ts
import { createRateLimiter, retryAfterSeconds } from "@zudojs/security";

const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });

for (let attempt = 1; attempt <= 5; attempt++) {
  const decision = loginLimiter.check({ ip: "203.0.113.7" });
  console.log(`attempt ${attempt}:`, decision.allowed ? `allowed, ${decision.remaining} left` : `429, retry after ${retryAfterSeconds(decision)} s`);
}
console.log("another client:", loginLimiter.check({ ip: "198.51.100.2" }).allowed ? "allowed" : "blocked");
loginLimiter.destroy();
```

Output of `npx tsx rate-limit.ts`

```ts
attempt 1: allowed, 2 left
attempt 2: allowed, 1 left
attempt 3: allowed, 0 left
attempt 4: 429, retry after 60 s
attempt 5: 429, retry after 60 s
another client: allowed
```

In an app you use `createRateLimitMiddleware({ max, windowMs })` from `@zudojs/http`, which answers `429 Too Many Requests` with a `Retry-After` header. A project made by `zudojs create` already applies it to every route, set by `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. Give the login route a much stricter limiter of its own, like the one above. Two production details:

- **Behind a proxy**, every request comes from the proxy's address. Set `trustProxy` on the adapter to the proxy you run, as the deployment lesson shows, or everyone shares one bucket.
- **With several app servers**, an in-memory limiter counts per server. For a strict limit, keep the counters in Redis, shared by all servers.

## Caching

A cache, from [the caching lesson](https://zudojs.oyinlola.site/learn/zudo-cache), is the cheapest performance win and the easiest way to show stale data. The production rule: **every write must invalidate what it changed**. Tags make that one call:

cache.ts

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter({ maxEntries: 10_000 }), config: { defaultTtl: 60_000 } });
let price = 12;
let queries = 0;
const loadMug = async () => {
  queries += 1;
  return { sku: "mug", price };
};

for (let request = 1; request <= 3; request++) {
  const { value, cached } = await cache.getOrSet("product.mug", loadMug, { tags: ["products"] });
  console.log(`request ${request}: ${value.price} (${cached ? "cache" : "database"})`);
}

price = 10;
await cache.invalidateByTag(["products"]);
const after = await cache.getOrSet("product.mug", loadMug, { tags: ["products"] });
console.log(`after the price change: ${after.value.price}`);
console.log("database queries:", queries, "hit rate:", cache.getStats()?.hitRate);
```

Output of `npx tsx cache.ts` and of the browser terminal

```ts
request 1: 12 (database)
request 2: 12 (cache)
request 3: 12 (cache)
after the price change: 10
database queries: 2 hit rate: 0.5
```

Also give every entry a TTL (time to live), so a missed invalidation heals itself, and watch the hit rate on your dashboard: a cache with a low hit rate costs memory and adds a failure point for nothing. With several servers, use a shared cache such as Redis, or each server keeps its own stale copy.

## Database performance and connection pools

### Indexes

Most slow APIs are slow in the database. Without an index, PostgreSQL finds matching rows by reading the whole table, a **sequential scan**. `EXPLAIN` shows the plan it chose. Here with PGlite, on 20,000 orders:

explain.tsNode.js only

```ts
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INT NOT NULL, total INT NOT NULL);
  INSERT INTO orders (customer_id, total) SELECT g % 2000, g % 97 FROM generate_series(1, 20000) g;
  ANALYZE orders;
`);

async function measure(label: string) {
  const { rows } = await db.query<{ "QUERY PLAN": string }>("EXPLAIN SELECT * FROM orders WHERE customer_id = $1", [42]);
  console.log(label);
  for (const row of rows) console.log("  " + row["QUERY PLAN"].replace(/\s+\(cost=.*\)/, ""));
  const start = performance.now();
  for (let customer = 0; customer < 100; customer++) await db.query("SELECT * FROM orders WHERE customer_id = $1", [customer]);
  console.log(`  100 queries took ${Math.round(performance.now() - start)} ms`);
}

await measure("without an index:");
await db.exec("CREATE INDEX orders_customer_id_idx ON orders (customer_id)");
await measure("with an index:");
await db.close();
```

Output of `npx tsx explain.ts`

```ts
without an index:
  Seq Scan on orders
    Filter: (customer_id = 42)
  100 queries took 1180 ms
with an index:
  Bitmap Heap Scan on orders
    Recheck Cond: (customer_id = 42)
    ->  Bitmap Index Scan on orders_customer_id_idx
          Index Cond: (customer_id = 42)
  100 queries took 121 ms
```

The plan changed from reading every row to looking the value up in the index, and the same 100 queries got roughly ten times faster. The example removes the `cost=` estimates from each line to keep the plan readable; run `EXPLAIN` yourself to see them. Index the columns you filter, join and sort by often, such as foreign keys. Do not index everything: each index slows down writes a little.

Two more habits: **avoid N+1 queries** (one query for a list, then one more per item; use a join or `WHERE id = ANY($1)` instead), and **always paginate** lists with `LIMIT`.

### Connection pools

Opening a database connection is slow, and PostgreSQL allows only a limited number (100 by default). So apps keep a **pool**: a few connections opened once and lent to requests in turn. When all are busy, the next query waits in line. This simulation has a pool of 2 connections and 5 queries of 100 ms each:

pool.ts

```ts
class Pool {
  private free: number;
  private readonly waiting: Array<() => void> = [];
  constructor(size: number) {
    this.free = size;
  }

  async query(name: string): Promise<void> {
    if (this.free > 0) this.free -= 1;
    else {
      console.log(`${name}: all connections busy, waiting`);
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    console.log(`${name}: running`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const next = this.waiting.shift();
    if (next) next();
    else this.free += 1;
  }
}

const pool = new Pool(2);
await Promise.all(["q1", "q2", "q3", "q4", "q5"].map((name) => pool.query(name)));
```

Output of `npx tsx pool.ts` and of the browser terminal

```ts
q1: running
q2: running
q3: all connections busy, waiting
q4: all connections busy, waiting
q5: all connections busy, waiting
q3: running
q4: running
q5: running
```

Only two queries ran at a time. The other three waited, and each started when a connection was handed back, so the five queries took about 300 ms instead of 100 ms. Real pools (the `pg` package's `Pool`, Prisma's connection limit) work the same way. How to size one:

- **Total connections = pool size × number of app processes.** Four servers with a pool of 20 need 80 connections, close to PostgreSQL's default limit of 100.
- **Small is fine.** A database does its best work with a few busy connections. Start with 10 per process and raise it only if requests are measurably waiting for a connection.
- **Always set a wait timeout** for getting a connection, so a full pool fails fast instead of piling up requests.

## Practice

TRY IT YOURSELF

### Add a rule to the config schema

Extend the configuration schema with `LOG_LEVEL`, one of `debug`, `info`, `warn`, `error`, defaulting to `info`, and `CACHE_TTL_MS`, a whole number of at least 1000, defaulting to 60000. Show that `CACHE_TTL_MS=5` is refused.

**Show a solution**

config-more.ts

```ts
import { schema } from "@zudojs/schema";

const Extra = schema.object({
  LOG_LEVEL: schema.default(schema.enum(["debug", "info", "warn", "error"]), "info"),
  CACHE_TTL_MS: schema.coerce.number().int().min(1000).default(60_000),
});

console.log(Extra.parse({}));
const bad = Extra.safeParse({ CACHE_TTL_MS: "5" });
if (!bad.success) console.log(bad.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`));
```

Output of `npx tsx config-more.ts` and of the browser terminal

```json
{ LOG_LEVEL: 'info', CACHE_TTL_MS: 60000 }
[ 'CACHE_TTL_MS: too_small' ]
```

TRY IT YOURSELF

### Which probe?

For each check, decide whether it belongs in `/health` (liveness), `/ready` (readiness), or neither: the event loop is responsive; the database answers `SELECT 1`; the payment provider's API is reachable; database migrations have run; the disk has more than 1 GB free.

**Show a solution**

- Event loop responsive: **liveness**. If the process cannot answer at all, a restart helps.
- Database answers: **readiness**. Without it the app cannot serve, but a restart would not help.
- Payment provider reachable: **neither**. Most pages still work without it. Handle it per request with a timeout and a clear error, and watch it with a metric.
- Migrations have run: **readiness**, checked once at startup.
- Disk space: **neither**. That is a metric with an alert, long before it becomes an outage.

TRY IT YOURSELF

### Size a pool

Your database allows 100 connections. You keep 10 for yourself and for migrations. You run 6 app processes, and each process also runs a background worker with its own pool of 3. What is the largest safe pool size for the web part of each process?

**Show a solution**

pool-size.js

```ts
const limit = 100;
const reserved = 10;
const processes = 6;
const workerPool = 3;

const perProcess = Math.floor((limit - reserved) / processes);
console.log("connections per process:", perProcess);
console.log("web pool size:", perProcess - workerPool);
```

Output of `node pool-size.js` and of the browser terminal

```ts
connections per process: 15
web pool size: 12
```

Then check the plan still holds during a deployment, when old and new processes may run at the same time for a moment. If it does not, lower the pool size or put a connection pooler such as PgBouncer in front of the database.

## Recap

- Set `NODE_ENV=production`. Take every setting from the environment, check it at startup, and never print a secret.
- Log one JSON line per event with a level and a request id. Measure traffic, errors and latency percentiles, and trace slow requests.
- `/health` answers "alive?", `/ready` answers "can serve?". Only readiness checks dependencies.
- On `SIGTERM`, stop taking requests, finish the ones in flight, then close resources.
- Put timeouts on every edge, rate-limit public endpoints, cache hot reads with tags and TTLs, index what you query, and keep connection pools small.

Your app is ready for production. Next, you put it there: a build, a server, Docker, a database, HTTPS and backups.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
