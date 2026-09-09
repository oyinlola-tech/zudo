# @zudojs/rpc

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

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/schema@0.2.0
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
  - @zudojs/schema@1.0.0
  - @zudojs/types@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/schema@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/schema@0.1.1
