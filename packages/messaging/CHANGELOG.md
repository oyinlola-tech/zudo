# @zudojs/messaging

## 1.2.0

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
  - @zudojs/constants@1.1.2
  - @zudojs/middleware@1.1.0

## 1.1.0

### Minor Changes

- **@zudojs/errors**

  - New `EventListenerLimitExceededError` (`ErrorCode.EVENT_LISTENER_LIMIT_EXCEEDED`),
    carrying `pattern`, `count` and `limit`. It is reported as internal and is
    never exposed to a caller, because registering past a handler limit is a
    programming fault rather than bad input.

  **@zudojs/events**

  - `EventListenerLimitExceededError` can now actually be raised. Nothing in the
    package ever threw it before, so any `catch` branch testing for it was
    unreachable. Exceeding `maxHandlersPerPattern` still emits a one-shot
    warning by default; set the new `enforceHandlerLimit: true` on a registry
    (or emitter/bus options) to refuse the registration instead, which throws
    the error and leaves the registry exactly as it was. The class is now owned
    by `@zudojs/errors` and re-exported here, so existing imports keep working.
  - A bus or registry observer (`bus.subscribe`, `registry.subscribe`) that
    throws is no longer discarded in silence. With no `onError` hook
    configured, the failure is now reported once per bus or registry on Node's
    process warning channel as a `ZudojsEventsWarning` with code
    `ZUDOJS_EVENTS_OBSERVER_ERROR`, matching how the handler-leak warning is
    already reported. A configured `onError` hook still takes precedence and
    the warning is not emitted.

  **@zudojs/messaging**

  - A handler registered in object form — `{ handle(message, context) }`, which
    `MessageHandlerLike` has always advertised — now actually runs. Previously
    the dispatcher invoked the handler as a function, so every dispatch to an
    object handler came back as a failed dispatch with
    `handler.handler is not a function`. `NamedMessageHandler.handler` now
    accepts either form, and `this` is bound for class-based handlers.
  - `DispatchResult.handlerResults` is now a snapshot taken when the dispatch
    settles. A handler still running after a timeout can no longer push a
    `success: true` record into the result of a dispatch that already failed
    with `MessageTimeoutError`, so audit records and metrics derived from
    `handlerResults` are stable once you have awaited the dispatch.
  - The `Dispatcher` interface now declares `dispose()`, `getRegistry()` and
    `listMiddleware()`, all of which `DefaultDispatcher` already implemented.
    `createDispatcher().dispose()` compiles without a cast.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/constants@1.1.1
  - @zudojs/middleware@1.0.3

## 1.0.2

### Patch Changes

- Round 10 fixes:

  - MSG-01: object-form middleware (`bus.use({ handle })`) and handlers resolved through `resolveMessageHandler` are now bound to their object, so class-based middleware and handlers that use `this` work.
  - MSG-02: calling `next()` twice in message middleware now throws `MiddlewareNextCalledMultipleTimesError` from `@zudojs/errors` (a `MiddlewareError`) instead of a plain `Error`. The message text changes to `Middleware "message-middleware#<index>" called next() multiple times.`
  - MSG-02 (phase 2): the middleware pipeline is built on `compose` from `@zudojs/middleware` instead of a local copy. A double `next()` still throws `MiddlewareNextCalledMultipleTimesError`; its `middlewareName` is now `"middleware[<index>]"` (was `"message-middleware#<index>"`). Pipelines keep no depth ceiling.

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/middleware@1.0.2

## 1.0.1

### Patch Changes

- - Handlers now receive the dispatch context: `DispatchOptions.context` (headers, correlation/causation overrides, `state`) and anything a middleware stored in `context.state` reach the handler instead of a fresh empty context.
  - A caller-provided `AbortSignal` no longer accumulates one `abort` listener per dispatch; the listener is removed when the dispatch settles.
  - Re-registering a handler id (`allowDuplicateHandlerIds`) re-indexes its message types, so the replacement no longer receives the old handler's types and a single-handler registry can replace a handler for the same type.
  - A dispatch cancelled through its `AbortSignal` between handlers fails with `MessageDispatchAbortedError` rather than a `MessageHandlerError` blamed on the handler that never ran.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add branded-id helpers and guard use of a disposed message bus.

  **New helpers `toMessageId`, `toCorrelationId` and `toCausationId`** convert a
  `string` into the corresponding branded id type. The branded types previously
  had no public constructor, so callers had to reach for a cast to produce one.

  **Using a disposed bus now throws `MessageBusDisposedError`** (from
  `@zudojs/errors`) instead of proceeding against torn-down state. Code that
  published or dispatched after `dispose()` previously got undefined behaviour and
  will now get a clear error.

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
