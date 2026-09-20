---
"@zudojs/logger": minor
"@zudojs/config": minor
---

**@zudojs/config**

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
