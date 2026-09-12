# @zudojs/api

## 1.0.1

### Patch Changes

- - `APIExecutor` runs a hand-rolled operation whose handler returns synchronously instead of failing with "promise.then is not a function" reported as an internal error of the operation.
  - README: `BaseError.toJSON()` serializes `cause` (message and stack), so `result.error` must not be passed to `res.json()` as-is; the section now says which fields a transport may expose.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/schema@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Enforce output validation, stop leaking untrusted input back to clients, and harden operation and context construction.

  This closes 22 audit findings. Most are behavioural; read the breaking list
  before upgrading.

  **Client-facing validation issues are now redacted by default.** Schema issue
  messages were copied verbatim into `APIValidationError`, which is `expose: true`,
  with no cap — so submitted input came straight back in a 422 body (an SSN was
  reproduced this way during the audit), and one issue per array element gave an
  attacker unbounded response amplification. Issues are now rendered as
  `"<path>: invalid"` and capped at 20 with an "N more omitted" marker. Opt back
  in with `new APIExecutor({ exposeValidationMessages: true })`.

  **`operation.output` is now actually enforced.** It was accepted, documented,
  used in the package's own example, stored — and read nowhere, so no output
  validation existed. A handler return value that does not conform now fails with
  `APIInternalError` (500, `expose: false`), and the schema's validated value
  replaces the raw one in `result.data`.

  **`timeout: 0`, negative and `NaN` are now startup errors.** They were accepted
  by `defineOperation` and silently disabled the deadline entirely — a 300 ms
  handler with `timeout: 0` completed with `ok: true` and no `APITimeoutError`.
  `timeout` must be a positive finite integer up to 3_600_000 ms. There is no
  longer any way to disable the deadline.

  **`createAPIContext` validates `requestId`.** It throws `TypeError` unless the
  value is a non-empty string of at most 128 characters matching
  `[A-Za-z0-9._:-]`. **Transports passing a client-supplied header through must
  now route it via the new `normalizeRequestId()`** — this is the one change most
  likely to need a code edit at your integration points.

  **Internal error messages no longer reach the client.** `normalizeAPIError`
  copied the original error's message onto the wrapper, and the published
  `BaseError.toJSON()` emits `message`/`stack`/`cause` regardless of `expose`.
  `result.error.message` for an internal failure is now generic; read
  `error.cause` server-side.

  **Registry errors changed class.** Duplicate registration throws
  `APIDuplicateOperationError` (409) and a `require()` miss throws
  `APIOperationNotFoundError` (404); both previously threw a bare `Error`, so an
  unknown operation degraded from a 404 to a generic 500. Frozen-registry mutation
  throws an `APIError` (500, `expose: false`). Code matching on the old plain-Error
  message strings will break.

  **Immutability is now real rather than asserted.** `context.metadata` returned
  the live backing `Map` behind a `ReadonlyMap` type; it is now a read-only façade
  (`instanceof Map` is false, and there is no `set`/`delete`/`clear`). Registered
  operations' `metadata` and `metadata.tags` are deeply frozen — the shallow freeze
  left `tags`, which `findByTag` and the executor's timeout lookup consume, mutable
  process-wide. Executor results are frozen throughout via `apiSuccess`/`apiFailure`.

  **Other breaking changes:** `APIContextKey` carries a required `id: symbol`, so
  hand-rolled `{ name, type }` literals no longer satisfy the type — use
  `createContextKey`, which is **now exported** (it was the only way to build a
  context key and was missing from the barrel entirely). `context.set` on the
  request-id key throws. `defineOperation` no longer copies unknown extra
  properties from its options. `MAX_POLICIES` is removed.

  **Interceptors work as documented.** Assigning `ctx.input` was silently
  discarded because `executeHandler` closed over a local; `input` is now writable
  and observed. `APIExecutionContext.result` now always equals what the level
  below returned, including on interceptor short-circuit — it previously held the
  raw pre-transformation value and was `undefined` whenever a downstream
  interceptor short-circuited, which broke exactly the logging and audit
  interceptors people write first.

  **New exports:** `createContextKey`, `isValidRequestId`, `normalizeRequestId`,
  `resolveOperationTimeout`, `ErrorCode`, `MAX_OPERATION_TIMEOUT`,
  `MAX_VALIDATION_ISSUES`, `MAX_VALIDATION_ISSUE_LENGTH`,
  `MAX_OPERATION_NAME_LENGTH`, `MAX_REQUEST_ID_LENGTH`, and the
  `APIExecutorOptions` and `AnyAPIOperation` types. `APIExecutor` now also accepts
  an options object. `APIOperationRegistry.register` accepts `AnyAPIOperation`, so
  typed operations can be registered — they previously failed to typecheck.

  The README usage block, which was broken on every line (`OperationDefinition`
  does not exist, the handler signature was wrong, `registry.dispatch` is not a
  method), has been rewritten and is now executed by `tests/readme.test.ts` so it
  cannot rot again.

  **Removed claim:** the package advertised a policy system in its description,
  module doc, README and a `MAX_POLICIES` constant, with no implementation
  anywhere. The claim is removed rather than stubbed. If `@zudojs/api` should own
  authorization, it needs designing; until then authorization is an interceptor
  concern.

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
