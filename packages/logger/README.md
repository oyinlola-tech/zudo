# @zudojs/logger

Structured logging with transports, formatters, log levels, secret
redaction, and context propagation for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-logger](https://zudojs.oyinlola.site/docs/packages-logger) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-logger.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

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

The multi and conditional composites forward `flush()` and `close()` to
the transports they wrap, so a buffered or file transport nested inside
is drained and released by the logger's own `flush()`/`close()`. The
multi transport writes to every sink even when one throws; the failures
are reported afterwards (several as one `AggregateError`). The buffered
transport writes each entry independently, so a failing write loses only
that entry, and a failure from a timer-triggered flush is rethrown by the
next `flush()` or `close()`.

`transportTimeout` (default 10s) bounds every transport write, so a
transport that stops responding cannot hang `flush()` or `close()`. A
write that exceeds it fails with `LoggerTimeoutError`, carrying
`transportName` and `timeout`; other write failures are reported as
`LoggerTransportError` with `transportName` set, and formatter failures
as `LoggerFormatterError` with `formatterName` set.

`throwTransportErrors` (default `false`) rethrows transport and formatter
failures instead of dropping them. A synchronous transport throws from the
log call itself; a failure from an asynchronous transport (or with
`asynchronous: true`) cannot, so it is rethrown by the next `flush()` or
`close()`, which still flush and close the transports first.

`flush()` and `close()` isolate each transport: one that throws does not
stop the rest from being flushed and closed, and `close()` always leaves
the logger disposed. The failures are rethrown afterwards (several as one
`AggregateError`).

## Flushing

Dispatch completes synchronously when every transport is synchronous.
With an asynchronous transport — or with `asynchronous: true`, which
always defers so the caller stays off the transport's critical path —
writes are in flight until drained. `flush()` and `close()` drain them,
including writes started by child loggers (`child()`, `withContext()`),
so nothing is lost at exit. A child reports itself disposed once its root
logger is closed.

## Secret redaction

Redaction is **on by default**. Metadata and context fields whose NAME
looks like a secret are replaced with `"[REDACTED]"` before the entry
reaches any formatter or transport. Names are split into words
(`x-api-key`, `api_key` and `apiKey` all read as `api key`) and matched
against `DEFAULT_LOGGER_SECRET_FIELDS` — password, passphrase, secret,
token, jwt, bearer, auth, authorization, cookie, session, sid,
credential, api key, private key, client secret, card number, cvv, ssn,
pin, otp and more — so `sessionId` and `cardNumber` are redacted while
`passenger` and `authorId` are not. Nested objects, arrays, `Map`,
`Set` and getters are all covered — a `Map` is redacted per key and a
`Set` becomes an array. A getter that THROWS yields `"[Unreadable]"`
for that field: the rest of the entry is logged and the read failure is
reported through the same path as transport and formatter failures
(dropped by default, rethrown with `throwTransportErrors`), so a lazy
ORM relation can never abort the caller's log statement. Passing
`redact.pattern` replaces the word matcher with
your own RegExp (the old substring default is still exported as
`DEFAULT_LOGGER_SECRET_PATTERN`).

```typescript
logger.info("login", { user: "alice", password: "hunter2" });
// metadata: { user: "alice", password: "[REDACTED]" }

createLogger({ redact: { keys: ["ssn"], replacement: "***" } });
createLogger({ redact: { enabled: false } }); // opt out
```

## Log injection

Text-shaped formatters escape control characters (C0, DEL, C1 and
U+2028/U+2029) in the message, the level, the logger name, metadata keys
and values, context values, source locations and error stacks. A newline
or ANSI escape inside attacker-supplied text becomes `\n` / `\u001b`
rather than forging an extra log record or driving the operator's
terminal. In a stack trace only the frame lines break the line: the
error's name and message are escaped as one line, and every frame line is
indented so none can start at column 0 and pass for a record. The JSON formatter relies on
`JSON.stringify`, which escapes the same characters.

Metadata is normalized before serialization, so circular references
(`"[Circular]"`), BigInt values and functions never make a formatter
throw and silently drop the record. Only a genuine back-edge becomes
`"[Circular]"` — the walk tracks the ancestor path, so an object
referenced from two places in one payload (`{ actor: user, target: user }`)
is logged in full both times.

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

Per-call context is merged into the entry's metadata the same way:
`logger.log(LoggerLevel.INFO, "handled", { context: { tenant: "acme" } })`.
The entry's `context` also carries the identifiers (`requestId`, `traceId`,
...) of the active context for transports that read them directly.

Child loggers inherit name, level, formatter, transports, metadata and
redaction settings: `logger.child({ name: "api.db" })`.

## Formatters

`createTextLoggerFormatter`, `createJsonLoggerFormatter`,
`createCompactLoggerFormatter`, `createDevelopmentLoggerFormatter`,
`createProductionLoggerFormatter`, `createStructuredLoggerFormatter`.

Pass `{ colors: true }` in the formatter context to colourize the level
tag of text output. Colour codes are emitted only around the fixed level
name, never around user-supplied text.

A formatter returns either a string or an object
(`LoggerFormattedOutput`). A string becomes the payload's `message`; an
object is merged OVER the entry, so `createStructuredLoggerFormatter()`
hands the transport its structured record (with an ISO-string
`timestamp` and serialized metadata) rather than the raw entry.

## Use Cases

- Application logging
- Distributed tracing correlation
- Audit trails
- Debugging and monitoring
