# @zudojs/events

## 1.4.0

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
  - @zudojs/middleware@1.1.3
  - @zudojs/errors@1.4.0
  - @zudojs/constants@1.2.0

## 1.3.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4
  - @zudojs/middleware@1.1.2

## 1.3.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/middleware@1.1.1

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
  - @zudojs/constants@1.1.2
  - @zudojs/middleware@1.1.0

## 1.2.0

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

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - EVT-01: with `freezeEvents` (the default) handlers now receive a deeply frozen COPY of the event instead of the publisher's objects being frozen in place, and nothing is copied or frozen when no handler is subscribed. Map, Set and Date values (including `event.timestamp`) are copied into `FrozenEventMap` / `FrozenEventSet` / `FrozenEventDate`, which still pass `instanceof` but throw on mutation. New export: `createFrozenEventSnapshot` (plus the three frozen classes).
  - EVT-02: every handler (not only once-handlers) is checked for registration immediately before it runs, so a handler unsubscribed by an earlier handler in the same dispatch, or remaining after the bus was disposed inside a handler, no longer runs.
  - CONV-02: the default leak warning is emitted through `process.emitWarning` (type `ZudojsEventsWarning`, code `ZUDOJS_EVENTS_HANDLER_LIMIT`) instead of `console.warn`.

  Behaviour changes: publishers can mutate their payload objects after publishing; handlers see a copy (so `e.payload.obj !== originalObj`), and instances of user classes inside a payload are passed by reference and are no longer frozen; mutating a Map/Set/Date in a dispatched event now throws a TypeError; the leak warning no longer prints via `console.warn` (it appears as a Node process warning).
  - MSG-02 (phase 2): `executeEventMiddlewarePipeline` is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged (descending priority, abort checks before every stage and the terminal, `EventMiddlewareError` for a double `next()` and for a middleware's own errors, downstream errors passed through untouched, no depth ceiling). The pipeline file also drops below 150 lines.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/middleware@1.0.2

## 1.0.1

### Patch Changes

- - A middleware that awaits `next()` but does not return its result no longer makes `publish()` report `shortCircuited: true` with no handlers, no errors and no `onError` call; the real handler outcome is reported.
  - `stripUndefinedValues()` / `createEventPayload({ stripUndefined })` copy a `__proto__` key as data instead of swapping the result's prototype.
  - `bus.unregister(type, { removeHandlers: true })` also removes disabled handlers subscribed to exactly that type.
  - `bus.dispose()` succeeds (and the bus reaches `DISPOSED`) even when its registry was disposed first.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/constants@1.0.1

## Unreleased

### Fixes

- `EventBus.stop()` now moves the bus to a `STOPPED` state; publishing or subscribing on a stopped bus throws `EventBusStoppedError` instead of silently restarting it.
- The emitter stores its handlers in the bus registry, so handlers registered through `bus.getRegistry().registerHandler()` are dispatched and `bus.getHandlers()` / `registry.getHandlers()` agree.
- Registering a handler with an id that already exists throws `DuplicateEventHandlerError` (registry option `onDuplicateHandlerId: "replace"` opts into replacement); cancelling an old subscription can no longer remove a newer handler with the same id.
- Registry subscriptions are tracked: `clear()` / `dispose()` cancel them, and `unsubscribe()` after dispose is a no-op.
- The middleware pipeline only wraps errors thrown by a middleware itself; handler failures (`EventHandlerError`) and aborts (`EventDispatchAbortedError`) pass through unwrapped. A middleware that does not call `next()` yields a `shortCircuited` result instead of a `TypeError`.
- Once-handlers are removed before they run, so a throwing or concurrently dispatched once-handler never fires twice.
- Event types are normalised at every entry point (`createEvent`, `defineEvent`, handler patterns, registry lookups); a registered definition always produces publishable events.
- `freezeEvents` is implemented (deep, cycle-safe); `deepFreeze` and `isJsonEventPayload` no longer overflow on cyclic input.
- `handled` is only true when a handler succeeded; results carry `ok`, `succeeded` and `failed`.
- Abort is reported uniformly as `EventDispatchAbortedError` (with partial `results` / `errors`).
- `createEventHandler` validates priority, id, pattern and `timeoutMs`; `bus.use()` validates middleware eagerly; per-publication middleware ids are stable (`publish-mw-<n>`).
- `createEvent` rejects invalid types, ids and `NaN` dates with `InvalidEventError`; `emit` / `publish` reject non-events.
- Wildcards are only valid as a trailing `.*` in patterns, never inside event types.
- `EventSubscriptionGroup.unsubscribe()` attempts every subscription and aggregates failures.
- Disposed emitters/registries throw `EventEmitterDisposedError` / `EventRegistryDisposedError`; the bus throws `EventBusDisposedError`; unregistered types throw `EventTypeNotFoundError`.

### Additions

- `EventBusState.STOPPED`, `EventBusStoppedError`, `EventBusDisposedError`, `EventListenerLimitExceededError`.
- `maxListeners` / `maxHandlersPerPattern` leak warnings with an `onWarning` hook; `onError` hook on the bus and registry.
- Per-handler `timeoutMs` backed by `EventTimeoutError`.
- `bus.emit()` accepts `EventInput` as well as `Event`; `bus.unregister(type, { removeHandlers })`.
- `EventPublishResult.succeeded` / `failed` / `shortCircuited`; `EventEmitResult.succeeded` / `failed`; `EventHandlerExecutionResult.ok`.
- Previously unexported helpers are now public: `matchesEventType`, `normalizeEventTypePattern`, `getEventAction`, `getEventTypeSegments`, `isSameEventNamespace`, `isChildEventType`, `createEventTypePattern`, `defineEventTypes`, `defineEventType`, `eventMatchesType`, `filterEventsByType`, `tryNormalizeEventType`, `assertEventType`, `createObjectEventPayload`, `createJsonEventPayload`, `cloneEventPayload`, `deepFreeze`, `stripUndefinedValues`, `mergeEventPayloads`, `staticPayload`, `definePayloadFactory`, `describeEventPayload`, `isRegisteredEventMiddleware`, `isEventEmitResult`.
- `EventInput.id` / `correlationId` accept plain strings.

### Packaging

- Sourcemaps are no longer published; `sideEffects: false`; tests are type-checked (`tsconfig.test.json`).

## 0.1.0

- Initial release under the `@zudojs` scope.
