# @zudojs/config

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.3.1

### Patch Changes

- - `@zudojs/schema`: a well-formed but impossible value now says so — `date()` on `"2026-02-30"` reports "Not a real calendar date" (likewise "Not a real date and time" / "Not a real time of day") instead of "Invalid date format", which sent people looking for a typo. The issue code is unchanged (`INVALID_FORMAT`).
  - `@zudojs/config`: `ConfigManagerValidationError.issues` is typed `readonly ConfigValidationIssue[]` (it already held those objects), so reading it no longer needs a cast.

## 1.3.0

### Minor Changes

- Fix bugs that lesson writers reproduced in config, validation, container and runtime.

  **`@zudojs/config`**

  - NUMBER and BOOLEAN schemas now accept values from environment variables. Env values are always strings, so `manager.validate({ properties: { port: { type: ConfigValueType.NUMBER } } })` rejected `PORT=8080` as `TYPE_MISMATCH`. A `transform` could not help, because transforms run after the type check. String input is now coerced before the type check when the schema's type includes `NUMBER` or `BOOLEAN` and does not also accept `STRING` or `ANY`. Numbers are parsed strictly and in decimal only: `"8080"` passes, but `"80a"`, `"0x1F90"` and `""` are still rejected. Booleans use the existing `boolean()` convention: `true`/`false`, `1`/`0`, `yes`/`no`, `y`/`n` and `on`/`off`. `validate` and `transform` receive the coerced value. This applies to `validate()`, `resolve()` and the standalone `validateConfigValue`/`validateConfigObject`. **Behaviour change:** these functions used to reject a numeric or boolean string for a NUMBER/BOOLEAN schema and now accept it. Set the new schema option `coerce: false` to keep the old strict behaviour.
  - A typed getter called with a fallback now returns `T` instead of `T | undefined`. This covers `string`, `number`, `boolean`, `bigint`, `date`, `object` and `array` on `ConfigManager`, `ConfigResolver` and `ScopedConfigResolver`. `get(key, fallback)` is a new overload. It returns the stored value, or the fallback when the key is missing. Its literal fallback is widened through the new `ConfigWiden<T>` type, so `get("mode", "dev")` is typed `string`, not `"dev"`. Calls without a fallback keep their old types.
  - `store.getByPrefix()` and `store.getObjectByPrefix()` now ignore a trailing dot in the prefix. Before, `getByPrefix("db.")` returned `[]` and `getObjectByPrefix("db.")` returned `{}`. Now `"db"` and `"db."` select the same entries.
  - `ScopedConfigResolver` and `ConfigManager` gain the typed required accessors that the root resolver already had: `requiredString`, `requiredNumber`, `requiredBoolean` and `requiredDate`. Each one parses the value, checks it, and throws when the value is missing or does not parse. For example, with `DB__PORT=5432`, `scoped("db").requiredNumber("port")` returns `5432`. `required<T>()` still performs no conversion, because `T` is erased at runtime and cannot be checked safely. It now documents this and points to the typed variants.
  - `resolve()` and `resolveResult()` now take a `TypedConfigSchema<T>`. This union is keyed on `type`, so each value type accepts exactly the constraints the validator enforces: `{ type: NUMBER, min: 1 }` compiles, and `{ type: NUMBER, minLength: 1 }` is a compile error. The constraint shapes are exported as `ConfigStringConstraints`, `ConfigNumberConstraints`, `ConfigArrayConstraints` and `ConfigObjectConstraints`. `ConfigStringSchema` and `ConfigNumberSchema` are now built from them, with the same fields as before.
  - `validate` now receives the final value. The order is: coerce, type check, constraints, `transform`, then `validate` on the transformed value, which matches its `(value: T)` signature. A string that does not have the schema's type is passed to `transform` as a parser, and the transform's output must then have the type and pass the constraints. This lets `{ type: ARRAY, transform: (s) => String(s).split(",") }` accept `"a,b"`, and a hex parser accept `"1F90"` for a NUMBER. A non-string of the wrong type is still rejected without calling `transform`. **Behaviour change:** `validate` used to see the value before `transform` ran. A transform can now run on a string that fails the type check, but a result without the right type is still never returned.

  **`@zudojs/validation` / `@zudojs/errors`**

  - `assertDepthWithinLimit` and `assertNoCircularReference` now throw `SerializationDepthError` with `statusCode: 400` and `expose: true`. Before, the error was an unexposed 500, so a request body nested too deep surfaced as a hidden server error. The message contains only the observed depth and the limit. The error class is unchanged, so `instanceof` checks still match. **Behaviour change:** `@zudojs/serialization` calls these guards, so a depth failure from `JSONSerializer` (serialize or deserialize) is now a 400 as well.
  - `SerializationDepthError` takes an optional third constructor argument, `{ statusCode?, expose? }`. Without it, the error is still an unexposed 500. The new `UNTRUSTED_DEPTH_ERROR` constant holds the options the validation guards pass.

  **`@zudojs/container`**

  - `registerFactory`, `factoryProvider` and `provideFactory` now infer the factory's parameter types from the `inject` list. Each `Token<T>` or class token maps to `T`, so the README example `registerFactory(API, (db) => new Api(db), [DB])` compiles under strict mode, and a factory whose parameters do not match the tokens is a compile error. String and symbol tokens give `unknown`, as before. A factory typed `(...deps: unknown[]) => T` and a non-tuple `readonly ProviderToken[]` inject list still compile. The new types are `InjectedDependencies<Deps>` and `InjectedFactory<T, Deps>`. **Behaviour change:** a factory that declares more parameters than its inject list supplies is now a compile error.
  - Error messages and default registration names now show a symbol token by its description: `MissingService` instead of `Symbol(MissingService)`. `describeToken` returns the same string.
  - `autoRegisterClasses` only auto-registers a class whose constructor declares no required parameters (`Class.length === 0`). Before, `resolve(NeedsDep)` for `constructor(dep: Dep)` silently built the class with `dep = undefined`. It now throws `RegistrationNotFoundError`, naming the class and explaining how to register it with an `inject` list. `canResolve` and `resolveOptional` agree with this rule. Parameters with default values are not counted. **Behaviour change** for code that relied on the old silent construction.

  **`@zudojs/runtime`**

  - `start()` now passes through every state in order: `created → initializing → initialized → starting → running`. `initialized` and `starting` were declared but never entered, and `onReady` ran while the state was still `initializing`. `onInitialize` hooks now see `initializing` and `onReady` hooks see `starting`. The runtime publishes `runtime.initialized` and `runtime.starting` between the two phases, and both are back in `RuntimeEventMap`. **Behaviour change:** `RUNTIME_STATE_TRANSITIONS` no longer allows `initializing → running` or `initialized → running`.
  - `RuntimeInitializationError`, `RuntimeRollbackError` and `RuntimeSignalError` were exported but never thrown. They are now used:
    - `RuntimeInitializationError` now extends `RuntimeStartError` with `phase: "initialize"`, so existing `instanceof RuntimeStartError` checks still match. It is thrown when an `onInitialize` hook fails or the configuration manager fails to load. It also accepts a `failedModuleId`.
    - `RuntimeRollbackError` now extends `RuntimeStartError`. It is thrown when startup fails and the rollback that follows also fails, which used to be only logged. `phase`, `failedModuleId` and `cause` describe the startup failure. `originalError` keeps the error `start()` would otherwise have thrown, and `rollbackError` holds what failed during rollback, or an `AggregateError` when several modules failed. The message names both failures.
    - When a shutdown triggered by `SIGTERM`, `SIGINT` or a fatal error fails, the signal handler has no caller to throw to. It now logs a `RuntimeSignalError` with the failure as `cause`. `RuntimeSignalError` accepts an optional `{ cause }`.
  - `failed` is no longer a terminal state. `TERMINAL_STATES` is now `["stopped"]`, and `isTerminalState("failed")` is `false`, which is consistent with `stop()` being allowed from `failed` to clean up. **Behaviour change** for callers of `isTerminalState` and `TERMINAL_STATES`.
  - A failed start still rejects with `RuntimeStartError` that wraps the module's error. It does not re-throw the original. The README now documents this, including `error.cause` (the original error), `error.phase` and `error.failedModuleId`.
  - Container ownership is now documented and configurable. The container is passed in, so by default the caller owns it and `stop()` leaves it alone. The new option `disposeContainerOnStop: true` makes `stop()` dispose the container after every module has shut down. This also covers `stop()` on a runtime that never started. A disposal failure is recorded in `status.shutdownFailures` under the id `"(container)"` (exported as `CONTAINER_SHUTDOWN_ID`) and does not fail the stop. `createTestRuntime` creates its own container and now disposes it on stop. Pass `disposeContainerOnStop: false` to keep it.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

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
