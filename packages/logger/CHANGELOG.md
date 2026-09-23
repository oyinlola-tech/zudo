# @zudojs/logger

## 1.4.0

### Minor Changes

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - - `@zudojs/schema`: new `isSchemaValidationError(error)` guard narrows a caught error so `error.issues` is typed `readonly SchemaIssue[]` without a cast (it also checks each issue's shape at runtime). `parse()` and `unwrapSchemaResult()` now throw `SchemaError<SchemaIssue>`.
  - `@zudojs/errors`: `SchemaError` is generic (`SchemaError<TIssue = unknown>`, likewise `SchemaErrorOptions` and `createSchemaError`); the default keeps existing code unchanged.
  - `@zudojs/schema`, `@zudojs/validation`: length and count messages use the singular for one ("at least 1 character", "at least 1 item") instead of "1 characters".
  - `@zudojs/types`: new `formatCount(count, singular, plural?)`.
  - `@zudojs/logger`: the console transport prints the formatted line instead of a record object that repeated the timestamp and level; an `Error` passed as the second argument of a level method (`logger.error("failed", err)`, common in JavaScript) is now logged as the entry's error with its stack instead of being read as empty metadata and dropped (the typed form remains `logger.log(level, message, { error, metadata })`); no trailing space before a stack trace. The level methods' signatures are unchanged.
  - `@zudojs/schema`: `string().url()` still accepts only `http`/`https` by default (so `javascript:` and `data:` URLs stay invalid), and now takes `url({ protocols: ["postgres", "postgresql", "redis", "rediss"] })` or `{ protocols: "any" }`, parsed with the WHATWG `URL` parser; a `postgres://` `DATABASE_URL` was refused. The doc comment now states the default.
  - `@zudojs/schema`: `date()`, `datetime()` and `time()` validate real values: month 01-12, a day that exists in that month (leap years included), hours 00-23, minutes and seconds 00-59 and a `±hh:mm` offset up to 23:59. `"2026-02-30"`, `"2026-13-45"` and `"2026-02-30T25:61:00Z"` used to pass.
  - `@zudojs/schema`: an optional key absent from the input stays absent from the parsed object instead of coming back as an own key set to `undefined` (a repository then wrote it as `NULL`); a key sent as `undefined` is kept. The inferred object type makes such keys optional properties (`{ b?: string | undefined }`, new exported `ObjectShapeOutput`), matching `exactOptionalPropertyTypes`.
  - `@zudojs/schema`: `partial()` no longer applies `.default()` to absent keys, so an update schema built with `partial()` no longer resets every defaulted field the caller left out. Present values are still validated.
  - `@zudojs/schema`: every primitive has `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()`: `boolean()`, `bigint()`, `symbol()`, `literal()`, `enum()`, the sentinel schemas and all `coerce` schemas (through the new `ModifiableSchema` base class). `schema.boolean().optional()` was a type error.
  - `@zudojs/schema`: `SchemaInput<typeof string().transform(fn)>` is the input type (`string`), not the output type; `TransformSchema<TIn, TOut>` now extends `Schema<TOut, TIn>`. Object, tuple and union inference read only the output type, so a transformed field keeps its output type in `Infer<>`. Compatibility: code that annotated a chained transform as `Schema<TOut>` must use `Schema<TOut, TIn>` (or `Schema<TOut, unknown>`).
  - `@zudojs/logger`: `entry.message` is again the raw message a transport receives. The formatter's rendering is in the new `entry.formatted` (the text or JSON line, or the JSON line of a structured formatter's record); a string formatter's output used to replace `message`. **Custom transports that printed `entry.message` to get the formatted line should print `entry.formatted ?? entry.message`** (or use the new `formatTransportLine(entry)`); the console transport does.
  - `@zudojs/logger`: with `createStructuredLoggerFormatter()`, the console transport prints one JSON line per record (cycles become `"[Circular]"`, BigInt a string) instead of a multi-line object; new `toJsonLogLine(record)` helper.
  - `@zudojs/logger`: `level` accepts level names in any case wherever a level is configured: `createLogger({ level: "error" })`, `setLevel("DEBUG")`, `child({ level: "trace" })` (type `LoggerLevelLike = LoggerLevel | LoggerLevelName | Uppercase<LoggerLevelName>`, new `resolveLoggerLevel()`). An unknown level now throws instead of silently disabling output. `Logger.setLevel` takes `LoggerLevelLike` and `Logger.child` the new `ChildLoggerOptionsInput`; `ChildLoggerOptions` is unchanged, and an implementation declared with a `LoggerLevel` / `ChildLoggerOptions` parameter still satisfies the interface (it may now be handed a name, which `resolveLoggerLevel()` converts).
  - `@zudojs/logger`: `createTextLoggerFormatter({ includeStackTrace: false })` prints an error as its name and message only (`error={"name":...,"message":...}`), and an `Error` inside metadata loses its stack too; the fallback used to serialize the stack, absolute paths included. `serializeLoggerValue` and `serializeLoggerError` take an optional flag to omit stacks.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.3.0

### Minor Changes

- **@zudojs/config**

  - Secret detection now runs inside `ConfigStore.set()`, so a key such as
    `db.password`, `api_key` or a `postgres://user:pw@host` connection string is
    marked sensitive however it was written — from a source, from
    `initialValues`, from `set()` / `setMany()` / `replace()` or from
    `manager.set()`. Previously only values arriving through a source were
    redacted, and `toSafeObject()` printed the identical key in clear when it had
    been seeded or set at runtime. Pass `sensitive: false` explicitly to opt a key
    out.
  - A configuration source that declares no `priority` now gets
    `DEFAULT_CONFIG_SOURCE_PRIORITY` (`-1`, newly exported) instead of `0`. Both
    defaulted to `0` before, and because a source overwrites on _equal_ priority,
    any source created without a priority silently wiped a manager's
    `initialValues` during `load()`. Sources that declare `priority: 0` or above
    still override them, as documented. If you relied on an undeclared source
    beating another source that declares `priority: 0`, declare a priority on it.
  - `ConfigLoader` now deduplicates its constructor sources by name, first
    occurrence wins — the same rule `addSource()` and `loadConfigSources()`
    already enforced. Duplicates used to load twice, with the _last_ one winning.
  - `initialValues` are seeded with `source: "initialValues"` on every path,
    including a store the manager creates itself (it recorded `"runtime"` before).

  **@zudojs/logger**

  - A formatter that returns an object (`createStructuredLoggerFormatter()`) now
    reaches the transport: the record is merged over the entry instead of being
    computed and discarded. String formatters are unchanged.
  - A metadata getter that throws no longer propagates out of `logger.info(...)`
    and aborts the caller. The field becomes `"[Unreadable]"` (exported as
    `LOGGER_UNREADABLE_TOKEN`), the entry is still logged, and the read failure is
    reported like any other infrastructure failure — dropped by default, rethrown
    when `throwTransportErrors` is on.
  - The cycle guard tracks the ancestor path instead of every object ever seen, so
    `{ actor: user, target: user }` logs both fields; only a genuine back-edge
    becomes `"[Circular]"`. Applies to redaction, serialization and the JSON
    formatter.
  - `Map` and `Set` metadata keep their contents instead of collapsing to `{}`: a
    `Map` serializes as an object (with per-key secret redaction) and a `Set` as an
    array.
  - `createLoggerManagerFromLogger(logger)` now registers the logger with the
    manager's factory, so `manager.flush()` / `manager.close()` actually reach it
    and `manager.size` / `getAll()` report it. `LoggerManager.adopt(logger)` and
    `LoggerFactory.register(logger, name?)` are new public methods.
  - Errors are now typed where they were generic: a transport write exceeding
    `transportTimeout` raises `LoggerTimeoutError` (with `transportName` and
    `timeout`), other write failures `LoggerTransportError` with `transportName`
    set, formatter failures `LoggerFormatterError` with `formatterName` set, a
    closed `LoggerManager` `LoggerDisposedError` instead of a bare `Error`, an
    unknown level `InvalidLoggerLevelError`, an invalid entry timestamp
    `InvalidLoggerEntryError`, an unresolved string formatter id
    `LoggerFormatterNotFoundError`, and a write to a closed buffered transport
    `LoggerTransportClosedError`. Code matching on `RangeError` or on error message
    text from these paths needs updating.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.2.0

### Minor Changes

- Round 10 fixes:

  - LOG-01: the text formatter no longer lets a newline inside an error message forge a log record through the stack trace. The error header (name and message) is escaped as one line and every frame line is escaped and indented. `escapeLogText` now also escapes C1 controls, DEL inside quoted values, and U+2028/U+2029; the level name and JSON-quoted metadata values are escaped as well.
  - LOG-02: `createMultiLoggerTransport` and `createConditionalLoggerTransport` now forward `flush()` and `close()` to the transports they wrap, so nested buffered/file transports are drained and closed by the logger. The multi transport writes to every sink even when one throws, then rethrows the failure(s) (several as an `AggregateError`).
  - LOG-03: the buffered transport writes each entry independently (a failing write loses only that entry), forwards `flush()` to its inner transport, and keeps a timer-triggered flush failure so the next `flush()`/`close()` rethrows it.
  - LOG-04: `logger.flush()` and `logger.close()` isolate each transport; one failing transport no longer leaves later ones unflushed/unclosed, and `close()` always marks the logger disposed. Several failures surface as one `AggregateError`.
  - LOG-05: child loggers (`child()`, `withContext()`) register their in-flight dispatches with the root logger, so the root's `flush()`/`close()` drains them; a child reports itself disposed once its root is closed.
  - LOG-06: the default secret matcher is now word-based over the new `DEFAULT_LOGGER_SECRET_FIELDS` (adds auth, jwt, bearer, session/sessionId, sid, ssn, card number, cvv, cvc, pin, otp, passphrase, client secret…) and no longer redacts names that merely contain `pass` (`passenger`, `compass`, `bypassCache`). `DEFAULT_LOGGER_SECRET_PATTERN` is still exported (deprecated) and can be passed as `redact.pattern` to restore the old behaviour.

  New exports: `DEFAULT_LOGGER_SECRET_FIELDS`, `createDefaultSecretFieldMatcher`, `throwCollectedFailures`, `settleAllOrThrow`.

  Behaviour changes: a timer-triggered buffered-flush failure is now rethrown by the next `flush()`/`close()`; different fields are redacted by default; a child logger throws `LoggerDisposedError` after its root is closed; multi/conditional composite transports without an explicit name keep a generated name but are now object transports with `flush`/`close`.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- - A `redact.pattern` carrying the `g` or `y` flag no longer alternates between redacting and leaking a secret-named field on consecutive entries.
  - Per-call `context` passed to `logger.log(level, message, { context })` is merged into the entry's metadata, so it reaches text formatters instead of being silently dropped; it is redacted like any other metadata.
  - `entry.context` now carries the active context's identifiers (`requestId`, `traceId`, ...) that its type always declared; the text formatter never prints an identifier twice.
  - `throwTransportErrors: true` now surfaces failures from asynchronous transports (and from `asynchronous: true` loggers): they are rethrown by the next `flush()` or `close()`, which still flush and close the transports first. Previously such failures were swallowed.
  - The buffered transport's flush timer is `unref`'d, so a finished process no longer stays alive for a full `flushInterval`.
  - Concurrent `logger.close()` calls share one closure instead of flushing and closing every transport twice.
  - README: the log-injection example contained a raw ESC control byte where the text `\u001b` was meant.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
