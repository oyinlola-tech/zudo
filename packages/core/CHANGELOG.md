# @zudojs/core

## 1.3.0

### Minor Changes

- Round 12: fixes for the core, lifecycle and runtime findings reported by the academy lessons.

  **Security default changed — `@zudojs/core` `ConsoleLogger` now redacts by default.** `password`, `secret`, `token`, `apiKey`, `authorization` and the other keys `createLogRedactor()` recognises are replaced with `"[REDACTED]"` in context and error details unless you pass `redact: false` (new) or your own hook. Until now a `ConsoleLogger` (including the one `createApplication` builds) logged them in clear unless `redact: createLogRedactor()` was passed by hand. If you relied on seeing those values in local logs, opt out explicitly.

  **@zudojs/core**

  - Rollback and shutdown no longer call `onDestroy` on a module that never had `onInitialize` invoked. A dependent of a module whose `onInitialize` threw stayed `created`, yet the runtime's teardown destroyed it (and a failed `start()` destroyed modules it never reached). Touched modules are still destroyed in reverse dependency order.
  - After a startup timeout, `stop()` no longer waits behind the hook that is still running — it used to wait the whole `shutdown.timeoutMs` (30 s by default) when that hook never settled. The module lifecycle manager now detaches an operation whose signal was aborted; the stuck module stays in its active phase (which teardown skips), and if its hook settles later the module is stopped and destroyed then, best-effort. `startup.timeoutMs` still defaults to `0` (no deadline) and is now documented as such; set one in production.
  - An `Application` now follows a stop its runtime started on its own. After a `SIGTERM` handled through `signalTarget` the runtime reported `stopped` while `app.state` stayed `running` and the application's lifecycle participants were never stopped; a fatal error left it `running` behind a `failed` runtime. The `Runtime` contract gains an optional `onStateChange(listener)` (implemented by `DefaultRuntime`; new exported type `RuntimeStateListener`), the application subscribes to it, moves through `stopping` to `stopped` (or `failed`) and stops its participants. `Application.stop()` is now single-flight: a second call while stopping joins the first instead of throwing `InvalidStateError`.
  - `RuntimeSignalTarget` accepts `process` and `EventEmitter` without a cast. Its listeners were typed `(...args: never[]) => void`, which current `@types/node` rejects; they are `(...args: unknown[]) => void` now.
  - `MissingModuleDependencyError` distinguishes a dependency that is registered but not loaded (`Module "orders" depends on "payments", which is registered but not loaded (state: "registered"). …`) from one that is not registered (`… requires missing module …`). New optional constructor context `{ dependencyState }` and property `dependencyState`.
  - `ContextValues.require()` throws the new `ContextValueNotFoundError` (`CORE_CONTEXT_VALUE_NOT_FOUND`, `details.key`) instead of a bare `Error`; `createContextKey("")` throws `InvalidArgumentError`.
  - Runtime diagnostics: `environment` in bootstrap/shutdown log entries is now the runtime mode (development/test/production) — it was the JavaScript engine (`"node"`), which now appears as `engine` — and the "started" entries log the phase about to run instead of the pipeline's resting `"created"`.
  - `Logger.error(message, …)` / `fatal` accept the `@zudojs/logger` convention too: a plain object in the second position with no third argument is logged as context rather than as the error. Pass a third argument to log a plain object as the error.
  - New Core-prefixed aliases for names that collide with sibling packages: `CoreLifecycleState`, `CoreLifecycle`, `CoreLifecycleManager`, `createCoreRuntime`, `CoreContainer`, `CoreConfigurationManager`. Nothing is renamed; `LifecycleState`'s JSDoc now explains how it differs from `@zudojs/constants`' `LifecycleState` and `@zudojs/runtime`'s `RuntimeState`.

  **@zudojs/lifecycle**

  - A component `timeout` now bounds `start()`. Each hook invocation gets its own `context.signal`, derived from the run signal and aborted when the timeout elapses, so a hook that honours it unwinds at the timeout instead of at its own pace. A hook that ignores it is tracked per component: that component's `stop()`/`dispose()` waits for it — a `stop()` that overran its timeout is a drain and is waited for until the shutdown deadline, a startup hook that ignored its timeout only for one more `timeout` — so one hung `start()` no longer holds every other component's teardown until the global deadline (a never-settling `start()` used to hold `start()` for the full `shutdownTimeout`). `ExecutionResult` gains `timedOut`.
  - Shutdown deadline expiry is reported instead of passing silently: every component whose hook was still running is marked `FAILED` with a `LifecycleTimeoutError` result and a `component:failed` event, one `application:shutdown-timeout` event is emitted with the timeout as `error`, `LifecycleManager.shutdownTimedOut` reads `true`, and results that arrive after `shutdown()` resolved are no longer recorded or emitted. `shutdown()` still resolves.
  - `stop()` is no longer called on a component whose `start()` threw (a failed non-critical component, or the failing component during rollback); it runs only when `start` completed or timed out. `dispose()` still runs for every component whose `initialize` was invoked.
  - The ready and dispose phases have their own event names: `component:readying`/`application:readying` (were `component:starting`/`application:starting`) and `component:disposing`/`component:disposed`/`application:disposing` (were `component:stopping`/`component:stopped`). A listener that counted `component:stopped` per component now sees one event, not two.
  - New `component:retrying` event with `component.attempt` (1-based), `component.delay` and `component.error`, so backoff no longer has to be inferred from wall-clock timing. `LifecycleExecutor` takes `{ onRetry }` (new exported types `LifecycleExecutorOptions`, `LifecycleRetryNotice`).
  - Retry semantics are documented: `attempts` counts retries after the first call (`attempts: 3` = up to four calls), `backoff` defaults to `"exponential"`, `delay` to 500 ms, `maxDelay` to 10 000 ms.
  - `topologicalSort` on a cyclic graph names the actual loop (`config -> http -> database -> config`) instead of every node that was still blocked, and runs in O(V + E) — a 20 000-component chain took 7 s to order and now takes milliseconds. `DependencyGraph.validate()` and the new `findCycle()` search iteratively, so deep graphs cannot overflow the stack.
  - `DependencyGraph.addEdge` still creates its endpoints (existing callers rely on it); the new `getUndeclaredNodes()` lists nodes never passed to `addNode`, and `validate({ requireDeclared: true })` rejects them (new `DependencyGraphValidationOptions`). The registry keeps rejecting an unknown `dependsOn` at `start()` by name.
  - `dist/` no longer ends every file with a `sourceMappingURL` comment pointing at `.map` files that were never shipped (source maps are off for this package, `@zudojs/core` and `@zudojs/runtime`). The `lifecycleInternal` re-exports (`DependencyGraph`, the sorts, `withTimeout`, `withAbort`, `withConcurrency`) are documented as a supported part of the public API.

  **@zudojs/runtime**

  - Readiness never flips back to `true` during or after `stop()`. `runReadinessChecks()` with passing checks used to set `runtime.ready` to `true` while the state was `stopping`/`stopped`, so a `/ready` probe sent traffic to an instance that was going away; the same `runChecks()` overwrote `setState("shutting_down")` and a manual `markNotReady()`. `shutting_down` is now sticky (only `setState()` leaves it; `markReady()` is ignored in it) and `markNotReady()` holds until `markReady()`.
  - Optional readiness checks: `registerReadinessCheck(name, check, { critical: false })` (also on `ReadinessTracker.registerCheck` and `initialChecks`) is evaluated and reported — health shows it as `degraded` — but never gates `ready`. `ReadinessCheck` gains `critical` (new types `ReadinessCheckOptions`, `ReadinessInitialCheck`). A check that returns `false` now carries the message `"Check returned false."`, and `readiness.reason` names the failing critical checks (`"Readiness checks failing: search."`), including on a runtime that was never ready.
  - The timer that bounds a readiness check is no longer `unref`'d: in a short script, `await runtime.runReadinessChecks()` on a hanging check exited Node with "unsettled top-level await" (code 13) instead of recording the timeout. The shutdown timeout timer had the same defect for `await runtime.stop()` on a hanging `onShutdown` and is fixed the same way; both timers are cleared as soon as the race settles, so a healthy process is not held open.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/constants@1.2.0

## 1.2.4

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.2.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.2.2

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.2.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **CORE-01 (security):** `Container` rejects captive dependencies. When a singleton's construction resolves a `"scoped"` provider, directly or through a transient, the container throws a `DependencyResolutionError` ("Captive dependency: …"). Previously the singleton captured one request's instance and served it to every later request. Resolving a `"scoped"` provider with no active scope now throws, where it used to behave as transient. This matches `@zudojs/container`.
  - **CORE-02:** A bootstrap that hits `startup.timeoutMs` starts no further phase or module hook. `ModuleLifecyclePhaseOptions` gains `signal`. The runtime queues a teardown right away, so a module that comes up late is stopped and destroyed, and `stop()` waits for that teardown.
  - **CORE-03:** An `uncaughtException` or `unhandledRejection` now ends in `exit(1)` after the runtime stops. New `signals.exitOnFatalError` (default true) and `signals.fatalExitTimeout` (default 10000 ms, bounds a hanging shutdown).
  - **CORE-04 (security):** `ContextStorage.run(ctx)` no longer inherits the enclosing execution's `ContextValues` unless it re-enters the current context. `runDerived` still inherits them.
  - **CORE-05:** A failed `Lifecycle.start()` rolls back (stops) the participants that had started. `dispose()` only reaches participants whose `initialize()` ran.
  - **X-01:** `signals.forceExitOnSecondSignal` now defaults to `true`, matching `@zudojs/runtime` and `@zudojs/lifecycle`.
  - Behaviour changes: the captive and no-scope scoped resolutions now throw; the process exits 1 after a fatal error (opt out with `exitOnFatalError: false`); a second signal force-exits (opt out with `forceExitOnSecondSignal: false`); a failed start rolls back, so a retry restarts from the first participant; `dispose()` skips participants that were never initialized.
  - LEAF-16 (phase 2, behaviour change): when `RuntimeOptions.mode` is omitted, the runtime mode is derived from `NODE_ENV` (or `environment.variables.NODE_ENV`) through `resolveEnvironment()` from `@zudojs/constants` instead of always being `"development"`. `prod`/`Production` give `"production"`, `staging` runs as `"production"`, `test` gives `"test"`, unset stays `"development"`. An explicit `mode` still wins.
  - CV-05 (phase 2): the "provider does not implement setConfiguration()" notice is a `process.emitWarning` (type `ZudojsCoreWarning`, code `ZUDOJS_CONFIG_PROVIDER_NO_SET`) instead of `console.warn`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 fixes:

  - `createRuntime()` / `createApplication()` / `resolveRuntimeOptions()` now reject an unknown runtime `mode` or `role` with a `TypeError`. Previously `mode: "prod"` was accepted silently and the environment reported neither production, development, nor test.
  - A runtime's `startup.continueOnInitializeError` / `continueOnStartError` (and the shutdown equivalents) are now passed to the `ModuleLifecycleManager` for each phase. With a hand-assembled graph whose manager kept its strict defaults, the manager rolled every module back and the runtime still reported `READY` with zero modules running. `ModuleLifecycleManager.initialize()/start()/stop()/destroy()` accept an optional `{ continueOnError }` (`ModuleLifecyclePhaseOptions`) for the same purpose.
  - Dependencies declared on a module instance (`Module.dependencies`, e.g. `super({ dependencies: ["users"] })` in a `BaseModule` subclass) are now honoured: they order initialization/shutdown, are visible through `context.hasModule()` / `getModuleContext()`, pull in `autoLoad: false` modules, block `unloadModule()`, and fail loading with `MissingModuleDependencyError` when unregistered. They were previously ignored entirely.
  - `ModuleLifecycleManager` builds its dependency graph from loaded modules only. A registered but unloaded definition (`autoLoad: false`) with a missing or circular dependency no longer makes `initialize()`, `start()`, `stop()` or `destroy()` throw for the modules that are loaded.
  - `ApplicationContext.getConfiguration()` reflects `ConfigurationManager.reload()`: `createApplication` now passes a configuration accessor, and `ApplicationContextOptions.configuration` accepts `Configuration | () => Configuration`.
  - `ConfigurationManager.reload()` serialises overlapping calls by sharing the in-flight reload instead of failing the second call with `InvalidStateError`.
  - `Container` keeps "scoped" instances per provider registration, so `unregister()` / `clear()` followed by a new registration for the same token no longer resolves the stale instance in an existing scope.
  - `sanitizeLogValue()` keeps an own `__proto__` key (as produced by `JSON.parse` on untrusted input) as data instead of turning it into the result's prototype and dropping it from structured log output.
  - README: `runWithValues` takes `(context, values, fn)`; configuration events are named `configuration.*`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

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
  - @zudojs/messaging@1.0.0

## 0.1.3

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/messaging@0.1.2

## 0.1.2

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/messaging@0.1.1
