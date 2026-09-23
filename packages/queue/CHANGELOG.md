# @zudojs/queue

## 1.4.0

### Minor Changes

- **@zudojs/queue**

  - Polling honours `pollInterval` on every poll, not only the first. Unset, polls start at 50 ms and back off to 2000 ms while idle, as before. Work no longer waits for the next poll: `add()`, a delayed job coming due, an elapsed retry backoff, `resume()`, `process()`, `releaseJob()`, a reclaimed stalled job and a finished job all wake the poller at once. 40 instant jobs at concurrency 1 used to take about 2 s and now finish in tens of milliseconds, and a job added after an idle spell starts immediately instead of after up to 2 s.
  - New optional `Queue.onJobReady(listener)`, implemented by the in-memory queue. A `Worker` subscribes on `start()` and unsubscribes on `stop()`, so an idle worker claims a newly added job at once. `WorkerOptions.pollInterval` now bounds only how often an idle worker re-checks.
  - **Behaviour change: process lifetime.** Pending work keeps the Node.js process alive. While a queue has waiting, delayed, retrying or running jobs that one of its processors can run, its poll timer is referenced, so a script whose only work is a queue no longer exits before the jobs run. A started `Worker` keeps the process alive until `stop()` or `forceStop()`. An idle queue, a paused one, work that no processor handles, and a closed queue never hold the process open. Pass `keepAlive: false` (new on `QueueOptions` and `WorkerOptions`) to get back the old unreferenced timers.
  - **Behaviour change: payloads.** The default `JsonSerializer` now preserves types, so a `Date` in a payload reaches the processor as a `Date`, matching `Queue<{ d: Date }>`. `BigInt`, `Map`, `Set`, `Uint8Array` and `Error` round-trip too; `BigInt` used to be rejected and `Map`/`Set` flattened to `{}`. Output for plain JSON data is unchanged. `createJsonSerializer()` now defaults to `preserveTypes: true` as well; pass `preserveTypes: false` for plain JSON, where a `Date` becomes its ISO string.
  - `PassthroughSerializer` really passes payloads through. It carries the new `Serializer.passthrough` marker, and the in-memory queue stores such payloads by reference (class instances included), as with `serializePayloads: false`. Used standalone it still returns strings unchanged and JSON-encodes anything else, because the `Serializer` contract requires a string.
  - **Behaviour change: ordering.** Within a priority, a job is ordered by when it became runnable: when it was added, or when a delayed job's delay elapsed. A delayed job no longer jumps ahead of jobs that were already waiting when it came due. Priority still wins first, as documented. A retried job keeps its original place in line.
  - New 1-based `JobContext.attemptNumber` (`job.attempt + 1`), matching `ctx.attempt` in `@zudojs/scheduler`. `job.attempt` keeps its meaning (the number of attempts already made, `0` on the first run) because `shouldRetry`, `calculateRetryDelay`, `job:retrying` and `DeadLetterJob.attempts` are all built on it. Both are now documented.
  - `queue.events` works without configuration: a queue created without an `eventEmitter` gets an in-memory emitter (it used to get a silent no-op).

  **@zudojs/scheduler**

  - **Behaviour change: process lifetime.** A started scheduler keeps the Node.js process alive until `stop()`. Its timer used to be unreferenced, so a script that only ran a scheduler exited 0 with nothing run. The new `SchedulerOptions.keepAlive: false` restores the old behaviour.
  - `stop()` is idempotent. On a scheduler that never started, or one already stopped, it resolves (after waiting for any execution still settling) instead of rejecting with `SchedulerStoppedError`.
  - `Clock` is exported from the package root (`import type { Clock } from "@zudojs/scheduler"`); it used to fail with TS2305.
  - `CronParseError` messages are no longer garbled. The parser passed the reason and the expression in swapped order, producing `Invalid cron expression "Cron field "minute" value 99 is outside 0-59": 99 0 * * *.`; it now reads `Invalid cron expression "99 0 * * *": Cron field "minute" value 99 is outside 0-59.` The `expression` and `reason` metadata fields are swapped back into place too.
  - `getExecutions()` records the real attempt: `3` for a run that succeeded on its third attempt (it always said `1`). While a run is in flight the record shows the attempt in progress. `JobExecutor.execute` takes an optional seventh `hooks` argument (`{ onAttempt }`) that reports each attempt as it starts.
  - New `JobContext.attemptNumber`, an alias of the 1-based `ctx.attempt` under the name `@zudojs/queue` uses.

  **@zudojs/messaging**

  - **Behaviour change: cancellation.** An abort during the last or only handler now fails the dispatch with `MessageDispatchAbortedError` (`success: false`), even if that handler returns normally. It used to be reported as `success: true`. As with a timeout, the dispatch settles promptly and does not wait for a handler that ignores its signal. `handlerResults` still lists every handler that finished. This applies to both the bus and a dispatcher used directly.
  - `send(input, { context: { correlationId, causationId } })` puts those identifiers on the message it builds, unless the input carries its own. `createDerivedMessage` in a handler therefore continues the chain instead of starting a new one.

  **@zudojs/cache**

  - `getStats().errors` counts rejected input: an invalid key, namespace, pattern or tag now counts and emits `cache.error`, as an invalid TTL already did. `failSilently` still never hides invalid input.
  - **Behaviour change: error codes.** An invalid tag (`tags: [""]`, or one over-long or containing NUL) throws `ERR_INVALID_INPUT` (`ErrorCode.INVALID_INPUT`), the same code as an invalid key. It used to be `CACHE_OPERATION_FAILED`, which reads as an adapter fault.
  - Docs: the README said invalid keys throw `CACHE_INVALID_KEY`, but no such code has ever been thrown; the code is and remains `ERR_INVALID_INPUT`, so existing `code` checks keep working. The README now says so.
  - `ttl()` returns whole milliseconds, rounded down, on both the service and the memory adapter. It used to return values like `9999.52…` straight after `set({ ttl: 10_000 })`.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/serialization@1.2.0
  - @zudojs/constants@1.1.2

## 1.3.0

### Minor Changes

- **@zudojs/queue**

  - **Security.** `zudo:context` is now owned by the queue on every enqueue path.
    Job metadata handed to `queue.add()` can no longer carry a context record of
    its own: whatever the caller put under that key is dropped before the job is
    stored, whether or not a context carrier captured anything. Previously, an
    `add()` made with no ambient context kept the caller's record verbatim and
    the queue replayed it around the middleware and the processor, so an
    enqueuer could choose the tenant, correlation id or trace the job ran under.
    Legitimately captured context is unaffected.
  - `runJob` no longer leaks an `abort` listener per job on a consumer's signal.
    A worker passes one long-lived signal to every job it dispatches, so a
    long-running worker accumulated one listener — and one retained per-job
    `AbortController` — for every job it had ever processed.
  - The default in-memory dead letter store is bounded. It retains the most
    recent 1000 dead-lettered jobs and evicts the oldest beyond that;
    `createInMemoryDeadLetterStore({ maxEntries })` sets a different cap, and
    `Number.POSITIVE_INFINITY` restores the previous unbounded behaviour. A
    store the queue created for itself is also cleared by `close()`; one you
    passed in as `deadLetterStore` is left alone, as before.
  - A throwing queue event listener now reaches the configured logger. The
    emitter accepts a `logger` of its own
    (`createInMemoryQueueEventEmitter({ logger })`), and a queue created with
    `logger` hands it to the emitter it was given, so the failure goes to
    `logger.error` instead of always falling back to `process.emitWarning`.
  - The four events that `QueueEventMap` declared but nothing emitted now fire.
    `worker:started`, `worker:stopped` and `worker:error` are published by
    `createWorker` on the queue's emitter, reachable through the new optional
    `Queue.events`. `job:cancelled` is emitted when a running job is aborted
    from outside — a draining worker, `close()`, a consumer's signal — and not
    for a job that merely timed out.

  **@zudojs/scheduler**

  - `handle.cancel()` aborts a running one-shot (`after()` / `at()`), as the
    README says and as a recurring schedule already did. In-flight executions
    are now tracked by schedule id, so a cancel arriving after the schedule was
    retired at dispatch time still reaches the run.
  - Cron day-of-week ranges that span Sunday are parsed correctly. `0-7`, `1-7`
    and `mon-sun` all mean every day; previously `0-7` was accepted and quietly
    fired once a week, and `1-7` and `mon-sun` were rejected as inverted ranges.
    `fri-sun` and `sat-sun` work for the same reason. A bare `7` is still
    Sunday, and a genuinely inverted range such as `5-2` is still an error.
  - A schedule whose job has been unregistered is retired and reported through
    `onError` with a `SchedulerJobNotFoundError`, instead of re-arming its timer
    forever while dispatching nothing and still reporting itself as active.
  - `handle.resume()` on a schedule that is already active is a no-op. It used
    to recompute the next fire time from now, so a supervisor calling it
    idempotently could postpone an hourly job indefinitely. Resuming a paused
    schedule is unchanged.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/serialization@1.1.1
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes:

  - INF-09: after a job times out, its concurrency slot and its retry wait up to `QueueOptions.timeoutGraceMs` (new, default 5000 ms) for the processor to actually settle. A processor that ignored `context.signal` used to keep running beside its own retries. Past the grace period, the processor is abandoned and the job fails anyway.
  - INF-10: new `QueueOptions.autoProcess` (default `true`) and optional `Queue.setAutoProcess()`. `createWorker` turns the queue's own poller off as a consumer, so a worker is the only thing running jobs, its middleware, timeout and concurrency apply to every job, and `worker.stop()` really stops consumption. Scheduled-job promotion and stalled-job reclaim keep running.
  - INF-11: a pending retry timer stays registered until it fires, so `close()` now clears it. It used to be deregistered as soon as it was registered.
  - INF-18: a worker's failing poll and a throwing event listener are reported through `logger.error` (new optional member of `QueueLogger`; new `WorkerOptions.logger`), or through `process.emitWarning` (type `ZudoQueueWarning`) when no logger is configured. They no longer go to `console.error`.
  - cross/X-06: new `QueueOptions.contextCarriers` with the `QueueContextCarrier` contract, `captureContext`, `runWithContext` and `CONTEXT_METADATA_KEY`. Ambient context (a tenant id, a correlation id) is captured into job metadata at `add()` and restored around the middleware and the processor, for both the queue's poller and a `Worker`.

  Behaviour changes: once a `Worker` is created for a queue, the queue no longer consumes jobs itself. A timed-out attempt holds its slot until the processor settles or `timeoutGraceMs` elapses. Default error reporting uses `process.emitWarning` instead of `console.error`.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/serialization@1.1.0

## 1.1.0

### Minor Changes

- - `createWorker()` now honours `WorkerOptions.concurrency`: jobs are dispatched in parallel up to the limit. Previously the worker awaited each job before polling again, so it ran one job at a time whatever `concurrency` said.
  - `Worker.stop()` is now graceful as documented: in-flight jobs get `drainTimeout` to finish and are only aborted when it elapses. Previously `stop()` aborted every running job immediately, making it indistinguishable from `forceStop()` for processors that honour their signal.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/serialization@1.0.1
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
  - @zudojs/serialization@0.2.0

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
  - @zudojs/serialization@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/serialization@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/serialization@0.1.1
