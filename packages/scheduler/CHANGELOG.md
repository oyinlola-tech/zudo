# @zudojs/scheduler

## 1.3.0

### Minor Changes

- **@zudojs/scheduler**

  - `CronTrigger` (and `Scheduler.cron(..., { timezone })`) now accepts any
    IANA zone name — `"Africa/Lagos"`, `"America/New_York"`, `"Asia/Kolkata"` —
    in addition to `"UTC"` and the host's local zone. Zones are resolved
    through Node's `Intl` data, so daylight-saving transitions are honoured:
    `0 9 * * *` in `America/New_York` fires at 09:00 wall-clock on both sides
    of a DST change, and a half-hour zone still visits every minute of a
    restricted hour. Previously every zone other than `"UTC"` threw
    `InvalidScheduleError`; an unknown zone name still does, with a message
    that names it. `CronTrigger.timezone` exposes the canonical zone name
    (`undefined` for local time), `nextCronDate` accepts a `CronZone` in
    place of its `utc` boolean (which still works), and `resolveCronZone`,
    `createIntlZone`, `UTC_ZONE`, `LOCAL_ZONE` and the `CronZone` /
    `CronWallClock` types are exported.

  **@zudojs/queue**

  - A job can now fail permanently. Throw an error passed through
    `markUnrecoverable(error)` — or `createUnrecoverableJobError(message)`, a
    pre-marked `JobError` — or return `createJobErrorResult(message, ms,
{ unrecoverable: true })`, and the job is dead-lettered at once instead of
    burning its remaining attempts. `isUnrecoverableJobError` reads the mark.
    Ordinary failures retry exactly as before.
  - A dead-letter entry for a job whose attempts ran out now says what went
    wrong: the `JobMaxAttemptsError` message ends in `Last error: <message>`
    (the bare message is still on `reason`). An unrecoverable failure is
    recorded with the processor's own error. `job:failed` now carries the
    error instance the processor threw rather than a fresh `Error` built from
    its message.
  - Retry jitter can be made deterministic: `calculateRetryDelay` takes an
    optional `random` source, `QueueOptions.random` injects one into the
    in-memory queue's retry scheduling, and `applyJitter`, `resolveBackoff`,
    `DEFAULT_RETRY_BACKOFF` and `MAX_TIMER_DELAY` are exported.
  - The queue error classes it throws — `JobDuplicateError` from `add()`,
    `JobMaxAttemptsError` on a dead-lettered job, `QueueError`, `isQueueError`
    and the rest — are re-exported from `@zudojs/queue`, so a consumer no longer
    has to depend on `@zudojs/errors` to catch them.
  - Selecting the next job no longer parses every waiting job's timestamps on
    every poll. Measured on the in-memory queue with 10,000 waiting jobs and
    1,000 retained settled jobs: 3.2 ms per selection before, 0.14 ms after
    (9.9 ms → 0.18 ms when the waiting jobs are delayed). Ordering is
    unchanged.

  **@zudojs/events**

  - `EventPayloadMap` is now `object`, so `EventUnion`, `EventTypeOf`,
    `PayloadOf` and `defineEventTypes` accept an `interface` as the payload
    map. A `Record<string, unknown>` bound rejected interfaces with "Index
    signature for type 'string' is missing".
  - New `createTypedEventBus<TMap>(bus)` returns a view whose `on`, `once`,
    `onAny` and `publish` are checked against one payload map: the event type
    selects the handler's payload type and the payload `publish` accepts.
    `bus.on<Event<OrderPlaced>>("stock.low", h)` still compiles on the raw
    bus — nothing ties `P` to the type there — which is the gap the typed
    view closes.
  - Documentation: `EventEmitterOptions.errorMode` said "Defaults to THROW",
    which is true of a standalone emitter only. An `EventBus` defaults to
    `CONTINUE`, so a throwing handler does not reject `publish()`; both
    option docs and the README now say so.

  **@zudojs/cqrs**

  - `errorMiddleware` and `toCqrsError` recognise `BaseError` with
    `isBaseError` instead of `instanceof`. With two copies of `@zudojs/errors`
    installed, an error from the other copy was wrapped as a 500 `CqrsError`
    and lost its code and status; it now passes through with both intact.
  - `CommandOf`, `QueryOf`, `createCommand`, `createQuery`, `CqrsEvent`,
    `CreateCqrsEventInput` and `createCqrsEvent` accept any object type as the
    payload, an `interface` included (previously TS2344).
  - Decorators: `CommandHandlerFor`, `QueryHandlerFor` and the
    `create*HandlerDecorator` helpers keep the literal type argument. The
    metadata readers (`getCqrsType`, `getCqrsHandlerMetadata`,
    `getCommandHandlerMetadata`, `getQueryHandlerMetadata`, `isCqrsHandler`,
    `isDecorated*Handler`) now report only metadata a class was decorated with
    itself: a subclass of a decorated handler used to inherit the parent's
    mark, so discovery registered one type twice. New
    `registerDecoratedHandlers({ commandBus, queryBus } | registry, instances)`
    and `collectDecoratedHandlers(instances)` turn decorated instances into
    registrations — the buses themselves never read the mark, which is now
    documented on the decorators.
  - Documentation: `execute<TCommand, TResult>`'s result type is a
    caller-side claim the bus cannot check (handlers are resolved by `type`
    string at run time), and with no type arguments it is `void`; the
    `CommandBus` / `QueryBus` contracts and the README say so.

  `@zudojs/middleware` ([#63](https://github.com/oyinlola-tech/zudo/issues/63)): `withTiming` JSDoc explains how its result type
  is inferred (annotate `ctx` or pass both type arguments), pinned by a type
  test. The second half of [#63](https://github.com/oyinlola-tech/zudo/issues/63), an `HttpMiddleware`-shaped guard type in this
  package, is not added: `@zudojs/middleware` sits below `@zudojs/http` and
  cannot own HTTP context types, so import `HttpMiddleware` from `@zudojs/http`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/types@1.3.0
  - @zudojs/constants@1.2.0

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4

## 1.2.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3

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
  - @zudojs/types@1.2.0

## 1.1.2

### Patch Changes

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

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1
  - @zudojs/constants@1.1.1

## 1.1.1

### Patch Changes

- Round 10 fixes:

  - INF-01: a schedule added after `start()` (`every`, `after`, `at`, `cron`) now re-arms the timer immediately. It used to wait for an unrelated timer, up to about 24.8 days on an empty scheduler.
  - INF-05: `timezone: "UTC"` cron no longer skips minutes 0-29 of a restricted hour on hosts with a half-hour offset (Asia/Kolkata, Newfoundland and similar). Hour skips and second-clearing now use UTC arithmetic in UTC mode.
  - INF-06: a `cron` (or `interval`) trigger with no next fire time, such as `0 0 30 2 *`, is rejected at registration with `InvalidScheduleError`. It used to be treated as a misfire, run once immediately and then retire silently. One-shot (`at`/`after`) misfire behaviour is unchanged.

  Behaviour changes: `cron()` throws `InvalidScheduleError` for an expression that can never fire.

- Updated dependencies [`d2b01bf`, `d2b01bf`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- - A scheduler at its `maxConcurrency` ceiling no longer spins a zero-delay tick loop while a due schedule waits; the timer is re-armed when an execution finishes.
  - Resuming a paused one-shot schedule whose fire time has passed now applies the misfire policy (`run-once`/`catch-up` fire it, `skip` retires it) instead of leaving it active forever with nothing able to dispatch it.
  - `define()` rejects a non-finite `timeout` or one above `MAX_TIMER_DELAY`, and the executor clamps oversized budgets. Previously `timeout: Infinity` was accepted and the job failed after 1ms because Node clamps the timer.
  - A `ScheduleHandle` reports `"completed"` once its one-shot schedule has fired, instead of `"active"`.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close 34 audit findings across the scheduler, schema, security and serialization packages.

  Several of these are behavioural changes. Code that compiles unchanged may now
  reject input it previously accepted, or accept input it previously rejected.

  ## @zudojs/security

  **Attack detection is no longer order-dependent.** `XSS_PATTERNS` and the
  internal null-byte and control-character patterns carried the `g` flag while
  being used with `RegExp.test`, which advances `lastIndex` and resumes from there
  on the next call. `containsXss`, `isSafeString` and `detectThreats` returned
  `false` on every second call for the same payload. The flag is gone, and
  `withoutStickyFlags` is exported so callers can normalise their own patterns.

  **`generateCspNonce` no longer throws.** It called `require("node:crypto")` from
  an ESM module; the import is now top-level. It also rejects a nonce shorter than
  16 bytes.

  **Cookies are validated before serialization.** `serializeCookie` and
  `createSecureCookie` now percent-encode the value and reject an unsafe name,
  attribute, `Max-Age` or `Expires`. `SameSite=None` and `Partitioned` require
  `Secure`.

  **Forwarding headers are no longer trusted by default.** `extractClientIp` took
  the leftmost `X-Forwarded-For` entry, which any client controls. It now takes
  `{ trustProxy, remoteAddress }` and walks in from the right; with no trusted
  proxies it uses the socket address.

  **Rate limiting is a real sliding window.** Denied requests no longer accrue
  into their own bucket, the window slides rather than resetting on a fixed
  boundary, the key store has a bound with least-recently-seen eviction, and
  `defaultHandler` applies when no handler is configured.

  **Request targets reject CR and LF**, literal or percent-encoded. Traversal
  detection now decodes to a fixed point instead of pattern-matching encoded
  forms, so `.%2e` and `%2e.` are caught.

  **`isSafeUrl` allowlists protocols and range-checks addresses** — 127.0.0.0/8,
  169.254.0.0/16, 100.64.0.0/10, 0.0.0.0/8, IPv4-mapped IPv6, `fc00::/7`,
  `fe80::/10` and internal hostname suffixes are blocked, and public 172.32+ is no
  longer blocked by mistake. `isPrivateHostname` is exported for post-resolution
  checks. This still cannot stop DNS rebinding; the docblock says so.

  **CSRF** cookies carry `Secure`, tokens are HMAC-SHA256 at full width rather
  than a truncated secret-suffix hash, `sessionId` binds a token to a session,
  `expiration` is enforced as a maximum age, and `verifyDoubleSubmit` compares the
  cookie and request tokens in constant time.

  **CORS** refuses a wildcard origin combined with credentials, emits
  `Vary: Origin` whenever the origin is reflected, normalises a `/g` regex origin,
  and can validate the requested method and headers.

  **`sanitizeObject`** keeps nested arrays as arrays, survives cycles, and stops
  at `maxDepth`.

  Smaller fixes: `sanitizeHeaderValue` strips every null byte; `Content-Length` is
  validated as `1*DIGIT` with an optional maximum; `validateBodyFraming` rejects
  `Content-Length` + `Transfer-Encoding` and conflicting lengths; body limits route
  on the parsed media type, so a form post gets the JSON limit rather than the
  100 MB upload limit; `generateSecurityHeaders` ships a default CSP and HSTS,
  sends `X-XSS-Protection: 0`, and rejects a config value containing CRLF.

  ## @zudojs/scheduler

  **`CronTrigger` implements cron.** It previously returned `after + 60_000` and
  never read the expression, so every cron job ran once a minute. There is now a
  real five-field parser with ranges, steps, lists, names and macros; invalid
  expressions throw at construction, and an unsupported timezone is rejected
  rather than ignored.

  **Recurring schedules recur.** Nothing re-enqueued them, so `every()` and
  `cron()` fired exactly once. One-shot schedules are now retired instead of
  leaking, and `MAX_SCHEDULES` is enforced.

  **`ScheduleHandle` is bound to its scheduler.** `pause`, `resume` and `cancel`
  were no-ops on a detached object and `nextRun()` always returned `undefined`.

  **Job failures are reported and jobs are cancellable.** The empty catch block is
  replaced by an `onError` hook; `RetryPolicy` is implemented (fixed, linear and
  exponential backoff with `maxDelay` and jitter); executions run under a real
  `AbortController` that a timeout or `stop()` can fire; concurrency is bounded by
  `maxConcurrency`; and `OverlapPolicy` is applied. `stop()` is now async and takes
  `{ drain, timeoutMs }`.

  Smaller fixes: `parseDuration` supports `ms` and `w` and compound values, and
  rejects zero, negative and out-of-range durations that produced an Invalid Date
  whose `NaN` timestamp corrupted heap ordering; `PriorityQueue.enqueue` refuses a
  non-finite `nextRunAt`; a past fire time follows the misfire policy instead of
  throwing; timeouts raise `SchedulerJobTimeoutError` and carry the original error
  as `cause`; the scheduler and executor share one clock; and `define()` validates
  the job.

  `Scheduler` now takes an options object. The positional form still works.

  ## @zudojs/schema

  **Discriminated unions work.** The lookup was keyed on `schema._type` — the
  string `"object"` for every variant — so no input ever matched. Variants are now
  keyed on the literal value at the discriminator, with duplicate and missing
  literals rejected at construction.

  **Depth and cycle guards are wired up.** `isMaxDepthExceeded` was exported and
  never called, and `ctx.seen` was threaded through every context and never read.
  Composite schemas now enforce both. The internal failure signal is a dedicated
  class, so a bare `catch {}` no longer swallows a `RangeError` from stack
  exhaustion and reports circular input as a success.

  **`.default()` applies to a missing object key.** A defaulted property was
  classified as required, so it could never be omitted.

  **`.passthrough()` passes keys through** — it behaved identically to `.strip()`.
  `pick`, `omit`, `partial`, `required`, `extend` and `merge` now carry the
  unknown-key strategy and required-key set.

  Smaller fixes: an unrecognised format string throws instead of disabling the
  check; `.regex()` strips `g`/`y`; strings and arrays get default length bounds
  before any pattern runs; coercion accepts the documented `"1"`/`"0"` boolean
  strings and rejects empty, `Infinity`, hex and symbol input, and coerced values
  can now be constrained; union failures carry per-branch reasons; intersection
  refuses to spread primitives; tuple elements stay aligned when one fails; Map and
  Set entries get their own issue paths; object shape keys use a `hasOwnProperty`
  guard; `multipleOf` tolerates floating-point representation and rejects a zero
  step; records use the parsed key; and `schema.bigint()` and `schema.symbol()` are
  implemented rather than throwing "not yet implemented".

  ## @zudojs/serialization

  **Prototype pollution is fixed.** `restoreValue` and `transformValue` assigned
  `result[key]`, so a `__proto__` key replaced the reconstructed object's
  prototype. Both now use `defineProperty` and drop forbidden keys.
  `allowUnsafeKeys` — declared with zero references — is implemented, and reinstates
  them as real own properties.

  **An unknown `$type` tag is data, not a crash.** Any peer could stop a consumer
  with `{"$type":"anything"}`, and legitimate payloads carrying a `$type` field
  were unparseable. Strict mode still reports it. `deserialize` is now
  size-bounded; `maxSize` previously applied only on the way out.

  **Map and Set round-trip their children.** Deserialization dispatched to the
  transformer without restoring children first, so a Map of Dates came back full
  of raw `{$type, $value}` objects.

  **Error stacks are opt-in** via `includeStack`, and a wire-supplied stack is
  carried as `originalStack` rather than overwriting the real one.

  **Envelope metadata is enforced**: the schema version is checked, malformed
  envelopes raise a domain error, `contentType` is derived from the format,
  an unsupported encoding is rejected, and `createSerializer`'s `pretty` and
  `preserveTypes` options are applied instead of discarded.

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
