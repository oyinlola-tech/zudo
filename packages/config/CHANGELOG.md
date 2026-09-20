# @zudojs/config

## 1.2.0

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
  - @zudojs/constants@1.1.1

## 1.1.0

### Minor Changes

- Round 10 fixes.

  - **data/CONFIG-01 (security):** `validate()` honours `secret: true` at any depth — inside nested object schemas, array items, and dotted keys such as `"db.password"` when the source supplied a nested `db` object. The store entry holding the secret is marked sensitive (the whole entry is redacted by `toSafeObject()`).
  - **data/CONFIG-02 (security):** every source, not only the environment source, now has keys and values screened: a key naming a password, secret, token, API/private key, credential, DSN, database URL or `*_key` (any segment, case-insensitive), a nested object containing such a key, or a URL with embedded `user:password@` is marked sensitive. New exports `isSensitiveConfigKey`, `isSensitiveConfigValue`, `isSensitiveConfigEntry`. Behaviour change: more values are redacted by `toSafeObject()`, and an environment source's `isSensitive: () => false` no longer disables this screening.
  - **data/CONFIG-03:** `reload()` on a layered store (the manager's default) rebuilds source-provided values from scratch in a staging store and commits them only once every source has loaded. A value a higher-priority source stopped providing is dropped, runtime and initial values are kept, a failing source leaves the previous configuration intact, and previously sensitive entries stay sensitive.
  - **data/CONFIG-04:** `toConfigJsonValue` / `configValueToString` define keys instead of assigning them, so an own `__proto__` key stays an own key and never replaces the result's prototype.
  - **data/CONFIG-06:** `parseConfigNumber` and the typed `number()` getters accept decimal notation only; `"0x1F90"`, `"0b11"` and `"0o17"` are rejected.
  - **data/CONFIG-05 (phase 2):** `isUnsafeConfigKey` now checks `SCHEMA_FORBIDDEN_KEYS` from `@zudojs/constants` (same three keys), so config no longer keeps its own copy of the list. The package still has no internal caller, by design: every key write goes through `defineConfigProperty`, which keeps `__proto__`/`constructor`/`prototype` as inert own properties (the round-8 CONFIG-01 policy). A new regression test fails if any source file assigns keys with `target[key] =`, `Object.assign` or `Reflect.set`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - A string schema `pattern` carrying the `g` or `y` flag now validates the same value consistently; `lastIndex` state made the same schema alternate between accepting and rejecting identical input.
  - An array schema's `items.transform` (and `items.default`) now reaches the returned value from `validateConfigValue` / `validateConfigObject` / `manager.validate()`; item results were previously consulted for issues only and the untransformed array was returned as valid.
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
