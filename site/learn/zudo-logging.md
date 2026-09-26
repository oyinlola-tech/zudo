---
title: "Structured logging — ZudoJS Academy"
description: "Replace console.log with structured entries a program can search: levels, child loggers, request ids, redaction and JSON logs with @zudojs/logger."
source: https://zudojs.oyinlola.site/learn/zudo-logging
---

LEVEL 14 · LESSON 12 OF 18

Quality and insight Advanced

# Structured logging

Replace console.log with structured entries a program can search: levels, child loggers, request ids, redaction and JSON logs with @zudojs/logger.

- **40 min** to read and try
- **You need:** The Task API project and the testing lesson
- **You build:** A Task API logger that prints readable lines in development, JSON in production, and tags every request with an id

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Write structured log entries with a fixed message and searchable metadata, instead of sentences
- Set a logger's threshold level and read it from a LOG_LEVEL environment variable
- Tag every line of one request with the same id using withContext and child loggers
- Log a thrown error once, with its stack trace, and separate a 4xx from a 5xx
- Keep secret field names out of logs with redaction, and switch to JSON output in production

## Why structured logs

A **log** is the diary of a running program: one line for each thing worth remembering. When a user says "my task disappeared yesterday at 14:05", the logs are often the only way to find out what happened.

So far you logged with `console.log` and a sentence. That is easy to write and hard to use later. Compare two ways to write the same three events:

why.js

```ts
const sentences = [
  "Task 7 created by ada",
  "ada completed task 7",
  "Task 9 created by linus",
];

const records = [
  { level: "info", message: "task created", taskId: 7, userId: "ada" },
  { level: "info", message: "task completed", taskId: 7, userId: "ada" },
  { level: "info", message: "task created", taskId: 9, userId: "linus" },
];

console.log(sentences.filter((line) => line.includes("ada")));
console.log(records.filter((r) => r.userId === "ada").map((r) => r.message));
console.log(records.filter((r) => r.taskId === 7).length, "events for task 7");
```

Output of `node why.js` and of the browser terminal

```json
[ 'Task 7 created by ada', 'ada completed task 7' ]
[ 'task created', 'task completed' ]
2 events for task 7
```

Searching sentences means guessing how each one was worded. The second list is a **structured log**: every entry is a record with named fields. A short, fixed **message** says what happened, and the details go into separate fields, called **metadata**. Log tools can then filter by `userId`, count by `message` or chart a `durationMs`, the same way you query a database table.

## Your first logger

`@zudojs/logger` is already in the Task API: the CLI installed it, and `src/app.ts` creates the logger that the runtime uses. (`npm ls @zudojs/logger` shows the version, 1.4 or later.) In a new project you would run `npm install @zudojs/logger`. Create a logger and write one entry:

first.ts

```ts
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "task-api" });

logger.info("task created", { taskId: 7, userId: "ada" });
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
2026-09-23T17:13:02.238Z [INFO] [task-api] task created taskId=7 userId=ada
```

These are the lines you saw when you started the Task API with `npm run dev`. When you configure nothing, the logger uses a text formatter and prints each entry to the console as one readable line. Two options decide what you see and where it goes:

- A **formatter** turns an entry into text: a readable line, or a line of JSON.
- A **transport** sends the entry somewhere: the terminal, a file, a log service. It can be a plain function. It receives the entry: `entry.message` is your raw message, and `entry.formatted` is the formatter's finished line. Its type says it may be missing, so write `entry.formatted ?? entry.message`.

format.ts

```ts
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter(),
  transports: [(entry) => console.log(entry.formatted ?? entry.message, "| raw:", entry.message)],
});

logger.info("task created", { taskId: 7, userId: "ada", title: "Buy milk" });
logger.warn("slow query", { durationMs: 840 });
```

Output of `npx tsx format.ts` and of the browser terminal

```ts
2026-09-23T17:20:16.059Z [INFO] [task-api] task created taskId=7 userId=ada title="Buy milk" | raw: task created
2026-09-23T17:20:16.064Z [WARN] [task-api] slow query durationMs=840 | raw: slow query
```

One line per entry: time, level, logger name, message, then the metadata as `key=value` pairs. A value with a space gets quotes, so `title="Buy milk"` stays one field. After the `|`, the raw `message` is still just `task created`: a transport that sends entries to a log service can send the fields, not the finished line. To keep the rest of this page free of changing timestamps, the next examples pass `createTextLoggerFormatter({ includeTimestamp: false })`. Always keep the time in a real application.

## Levels

Every entry has a **level** that says how serious it is. There are six, from most to least serious:

| Level | Use it for | Task API example |
| --- | --- | --- |
| `fatal` | The process cannot continue. | The database settings are missing at start-up. |
| `error` | Something failed that should have worked. | Saving a task threw. |
| `warn` | Unusual, but handled. | A query took 2 seconds. A login failed. |
| `info` | Normal, important events. | Server started. Task created. |
| `debug` | Details for a developer who is hunting a bug. | The SQL that ran and its parameters. |
| `trace` | Even more detail, step by step. | Every cache lookup. |

A logger has a **threshold** level, `info` by default. It writes entries at that level or more serious, and silently drops the rest:

levels.ts

```ts
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

logger.debug("cache miss", { key: "tasks:ada" });
logger.info("task created", { taskId: 7 });

logger.setLevel("debug");
logger.debug("cache miss", { key: "tasks:ada" });

logger.setLevel("warn");
logger.info("task created", { taskId: 8 });
logger.error("could not save task", { taskId: 8 });
```

Output of `npx tsx levels.ts` and of the browser terminal

```json
[INFO] [task-api] task created taskId=7
[DEBUG] [task-api] cache miss key=tasks:ada
[ERROR] [task-api] could not save task taskId=8
```

The first `debug` entry and the last `info` entry were dropped. That is the point of levels: you can leave `debug` lines in your code, and switch them on only while you look for a bug. You can name a level as a string (`"debug"`, in any case) or with the `LoggerLevel` enum (`LoggerLevel.DEBUG`). An unknown name throws, so a typo cannot switch your logs off.

The level belongs in configuration, not in code. At the end of this lesson you read it from a `LOG_LEVEL` environment variable.

## Metadata and child loggers

Some fields belong on every entry of one part of the app: which module wrote it, which version is running. A **child logger** is a copy of a logger with a new name and extra metadata. It shares the parent's formatter, transports and level:

child.ts

```ts
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  metadata: { version: "0.1.0" },
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

const dbLogger = logger.child({ name: "task-api.db", metadata: { component: "db" } });
const mailLogger = logger.child({ name: "task-api.mail", metadata: { component: "mail" } });

logger.info("server started", { port: 3000 });
dbLogger.info("connected", { pool: 10 });
mailLogger.warn("mail server slow", { durationMs: 2300 });
```

Output of `npx tsx child.ts` and of the browser terminal

```json
[INFO] [task-api] server started version=0.1.0 port=3000
[INFO] [task-api.db] connected version=0.1.0 component=db pool=10
[WARN] [task-api.mail] mail server slow version=0.1.0 component=mail durationMs=2300
```

Give each module its own child logger once, when the app starts, and pass it in, just like the event bus in [the events lesson](https://zudojs.oyinlola.site/learn/zudo-events). Do not call `createLogger` inside a service: the placeholder `AppService` the CLI generated did that (the [runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime#task-api) replaced it), and such a logger ignores every setting you give the main one.

## Request ids and context

The Task API serves many users at once, so the log lines of different requests are mixed together. To follow one request, give it a **request id**, a unique string, and put it on every line that request writes. Then one search for that id shows the whole story. When several services pass the same id along, it is called a **correlation id**: you will use one in [the observability lesson](https://zudojs.oyinlola.site/learn/zudo-observability).

`logger.withContext(context)` returns a logger that adds a **context** to every entry. `createLoggerContext` knows the usual identifiers (`requestId`, `correlationId`, `traceId`, `userId`, `tenantId` and more) and takes extra fields in `metadata`:

context.ts

```ts
import { createLogger, createLoggerContext, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

const requestLog = logger.withContext(
  createLoggerContext({ requestId: "req-41", userId: "ada", metadata: { route: "POST /tasks" } }),
);

requestLog.info("task created", { taskId: 7 });
requestLog.child({ name: "task-api.db" }).info("row inserted", { table: "tasks" });
logger.info("no request here");
```

Output of `npx tsx context.ts` and of the browser terminal

```json
[INFO] [task-api] task created requestId=req-41 userId=ada route="POST /tasks" taskId=7
[INFO] [task-api.db] row inserted requestId=req-41 userId=ada route="POST /tasks" table=tasks
[INFO] [task-api] no request here
```

The context also travels into child loggers of the scoped logger. The original `logger` is unchanged.

## Log every request

Now make it automatic. This wrapper goes around the Task API's request handler. For every request it creates an id, builds a scoped logger, and writes one line when the request is done: method, path, status and how long it took. The handler receives the scoped logger, so everything it logs carries the same id:

request-logging.tsNode.js only

```ts
import { randomUUID } from "node:crypto";
import { createHttpServer, createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type { HttpRequestContext, HttpResponseContext } from "@zudojs/http";
import { createLogger, createLoggerContext, createTextLoggerFormatter } from "@zudojs/logger";
import type { Logger } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

type Handler = (request: HttpRequestContext, log: Logger) => Promise<HttpResponseContext>;

function withRequestLogging(handler: Handler) {
  return async (request: HttpRequestContext): Promise<HttpResponseContext> => {
    const log = logger.withContext(createLoggerContext({ requestId: randomUUID() }));
    const started = performance.now();
    const response = await handler(request, log);
    const duration = `${Math.round(performance.now() - started)}ms`;
    log.info("request done", { method: request.method, path: request.path, status: response.status, duration });
    return response;
  };
}

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ port: 0 }),
  handler: withRequestLogging(async (request, log) => {
    if (request.path === "/tasks") {
      log.info("listing tasks", { count: 1 });
      return createResponseContext().json([{ id: 7, title: "Buy milk" }]);
    }
    return createResponseContext({ status: 404 }).json({ error: "Not Found" });
  }),
});

await server.start();
const base = `http://localhost:${server.address?.port}`;
for (const path of ["/tasks", "/nope"]) {
  const response = await fetch(base + path);
  console.log("client got", response.status);
}
await server.stop();
```

Output of `npx tsx request-logging.ts`

```json
[INFO] [task-api] listing tasks requestId=090ee428-38fe-43d3-9eff-5877a964b344 count=1
[INFO] [task-api] request done requestId=090ee428-38fe-43d3-9eff-5877a964b344 method=GET path=/tasks status=200 duration=3ms
client got 200
[INFO] [task-api] request done requestId=54a04b7e-67a2-43e7-a09a-c0e55f828fe0 method=GET path=/nope status=404 duration=0ms
client got 404
```

`randomUUID()` creates an id that is unique in practice. The two lines of the first request share one id, so you can tell them apart from the second request's line. The server starts on port 0, which means "any free port", and the example stops it after two requests, so it can run to the end.

> A REQUEST ID FROM THE CLIENT IS ONLY A LABEL
>
> Some clients send their own `x-request-id` header, and by default `@zudojs/http` reuses a valid one as `request.id` (see [the middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware)). That is useful behind your own proxy or gateway, which sets the id for you. But on a public API, anyone can pick the id and mix fake lines into another request's story. There, create the adapter with `createNodeHttpAdapter({ trustRequestId: false })` so every request gets an id your server made, and if you want to keep the client's value, log it as a separate field. Never treat any request id as proof of anything.

## Logging errors

When something throws, log the **error object**, not just its message: the object carries its name and the **stack trace**, the list of function calls that led to the error. `logError(logger, error, message, metadata)` writes an `error` entry with the error attached:

log-error.ts

```ts
import { BaseError, NotFoundError } from "@zudojs/errors";
import { createLogger, createTextLoggerFormatter, logError } from "@zudojs/logger";
import type { Logger } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  formatter: createTextLoggerFormatter({ includeTimestamp: false, includeStackTrace: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

function logFailure(log: Logger, error: unknown, route: string): number {
  const status = error instanceof BaseError ? error.statusCode : 500;
  if (status < 500) {
    log.warn("request rejected", { route, status, reason: error instanceof Error ? error.message : "unknown" });
  } else {
    logError(log, error instanceof Error ? error : new Error(String(error)), "request failed", { route, status });
  }
  return status;
}

logFailure(logger, new NotFoundError("Task 9 not found"), "GET /tasks/9");
logFailure(logger, new Error("connect ECONNREFUSED 127.0.0.1:5432"), "POST /tasks");
```

Output of `npx tsx log-error.ts` and of the browser terminal

```json
[WARN] [task-api] request rejected route="GET /tasks/9" status=404 reason="Task 9 not found"
[ERROR] [task-api] request failed route="POST /tasks" status=500 error={"name":"Error","message":"connect ECONNREFUSED 127.0.0.1:5432"}
```

The error entry ends with the error's name and message. `includeStackTrace: false` left out the stack trace to keep this page short. Save the example on your computer, remove that option, and run it. Now the error entry continues with the stack trace, one call per line:

Terminal on your computer

```bash
$ npx tsx log-error.ts
[WARN] [task-api] request rejected route="GET /tasks/9" status=404 reason="Task 9 not found"
[ERROR] [task-api] request failed route="POST /tasks" status=500
Error: connect ECONNREFUSED 127.0.0.1:5432
    at <anonymous> (~/task-api/log-error.ts:22:20)
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

The first frame points at line 22 of your file, where the error was created. That is where you start looking.

`logError` is not the only place an `Error` can end up. Since `@zudojs/logger` 1.5.0, an `Error` nested anywhere in metadata, such as `logger.error("retry failed", { cause: previousError })`, is normalized the same way when the entry is built: `{ name, message, stack, …ownFields }`, with its own fields redacted like any other metadata and a self-referential `cause` written as `"[Circular]"`. Before that fix, an error nested this way had no enumerable properties of its own, so a custom transport that stringifies `entry.metadata` saw `{}` and the failure it was trying to record vanished. The built-in formatters already rendered it correctly; the fix is for your own transports.

Two rules make error logs useful:

- **4xx is not an error of your server.** A missing task or a bad request body is the client's mistake. Log it as `warn` (or `info`), without a stack trace. Keep `error` for 5xx, the failures you must fix. If every 404 is an `error`, the real errors drown.
- **Log an error once.** Do not log it in the repository, again in the service, and again in the handler. Let it travel up, and log it in one place: the request wrapper. There you have the request id too.

The error details go to the log, never to the client. The client gets the status and a safe message, as you saw in [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors).

## Keep secrets out of logs

Logs are read by many people and kept for a long time, often in another company's service. A password or token that lands in a log has leaked. The logger **redacts** (hides) metadata fields whose *name* looks secret, before any formatter or transport sees them:

REASON IT OUT

### Redaction checks a field's name, such as password or token. Why not also scan every value and hide anything that looks like a secret?

A name-based check is a simple, fast lookup the logger can run on every entry without understanding what your app's data means. Scanning values for "looks like a secret" is a much harder problem: a credit card number, a UUID, a phone number and an ordinary large id can look alike in different apps, and any pattern strict enough to catch real secrets will also redact things that were never secret, such as an order id that happens to be 16 digits. What would you rather have: a fast, predictable rule you can reason about and extend with your own key names, or a heuristic that sometimes hides data you needed and sometimes lets a secret through because it did not match the pattern?

**Show the reasoning**

The logger keeps the fast, predictable rule, and pushes the harder problem back onto you at the one place you actually know what a value means: where you decide what goes into metadata in the first place. That is also why the rule cannot help the second example below, where a secret is glued into the message text rather than kept in a named field — there is no field name to check at all once a value has been interpolated into a string. Name-based redaction is a safety net for the metadata you already intended to log, not a substitute for deciding, at the call site, that a value should never be logged.

redaction.ts

```ts
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "task-api",
  redact: { keys: ["email"] },
  formatter: createTextLoggerFormatter({ includeTimestamp: false }),
  transports: [(entry) => console.log(entry.formatted ?? entry.message)],
});

logger.info("login", {
  userId: "ada",
  email: "ada@example.com",
  password: "hunter2",
  headers: { authorization: "Bearer abc.def", "x-api-key": "k-123", accept: "application/json" },
  sessionId: "s-77",
});

const password = "hunter2";
logger.warn(`BAD: login failed with password ${password}`);

logger.info("task created", { title: "Buy milk\n[ERROR] [task-api] fake entry" });
```

Output of `npx tsx redaction.ts` and of the browser terminal

```json
[INFO] [task-api] login userId=ada email=[REDACTED] password=[REDACTED] headers={"authorization":"[REDACTED]","x-api-key":"[REDACTED]","accept":"application/json"} sessionId=[REDACTED]
[WARN] [task-api] BAD: login failed with password hunter2
[INFO] [task-api] task created title="Buy milk\n[ERROR] [task-api] fake entry"
```

- Redaction is on by default. It knows names like `password`, `token`, `authorization`, `cookie`, `session`, `apiKey` and `x-api-key`, also inside nested objects. `redact.keys` adds your own names, here `email`, which is personal data.
- It works on field **names** only. The second line leaked the password, because it was glued into the message text. Never build messages from outside values. Put values in metadata, and leave secrets out completely.
- The last title contains a newline, an attempt to fake a second log line. This is called **log injection**. The formatter escaped it to `\n`, so it stays inside one entry.

## Production: JSON on standard output

In production nobody reads the terminal. The platform that runs your app (Docker, Kubernetes, a cloud service) collects everything the process writes to **standard output** and ships it to a log store. The usual rules:

- Write **one JSON object per line**. Log stores read JSON fields without guessing.
- Write to standard output, not to files. Collecting and rotating files is the platform's job.
- Before the process exits, **flush**: wait until every entry has been written.

`createJsonLoggerFormatter()` turns each entry into one line of JSON, and a transport that calls `process.stdout.write` sends it to standard output. `await logger.flush()` waits for pending writes. The next section puts these together.

## Put it together: the Task API logger

Put the choice in one place. The generated project has a `src/loggers` folder for exactly this (its `index.ts` is empty). Create a file there:

src/loggers/app.logger.tsNode.js only

```ts
import {
  createJsonLoggerFormatter,
  createLogger,
  createTextLoggerFormatter,
  LoggerLevel,
  loggerLevelFromName,
} from "@zudojs/logger";
import type { Logger } from "@zudojs/logger";

export interface LoggerEnv {
  readonly NODE_ENV?: string;
  readonly LOG_LEVEL?: string;
}

export function createAppLogger(env: LoggerEnv = process.env): Logger {
  const production = env.NODE_ENV === "production";
  const level = env.LOG_LEVEL?.trim() ? loggerLevelFromName(env.LOG_LEVEL.trim()) : LoggerLevel.INFO;
  return createLogger({
    name: "task-api",
    level,
    environment: production ? "production" : "development",
    formatter: production ? createJsonLoggerFormatter() : createTextLoggerFormatter(),
    transports: [(entry) => {
      process.stdout.write((entry.formatted ?? entry.message) + "\n");
    }],
  });
}
```

src/check-logger.tsNode.js only

```ts
import { InvalidLoggerLevelError } from "@zudojs/logger";
import { createAppLogger } from "./loggers/app.logger.js";

const dev = createAppLogger({ LOG_LEVEL: "debug" });
dev.debug("dev logger ready", { level: dev.level });

const prod = createAppLogger({ NODE_ENV: "production" });
prod.debug("hidden: production defaults to info");
prod.info("prod logger ready", { level: prod.level });
await Promise.all([dev.flush(), prod.flush()]);

try {
  createAppLogger({ LOG_LEVEL: "loud" });
} catch (error) {
  if (error instanceof InvalidLoggerLevelError) console.log(error.name, "-", error.message);
}
```

Output of `npx tsx src/check-logger.ts`

```ts
2026-09-23T13:52:19.445Z [DEBUG] [task-api] dev logger ready level=4
{"id":"log:4821dea8-8c95-47ad-aa4c-499421a11562","level":3,"levelName":"info","message":"prod logger ready","metadata":{"level":3},"logger":"task-api","timestamp":"2026-09-23T13:52:19.448Z","timestampMs":1790171539448,"environment":"production"}
InvalidLoggerLevelError - Invalid logger level: loud.
```

The production entry has a unique `id`, the level as a number and as a name, the message, the metadata as a real JSON object, and the time twice: as text and as milliseconds. Redaction runs in both formats. An error entry adds an `error` object with `name`, `message` and `stack`.

`LOG_LEVEL=debug` and `LOG_LEVEL=DEBUG` both work. An unknown `LOG_LEVEL` throws at start-up, where you notice it at once, instead of silently logging nothing for weeks. The function takes the environment as a parameter, with `process.env` as the default. That makes it easy to test, as you did in [the testing lesson](https://zudojs.oyinlola.site/learn/zudo-testing): pass a plain object instead of changing real environment variables.

Now use it in `src/app.ts`. Replace the `createLogger` line and its import:

src/app.ts (part)Node.js only

```ts
import { createAppLogger } from "./loggers/app.logger.js";

// inside createApp():
  const logger = createAppLogger();
```

`createAppLogger()` reads `process.env`. By the time `createApp` runs, `src/server.ts` has already called `loadConfig()`, which loads `.env`, so a `LOG_LEVEL=debug` line in `.env` works too.

Start the server in development mode, then in production mode. `NODE_ENV=production` before a command sets that variable for that one command. Stop each one with Ctrl + C:

Terminal on your computer

```bash
$ npx tsx src/server.ts
2026-09-23T22:27:56.920Z [INFO] [task-api] store connected
2026-09-23T22:27:56.923Z [INFO] [task-api] tasks ready, 1 in store
2026-09-23T22:27:56.924Z [INFO] [task-api] All modules initialized. modules=["integrations","store","tasks"] durationMs=8
…
Listening on http://127.0.0.1:3000
^CReceived SIGINT: shutting down.
2026-09-23T22:27:57.847Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
…
$ NODE_ENV=production npx tsx src/server.ts
{"id":"log:5650dcd0-1346-430e-b8ff-666f2fe3f689","level":3,"levelName":"info","message":"store connected","metadata":{},"logger":"task-api","timestamp":"2026-09-23T22:28:00.281Z","timestampMs":1790202480281,"environment":"production"}
{"id":"log:9b821f34-ee23-4027-80f4-42261e93957d","level":3,"levelName":"info","message":"tasks ready, 1 in store","metadata":{},"logger":"task-api","timestamp":"2026-09-23T22:28:00.284Z","timestampMs":1790202480284,"environment":"production"}
{"id":"log:e746d054-67ae-4dda-b14b-6e895520209d","level":3,"levelName":"info","message":"All modules initialized.","metadata":{"modules":["integrations","store","tasks"],"durationMs":7},"logger":"task-api","timestamp":"2026-09-23T22:28:00.284Z","timestampMs":1790202480284,"environment":"production"}
…
Listening on http://0.0.0.0:3000
^CReceived SIGINT: shutting down.
{"id":"log:91f641ba-5755-4555-acb7-c47cf67b9c5a","level":3,"levelName":"info","message":"Initiating graceful shutdown.","metadata":{"timeoutMs":30000},"logger":"task-api","timestamp":"2026-09-23T22:28:01.303Z","timestampMs":1790202481303,"environment":"production"}
…
```

The runtime's own lines and your modules' lines now use your format: readable text in development, one JSON object per line in production. So do the bug reports from [the errors lesson](https://zudojs.oyinlola.site/learn/zudo-errors#task-api), because `src/server.ts` builds them with `logBugs(runtime.context.logger)`, the same logger. Two lines are still plain text: `Listening on …` and `Received SIGINT: shutting down.`, both `console.log` calls in `src/server.ts`. Log collectors keep a line that is not JSON as plain text, so they do no harm; to make them JSON too, write them with the same logger, for example `runtime.context.logger.info("listening", { host: config.host, port: config.port })`.

> TIP
>
> On Windows PowerShell, set the variable first: `$env:NODE_ENV="production"; npx tsx src/server.ts`.

## Practice

TRY IT YOURSELF

### Count entries per level

A transport can do more than print. Write one that counts entries per level name in a `Map` (use `entry.levelName`). Log two `info` entries, one `warn` and one `debug` with the default level, then print the map.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Inside the transport, read the current count with `counts.get(entry.levelName) ?? 0` before writing it back with `counts.set`.

HINT 2

`counts.set(entry.levelName, (counts.get(entry.levelName) ?? 0) + 1);`. The `debug` call never reaches the transport at all, because the default level is `info`.

SOLUTION

count-levels.ts

```ts
import { createLogger } from "@zudojs/logger";

const counts = new Map<string, number>();
const logger = createLogger({
  name: "task-api",
  transports: [(entry) => {
    counts.set(entry.levelName, (counts.get(entry.levelName) ?? 0) + 1);
  }],
});

logger.info("task created");
logger.info("task completed");
logger.warn("slow query");
logger.debug("cache miss");
console.log(counts);
```

Output of `npx tsx count-levels.ts` and of the browser terminal

```ts
Map(2) { 'info' => 2, 'warn' => 1 }
```

The `debug` entry never reached the transport: the level check happens first. A transport like this is also handy in tests, to check what your code logged.

TRY IT YOURSELF

### Find the leaks

Which of these lines leak a secret into the logs, and how do you fix them? (a) `log.info("login", { user, password })` (b) `log.info(\`token issued: ${token}\`)` (c) `log.debug("request", { headers: request.headers })` (d) `log.info("user", { profile: { name, creditCard, phone } })`

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Redaction checks a field *name*, at any depth of an object. Ask, for each case, whether the secret value sits in a named field at all, or whether it has already been merged into plain text.

HINT 2

(a) and part of (d) are already covered by the built-in name list. (b) has no field to redact, because a template literal is just a string. (c) and the rest of (d) need a decision about which fields belong in a log at all, not just whether the logger recognises their names.

SOLUTION

(a) is safe: `password` is redacted by name. (b) leaks: the token is inside the message text, which is never redacted. Log `"token issued"` with a harmless field like `{ userId }` instead. (c) is safe for `authorization` and `cookie`, but you still log every other header, some of which may be personal. Log only the headers you need. (d) half leaks: `creditCard` is redacted by default (the list also knows `cardNumber`, `cvv` and `ssn`), but `phone` is personal data the logger does not know about. Add it with `redact: { keys: ["phone"] }`. Better still, log only the `userId`, and never put card data in a log object at all.

## Recap

- Structured logs are records: a short fixed message plus named metadata fields that tools can search.
- A formatter turns an entry into text (readable text or JSON). A transport sends it somewhere. A transport can be a plain function.
- Six levels, from `fatal` to `trace`. The threshold (default `info`) drops the less serious ones. Read it from `LOG_LEVEL` and reject typos.
- Child loggers add a name and metadata. `withContext` adds a request id to every line of one request.
- Log errors once, with the error object. 4xx is `warn`, 5xx is `error`.
- Redaction hides secret field names, but never text inside the message. Log injection is escaped.
- In production: one JSON object per line on standard output, and flush before exit.

Next, [Observability](https://zudojs.oyinlola.site/learn/zudo-observability) adds metrics and traces alongside these logs, sharing one trace id across a request and every service it touches.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
