---
"@zudojs/errors": minor
"@zudojs/events": minor
"@zudojs/messaging": minor
---

**@zudojs/errors**

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
