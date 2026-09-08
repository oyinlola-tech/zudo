# @zudojs/events

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
