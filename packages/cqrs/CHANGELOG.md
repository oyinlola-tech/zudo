# @zudojs/cqrs

## 1.2.1

### Patch Changes

- Updated dependencies [[`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/events@1.3.1

## 1.2.0

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
  - @zudojs/events@1.3.0
  - @zudojs/middleware@1.1.0

## 1.1.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/events@1.2.0
  - @zudojs/middleware@1.0.3

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - CQRS-01: `timingMiddleware`'s `onTiming` observer is isolated. If it throws or rejects, a successful command or query stays successful and a failing one keeps its own error. Previously the observer's error replaced the outcome. New opt-in option `onTimingError(error, timing)` receives observer failures; a non-function value throws `InvalidMiddlewareError`.
  - CONV-01 / H4 (phase 2): `CqrsError` is now the `@zudojs/errors` class, re-exported (same defaults). Every CQRS subclass extends it, so `instanceof CqrsError` matches across both import paths.
  - MSG-02 (phase 2): `composeMiddleware` (and therefore the command and query bus pipelines) is built on `compose` from `@zudojs/middleware`. Behaviour is unchanged: `next(request, context)` still replaces the request and context, a second `next()` still rejects with `MiddlewareExecutionError`, and there is no depth ceiling. It moved to `cqrsMiddleware/cqrsMiddleware.compose.ts` and is still exported from the package root.

### Patch Changes

- Updated dependencies [`d2b01bf`, `5d6b957`, `5d6b957`]:
  - @zudojs/errors@1.1.0
  - @zudojs/events@1.1.0
  - @zudojs/middleware@1.0.2

## 1.0.1

### Patch Changes

- - `lockMiddleware` now awaits the lock's `release()` function. A release that returns a rejected promise (a failed Redis unlock, say) previously became an unhandled promise rejection — which terminates the process under Node's defaults. It now surfaces as a `CqrsError` ("CQRS lock release failed") carrying the lock key and the original error as `cause`; when the handler itself failed, the handler's error is kept and the release failure is not allowed to mask it. `CqrsLock.acquire()` is typed to accept an async release function.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/events@1.0.1

## 0.1.0

### Patch Changes

- Audit hardening (round 5):
  - Decorators are exported as `CommandHandlerFor` / `QueryHandlerFor` (with `isDecoratedCommandHandler` / `isDecoratedQueryHandler`) so they no longer collide with the abstract `CommandHandler` / `QueryHandler` classes; stacking decorators with identical metadata is a no-op and conflicting metadata throws `HandlerConfigurationError`.
  - Object handlers implementing the handler interface (any object with `execute()`) are accepted at registration and execution time; invalid handlers are rejected at registration.
  - `timingMiddleware` reports measurements through `onTiming` and `lastTiming`.
  - Buses throw the dedicated CQRS error classes (`CommandHandlerNotFoundError`, `QueryHandlerNotFoundError`, `DuplicateHandlerError`, `InvalidCommandError`, `InvalidQueryError`, `MiddlewareExecutionError`, ...); `isCqrsError` is true for every bus failure.
  - Bus pipelines are built on `composeMiddleware`: validation and handler resolution run at the end of the pipeline, and calling `next()` twice throws.
  - Execution contexts always belong to a correlation chain; child contexts inherit it.
  - `createCommand` / `createQuery` never let a payload override `type`; metadata is copied and frozen; registration keys must not contain surrounding whitespace; unknown registry kinds are rejected; `lockMiddleware` validates the release function.
  - `CreateCqrsEventInput` accepts plain string identifiers.
  - `CommandOf<"X">` / `QueryOf<"X">` (and `createCommand("X")` / `createQuery("X")`) default to an empty payload, so requests without data are satisfiable; a `type` key in the payload type is ignored in favour of the discriminator.
  - Removed the unused `@zudojs/messaging` dependency; source maps are excluded via `package.json#files` (the ineffective `.npmignore` was removed); tests are typechecked without `any` casts.

## 0.0.1

### Patch Changes

- Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
