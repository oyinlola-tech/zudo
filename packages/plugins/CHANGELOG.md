# @zudojs/plugins

## 1.4.0

### Minor Changes

- Round 12 platform fixes (findings 94–101, 104–106, 125, 132, 134 from the academy lessons).

  **@zudojs/docs**

  - Security: `validateLinks` now scans every link form a renderer turns into a live link and applies the URL-scheme allow-list to each. `[x](javascript:alert(1))` (parentheses in the target), `[x](<javascript:…>)`, titled targets, reference definitions `[x]: javascript:…`, raw `<a href="…">` in any quoting and `<scheme:…>` autolinks are all reported as `UNSAFE_LINK`; each was previously missed. Every scanner is linear on hostile input.
  - `validateAll` / `validateLinks` take `brokenLinkSeverity` and `validateAll` takes `orphanSeverity` (`"error" | "warning"`, default `"warning"`), so a documentation set with dead links or unreachable documents can be made to fail validation. Defaults are unchanged.
  - `createDocument({ …, strict: true })` rejects an unknown `category`, `status` or `visibility` at creation; without it the builder accepts them as before. Built documents no longer carry explicit `undefined` keys for options that were not supplied.
  - `getAdjacent(id, nav, { scope: "tree" })` walks previous/next across section boundaries in reading order. `SearchDocument`, `SearchResult`, `DocumentationSourceLoader` and `DocumentationVersion` are documented as contracts the package does not implement.

  **@zudojs/plugins**

  - The hook-timeout timer is no longer `unref`'d. A `start()` that never settles, in a process where nothing else holds the event loop, used to exit Node with code 13 before the timeout could fire — no `PluginTimeoutError`, no rollback. It now times out, is rolled back and rejects `start()`.
  - Lifecycle failures name the plugin: a hook's error that is not already a `PluginError` is thrown as `PluginInitializationError` (install/initialize), `PluginStartError` (start) or `PluginStopError` (stop), with `pluginName` set, the original as `cause` and its message quoted (`Plugin "x" failed to start: boom`). Typed plugin errors (`PluginTimeoutError`, `PluginStateError`, …) propagate unchanged. `diagnostics()` and the `failed` event keep the hook's own error.
  - `PluginManager.register(plugin, options)` types `options` from `Plugin<TOptions>`. `PluginContext.host` carries the host application's metadata (the `plugin` of the context passed to `start()`), and `createPluginContext` takes a `host` option. `PluginContainer` declares optional `resolve()` and `has()`, so a real container is accepted without casting.
  - Behaviour change in `diagnostics()`: a plugin that is idle — `registered`, or cleanly `stopped` or `disposed` — is now `healthy` instead of `degraded` (every plugin read `degraded` after a clean `stop()`); a plugin part-way through boot or a transition is `degraded`; a `started` plugin may report its own health through a new optional `Plugin.health()`. New export `resolvePluginHealth`.

  **@zudojs/adapters**

  - Behaviour change: `stopAll()` and `disposeAll()` now run in reverse registration order (the mirror of `initializeAll()`/`startAll()`), as the lifecycle and cleanup managers do.
  - `initializeAll()`, `startAll()` and `stopAll()` take `AdapterOperationOptions` (`timeout`, `retry`, `signal`) like `healthAll()`. The `AggregateError` they throw now holds typed per-adapter errors — `AdapterInitializationError`, `AdapterOperationError` (operation `"start"`/`"stop"`) or `AdapterTimeoutError` — naming the adapter, with the hook's own error as `cause`; previously each entry was the bare error and nothing said which adapter had failed. `disposeAll()`/`removeAndDispose()` still rethrow the hooks' own errors. Code that read `errors[i].message` from `initializeAll()`/`startAll()`/`stopAll()` should read `errors[i].cause` instead.
  - `AdapterCapabilities` is open: any capability name (`refunds`) can be declared and looked up with `findByCapability`, `supports` and `requireCapability`; the well-known keys live in the new `KnownAdapterCapabilities`.
  - `healthAll().adapters` keys are in registration order regardless of which check finished first. `withRetry`, `collectAdapterHealth`, `configureAdapter`, `runAdapterLifecycle` and `toAdapterLifecycleError` are exported from the package root.
  - Not changed here (needs `@zudojs/errors`): `AdapterTimeoutError` and `AdapterConnectionError` still carry `statusCode: 500`.

  **@zudojs/testing**

  - `createMockFn` gains `mockReturnValueOnce`, `mockResolvedValueOnce`, `mockRejectedValueOnce` and `mockImplementationOnce`. One-shot results are consumed in order before the persistent mode; `mockReset` drops them, `mockClear` keeps them.

  **@zudojs/rpc**

  - An `RPCTransportError`, or an `RPCTimeoutError` naming a different procedure, thrown inside a handler or middleware — what an `RPCClient` raises when a downstream call cannot be reached or times out — is now answered with `RPC_UNAVAILABLE` and the new `UNAVAILABLE_ERROR_MESSAGE`, instead of `RPC_INTERNAL_ERROR` (transport) or this procedure's own `RPC_TIMEOUT` (timeout). The dispatcher wraps it in an `RPCUnavailableError` with the original as `cause`, which the server hands to `onInternalError`. A timeout about the procedure itself — the dispatcher's own, a cooperative handler rethrowing `context.signal.reason`, or a handler throwing an `RPCTimeoutError` under its own procedure name — still maps to `RPC_TIMEOUT`. `mapRPCError` applies the same rule to a bare `RPCTransportError`.
  - Documented: `retry()`'s `attempts` counts calls, not retries (`attempts: 3` = three calls); `@zudojs/lifecycle` counts the other way.

  **@zudojs/openapi**

  - New `implicitLimits` option (default `true`) on `createOpenAPIManager`, `createOpenAPIDocumentFromRoutes`, `convertSchema`, `resolveSchemaInput` and the route scanner. The emitted `maxLength: 255` / `maxItems: 1000` on strings and arrays without their own `.max()` reflect the ceilings `@zudojs/schema` actually enforces, so the default is kept; `implicitLimits: false` emits only explicitly declared bounds.
  - Not changed here (lives in `@zudojs/http`): `mountOpenAPI` still serves `/docs` by default in every environment; pass `docsPath: false` to disable it.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0

## 1.3.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.3.1

### Patch Changes

- [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Post-release fixes.

  - **messaging:** aborting a dispatch in a browser threw `ReferenceError: setImmediate is not defined`. The abort rejection is now scheduled with `setTimeout(…, 0)`, which keeps the same ordering (a handler that aborts and returns still has its result recorded first) and works in every runtime.
  - **runtime:** with `handleSignals: true`, a `SIGTERM`/`SIGINT` under plain `node` could exit the process at once with code 0 — the runtime still `running` or `stopping` and `onShutdown` never finished — whenever nothing else kept the event loop alive (tsx masked this by keeping the loop alive). The signal handler now holds the loop open for the whole graceful shutdown, gives a signal delivered just before the loop drained one turn to be dispatched, and sets `process.exitCode = 1` when the shutdown fails (`stop()` rejects or a module's shutdown hook fails). A clean shutdown leaves the exit code alone, and the process still exits on its own rather than through `process.exit()`. A failed signal-triggered shutdown is now logged as the documented `RuntimeSignalError` ("Shutdown handler failed.") instead of "Shutdown failed.".
  - **rpc:** a non-exposed `RPCError` hid its message but sent its custom code: `new RPCError("secret", { code: "TASK_SECRET" })` went out as `{ code: "TASK_SECRET", … }`. It now goes out as `RPC_INTERNAL_ERROR`. A non-exposed error whose code is a standard wire code (a key of `RPC_HTTP_STATUS`, such as `RPC_UNAVAILABLE`) keeps that code with the generic message, and exposed errors keep their code and message as before.
  - **plugins:** `dependencies: [{ name: "metrics", optional: true }]` made `start()` throw `PluginDependencyError` when "metrics" was not registered, because only `optionalDependencies` was honoured. `optional: true` inside `dependencies` is now equivalent: skipped when missing, ordered before the dependent (and version-checked) when present.
  - **events:** documentation only. A namespace wildcard is multi-level — `"task.*"` matches `task`, `task.created` and `task.sub.created` — which the README and JSDoc now say, along with the fact that there is no single-level wildcard.

## 1.3.0

### Minor Changes

- **`@zudojs/feature-flags`**

  - **Behaviour change (security): the kill switch now fails closed.** A flag that is off — `enabled: false`, `state: "disabled"` (which was not honoured at all before), a draft, archived, expired, or blocked by a dependency — no longer serves `defaultValue`. It serves its new optional `offValue`; without one, `false` for a boolean flag, or `defaultValue` for a string, number or object flag. So `createMemoryProvider([{ key: "x", enabled: false, defaultValue: true }])` now gives `isEnabled("x") === false` and `evaluate("x").value === false` (reason still `"disabled"`). Previously every flag with `defaultValue: true` stayed on when killed. If you relied on a killed flag serving `true`, declare `offValue: true`.
  - **Behaviour change: `createEnvironmentProvider` normalises keys.** `FEATURE_NEW_CHECKOUT=true` is now the flag `new-checkout` (lower case, `_` → `-`), the same key other providers use, so it overrides that flag in a composite. `get()` normalises the key it is asked for too, so `get("NEW_CHECKOUT")` and `isEnabled("NEW_CHECKOUT")` still work; only keys returned by `getAll()` / `snapshot()` change. Pass `keyFormat: "preserve"` for the old spelling.

  **`@zudojs/observability`**

  - **Behaviour change (security): redaction is on by default.** Without a `redaction` option, log contexts and span attributes are now redacted, so `password`, `token`, `authorization` and the rest are no longer exported in the clear. The default rules include every name `@zudojs/logger` redacts by default (it now reuses the logger's `createDefaultSecretFieldMatcher`, and depends on `@zudojs/logger`), which also adds names such as `jwt`, `bearer`, `sid`, `pwd` and `passphrase` to `redaction: {}`, `redactObject()` and `isSensitiveField()`. Pass `redaction: false` to turn redaction off; passing `fields` still replaces the defaults.
  - `shutdown()` exports the final metric snapshot once instead of twice. `flush()` is unchanged.

  **`@zudojs/plugins`**

  - An async `PluginEvents.emit` that rejects no longer becomes an `unhandledRejection` (which terminates Node by default) after `start()` resolves. Rejections are contained and reported exactly like a synchronous throw, both for `context.events` and for the manager's `events` option. `PluginEvents.emit` may now return a promise.
  - `@zudojs/events`' `EventBus` is accepted by `new PluginManager({ events })` and `createPluginContext(meta, { events })`. It is adapted with the new `toPluginEvents()` (`emit(name, payload)` publishes `{ type: name, payload }`; `on`/`off` subscribe and unsubscribe, handing handlers the payload), so `context.events` is still a `PluginEvents`. Previously a cast bus crashed with `InvalidEventError`. New exports: `toPluginEvents`, `isPluginEventBus`, and the types `PluginEventBus` and `PluginEventSource`.

  **`@zudojs/events`**

  - `bus.use()` accepts registered middleware from `createEventMiddleware()` and builder helpers such as `validateEventMiddleware()`, as the constructor option already did, instead of throwing "Invalid event middleware.".
  - A handler's `timeoutMs` now aborts the `context.signal` that handler received, with the `EventTimeoutError` as the abort `reason`. The dispatch and other handlers are not aborted.
  - **Behaviour change:** in sequential dispatch, aborting the publish `signal` while the last or only handler runs now rejects with `EventDispatchAbortedError`, as it already did when another handler was still to run. It used to resolve with `handled: true, failed: 0`. Parallel dispatch is unchanged.
  - `EventBusStoppedError` and `EventBusDisposedError` now come from `@zudojs/errors` and are re-exported, so `instanceof` works whichever package you import them from. `EventBusDisposedError`'s code is now `ERR_EVENT_BUS_DISPOSED` (was `ERR_LIFECYCLE_DISPOSED`).
  - `EventPublishResult.errors` and `EventEmitResult.errors` are typed `readonly EventHandlerError[]` (was `readonly unknown[]`), which is what they always held.

  **`@zudojs/cqrs`**

  - **Behaviour change:** `unwrapCommandResult()` throws `CommandFailedError` for a result whose status is `"failure"`, and `unwrapQueryResult()` throws `QueryFailedError`, instead of returning the failure payload as if it were the value. The payload is on `error.failure` and `error.cause`. Both errors are re-exported from `@zudojs/cqrs`.

  **`@zudojs/errors`**

  - New `EventBusStoppedError`, `CommandFailedError` and `QueryFailedError`, and the codes `ErrorCode.COMMAND_FAILED` and `ErrorCode.QUERY_FAILED`.

  **`@zudojs/security`**

  - The CSRF checks (`verifyDoubleSubmit`, `validateCsrfToken`, `createCsrfProtection().verify`) return `false` for a non-string token, a request with no method, or a malformed header or cookie bag, instead of throwing a `TypeError`. They still throw `ConfigurationError` for misconfiguration (a secret shorter than 32 characters, or a bad `methods` list). The README and JSDoc show how to require `CSRF_SECRET` from the environment, with no hard-coded fallback.
  - **Behaviour change (security):** `serializeCookie` / `createSecureCookie` validate `Domain` as a hostname — labels of `[A-Za-z0-9-]` separated by dots, with an optional leading dot, at most 253 characters — and `Path` as free of control characters, DEL, `;` and `,`. Anything else throws `ValidationError`. Previously only a real CR, LF, NUL, `;` or `,` was refused, so `domain: "a\\r\\nX-Evil: 1"` (literal backslashes), spaces and colons were written into the header unchanged.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **PLUG-01:** When a hook exceeds `hookTimeout`, the manager now waits up to another `hookTimeout` for that hook to settle before disposing the plugin. It calls `stop()` if the timed-out `start()` went on to succeed. If `start()` finishes even later, `stop()` runs as soon as it does.
  - **CONV-02:** Teardown and event-listener failures no longer go to `console.error`. They go to `onError`, then to the new `PluginManagerOptions.logger`, then to the context logger. With none of these they become a `ZudoPluginWarning` process warning.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- Restart safety and semver ordering fixes (audit round 9).

  - `PluginManager.start()` now throws `PluginStateError` when a plugin in the startup order has already been disposed (after `stop()` or a rolled-back startup). It used to skip disposed plugins silently, so a second `start()` resolved with nothing running, and a still-registered dependent could be started on top of dependencies that had been disposed. Unregister and re-register the disposed plugins, or use a new manager.
  - `compareVersions` (and therefore `satisfiesVersion` / dependency version checks) compares prerelease identifiers per the semver specification: numeric identifiers compare numerically and rank below alphanumeric ones. `1.0.0-alpha.10` was sorted before `1.0.0-alpha.9`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
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

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/types@0.2.0

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
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/types@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
