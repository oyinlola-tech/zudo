# @zudojs/messaging

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
