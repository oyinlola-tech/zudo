# @zudojs/runtime

## 1.3.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4
  - @zudojs/container@1.2.3
  - @zudojs/core@1.2.4
  - @zudojs/events@1.3.3
  - @zudojs/logger@1.4.3

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/container@1.2.2
  - @zudojs/core@1.2.3
  - @zudojs/events@1.3.2
  - @zudojs/logger@1.4.2

## 1.3.1

### Patch Changes

- Post-release fixes.

  - **database:** `new UserRepository(prisma.user)` with a real generated Prisma 7 client failed strict type-checking (TS2345). A generated delegate's methods are generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)`) and their argument types (`select?: UserSelect | null`) cannot be assigned from one hand-written argument shape. `RepositoryDelegate` now accepts any argument list, the same way `PrismaClientLike.$transaction` already did, and still checks return types, so a delegate whose rows do not match the entity is still rejected. A generated delegate is passed with no cast. `BaseRepository#delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so a subclass that calls `this.delegate.findMany({ where })` compiles as before.
  - **queue:** `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so `createInMemoryDeadLetterStore()` (a `DeadLetterStore<unknown>`) and `createInMemoryDeadLetterStore<T>()` for a `Queue<T>` were both rejected with TS2322. It is now `DeadLetterStore<unknown>`, which accepts either with no annotation. A store already annotated `<never>` still compiles.
  - **container:** `registerClass(TOKEN, Service)` (and `{ useClass }`, `classProvider`, `provideClass`) with no `inject` list built a class whose constructor needs arguments, passing `undefined` for each one. 1.2.0 fixed this only for auto-registration. Registering is still allowed, but resolving now throws `ProviderResolutionError` naming the class, the parameter count and the `inject: [...]` fix. Constructors with no parameters, or only defaulted ones, are unaffected.
  - **runtime:** a failed stop published `runtime.failed` (`phase: "stop"`) twice, once from the shutdown sequence and once from the runtime. An `onShutdown` that outlives `shutdownTimeout` under `SIGTERM` now leaves the runtime `failed`, sets exit code 1 and publishes `runtime.failed` once. `RuntimeEventType` lacked `"runtime.initialized"` and `"runtime.starting"`, which `RuntimeEventMap` declares and the runtime publishes. It is now derived from the map (`keyof RuntimeEventMap`), and `RuntimeModuleEventType` from the `runtime.module.*` keys, so the two cannot drift again.
  - **serialization:** the `SerializeError` for a value JSON would write as `{}` said "a Error" and "a ArrayBuffer", and told the caller to "keep the built-in transformers enabled" even when they were on. It now uses the right article ("an Error"). It suggests the built-ins only when they are disabled and one of them handles the type. Otherwise it suggests registering a transformer.

  `@zudojs/runtime`: a module failure during startup publishes `runtime.failed` once (from startup, naming the failing module) instead of twice.

- [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Post-release fixes.

  - **messaging:** aborting a dispatch in a browser threw `ReferenceError: setImmediate is not defined`. The abort rejection is now scheduled with `setTimeout(…, 0)`, which keeps the same ordering (a handler that aborts and returns still has its result recorded first) and works in every runtime.
  - **runtime:** with `handleSignals: true`, a `SIGTERM`/`SIGINT` under plain `node` could exit the process at once with code 0 — the runtime still `running` or `stopping` and `onShutdown` never finished — whenever nothing else kept the event loop alive (tsx masked this by keeping the loop alive). The signal handler now holds the loop open for the whole graceful shutdown, gives a signal delivered just before the loop drained one turn to be dispatched, and sets `process.exitCode = 1` when the shutdown fails (`stop()` rejects or a module's shutdown hook fails). A clean shutdown leaves the exit code alone, and the process still exits on its own rather than through `process.exit()`. A failed signal-triggered shutdown is now logged as the documented `RuntimeSignalError` ("Shutdown handler failed.") instead of "Shutdown failed.".
  - **rpc:** a non-exposed `RPCError` hid its message but sent its custom code: `new RPCError("secret", { code: "TASK_SECRET" })` went out as `{ code: "TASK_SECRET", … }`. It now goes out as `RPC_INTERNAL_ERROR`. A non-exposed error whose code is a standard wire code (a key of `RPC_HTTP_STATUS`, such as `RPC_UNAVAILABLE`) keeps that code with the generic message, and exposed errors keep their code and message as before.
  - **plugins:** `dependencies: [{ name: "metrics", optional: true }]` made `start()` throw `PluginDependencyError` when "metrics" was not registered, because only `optionalDependencies` was honoured. `optional: true` inside `dependencies` is now equivalent: skipped when missing, ordered before the dependent (and version-checked) when present.
  - **events:** documentation only. A namespace wildcard is multi-level — `"task.*"` matches `task`, `task.created` and `task.sub.created` — which the README and JSDoc now say, along with the fact that there is no single-level wildcard.

- Updated dependencies [`e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099), [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/container@1.2.1
  - @zudojs/events@1.3.1
  - @zudojs/logger@1.4.1

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
  - @zudojs/events@1.3.0
  - @zudojs/container@1.2.0
  - @zudojs/constants@1.1.2
  - @zudojs/core@1.2.2
  - @zudojs/logger@1.4.0

## 1.2.1

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

- Updated dependencies [`c904687`, `c904687`, `c904687`, `c904687`]:
  - @zudojs/container@1.1.2
  - @zudojs/errors@1.2.0
  - @zudojs/events@1.2.0
  - @zudojs/logger@1.3.0
  - @zudojs/constants@1.1.1
  - @zudojs/core@1.2.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **RT-01:** A startup timeout now abandons the startup. No further module hook starts, and a module whose `onInitialize` or `onReady` finishes after the timeout is shut down and destroyed when it settles. `stop()` waits for that teardown, bounded by `shutdownTimeout`. `LifecycleManager` gains `cancel()` and a `cancelled` getter.
  - **RT-02:** A second `stop()` after a shutdown timeout joins the teardown that is still running instead of calling every `onShutdown` again. Modules leave `startedModules` as they are stopped.
  - **RT-03 (fail-closed):** A configuration manager that fails to load now fails startup with `RuntimeStartError` (`phase: "initialize"`), and the startup rolls back. Previously the failure was logged as a warning and modules initialized against partial configuration.
  - **RT-04:** Signal and fatal-error handlers are released after a failed, rolled-back `start()`.
  - **RT-05:** `RuntimeOptions` now exposes `exitOnFatalError`, `forceExitOnSecondSignal` and `fatalExitTimeout` and passes them to the signal handler. The defaults are unchanged (true, true, 10000). `LifecycleManagerOptions.shutdownTimeout` is marked deprecated, since it has never had an effect.
  - **X-01:** A module whose `onInitialize` threw now has its `onDestroy` run during rollback and teardown, matching `@zudojs/lifecycle` and `@zudojs/core`.
  - Behaviour changes: `stop()` after a timed-out startup whose hook never settles rejects with a shutdown timeout instead of reporting a clean stop; config load failures fail startup; `onDestroy` runs for failed initializers.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `d2b01bf`, `d2b01bf`, `5d6b957`, `5d6b957`]:
  - @zudojs/constants@1.1.0
  - @zudojs/container@1.1.1
  - @zudojs/core@1.2.0
  - @zudojs/errors@1.1.0
  - @zudojs/events@1.1.0
  - @zudojs/logger@1.2.0

## 1.1.0

### Minor Changes

- - **`runtimeId` is now actually generated when omitted.** It was documented as auto-generated, but nothing generated it: an omitted id reached `runtime.context.runtimeId`, every event payload and every log line as `undefined`. `resolveRuntimeOptions()` now fills in `rt_<32 hex>` via `createRuntimeId()`; an explicit id is honoured as before.
  - **`stop()` during `start()` no longer throws.** Calling `stop()` while startup was in flight threw `RuntimeStateError` ("cannot stop a runtime in state initializing"), so a SIGTERM arriving while modules were still coming up was logged as "Shutdown failed" and the runtime carried on to `running`. `stop()` now waits for the in-flight start to settle (bounded by `startupTimeout`) and then shuts the runtime down.
  - **Removing the last readiness check restores readiness.** A running runtime whose only (failing) check was removed stayed at `ready: false` / `readiness.state: "degraded"` while `health.state` — which sees no checks — reported `healthy`. `ReadinessTracker.removeCheck()` now returns to `ready` when the last check is removed from a degraded tracker.

### Patch Changes

- Updated dependencies []:
  - @zudojs/config@1.0.1
  - @zudojs/container@1.1.0
  - @zudojs/core@1.1.0
  - @zudojs/errors@1.0.1
  - @zudojs/events@1.0.1
  - @zudojs/logger@1.1.0
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix the 34 findings from audit round 7 across the queue, rpc, plugins and runtime packages.

  **Availability**

  - `InMemoryQueue` no longer spins the event loop forever when a waiting job has no registered processor. `processTick` now claims only runnable jobs, so an unprocessable job is skipped instead of starving the process.
  - `RPCClient` drains its pending map when a call settles. Previously entries survived until their timeout fired, so a client that made more than ~1024 successful calls in 30 seconds refused all further work.
  - `RPCDispatcher` enforces `RPCProcedureOptions.timeout` (and a default), aborts the request signal when it elapses, honours `metadata.deadline`, and rejects payloads over `MAX_RPC_PAYLOAD_SIZE`.

  **Security**

  - The RPC server no longer returns internal exception text to callers. Unexpected failures answer with a fixed message and are reported to the new `onInternalError` hook for server-side logging.
  - `RPCAuthenticationError`, `RPCForbiddenError`, `RPCRateLimitedError`, `RPCTimeoutError` and friends keep their identity through dispatch and map to distinct wire codes instead of collapsing into `RPC_INTERNAL_ERROR`.
  - Incoming requests are validated before dispatch: frame shape, request id, procedure name pattern, metadata type and payload size. Procedures may declare `input`/`output` schemas, which the dispatcher enforces.
  - `LifecycleManager` scopes `context.getModuleContext()` to a module's declared dependencies.

  **Resource safety**

  - Timers that guard an operation are now cleared when the operation wins, in the queue timeout middleware, the RPC timeout helpers, and runtime shutdown. A cleanly stopped runtime no longer holds the process open for the full `shutdownTimeout`.
  - `InMemoryQueue.close()` drains in-flight jobs before tearing down, bounded by `closeTimeout`, and clears scheduled and retry timers.
  - Plugin `context.onDispose` / `registerDisposable` now reach the collection teardown actually drains, and `context.signal` aborts on shutdown. Neither previously did anything.
  - `PluginManager.start()` rolls back on failure, and `stop()` disposes plugins left in `installed`/`initialized`.
  - `Runtime.stop()` works from the `failed` state, and startup rollback destroys modules that initialized but never started.

  **Correctness**

  - Queue job selection no longer skips jobs with a negative priority.
  - Retry delays are clamped to the maximum timer delay, so a large exponential backoff no longer overflows into an immediate retry; jitter is available on both queue and RPC retry, and defaults to on for `retry()`.
  - Queue throughput counters are shared by reference and reported through `getStats()`.
  - Job payloads round-trip through the configured serializer, which was previously never used.
  - Plugin shutdown follows reverse dependency order; present optional dependencies participate in ordering; declared dependency versions are enforced.
  - Missing module dependencies are rejected by `resolveDependencies` instead of silently dropped.
  - Runtime readiness checks registered before startup are evaluated rather than overridden, run under a per-check timeout, and `parallelInitialization` is implemented.

  **Capabilities that were declared but never called**

  A follow-up sweep found more instances of the pattern the audit was tracking — an option or type in the public surface that nothing reads. Each is now honoured:

  - `Worker` ran jobs by invoking the processor directly, leaving every job it processed stuck in `active` forever with no retry, dead-lettering or middleware. Job execution now belongs to the queue: the new `Queue.runJob()` runs a claimed job through the queue's pipeline, and the worker dispatches through it.
  - A processor returning a primitive (`"done"`, `42`) threw a `TypeError` from `"success" in result` and was dead-lettered as a failure. Non-`JobResult` returns now complete normally and carry their value on `job:completed`.
  - `QueueOptions.stalledAfter` / `maxStalledCount` reclaim jobs left `active` by a consumer that died, dead-lettering a job that stalls repeatedly. `WorkerOptions.timeoutMs` is applied to jobs that carry no timeout of their own; the unimplemented `WorkerOptions.maxStalledCount` was removed in favour of the queue-level setting.
  - `RuntimeOptions.startupTimeout` was validated as positive and never enforced, so a module whose `onInitialize` never settled hung the boot forever. It now bounds startup.
  - `RuntimeOptions.trackHealth` now actually disables health derivation, and `RuntimeOptions.metadata` — required on `ResolvedRuntimeOptions` with no default, so `undefined` at runtime — has a default and is surfaced on the runtime context.
  - `PluginManagerOptions.hookTimeout` bounds a lifecycle hook with `PluginTimeoutError`, which was exported and never thrown; `allowedCapabilities` enforces `PluginMetadata.capabilities`, which was declared and never read.
  - `RPCInterceptor` and `createNoopRPCInterceptor` were exported with no way to register them. Interceptors now wrap every dispatch via `RPCDispatcherOptions.interceptors`.
  - `RPCProcedureOptions.idempotent` and `description` are reachable through the new `RPCProcedureRegistry.describe()`.
  - `RPCStreamingProcedure` is documented as not yet dispatchable — the registry accepts only `RPCProcedure` and `RPCTransport.send` resolves a single response — rather than left looking usable.

  **Breaking**

  - `Queue` gains required `claimNextJob()`, `releaseJob()`, `runJob()`, `isDisposed()` and `getDeadLetterJobs()` members; custom implementations must add them. Consumers that ran jobs from `getNextJob()` must switch to `claimNextJob()`, which claims the job.
  - `QueueStats` gains lifetime counters.
  - `createTimeout()` (RPC) returns `{ promise, cancel }` instead of a bare promise, and `createCancellableSignal()` returns `{ signal, cancel }` instead of an un-abortable signal.
  - `RPCTransport.send()` receives an options argument carrying the abort signal.
  - `executeShutdown()` resolves with a `ShutdownResult`; `LifecycleManager.rollback()` resolves with its failures.
  - `@zudojs/runtime` no longer exports `testRuntime` from the package root; import from `@zudojs/runtime/testing`. `createMockModule()` records calls itself rather than importing `vitest` via `require`, which crashed in ESM.
  - `RuntimeRegistry.unregister()` returns a boolean; `removeAndStop()` added.
  - `WorkerOptions.maxStalledCount` removed; use `QueueOptions.stalledAfter` and `QueueOptions.maxStalledCount`.
  - `RuntimeContext` gains a required `metadata` field.

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Make runtime status and readiness actually live, add a health surface, and give modules a real context.

  **`RuntimeStatus` and `RuntimeContext` were frozen snapshots.** Both were built
  once at construction, so `state`, `ready`, `health`, `startedAt`, `stoppedAt`
  and `error` never changed for the lifetime of the process — a runtime that had
  started, become healthy and then stopped still reported the values it had at
  construction. They are now derived getters that reflect current state. Code that
  captured a status object and read it later will now observe it changing; code
  that (correctly) expected live values now gets them.

  **`ReadinessTracker.registerCheck` discarded the check function.** It kept the
  name and threw the function away, so `initialChecks` never ran and a registered
  check could never be re-evaluated. Checks are now retained and executed, and
  each result carries a `durationMs`.

  **New readiness API on `Runtime`:** `registerReadinessCheck`,
  `removeReadinessCheck`, `runReadinessChecks` and a `readiness` getter.
  Registering a check on an already-running runtime moves it back to not-ready
  until the check passes.

  **New health surface.** `src/health/` derives a `RuntimeHealth` from lifecycle
  state plus readiness and emits a `runtime.health.changed` event when the derived
  health moves. Subscribe to it for liveness/readiness probes instead of polling.

  **`LifecycleManager` now builds a real `ModuleContext`.** It previously passed
  `{} as ModuleContext` stubs whose `getConfig` always returned `undefined` and
  whose `hasModule` always returned `false`. It is now backed by a
  `ConfigurationManager`, with a cached per-module context and a throwing getter
  for `application`. Modules that silently received `undefined` config will now
  receive their actual configuration — check any module that worked around the
  old stub behaviour.

  Note: `ApplicationContext` is not reachable from `@zudojs/core@0.1.0` (no
  `application` barrel export and no `./application` subpath in its `exports`
  map), so the runtime cannot construct one. It must be supplied by the host.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5)]:
  - @zudojs/errors@0.2.0

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
  - @zudojs/config@1.0.0
  - @zudojs/constants@1.0.0
  - @zudojs/container@1.0.0
  - @zudojs/core@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/events@1.0.0
  - @zudojs/logger@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/core@0.1.3
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/config@0.1.2
  - @zudojs/logger@0.1.2
  - @zudojs/container@0.1.2
  - @zudojs/events@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/core@0.1.2
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/config@0.1.1
  - @zudojs/logger@0.1.1
  - @zudojs/container@0.1.1
  - @zudojs/events@0.1.1
