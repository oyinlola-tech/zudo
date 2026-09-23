# @zudojs/container

## 1.2.1

### Patch Changes

- Post-release fixes.

  - **database:** `new UserRepository(prisma.user)` with a real generated Prisma 7 client failed strict type-checking (TS2345). A generated delegate's methods are generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)`) and their argument types (`select?: UserSelect | null`) cannot be assigned from one hand-written argument shape. `RepositoryDelegate` now accepts any argument list, the same way `PrismaClientLike.$transaction` already did, and still checks return types, so a delegate whose rows do not match the entity is still rejected. A generated delegate is passed with no cast. `BaseRepository#delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so a subclass that calls `this.delegate.findMany({ where })` compiles as before.
  - **queue:** `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so `createInMemoryDeadLetterStore()` (a `DeadLetterStore<unknown>`) and `createInMemoryDeadLetterStore<T>()` for a `Queue<T>` were both rejected with TS2322. It is now `DeadLetterStore<unknown>`, which accepts either with no annotation. A store already annotated `<never>` still compiles.
  - **container:** `registerClass(TOKEN, Service)` (and `{ useClass }`, `classProvider`, `provideClass`) with no `inject` list built a class whose constructor needs arguments, passing `undefined` for each one. 1.2.0 fixed this only for auto-registration. Registering is still allowed, but resolving now throws `ProviderResolutionError` naming the class, the parameter count and the `inject: [...]` fix. Constructors with no parameters, or only defaulted ones, are unaffected.
  - **runtime:** a failed stop published `runtime.failed` (`phase: "stop"`) twice, once from the shutdown sequence and once from the runtime. An `onShutdown` that outlives `shutdownTimeout` under `SIGTERM` now leaves the runtime `failed`, sets exit code 1 and publishes `runtime.failed` once. `RuntimeEventType` lacked `"runtime.initialized"` and `"runtime.starting"`, which `RuntimeEventMap` declares and the runtime publishes. It is now derived from the map (`keyof RuntimeEventMap`), and `RuntimeModuleEventType` from the `runtime.module.*` keys, so the two cannot drift again.
  - **serialization:** the `SerializeError` for a value JSON would write as `{}` said "a Error" and "a ArrayBuffer", and told the caller to "keep the built-in transformers enabled" even when they were on. It now uses the right article ("an Error"). It suggests the built-ins only when they are disabled and one of them handles the type. Otherwise it suggests registering a transformer.

  `@zudojs/runtime`: a module failure during startup publishes `runtime.failed` once (from startup, naming the failing module) instead of twice.

## 1.2.0

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

## 1.1.2

### Patch Changes

- **@zudojs/lifecycle**

  - `priority` is now a real ordering barrier instead of a hint. Components
    registered at one priority all complete a phase before the next priority
    starts, so `register(metrics, { priority: 100 })` genuinely starts before
    `register(server, { priority: 0 })`. Previously the whole dependency level
    was launched concurrently (up to `concurrency`, default 10) and the sorted
    order was observable only at `concurrency: 1`, so whichever hook happened
    to finish first won. Components sharing a priority still run together, so
    the default configuration — every component at priority 0 — is unchanged.
    Shutdown now mirrors startup within a level: the lowest priority stops
    first, the highest last. The same reversal applies to the exported
    `reverseTopologicalSort`, which now reverses each stage's contents as well
    as the stage list.
  - `shutdown()` no longer disposes a component whose `stop()` is still
    running. A `stop()` hook that blows its own component `timeout` is
    abandoned rather than cancelled; shutdown only waited for such hooks
    _before_ the stop phase, so one abandoned during it had `dispose()` run on
    top of it while `shutdown()` resolved and reported the application
    DISPOSED. Each shutdown phase now waits for abandoned hooks to settle
    before the next one begins, still bounded by the global
    `shutdownTimeout`, so `await shutdown(); process.exit(0)` can no longer
    cut a drain short.
  - Registry and abort failures (`Cannot register components after registry is
frozen`, `Component "x" is already registered`, an unregistered
    `dependsOn` target, and a cancelled `withAbort`) now throw
    `LifecycleError` from `@zudojs/errors` rather than a bare `Error`, so they
    carry an `ErrorCode` and answer `instanceof LifecycleError`. Messages are
    unchanged.

  **@zudojs/container**

  - `clearRegistrations()` and `restoreSnapshot()` now invalidate live scopes.
    Both already evicted and disposed cached singletons, but scopes were never
    told, so a scope went on serving the SCOPED instance built from a
    registration that had just been discarded — for the rest of its life, and
    without ever disposing it. A test harness that snapshotted, installed a
    SCOPED fake and then restored kept the fake. Every token that was cached
    when the registry is cleared or restored is now reported as invalidated,
    so live scopes drop and dispose their copies and the next `resolve()`
    rebuilds from the current registration.
  - `Container "x" has already been disposed`, `Registrations for container
"x" are frozen`, `Container scopes are disabled`, the three disposed-scope
    guards, an unregistered `useExisting` target and an unsupported provider
    now throw `ContainerError` / `ContainerLifecycleError` from
    `@zudojs/errors` rather than a bare `Error`. Messages are unchanged.

  **@zudojs/runtime**

  - `LifecycleManager` with `continueOnFailure: true` no longer initializes or
    readies a module whose declared dependency failed. It previously consulted
    only the failure count, so `api` with `dependencies: ["db"]` had both
    `onInitialize` and `onReady` invoked — and appeared in `start().succeeded`
    — after `db` failed to come up. Such a module is now skipped, reported in
    `initialize().failed` with the blocking dependency named, and the skip
    cascades to its own dependents. Modules independent of the failure still
    continue, and `continueOnFailure: false` (the default, and what
    `createRuntime()` uses) is unaffected.
  - Runtime option validation and `RuntimeRegistry.register()` /
    `require()` now throw `RuntimeError` / `RuntimeStateError` rather than a
    bare `Error`. Messages are unchanged.

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.1.1

### Patch Changes

- Round 10 fixes.

  - **CONT-01:** `replace()` and `remove()` now cascade. Every cached singleton built on the replaced token, directly or through a transient, is evicted and disposed. Live scopes also drop and dispose their cached `SCOPED` copies of the token and its consumers. Previously consumers kept serving the old, disposed instance.
  - **CONT-02:** Values registered with `registerValue()` or `{ useValue }` belong to the host and are no longer disposed by the container.
  - Behaviour changes: replacing a dependency now rebuilds its consumers (and disposes the old ones); `registerValue()` instances are never disposed; use a factory if the container should own disposal.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- - A `useExisting` alias of a cached (`SINGLETON`/`SCOPED`) target is no longer tracked as a second owner of the target's instance: the instance is disposed exactly once on `container.dispose()`, and a `SCOPED` alias of a `SINGLETON` no longer lets `scope.dispose()` dispose the container-owned singleton. A `TRANSIENT` target captured by a cached alias is still tracked through the alias.
  - `replace()`/`remove()` of a token now also evicts every cached `useExisting` alias that points at it, so `resolve(alias)` returns the new instance instead of the old, already-disposed one.
  - `container.dispose()` marks the container disposed before any cleanup runs: a `resolve()` racing the disposal throws instead of creating a singleton that was then dropped without disposal, and concurrent `dispose()` calls (container and scope) share the in-flight disposal instead of settling early. `ContainerLifecycle.dispose()` likewise refuses `track()` while a full disposal is in flight.
  - `CircularDependencyError`, `DuplicateRegistrationError`, `RegistrationNotFoundError` and `ProviderResolutionError` are re-exported from `@zudojs/container`, as the README implied.

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
