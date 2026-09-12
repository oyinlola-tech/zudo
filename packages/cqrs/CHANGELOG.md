# @zudojs/cqrs

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
