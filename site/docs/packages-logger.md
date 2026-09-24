---
title: "@zudojs/logger — Structured Logging Documentation"
description: "Complete documentation for @zudojs/logger — structured logging with transports, formatters, context propagation, and lifecycle management for the Zudojs framework."
source: https://zudojs.oyinlola.site/docs/packages-logger
---

v1.4.0

# @zudojs/logger

Structured logging with transports, formatters, context propagation, child loggers, and lifecycle management. Every log entry is a typed, serialized object flowing through a configurable pipeline.

LOGGING STRUCTURED TRANSPORTS CONTEXT

## INSTALLATION

```ts
// npm
npm install @zudojs/logger

// pnpm
pnpm add @zudojs/logger

// yarn
yarn add @zudojs/logger
```

> **Peer Dependency:** `@zudojs/logger` depends on `@zudojs/errors` for its error hierarchy (`LoggingError`, `LoggerTransportError`, etc.).

## WHAT IT DOES

`@zudojs/logger` is the structured logging infrastructure for Zudojs. It provides:

- **Structured logging** — every log entry is a typed `LoggerEntry` object, not a plain string
- **Six log levels** — FATAL, ERROR, WARN, INFO, DEBUG, TRACE with numeric severity ordering
- **Multiple transports** — console, buffered, conditional, and multi-transport composition
- **Formatters** — JSON, text, compact, structured, development, and production formatters
- **Context propagation** — correlationId, requestId, traceId, spanId, userId, tenantId, sessionId, jobId, moduleId, operationId
- **Child loggers** — inherit parent configuration and merge metadata
- **Factory pattern** — `LoggerFactory` manages logger creation, caching, and lifecycle
- **Lifecycle management** — enable/disable, flush, close, and dispose operations
- **Buffered transport** — batch entries before forwarding with configurable size and flush interval
- **Conditional transport** — forward entries only when a predicate passes
- **Async logging** — optional asynchronous dispatch with configurable transport timeout

> **Core Principle:** Log entries are structured data objects, not formatted strings. The formatter layer handles presentation; the transport layer handles delivery. This separation makes it trivial to switch between development and production output without touching application code.

## WHERE IT SITS

APPLICATION LAYER (CQRS, Modules, Handlers)

FEATURE PACKAGES (http, database, cache, auth, queue)

LOGGER (@zudojs/logger)

@zudojs/errors (FOUNDATION LEAF PACKAGE)

`@zudojs/logger` sits in the infrastructure layer. Application code and feature packages create loggers. The logger formats entries and dispatches them to transports. Its only internal dependency is `@zudojs/errors` for the error hierarchy.

## DEPENDENCIES

| Package | Version | Purpose |
| --- | --- | --- |
| @zudojs/errors | Same release (`workspace:*`) | Error hierarchy (LoggingError, LoggerTransportError, LoggerFormatterError, etc.) |
| Dev dependencies: typescript 7.x, vitest |  |  |

> **Internal dependencies:** Packages depend on each other with `workspace:*`, always — including on `main`. They are never hand-pinned to an exact version. At publish time `pnpm` rewrites each `workspace:*` to the exact version of that package in the same release, so a published tarball carries real ranges. Releases go out through `publish-all.sh`, which runs `pnpm -r publish` — it rewrites the ranges and publishes in dependency order. Plain `npm publish` does not understand the `workspace:` protocol and would ship a literal `workspace:*` to the registry.

## LOG LEVELS

Six severity levels with numeric ordering. Lower values represent more severe messages. The logger compares `messageLevel <= threshold` to decide whether to emit.

### Enum: LoggerLevel

```ts
enum LoggerLevel {
  FATAL = 0,
  ERROR = 1,
  WARN  = 2,
  INFO  = 3,
  DEBUG = 4,
  TRACE = 5,
}
```

### Type: LoggerLevelName

```ts
type LoggerLevelName =
  "fatal" | "error" | "warn" | "info" | "debug" | "trace";
```

### Type: LoggerLevelLike

Wherever you configure a level (`createLogger({ level })`, `setLevel()`, `child({ level })`), you can pass the enum value or its name in any case. `"warning"` and `"information"` also work, as aliases of `"warn"` and `"info"`.

```ts
type LoggerLevelLike =
  LoggerLevel | LoggerLevelName | Uppercase<LoggerLevelName>;
```

### Utility Functions

| Function | Signature | Returns |
| --- | --- | --- |
| loggerLevelToName | (level: LoggerLevel) => LoggerLevelName | Converts numeric level to canonical string name |
| loggerLevelFromName | (name: string) => LoggerLevel | Converts string name to enum value (accepts "warning", "information") |
| resolveLoggerLevel | (level: LoggerLevelLike) => LoggerLevel | Turns an enum value or a name in any case into the enum value; throws `InvalidLoggerLevelError` for anything else |
| shouldLog | (threshold, messageLevel) => boolean | True if message should be emitted at the given threshold |
| getLoggerLevels | () => readonly LoggerLevel[] | Returns all six canonical levels |
| getLoggerLevelNames | () => readonly LoggerLevelName[] | Returns all six canonical level names |

> **Threshold Behavior:** A logger set to `LoggerLevel.WARN` (2) emits FATAL (0), ERROR (1), and WARN (2). It suppresses INFO (3), DEBUG (4), and TRACE (5).

### Setting a level by name

Levels often come from an environment variable such as `LOG_LEVEL=debug`, so a name is accepted anywhere a level is. The logger stores the enum value, which is why `logger.level` prints a number.

```ts
import { createLogger, resolveLoggerLevel } from "@zudojs/logger";

const logger = createLogger({ name: "svc", level: "error" });
console.log(logger.level);          // 1  (LoggerLevel.ERROR)

logger.setLevel("DEBUG");
console.log(logger.level);          // 4

const child = logger.child({ level: "trace" });
console.log(child.level);           // 5

console.log(resolveLoggerLevel("Warn")); // 2

createLogger({ level: "verbose" });
// throws InvalidLoggerLevelError: Invalid logger level: verbose.
```

> **Changed in 1.4.0:** names are accepted in any case, and an unknown level now throws instead of quietly switching output off. `createLogger()` and `child()` throw `InvalidLoggerLevelError`; `setLevel()` throws `LoggerConfigurationError`. A typo such as `LOG_LEVEL=verbose` now fails at startup rather than leaving you with an empty log.

## LOGGER INTERFACE

The core contract every logger implementation satisfies. Application code depends on this interface, not concrete classes.

### Interface: Logger

```ts
interface Logger {
  readonly name: string;
  readonly level: LoggerLevel;
  readonly enabled: boolean;

  fatal(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  debug(message: string, metadata?: LogMetadata): void;
  trace(message: string, metadata?: LogMetadata): void;

  log(level: LoggerLevel, message: string, options?: LogOptions): void;

  child(options?: ChildLoggerOptionsInput): Logger;
  withContext(context: LoggerContext): Logger;

  setLevel(level: LoggerLevelLike): void;
  enable(): void;
  disable(): void;

  flush(): Promise<void>;
  close(): Promise<void>;
}
```

### Methods

| Method | Description |
| --- | --- |
| fatal / error / warn / info / debug / trace | Log at the corresponding severity level with optional metadata. To log a caught `Error` with its stack, see [Logging errors](#logging-errors) |
| log(level, message, options?) | Dynamic level logging with extended options (`error`, `metadata`, `source`, `context`). The typed way to log an `Error` together with metadata |
| child(options?) | Creates a child logger inheriting configuration and merging metadata; its `level` may also be a name |
| withContext(context) | Returns a scoped logger that injects context into every entry |
| setLevel(level) | Changes the log level threshold at runtime. Takes `LoggerLevel.DEBUG` or a name such as `"debug"` / `"DEBUG"` |
| enable() / disable() | Toggle the logger on/off without destroying it |
| flush() | Waits for all in-flight writes (including child loggers') and flushes every transport; one failing transport does not stop the others |
| close() | Flushes and releases all transport resources |

## CREATING LOGGERS

### Function: createLogger

```ts
function createLogger(options?: LoggerOptions): Logger
```

### Interface: LoggerOptions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| name | string | "zudojs" | Logger identifier in log entries |
| level | LoggerLevelLike | INFO (3) | Minimum severity threshold: `LoggerLevel.WARN`, or a name in any case such as `"warn"`. An unknown value throws |
| environment | string | undefined | Environment name (development, production, etc.) |
| metadata | LoggerContextData | {} | Default metadata merged into every entry |
| formatter | LoggerFormatterLike | "text" | Formatter for converting entries to output |
| transports | LoggerTransportLike[] | [] (writes to the console) | Destinations for formatted log entries. An empty or missing list does not silence the logger: it writes through a console transport. To discard output, pass a transport that does nothing, or call `disable()` |
| enabled | boolean | true | Whether the logger starts enabled |
| throwTransportErrors | boolean | false | Whether to throw on transport failures; failures from asynchronous transports are rethrown by the next `flush()`/`close()` |
| asynchronous | boolean | false | Enable async transport dispatch |
| transportTimeout | number | 10000 | Timeout in ms for async transport operations |
| inheritContext | boolean | true | Whether child loggers inherit parent context |
| mutable | boolean | true | Whether the logger configuration can be changed at runtime |
| redact | LoggerRedactionOptions | {} | Secret redaction for metadata and context: `enabled` (true), `keys`, `pattern`, `replacement` ("[REDACTED]") |

### Constants & Helpers

| Export | Description |
| --- | --- |
| DEFAULT_LOGGER_OPTIONS | Default values for boolean/numeric logger options |
| resolveLoggerOptions(options) | Validates and normalizes partial options into a full LoggerConfiguration |
| validateLoggerOptions(options) | Throws TypeError/RangeError if options are invalid |
| mergeLoggerOptions(base, override) | Merges two option objects (override wins) |

### Example: Basic Logger

```ts
import { createLogger, LoggerLevel } from "@zudojs/logger";

const logger = createLogger({
  name: "my-app",
  level: LoggerLevel.DEBUG,
  environment: "development",
});

logger.info("Application started", { port: 3000 });
logger.debug("Config loaded", { configPath: "./config.json" });
logger.error("Connection failed", { host: "localhost", retryCount: 3 });
```

With no `transports` the logger writes to the console, one formatted line per call, using the default text formatter:

```ts
2026-09-23T10:15:02.114Z [INFO] [my-app] Application started port=3000
2026-09-23T10:15:02.116Z [DEBUG] [my-app] Config loaded configPath=./config.json
2026-09-23T10:15:02.117Z [ERROR] [my-app] Connection failed host=localhost retryCount=3
```

## LOGGING ERRORS

When something throws, you usually want two things in the log: the error itself, with its *stack trace* (the list of function calls that led to it), and a few facts about what you were doing, such as an order id. The level methods take a message and a metadata object, so the typed way to send both is `logger.log(level, message, { error, metadata })`.

```ts
import { createLogger, LoggerLevel } from "@zudojs/logger";

const logger = createLogger({ name: "payments" });

try {
  throw new Error("card declined");
} catch (err) {
  logger.log(LoggerLevel.ERROR, "payment failed", {
    error: err instanceof Error ? err : new Error(String(err)),
    metadata: { orderId: "o_42" },
  });
}
```

What you should see: the formatted line, then the stack on the lines below it (the file's directory is shortened to `…` here; yours shows the full path).

```ts
2026-09-23T16:09:17.251Z [ERROR] [payments] payment failed orderId=o_42
Error: card declined
    at file:///…/pay.mjs:6:9
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

The level methods keep a single signature, `logger.error(message, metadata?)`, so every custom `Logger` implementation and every structural logger type (`{ warn(message, context?) }`) still matches. JavaScript, or loosely typed TypeScript, often passes the caught error straight in as the second argument: `logger.error("payment failed", err)`. Since 1.4.0 that call logs `err` as the entry's `error`, stack included, exactly like the `log()` call above (minus the metadata). It used to be read as metadata, and because an `Error` has no enumerable fields it vanished from the log without a trace.

> **Tip:** in TypeScript, prefer `log(LoggerLevel.ERROR, ..., { error, metadata })`. It type-checks, and it keeps the error and your metadata in one entry. Putting the error inside metadata (`{ err }`) also works, but then it is serialized as a metadata field (`{ name, message, stack }`) rather than recorded as the entry's `error`.

### Hiding stack traces

Stack frames contain absolute file paths from the machine the code runs on, which you may not want in logs that leave the server. Build the text formatter with `includeStackTrace: false` and every error is printed as its name and message only: the entry's own error, and any `Error` you put inside metadata.

```ts
import { createLogger, createTextLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "payments",
  formatter: createTextLoggerFormatter({ includeStackTrace: false }),
});

const err = new Error("card declined");
logger.error("payment failed", err);
logger.info("retrying", { cause: err });
```

```ts
2026-09-23T16:08:29.975Z [ERROR] [payments] payment failed error={"name":"Error","message":"card declined"}
2026-09-23T16:08:29.975Z [INFO] [payments] retrying cause={"name":"Error","message":"card declined"}
```

**Changed in 1.4.0:** the option used to drop only the stack printed under the line; the fallback still wrote the stack, paths included, and an `Error` in metadata always carried its `stack`. With the default (`true`) nothing changes: the stack follows the line, and a metadata error prints as `{"name":…,"message":…,"stack":…}`.

## CHILD LOGGERS

Child loggers inherit parent configuration (transports, formatter, level) and merge metadata. Every entry from a child logger includes both parent and child metadata.

### Interface: ChildLoggerOptions

```ts
interface ChildLoggerOptions {
  readonly name?: string;
  readonly metadata?: LoggerContextData;
  readonly level?: LoggerLevel;
}

// What logger.child() accepts: the same, but level may be a name
interface ChildLoggerOptionsInput extends Omit<ChildLoggerOptions, "level"> {
  readonly level?: LoggerLevelLike;
}
```

`ChildLoggerOptions` keeps the enum, so a custom `Logger` implementation written against it still compiles. Such an implementation may now be handed a name like `"debug"`; pass `options.level` through `resolveLoggerLevel()` to convert it.

### Example: Child Loggers

```ts
const parent = createLogger({ name: "app" });

// Child inherits transports, formatter, level
const child = parent.child({
  name: "app:auth",
  metadata: { module: "authentication" },
});

child.info("Login successful", { userId: "u_123" });
// Entry includes both parent name and child metadata
```

### Class: ContextLogger

A logger wrapper that provides scoped context. Every log call runs within the stored context.

```ts
const scoped = logger.withContext({
  identifiers: { requestId: "req_456", userId: "u_789" },
  metadata: { operation: "getUser" },
});

// Every entry from scoped includes the context identifiers
scoped.info("Fetching user");
// Entry has requestId: "req_456", userId: "u_789"
```

## LOG CONTEXT

A *context* is a set of correlation identifiers (request id, trace id, user id…) plus metadata that you want on every entry while handling one piece of work. Build one with `createLoggerContext` and attach it with `logger.withContext(context)`, which returns a scoped logger; every entry that logger writes carries the context.

### Interface: LoggerContext

```ts
interface LoggerContext {
  readonly identifiers: LoggerContextIdentifiers;
  readonly metadata: LoggerContextData;
}
```

### Interface: LoggerContextIdentifiers

```ts
interface LoggerContextIdentifiers {
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly jobId?: string;
  readonly moduleId?: string;
  readonly operationId?: string;
}
```

### Interface: LoggerContextData

```ts
interface LoggerContextData {
  readonly custom?: Record<string, unknown>;
  readonly [key: string]: unknown;
}
```

### Interface: LoggerContextOptions

```ts
interface LoggerContextOptions {
  readonly parent?: LoggerContext;       // start from another context's identifiers and metadata
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly sessionId?: string;
  readonly jobId?: string;
  readonly moduleId?: string;
  readonly operationId?: string;
  readonly metadata?: LoggerContextData;
}
```

### Context Functions

| Function | Description |
| --- | --- |
| createLoggerContext(options?) | Creates a frozen `LoggerContext` from `LoggerContextOptions`; `parent` values are inherited and overridden |
| mergeLoggerContexts(base, override) | Merges two contexts (override identifiers and metadata win) |
| withLoggerContext(logger, context, callback) | Calls `callback(scoped)` with `logger.withContext(context)` and returns its result |
| isLoggerContext(value) | Type guard checking for identifiers and metadata properties |

```ts
import { createLogger, createLoggerContext, withLoggerContext } from "@zudojs/logger";

const logger = createLogger({ name: "api" });
const context = createLoggerContext({ requestId: "req_1", userId: "u_7" });

withLoggerContext(logger, context, (scoped) => {
  scoped.info("Fetching orders"); // carries requestId and userId
});
```

## LOG ENTRY

Every log call produces a `LoggerEntry` — a frozen, typed object containing all data for that log event.

### Interface: LoggerEntry

```ts
interface LoggerEntry {
  readonly id: string;
  readonly level: LoggerLevel;
  readonly levelName: LoggerLevelName;
  readonly message: string;     // the raw message, as logged
  readonly formatted?: string;  // the formatter's line (set on entries sent to transports)
  readonly metadata: LogMetadata;
  readonly context?: LoggerEntryContext;
  readonly source?: LoggerSource;
  readonly error?: Error;
  readonly logger?: string;
  readonly timestamp: Date;
  readonly timestampMs: number;
  readonly pid?: number;
  readonly hostname?: string;
  readonly environment?: string;
}
```

### Interface: LoggerEntryInput

```ts
interface LoggerEntryInput {
  readonly id?: string;
  readonly level: LoggerLevel;
  readonly levelName?: LoggerLevelName;
  readonly message: string;
  readonly metadata?: LogMetadata;
  readonly context?: LoggerEntryContext;
  readonly source?: LoggerSource;
  readonly error?: Error;
  readonly logger?: string;
  readonly timestamp?: Date;
  readonly pid?: number;
  readonly hostname?: string;
  readonly environment?: string;
}
```

### Related Types

| Type | Description |
| --- | --- |
| LogMetadata | Readonly record of string keys to LogValue |
| LogValue | string, number, boolean, bigint, null, undefined, Date, Error, arrays, objects. `Map` and `Set` are handled at runtime but are not named in the union, so TypeScript needs a cast to put one in metadata |
| LoggerSource | Service, component, module, file, function, line |
| LoggerEntryContext | correlationId, requestId, traceId, spanId, userId, tenantId, metadata |

### Metadata Serialization

Metadata and context go through two passes. **Redaction** runs when the entry is created, before it is frozen, so no formatter and no transport can ever see an unmasked secret. **Serialization** runs inside the JSON and structured formatters, turning the values that are left into JSON-safe ones. Both walks descend through nested objects, arrays, `Map`, `Set` and getters, and both share the same cycle guard.

| Value | Becomes | Pass |
| --- | --- | --- |
| Map | A plain object, one property per entry; a secret-named key is redacted | redaction |
| Set | An array of its members | redaction |
| bigint | Its decimal string | serialization |
| Date | An ISO-8601 string | serialization |
| Error | { name, message, stack }; without `stack` when the text formatter has `includeStackTrace: false` | serialization |
| function | "[Function name]", or "[Function anonymous]" | serialization |
| symbol | "Symbol(description)" | serialization |
| A secret-named field | "[REDACTED]" (`LOGGER_REDACTION_TOKEN`) | redaction |
| A getter that throws | "[Unreadable]" (`LOGGER_UNREADABLE_TOKEN`) | both |
| A back-edge to an enclosing object | "[Circular]" | both |

**Changed in 1.3.0.**

- `Map` and `Set` keep their contents. They used to collapse to `{}`, so a `headers` Map or a `tags` Set reached the transport empty.
- The cycle guard tracks the *ancestor path* only, instead of every object it has ever seen. `{ actor: user, target: user }` now logs `user` in both fields; only a genuine back-edge — an object that contains itself — becomes `"[Circular]"`. This applies to redaction, to serialization and to the JSON formatter alike.
- A metadata getter that throws no longer propagates out of `logger.info(...)` and aborts your call. The field becomes `"[Unreadable]"`, the entry is still logged, and the read failure is reported like any other infrastructure failure — dropped by default, rethrown when `throwTransportErrors` is on.

```ts
const user = { id: "u_1", name: "Alice" };

logger.info("Transfer", { from: user, to: user });
// metadata.from and metadata.to both carry the full user object.
// Before 1.3.0 the second one was "[Circular]".

logger.info("Request", {
  headers: new Map([["accept", "json"], ["authorization", "Bearer abc"]]) as never,
  tags: new Set(["api", "v2"]) as never,
});
// headers: { accept: "json", authorization: "[REDACTED]" }
// tags: ["api", "v2"]
// Before 1.3.0 both were {}.
```

If you write your own formatter, the same serializers are exported. Both take an optional flag to leave stacks out: `serializeLoggerError(error, false)` returns `{ name, message }`, and `serializeLoggerValue(value, undefined, false)` strips the stack from every `Error` it finds inside `value`.

### Creating Entries

```ts
import { createLoggerEntry, LoggerLevel } from "@zudojs/logger";

const entry = createLoggerEntry({
  level: LoggerLevel.INFO,
  message: "User signed in",
  metadata: { userId: "u_123" },
  logger: "auth",
});

// entry.id — auto-generated unique ID
// entry.timestamp — Date.now()
// entry.levelName — "info"
```

## FORMATTERS

Formatters convert a `LoggerEntry` into output — either a string or a structured object. A transport always receives a `LoggerEntry`; the formatter's result travels with it in `entry.formatted`, while `entry.message` stays the message you logged.

### Interface: LoggerFormatter

```ts
interface LoggerFormatter<TOutput> {
  readonly name: string;
  format(entry: LoggerEntry, context?: LoggerFormatterContext): TOutput;
}

type LoggerFormatterFunction<TOutput> = (
  entry: LoggerEntry,
  context: LoggerFormatterContext,
) => TOutput;

type LoggerFormatterLike<TOutput> =
  LoggerFormatter<TOutput> | LoggerFormatterFunction<TOutput> | string;
```

### Interface: LoggerFormatterContext

```ts
interface LoggerFormatterContext {
  readonly loggerName?: string;
  readonly environment?: string;
  readonly colors?: boolean;
  readonly includeStackTrace?: boolean;
}
```

### Built-in Formatters

| Function | Output | Description |
| --- | --- | --- |
| createJsonLoggerFormatter() | string | JSON output with optional pretty-printing |
| createTextLoggerFormatter() | string | Human-readable text with timestamps, context, metadata |
| createCompactLoggerFormatter() | string | Minimal output: LEVEL logger: message |
| createDevelopmentLoggerFormatter() | string | Full details: timestamp, logger, message, context, source, stack |
| createProductionLoggerFormatter() | string | JSON output (alias for JSON formatter) |
| createStructuredLoggerFormatter() | Record | Returns the serialized entry as an object, merged over the entry the transport receives; the console transport prints it as one JSON line |

### Formatter Output

| The formatter returns | What the transport receives |
| --- | --- |
| a string | The entry, with that string in `formatted`. `message` is unchanged |
| a plain object | The entry with the returned fields merged over it (same-named fields win), and `formatted` set to the object as one JSON line |
| anything else (array, null, a primitive) | The entry, unchanged |

> **Changed in 1.3.0:** an object return used to be computed and then discarded — the transport got the untouched entry, so `createStructuredLoggerFormatter()` and any hand-written object formatter had no visible effect at all. Object returns now reach the transport.

> **Changed in 1.4.0:** a string formatter's output used to *replace* `entry.message`, so a transport could no longer see the message you logged. `message` is now always the raw message and the formatted line is in the new `entry.formatted`. If your custom transport printed `entry.message` to get the formatted line, print `entry.formatted ?? entry.message` instead, or call `formatTransportLine(entry)` (see [Writing a transport](#custom-transports)).

```ts
import { createLogger, createStructuredLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({
  name: "api",
  formatter: createStructuredLoggerFormatter(),
  transports: [
    (entry) => {
      console.log(typeof entry.timestamp, entry.levelName, entry.metadata);
    },
  ],
});

logger.info("Request handled", { route: "/users", ms: 12 });
// string info { route: '/users', ms: 12 }
```

`timestamp` prints as `string` because the structured formatter's ISO-8601 value is merged over the entry's `Date`. Before 1.3.0 the same transport saw the raw entry and printed `object`.

### Options Interfaces

```ts
interface JsonLoggerFormatterOptions {
  readonly name?: string;
  readonly pretty?: boolean;
  readonly indent?: number;
  readonly includeUndefined?: boolean;
}

interface TextLoggerFormatterOptions {
  readonly name?: string;
  readonly includeTimestamp?: boolean;
  readonly includeLogger?: boolean;
  readonly includeMetadata?: boolean;
  readonly includeContext?: boolean;
  readonly includeSource?: boolean;
  readonly includeStackTrace?: boolean;   // default true; false hides every stack, metadata errors included
  readonly metadataSeparator?: string;
}
```

## TRANSPORTS

Transports receive formatted entries and deliver them to their destination — console, file, network, or any custom sink. A logger can have multiple transports.

### Interface: LoggerTransport

```ts
interface LoggerTransport {
  readonly name: string;
  readonly enabled: boolean;
  write(entry: LoggerEntry, context?: LoggerTransportContext): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

type LoggerTransportFunction = (
  entry: LoggerEntry,
  context: LoggerTransportContext,
) => void | Promise<void>;

type LoggerTransportLike = LoggerTransport | LoggerTransportFunction;
```

### Built-in Transports

| Function | Description |
| --- | --- |
| createConsoleLoggerTransport() | Writes to console.error / console.warn / console.info / console.debug based on level, one line per entry: `entry.formatted` (the text line, or the JSON line of a structured record), or the whole entry as one JSON line when there is none |
| createConditionalLoggerTransport(transport, predicate) | Forwards entries only when the predicate returns true. Forwards `flush()`/`close()` to the wrapped transport. |
| createMultiLoggerTransport(transports) | Fans out entries to every transport (a failing sink does not stop the others; failures are rethrown afterwards). Forwards `flush()`/`close()`. |
| createBufferedLoggerTransport(transport, options?) | Batches entries in memory and flushes by size or interval; each entry is written independently and a timer-flush failure is rethrown by the next `flush()`/`close()` |

### Console Output

With the default text formatter the console transport prints one line per entry: timestamp, level, logger name, message, then the metadata as `key=value` pairs. When the entry carries an error and the formatter includes stack traces, the stack follows on the next lines, with no trailing space left on the first line.

```ts
import { createLogger, createConsoleLoggerTransport } from "@zudojs/logger";

const logger = createLogger({ name: "svc", transports: [createConsoleLoggerTransport()] });
logger.warn("careful", { userId: "u1" });
// 2026-09-23T10:15:02.114Z [WARN] [svc] careful userId=u1
```

With `createStructuredLoggerFormatter()` each entry is one line of JSON, which is what log collectors expect. Values JSON cannot hold are made safe: a cycle becomes `"[Circular]"` and a `bigint` becomes a string.

```ts
import { createLogger, createStructuredLoggerFormatter } from "@zudojs/logger";

const logger = createLogger({ name: "api", formatter: createStructuredLoggerFormatter() });
logger.info("Request handled", { route: "/users", ms: 12 });
```

```json
{"id":"log:23469222-ab02-4629-af8e-e4ea0243dd63","level":3,"levelName":"info","message":"Request handled","metadata":{"route":"/users","ms":12},"logger":"api","timestamp":"2026-09-23T16:08:29.973Z","timestampMs":1790179709973}
```

> **Changed in 1.4.0:** the console transport used to print a record object around the formatted text, so the timestamp and level appeared twice on every line, and a structured record was spread over several lines. It now prints the formatted line on its own, and a structured record as a single JSON line.

### Writing a transport

A transport can be a plain function. It receives the entry: `entry.message` is the message as you logged it, and `entry.formatted` is the line the logger's formatter produced. A transport that writes lines (a file, a socket, a stream) should print `formatTransportLine(entry)`, which returns `entry.formatted` when it is set and otherwise the entry as one JSON line.

```ts
import { createLogger, formatTransportLine } from "@zudojs/logger";

const logger = createLogger({
  name: "api",
  transports: [
    (entry) => {
      console.log(entry.message);
      console.log(formatTransportLine(entry));
    },
  ],
});

logger.info("Request handled", { route: "/users", ms: 12 });
```

```ts
Request handled
2026-09-23T16:08:29.967Z [INFO] [api] Request handled route=/users ms=12
```

### Transport Helpers

| Function | Description |
| --- | --- |
| createLoggerTransport(transport, options?) | Wraps a transport or function into a RegisteredLoggerTransport |
| enableLoggerTransport(transport) | Returns a new registered transport with enabled=true |
| disableLoggerTransport(transport) | Returns a new registered transport with enabled=false |
| formatTransportLine(entry) | The line a line-oriented transport should print: `entry.formatted`, or the entry as one JSON line when there is none. The console transport uses it |
| toJsonLogLine(record) | Serializes any value to a single JSON line: cycles become `"[Circular]"`, a `bigint` a string, and U+2028/U+2029 are escaped |

### Buffered Transport Options

```ts
interface LoggerBufferedTransportOptions {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly maxSize?: number;       // default: 100
  readonly flushInterval?: number; // default: 0 (no auto-flush)
}
```

## LOGGER FACTORY

`LoggerFactory` manages logger creation, caching, and lifecycle. It ensures consistent configuration across the application and prevents duplicate loggers.

### Class: LoggerFactory

```ts
class LoggerFactory {
  constructor(defaults?: LoggerOptions);

  create(name?: string, options?: LoggerOptions, forceNew?: boolean): Logger;
  register(logger: Logger, name?: string): Logger;
  get(name: string): Logger | undefined;
  getOrCreate(name: string, options?: LoggerOptions): Logger;
  child(parent: Logger, options?: ChildLoggerOptions): Logger;
  remove(name: string): boolean;
  dispose(name: string): Promise<boolean>;
  disposeAll(): Promise<void>;
  flushAll(): Promise<void>;
  getAll(): readonly Logger[];
  has(name: string): boolean;
  createTransient(options?: LoggerOptions): Logger;
  readonly size: number;
}
```

### Factory Functions

| Function | Description |
| --- | --- |
| createLoggerFactory(defaults?) | Creates a new LoggerFactory with optional default options |
| createFactoryLogger(factory, name, options?) | Creates a logger through a factory |
| getFactoryLogger(factory, name) | Gets or creates a logger from a factory |

### Example: Factory Usage

```ts
import { createLoggerFactory, LoggerLevel } from "@zudojs/logger";

const factory = createLoggerFactory({
  level: LoggerLevel.DEBUG,
  environment: "production",
});

// Creates "api" logger with factory defaults
const apiLogger = factory.create("api");

// Returns existing "api" logger
const same = factory.get("api");

// Create without registering
const transient = factory.createTransient({ name: "temp" });

// Adopt a logger the factory did not create (new in 1.3.0)
factory.register(transient, "temp");

// Cleanup
await factory.disposeAll();
```

`register(logger, name?)` puts an existing logger into the factory's registry under its own `name`, or under the name you pass. From then on it is covered by `flushAll()`, `disposeAll()`, `getAll()`, `has()` and `size` exactly like one the factory built itself. Without it, a hand-made logger is invisible to the factory and its transports are never flushed or closed on shutdown.

## LOGGER MANAGER

`LoggerManager` provides application-wide logger management with initialization, lifecycle, and a default application logger.

### Class: LoggerManager

```ts
class LoggerManager {
  constructor(options?: LoggerOptions);

  initialize(options?: LoggerOptions): Logger;
  adopt(logger: Logger): Logger;
  getLogger(): Logger;
  get(name: string, options?: LoggerOptions): Logger;
  create(name: string, options?: LoggerOptions): Logger;
  has(name: string): boolean;
  remove(name: string): boolean;
  flush(): Promise<void>;
  close(): Promise<void>;
  getAll(): readonly Logger[];
  getFactory(): LoggerFactory;
  readonly size: number;
  readonly isInitialized: boolean;
  readonly isClosed: boolean;
}
```

### Manager Functions

| Function | Description |
| --- | --- |
| createLoggerManager(options?) | Creates an uninitialized LoggerManager |
| initializeLoggerManager(options?) | Creates and initializes a LoggerManager in one call |
| createManagedDefaultLogger(name?) | Creates a standalone default logger (no manager) |
| createLoggerManagerFromLogger(logger) | Creates a manager that adopts an existing logger as its default |

### Example: Manager Usage

```ts
import { initializeLoggerManager, LoggerLevel } from "@zudojs/logger";

const manager = initializeLoggerManager({
  name: "app",
  level: LoggerLevel.DEBUG,
});

// Default application logger
const appLogger = manager.getLogger();
appLogger.info("Application started");

// Named loggers
const authLogger = manager.get("auth");
const dbLogger = manager.get("database");

// Shutdown
await manager.close();
```

### Adopting an existing logger

`adopt(logger)` (new in 1.3.0) makes a logger you built yourself the manager's default *and* registers it with the manager's factory, so `flush()`, `close()`, `getAll()` and `size` all reach it. It throws `LoggerDisposedError` if the manager is already closed.

```ts
import { createLogger, createLoggerManagerFromLogger } from "@zudojs/logger";

const logger = createLogger({ name: "app", transports: [fileTransport] });

const manager = createLoggerManagerFromLogger(logger);

console.log(manager.size);                     // 1
console.log(manager.getLogger() === logger); // true

await manager.close();                     // reaches fileTransport
```

`createLoggerManagerFromLogger()` is built on `adopt()`. Before 1.3.0 it only assigned the logger to a private field, leaving the factory registry empty: `manager.size` reported `0`, `getAll()` returned nothing, and `flush()` / `close()` were no-ops for the only logger the manager owned — so buffered and file transports were never drained on shutdown.

## ERROR HIERARCHY

All error types extend `LoggingError` from `@zudojs/errors`. The base `LoggerError` adds a `loggerCode` string for fine-grained classification.

| Error Class | Code | When Thrown |
| --- | --- | --- |
| LoggerError | LOGGER_ERROR | Base error for all logger failures |
| LoggerConfigurationError | LOGGER_CONFIGURATION_ERROR | Invalid logger options or configuration |
| LoggerDisposedError | LOGGER_DISPOSED | Operation on a disposed logger |
| LoggerTransportError | LOGGER_TRANSPORT_ERROR | A transport write/flush/close failed |
| LoggerFormatterError | LOGGER_FORMATTER_ERROR | A formatter threw during format |
| InvalidLoggerEntryError | INVALID_LOGGER_ENTRY | A log entry is malformed |
| InvalidLoggerLevelError | INVALID_LOGGER_LEVEL | An invalid level value was supplied |
| LoggerTimeoutError | LOGGER_TRANSPORT_ERROR | Transport exceeded its timeout |
| LoggerTransportClosedError | LOGGER_TRANSPORT_ERROR | Operation on a closed transport |
| LoggerFormatterNotFoundError | LOGGER_FORMATTER_NOT_FOUND | Named formatter doesn't exist |
| LoggerTransportNotFoundError | LOGGER_TRANSPORT_NOT_FOUND | Named transport doesn't exist |

> **Changed in 1.3.0:** several paths that used to throw a bare `Error` or a `RangeError` now throw the typed error above — a write past `transportTimeout` raises `LoggerTimeoutError` (carrying `transportName` and `timeout`), any other write failure a `LoggerTransportError` with `transportName` set, a formatter failure a `LoggerFormatterError` with `formatterName` set, a call on a closed `LoggerManager` a `LoggerDisposedError`, an unknown level an `InvalidLoggerLevelError`, an invalid entry timestamp an `InvalidLoggerEntryError`, an unresolved string formatter id a `LoggerFormatterNotFoundError`, and a write to a closed buffered transport a `LoggerTransportClosedError`. If you match on `RangeError` or on message text from any of these paths, update the check.

## FULL INTEGRATION EXAMPLE

Complete working example: factory, transports, formatters, context, and child loggers.

```ts
import {
  createLoggerFactory,
  createLoggerContext,
  createConsoleLoggerTransport,
  createBufferedLoggerTransport,
  createConditionalLoggerTransport,
  createJsonLoggerFormatter,
  createDevelopmentLoggerFormatter,
  formatTransportLine,
  LoggerLevel,
} from "@zudojs/logger";

// 1. Create transports
const consoleTransport = createConsoleLoggerTransport();

const fileTransport = createBufferedLoggerTransport(
  async (entry) => {
    await appendToFile("app.log", formatTransportLine(entry) + "\n");
  },
  { name: "file", maxSize: 50, flushInterval: 5000 },
);

// 2. Create a conditional transport (errors only)
const errorTransport = createConditionalLoggerTransport(
  async (entry) => {
    await sendToSentry(entry);
  },
  (entry) => entry.level <= 1, // ERROR and FATAL only
  { name: "sentry" },
);

// 3. Create a factory with defaults
const factory = createLoggerFactory({
  level: LoggerLevel.DEBUG,
  environment: process.env.NODE_ENV,
  formatter: createDevelopmentLoggerFormatter(),
  transports: [consoleTransport, fileTransport, errorTransport],
});

// 4. Create loggers
const appLogger = factory.create("app");
const authLogger = factory.create("app:auth", {
  metadata: { module: "authentication" },
});

// 5. Create scoped context
const requestContext = createLoggerContext({
  correlationId: "corr_abc",
  requestId: "req_123",
  userId: "user_456",
});

const scoped = authLogger.withContext(requestContext);

// 6. Log with full context
scoped.info("Login attempt", { provider: "google" });
scoped.error("Login failed", { reason: "invalid_token" });

// 7. Child logger in a different module
const dbLogger = factory.create("app:database");
const queryLogger = dbLogger.child({
  name: "app:database:query",
  metadata: { table: "users" },
});

queryLogger.debug("SELECT * FROM users", { duration: 42 });

// 8. Switch to production formatter
const prodFactory = createLoggerFactory({
  level: LoggerLevel.INFO,
  formatter: createJsonLoggerFormatter({ pretty: false }),
  transports: [fileTransport, errorTransport],
});

// 9. Cleanup
process.on("SIGTERM", async () => {
  await factory.disposeAll();
  process.exit(0);
});
```

## COMPLETE EXPORT INDEX

Every name `@zudojs/logger` exports from its package root at v1.4.3 — **153** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 153 exports**

Classes (15)

`ContextLogger` `InvalidLoggerEntryError` `InvalidLoggerLevelError` `LoggerConfigurationError` `LoggerDisposedError` `LoggerError` `LoggerFactory` `LoggerFormatterError` `LoggerFormatterNotFoundError` `LoggerManager` `LoggerTimeoutError` `LoggerTransportClosedError` `LoggerTransportError` `LoggerTransportNotFoundError` `ZudojsLogger`

Functions (97)

`assertActive` `assertMutable` `childLogger` `closeLogger` `closeLoggerTransport` `createBufferedLoggerTransport` `createChildLogger` `createChildLoggerOptions` `createCompactLoggerFormatter` `createConditionalLoggerTransport` `createConsoleLoggerTransport` `createDefaultLogger` `createDefaultSecretFieldMatcher` `createDevelopmentLoggerFormatter` `createEntry` `createErrorLoggerEntry` `createFactoryLogger` `createJsonLoggerFormatter` `createLogger` `createLoggerContext` `createLoggerEntry` `createLoggerEntryId` `createLoggerFactory` `createLoggerFormatter` `createLoggerFormatterError` `createLoggerFormatterId` `createLoggerManager` `createLoggerManagerFromLogger` `createLoggerTransport` `createLoggerTransportError` `createLoggerTransportId` `createLogMethods` `createManagedDefaultLogger` `createMultiLoggerTransport` `createProductionLoggerFormatter` `createSecretMatcher` `createStructuredLoggerFormatter` `createTextLoggerFormatter` `disableLogger` `disableLoggerTransport` `dispatchEntry` `dispatchEntrySync` `enableLogger` `enableLoggerTransport` `escapeLogText` `flushLogger` `flushLoggerTransport` `formatLoggerEntry` `formatTransportLine` `getFactoryLogger` `getLoggerEnabled` `getLoggerErrorCause` `getLoggerLevel` `getLoggerLevelNames` `getLoggerLevels` `getLoggerName` `handleInfrastructureError` `hasLogControlCharacters` `initializeLoggerManager` `isLoggerContext` `isLoggerError` `isLoggerFormatter` `isLoggerFormatterFunction` `isLoggerFormatterObject` `isLoggerLevel` `isLoggerLevelName` `isLoggerTransport` `isLoggerTransportFunction` `isLoggerTransportObject` `levelOptions` `logAtLevel` `logError` `loggerLevelFromName` `loggerLevelNameFallback` `loggerLevelToName` `mergeLoggerContexts` `mergeLoggerOptions` `normalizeConfiguration` `normalizeLogMetadata` `redactLogValue` `resolveLoggerLevel` `resolveLoggerOptions` `resolveManagedLogger` `serializeLoggerEntry` `serializeLoggerError` `serializeLoggerValue` `serializeTransportEntry` `setLoggerLevel` `settleAllOrThrow` `shouldLog` `throwCollectedFailures` `toJsonLogLine` `toLoggerError` `validateLoggerOptions` `withContextLogger` `withLoggerContext` `writeLoggerTransport`

Interfaces (26)

`ChildLoggerOptions` `ChildLoggerOptionsInput` `JsonLoggerFormatterOptions` `Logger` `LoggerBufferedTransportOptions` `LoggerConfiguration` `LoggerContext` `LoggerContextData` `LoggerContextIdentifiers` `LoggerContextOptions` `LoggerEntry` `LoggerEntryContext` `LoggerEntryInput` `LoggerFormatter` `LoggerFormatterContext` `LoggerFormatterOptions` `LoggerOptions` `LoggerRedactionOptions` `LoggerSource` `LoggerTransport` `LoggerTransportContext` `LoggerTransportOptions` `LogOptions` `RegisteredLoggerTransport` `TextLoggerFormatterOptions` `ZudojsLoggerContext`

Type aliases (9)

`LoggerFormattedOutput` `LoggerFormatterFunction` `LoggerFormatterLike` `LoggerLevelLike` `LoggerLevelName` `LoggerTransportFunction` `LoggerTransportLike` `LogMetadata` `LogValue`

Constants (5)

`DEFAULT_LOGGER_OPTIONS` `DEFAULT_LOGGER_SECRET_FIELDS` `DEFAULT_LOGGER_SECRET_PATTERN` `LOGGER_REDACTION_TOKEN` `LOGGER_UNREADABLE_TOKEN`

Enums (1)

`LoggerLevel`
