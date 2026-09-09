# @zudojs/logger

Structured logging with transports, formatters, log levels, secret
redaction, and context propagation for Zudojs applications.

## Installation

```bash
npm install @zudojs/logger
```

## Quick Start

```typescript
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "api" });

logger.info("Server started", { port: 3000, env: "production" });
logger.error("Connection failed", { error: err.message });

await logger.flush(); // drain in-flight writes before exit
```

## Levels

`fatal` (0), `error` (1), `warn` (2), `info` (3), `debug` (4), `trace`
(5). A logger emits every message at or below its configured level;
`level` defaults to `info`.

## Transports

A transport is either a `{ name, enabled, write, flush?, close? }`
object or a `(entry, context) => void | Promise<void>` function. When no
transport is configured the logger writes to the console.

Built in: `createConsoleLoggerTransport`, and the composites
`createMultiLoggerTransport`, `createConditionalLoggerTransport` and
`createBufferedLoggerTransport`. File and HTTP transports are not
included — implement the `LoggerTransport` interface for those.

`transportTimeout` (default 10s) bounds every transport write, so a
transport that stops responding cannot hang `flush()` or `close()`.

## Flushing

Dispatch completes synchronously when every transport is synchronous.
With an asynchronous transport — or with `asynchronous: true`, which
always defers so the caller stays off the transport's critical path —
writes are in flight until drained. `flush()` and `close()` drain them,
so nothing is lost at exit.

## Secret redaction

Redaction is **on by default**. Metadata and context fields whose NAME
looks like a secret — password, secret, token, api key, private key,
credential, authorization, cookie — are replaced with `"[REDACTED]"`
before the entry reaches any formatter or transport. Nested objects,
arrays and getters are all covered.

```typescript
logger.info("login", { user: "alice", password: "hunter2" });
// metadata: { user: "alice", password: "[REDACTED]" }

createLogger({ redact: { keys: ["ssn"], replacement: "***" } });
createLogger({ redact: { enabled: false } }); // opt out
```

## Log injection

Text-shaped formatters escape control characters in the message, the
logger name, metadata keys and values, context values and source
locations. A newline or ANSI escape inside attacker-supplied text
becomes `\n` / `` rather than forging an extra log record or
driving the operator's terminal. The JSON formatter relies on
`JSON.stringify`, which escapes the same characters.

Metadata is normalized before serialization, so circular references
(`"[Circular]"`), BigInt values and functions never make a formatter
throw and silently drop the record.

## Context

```typescript
import { createLoggerContext, withLoggerContext } from "@zudojs/logger";

const scoped = logger.withContext(
  createLoggerContext({ requestId: "req-1", metadata: { tenant: "acme" } }),
);
scoped.info("handled"); // metadata carries requestId and tenant

withLoggerContext(logger, createLoggerContext({ traceId }), (scoped) => {
  scoped.info("inside the trace");
});
```

Child loggers inherit name, level, formatter, transports, metadata and
redaction settings: `logger.child({ name: "api.db" })`.

## Formatters

`createTextLoggerFormatter`, `createJsonLoggerFormatter`,
`createCompactLoggerFormatter`, `createDevelopmentLoggerFormatter`,
`createProductionLoggerFormatter`, `createStructuredLoggerFormatter`.

Pass `{ colors: true }` in the formatter context to colourize the level
tag of text output. Colour codes are emitted only around the fixed level
name, never around user-supplied text.

## Use Cases

- Application logging
- Distributed tracing correlation
- Audit trails
- Debugging and monitoring
