---
"@zudojs/logger": minor
---

Round 10 fixes:

- LOG-01: the text formatter no longer lets a newline inside an error message forge a log record through the stack trace. The error header (name and message) is escaped as one line and every frame line is escaped and indented. `escapeLogText` now also escapes C1 controls, DEL inside quoted values, and U+2028/U+2029; the level name and JSON-quoted metadata values are escaped as well.
- LOG-02: `createMultiLoggerTransport` and `createConditionalLoggerTransport` now forward `flush()` and `close()` to the transports they wrap, so nested buffered/file transports are drained and closed by the logger. The multi transport writes to every sink even when one throws, then rethrows the failure(s) (several as an `AggregateError`).
- LOG-03: the buffered transport writes each entry independently (a failing write loses only that entry), forwards `flush()` to its inner transport, and keeps a timer-triggered flush failure so the next `flush()`/`close()` rethrows it.
- LOG-04: `logger.flush()` and `logger.close()` isolate each transport; one failing transport no longer leaves later ones unflushed/unclosed, and `close()` always marks the logger disposed. Several failures surface as one `AggregateError`.
- LOG-05: child loggers (`child()`, `withContext()`) register their in-flight dispatches with the root logger, so the root's `flush()`/`close()` drains them; a child reports itself disposed once its root is closed.
- LOG-06: the default secret matcher is now word-based over the new `DEFAULT_LOGGER_SECRET_FIELDS` (adds auth, jwt, bearer, session/sessionId, sid, ssn, card number, cvv, cvc, pin, otp, passphrase, client secret…) and no longer redacts names that merely contain `pass` (`passenger`, `compass`, `bypassCache`). `DEFAULT_LOGGER_SECRET_PATTERN` is still exported (deprecated) and can be passed as `redact.pattern` to restore the old behaviour.

New exports: `DEFAULT_LOGGER_SECRET_FIELDS`, `createDefaultSecretFieldMatcher`, `throwCollectedFailures`, `settleAllOrThrow`.

Behaviour changes: a timer-triggered buffered-flush failure is now rethrown by the next `flush()`/`close()`; different fields are redacted by default; a child logger throws `LoggerDisposedError` after its root is closed; multi/conditional composite transports without an explicit name keep a generated name but are now object transports with `flush`/`close`.
