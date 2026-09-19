# @zudojs/logger

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
