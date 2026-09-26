# @zudojs/lifecycle

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

## 1.2.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

## 1.2.1

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/constants@1.1.2

## 1.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1

## 1.1.1

### Patch Changes

- Round 10 fixes.

  - **LC-01:** A component `timeout` of NaN or a negative value throws a `RangeError` at `register()`. `Infinity` means unbounded, and finite values above 2^31-1 ms are clamped. Previously these values armed a 1 ms timer, and its callback crashed the process with an uncaught `RangeError`. `withTimeout` validates the same way.
  - **LC-02:** A hook that times out is not retried while it is still running. Shutdown waits, within its deadline, for the abandoned hook to settle before calling `stop()`. `LifecycleExecutor.settleAbandoned()` was added.
  - **LC-03:** `shutdownTimeout: Infinity` means no deadline, where it used to abort after 1 ms. NaN and negative values throw a `RangeError` from the constructor, and large finite values are clamped.
  - **LC-04:** Signal handlers are installed by `start()`, not the constructor, and removed when shutdown finishes. A second signal during shutdown exits with code 1. `installSignalHandlers` gains `forceExitOnSecondSignal` (default true) and `exit`.
  - Behaviour changes: a timed-out hook is never retried; constructing a manager no longer touches process signals; invalid timeouts throw at registration or construction.

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0

## 1.1.0

### Minor Changes

- Startup and rollback bookkeeping fixes (audit round 9). These are behavioural changes.

  - A component that fails a startup phase no longer has its later hooks invoked: a non-critical component whose `initialize()` threw used to have `start()` and `ready()` called anyway.
  - Dependents of a failed component are no longer started. They are marked `FAILED` with a `LifecycleComponentError` naming the failed dependency, emit `component:failed`, and their own `critical` flag decides whether startup aborts (a critical dependent of a failed non-critical dependency now rejects `start()`).
  - When a critical component fails, the results of its siblings in the same stage are still recorded and their state transitions and `component:*` events still fire; they used to be dropped, leaving successful siblings reported as `INITIALIZING`/`STARTING` forever after rollback.
  - Rollback and `shutdown()` only undo phases that actually ran: `stop()` is invoked only on components whose `start` phase ran, `dispose()` only on components whose `initialize` phase ran. Calling `stop()` on a never-started server used to throw and be recorded as a phantom component failure. `shutdown()` on a manager that was never started now runs no hooks.
  - `shutdown()` requested while `start()` is in flight now waits for the executing stage to settle, then stops launching further stages; `start()` rejects with a `LifecycleStartError` (componentId `"application"`). Previously later stages kept starting components after teardown had completed and those components were never stopped.
  - `withAbort()` removes its abort listener when the operation throws synchronously.

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

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
