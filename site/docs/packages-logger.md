---
title: "@zudojs/logger — Structured Logging Documentation"
description: "Complete documentation for @zudojs/logger — structured logging with transports, formatters, context propagation, and lifecycle management for the Zudojs framework."
source: https://zudojs.oyinlola.site/docs/packages-logger
---

v1.1.0

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
| @zudojs/errors | 1.0.0 | Error hierarchy (LoggingError, LoggerTransportError, LoggerFormatterError, etc.) |
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

### Utility Functions

| Function | Signature | Returns |
| --- | --- | --- |
| loggerLevelToName | (level: LoggerLevel) => LoggerLevelName | Converts numeric level to canonical string name |
| loggerLevelFromName | (name: string) => LoggerLevel | Converts string name to enum value (accepts "warning", "information") |
| shouldLog | (threshold, messageLevel) => boolean | True if message should be emitted at the given threshold |
| getLoggerLevels | () => readonly LoggerLevel[] | Returns all six canonical levels |
| getLoggerLevelNames | () => readonly LoggerLevelName[] | Returns all six canonical level names |

> **Threshold Behavior:** A logger set to `LoggerLevel.WARN` (2) emits FATAL (0), ERROR (1), and WARN (2). It suppresses INFO (3), DEBUG (4), and TRACE (5).

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

  child(options?: ChildLoggerOptions): Logger;
  withContext(context: LoggerContext): Logger;

  setLevel(level: LoggerLevel): void;
  enable(): void;
  disable(): void;

  flush(): Promise<void>;
  close(): Promise<void>;
}
```

### Methods

| Method | Description |
| --- | --- |
| fatal / error / warn / info / debug / trace | Log at the corresponding severity level with optional metadata |
| log(level, message, options?) | Dynamic level logging with extended options (error, source, context) |
| child(options?) | Creates a child logger inheriting configuration and merging metadata |
| withContext(context) | Returns a scoped logger that injects context into every entry |
| setLevel(level) | Changes the log level threshold at runtime |
| enable() / disable() | Toggle the logger on/off without destroying it |
| flush() | Waits for all buffered transport writes to complete |
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
| level | LoggerLevel | INFO (3) | Minimum severity threshold |
| environment | string | undefined | Environment name (development, production, etc.) |
| metadata | LoggerContextData | {} | Default metadata merged into every entry |
| formatter | LoggerFormatterLike | "text" | Formatter for converting entries to output |
| transports | LoggerTransportLike[] | [] | Destinations for formatted log entries |
| enabled | boolean | true | Whether the logger starts enabled |
| throwTransportErrors | boolean | false | Whether to throw on transport failures; failures from asynchronous transports are rethrown by the next `flush()`/`close()` |
| asynchronous | boolean | false | Enable async transport dispatch |
| transportTimeout | number | 10000 | Timeout in ms for async transport operations |
| inheritContext | boolean | true | Whether child loggers inherit parent context |
| mutable | boolean | true | Whether the logger configuration can be changed at runtime |

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

## CHILD LOGGERS

Child loggers inherit parent configuration (transports, formatter, level) and merge metadata. Every entry from a child logger includes both parent and child metadata.

### Interface: ChildLoggerOptions

```ts
interface ChildLoggerOptions {
  readonly name?: string;
  readonly metadata?: LoggerContextData;
  readonly level?: LoggerLevel;
}
```

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

Context propagates correlation identifiers and metadata through the log pipeline. Use `AsyncLocalStorage`-compatible storage to propagate context across async boundaries.

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

### Interface: LoggerContextStorage

```ts
interface LoggerContextStorage {
  get(): LoggerContext | undefined;
  set(context: LoggerContext): void;
  run<T>(context: LoggerContext, callback: () => T): T;
  with<T>(context: LoggerContext, callback: () => T): T;
  clear(): void;
}
```

### Context Functions

| Function | Description |
| --- | --- |
| createLoggerContext(options?) | Creates a frozen LoggerContext from identifiers and metadata |
| mergeLoggerContexts(base, override) | Merges two contexts (override identifiers and metadata win) |
| withLoggerContext(context, metadata) | Extends a context with additional metadata |
| withLoggerIdentifiers(context, identifiers) | Extends a context with additional identifiers |
| createLoggerContextStorage() | Creates a stack-based context storage for propagation |
| isLoggerContext(value) | Type guard checking for identifiers and metadata properties |

## LOG ENTRY

Every log call produces a `LoggerEntry` — a frozen, typed object containing all data for that log event.

### Interface: LoggerEntry

```ts
interface LoggerEntry {
  readonly id: string;
  readonly level: LoggerLevel;
  readonly levelName: LoggerLevelName;
  readonly message: string;
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
| LogValue | string, number, boolean, bigint, null, undefined, Date, Error, arrays, objects |
| LoggerSource | Service, component, module, file, function, line |
| LoggerEntryContext | correlationId, requestId, traceId, spanId, userId, tenantId, metadata |

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

Formatters convert a `LoggerEntry` into output — either a string or a structured object. The transport receives formatted output, not raw entries.

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
| createStructuredLoggerFormatter() | Record | Returns structured object (not stringified) |

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
  readonly includeStackTrace?: boolean;
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
| createConsoleLoggerTransport() | Writes to console.error / console.warn / console.info / console.debug based on level |
| createConditionalLoggerTransport(transport, predicate) | Forwards entries only when the predicate returns true |
| createMultiLoggerTransport(transports) | Fans out entries to multiple transports sequentially |
| createBufferedLoggerTransport(transport, options?) | Batches entries in memory and flushes by size or interval |

### Transport Helpers

| Function | Description |
| --- | --- |
| createLoggerTransport(transport, options?) | Wraps a transport or function into a RegisteredLoggerTransport |
| enableLoggerTransport(transport) | Returns a new registered transport with enabled=true |
| disableLoggerTransport(transport) | Returns a new registered transport with enabled=false |

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

// Cleanup
await factory.disposeAll();
```

## LOGGER MANAGER

`LoggerManager` provides application-wide logger management with initialization, lifecycle, and a default application logger.

### Class: LoggerManager

```ts
class LoggerManager {
  constructor(options?: LoggerOptions);

  initialize(options?: LoggerOptions): Logger;
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
  LoggerLevel,
} from "@zudojs/logger";

// 1. Create transports
const consoleTransport = createConsoleLoggerTransport();

const fileTransport = createBufferedLoggerTransport(
  async (entry) => {
    await appendToFile("app.log", entry);
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

Every name `@zudojs/logger` exports from its package root at v1.1.0 — **142** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 142 exports**

Classes (15)

`ContextLogger` `InvalidLoggerEntryError` `InvalidLoggerLevelError` `LoggerConfigurationError` `LoggerDisposedError` `LoggerError` `LoggerFactory` `LoggerFormatterError` `LoggerFormatterNotFoundError` `LoggerManager` `LoggerTimeoutError` `LoggerTransportClosedError` `LoggerTransportError` `LoggerTransportNotFoundError` `ZudojsLogger`

Functions (90)

`assertActive` `assertMutable` `childLogger` `closeLogger` `closeLoggerTransport` `createBufferedLoggerTransport` `createChildLogger` `createChildLoggerOptions` `createCompactLoggerFormatter` `createConditionalLoggerTransport` `createConsoleLoggerTransport` `createDefaultLogger` `createDevelopmentLoggerFormatter` `createEntry` `createErrorLoggerEntry` `createFactoryLogger` `createJsonLoggerFormatter` `createLogger` `createLoggerContext` `createLoggerEntry` `createLoggerEntryId` `createLoggerFactory` `createLoggerFormatter` `createLoggerFormatterError` `createLoggerFormatterId` `createLoggerManager` `createLoggerManagerFromLogger` `createLoggerTransport` `createLoggerTransportError` `createLoggerTransportId` `createLogMethods` `createManagedDefaultLogger` `createMultiLoggerTransport` `createProductionLoggerFormatter` `createSecretMatcher` `createStructuredLoggerFormatter` `createTextLoggerFormatter` `disableLogger` `disableLoggerTransport` `dispatchEntry` `dispatchEntrySync` `enableLogger` `enableLoggerTransport` `escapeLogText` `flushLogger` `flushLoggerTransport` `formatLoggerEntry` `getFactoryLogger` `getLoggerEnabled` `getLoggerErrorCause` `getLoggerLevel` `getLoggerLevelNames` `getLoggerLevels` `getLoggerName` `handleInfrastructureError` `hasLogControlCharacters` `initializeLoggerManager` `isLoggerContext` `isLoggerError` `isLoggerFormatter` `isLoggerFormatterFunction` `isLoggerFormatterObject` `isLoggerLevel` `isLoggerLevelName` `isLoggerTransport` `isLoggerTransportFunction` `isLoggerTransportObject` `logAtLevel` `logError` `loggerLevelFromName` `loggerLevelNameFallback` `loggerLevelToName` `mergeLoggerContexts` `mergeLoggerOptions` `normalizeConfiguration` `normalizeLogMetadata` `redactLogValue` `resolveLoggerOptions` `resolveManagedLogger` `serializeLoggerEntry` `serializeLoggerError` `serializeLoggerValue` `serializeTransportEntry` `setLoggerLevel` `shouldLog` `toLoggerError` `validateLoggerOptions` `withContextLogger` `withLoggerContext` `writeLoggerTransport`

Interfaces (25)

`ChildLoggerOptions` `JsonLoggerFormatterOptions` `Logger` `LoggerBufferedTransportOptions` `LoggerConfiguration` `LoggerContext` `LoggerContextData` `LoggerContextIdentifiers` `LoggerContextOptions` `LoggerEntry` `LoggerEntryContext` `LoggerEntryInput` `LoggerFormatter` `LoggerFormatterContext` `LoggerFormatterOptions` `LoggerOptions` `LoggerRedactionOptions` `LoggerSource` `LoggerTransport` `LoggerTransportContext` `LoggerTransportOptions` `LogOptions` `RegisteredLoggerTransport` `TextLoggerFormatterOptions` `ZudojsLoggerContext`

Type aliases (8)

`LoggerFormattedOutput` `LoggerFormatterFunction` `LoggerFormatterLike` `LoggerLevelName` `LoggerTransportFunction` `LoggerTransportLike` `LogMetadata` `LogValue`

Constants (3)

`DEFAULT_LOGGER_OPTIONS` `DEFAULT_LOGGER_SECRET_PATTERN` `LOGGER_REDACTION_TOKEN`

Enums (1)

`LoggerLevel`
