# @zudojs/api

## 1.2.2

### Patch Changes

- - **@zudojs/api:** a handler's context is now typed `APIHandlerContext` (`APIContext & { readonly signal: AbortSignal }`, newly exported), matching the runtime guarantee that every handler receives a signal. `ctx.signal` no longer needs a `!` under strict TypeScript. Contexts built by callers (`createAPIContext`, `executor.execute(op, input, context)`) may still omit the signal, and handlers annotated with the plain `APIContext` are still accepted.
  - **@zudojs/messaging:** `MessageDispatchAbortedError.cause` is now the abort signal's `reason` (for an abort during or between handlers, and for a signal that was already aborted). It used to be `undefined`.
  - **@zudojs/errors:** `MessageDispatchAbortedError` accepts a `cause` option, like `InvalidMessageError`.
  - **@zudojs/queue:** new `job:dead-lettered` event (`{ job, error, reason? }`), emitted once when a job is moved to the dead-letter store (attempts exhausted, or stalled `maxStalledCount` times), so dead-letter alerting no longer needs attempt arithmetic or polling `getStats().deadLettered`. The README now documents that `job:failed` fires on every failed attempt with `job.state` `"failed"` on retryable and final attempts alike; that behaviour is unchanged.
- Updated dependencies []:
  - @zudojs/queue@1.5.0
  - @zudojs/errors@1.3.1
  - @zudojs/openapi@1.5.1
  - @zudojs/rpc@1.4.2
  - @zudojs/schema@1.2.2
  - @zudojs/security@1.3.2
  - @zudojs/serialization@1.2.2

## 1.2.1

### Patch Changes

- Updated dependencies [`e546629`, `e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099), `e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/queue@1.4.1
  - @zudojs/serialization@1.2.1
  - @zudojs/security@1.3.1
  - @zudojs/rpc@1.4.1
  - @zudojs/schema@1.2.1
  - @zudojs/openapi@1.5.0

## 1.2.0

### Minor Changes

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Ship working transports and bindings.

  `@zudojs/rpc` now includes transports. `createRPCMemoryTransport(server)` connects a client to a server in the same process, round-tripping frames through JSON by default. `createRPCHttpTransport({ url })` calls a remote server with the global `fetch`; timeouts and cancellation abort the request. `createRPCFetchHandler(server)` is a web-standard `(request: Request) => Promise<Response>` handler that any HTTP server can mount. It bounds request bodies, decodes them with `@zudojs/serialization`, answers every failure with an RPC error frame, and never sends stack traces or internal messages. The client now rebuilds typed errors from the wire (`RPCValidationError`, `RPCProcedureNotFoundError`, `RPCAuthenticationError`, `RPCForbiddenError`, …) and keeps the wire `code` and `details` on them. `mapRPCError` exposes the server's error-to-wire mapping.

  `@zudojs/api` now serves one operation over four transports, all running through the same executor, interceptors and schema validation, with one client-safe error shape (`APIWireError`):

  - HTTP: `createApiFetchHandler(operations)`, a web-standard fetch handler. Routes come from `metadata.http` (`{ method, path: "/users/:id" }`) and default to `POST /<name>`.
  - RPC: `registerApiRpcProcedures(server, operations)`.
  - Queues: `bindApiQueue(queue, operations)`.
  - CLI: `runApiCli(operations, argv)`. It parses `--field value` and `--json`, prints the result, and returns a sysexits-style exit code.

  `describeApiRoutes` returns the structural `APIOperationRoute` contract. `toOpenAPIRouteDescriptors(operations, { basePath })` converts the operations into `@zudojs/openapi` route descriptors, so `createOpenAPIDocumentFromRoutes` documents them in one call, including the success and error envelopes. Both fetch handlers mount on `@zudojs/http` with `mountFetchHandler(router, "/api", handler)`. `TransportContextKey` tells interceptors which binding a call came through.

  Hardening from the release security review. The RPC server refuses (`RPC_INVALID_REQUEST`) a frame whose `payload` or `metadata` holds a `__proto__`, `constructor` or `prototype` key at any depth (opt out with `limits: { allowUnsafeKeys: true }`; `findUnsafeKey(value)` is exported), and every API binding refuses such keys in its input: 400 over HTTP, a validation error over RPC, queues and the CLI. `RPCContextOptions.signal` carries the caller's signal into dispatch, so a client that disconnects from `createRPCFetchHandler`, or a memory-transport caller that aborts, cancels the procedure (`context.signal` aborts, `RPC_CANCELLED`) instead of letting it run to its timeout. `createRPCHttpTransport` clamps its deadline to the timer range: a timeout past about 24.8 days, or `Infinity`, used to fail every call at once. The API RPC binding no longer sends the message of an `expose: false` error whose code has an RPC equivalent (such as `createAPIError(msg, { code: ErrorCode.API_UNAVAILABLE })`); it travels with the generic internal message, as over HTTP. `createApiFetchHandler` answers 415 to a body route called with a non-JSON content type even when the body is empty, so a cross-site HTML form cannot trigger an input-less operation.

  RPC client fixes found by running the package in plain scripts. The client deadline and the `retry()` backoff timers are no longer unref'd, so a script awaiting a call stays alive until it times out. Before, Node exited with code 13 ("unsettled top-level await") first. Both timers are still cleared the moment the call settles. `error.code` on every error an `RPCClient` rejects with is now the wire code. `RPC_TIMEOUT`, `RPC_CANCELLED` and `RPC_UNAVAILABLE` used to come back with the class codes (`ERR_RPC_TIMEOUT` …), and so did the client's own deadline and cancellation errors. `instanceof` is unchanged. `RPCError` (in `@zudojs/errors`) declares a readonly `details` and accepts it as an option. A `@zudojs/errors` error thrown with `expose: true` (`NotFoundError`, `ConflictError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `RateLimitError` …) now reaches the caller under the matching code (new `RPC_NOT_FOUND` 404 and `RPC_CONFLICT` 409, plus `RPC_VALIDATION_ERROR`, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`, `RPC_RATE_LIMITED` …) with its own message, instead of as `RPC_INTERNAL_ERROR`. Non-exposed errors stay internal.

  Fixes reported by the lesson writers in `@zudojs/api`:

  - **Security, behaviour change:** `APIExecutor` now runs the interceptors before input validation. Validation is the innermost step, immediately before the handler, on the input the interceptors finally pass. Before, input was validated first. An anonymous call with invalid input therefore got a 422 `ERR_API_VALIDATION` that described the schema, instead of the 401 its authentication interceptor would have returned. Logging, metrics and rate-limit interceptors never saw invalid calls. An interceptor that replaced `context.input` bypassed the schema entirely (the handler received `{ title: "" }` despite `min(3)`). Interceptors now see invalid calls, with the 422 as `context.result`. What changes for interceptor authors: `context.input` is the input as the caller sent it (not yet validated, coerced or transformed), and a replacement is validated before the handler runs. The bindings keep their error shapes (HTTP status and `APIWireError`, RPC error classes, queue failure messages, CLI exit codes). The prototype-pollution guard still refuses `__proto__` / `constructor` / `prototype` keys before any interceptor or handler sees the input.
  - The handler's `context.signal` now aborts when the operation times out, with the `APITimeoutError` the call fails with (504) as its reason, and when the caller's signal aborts, with the `OPERATION_CANCELLED` error as its reason. Before, the executor stopped waiting but the signal never fired, so a handler kept running and repeated its side effects after the caller had given up. Every handler now receives a signal, even when the caller supplied none; it is not aborted on normal completion. The handler's context is a view of the caller's context: `requestId`, `state`, `get`/`set` and `metadata` are shared with the interceptors.
  - `defineOperation` infers the handler's `input` from the `input` schema: a Standard Schema's declared output type, or a `safeParse` schema's success `data` (`@zudojs/schema`, Zod). Inline definitions such as `registry.register(defineOperation({ input: TodoInput, handler: async (input) => input.title }))` now compile. Before, the `AnyAPIOperation` contextual type flowed into `defineOperation`'s generics and inferred `input` as `never` (as `unknown` outside a call). The return type no longer takes part in inference. Explicit type arguments (`defineOperation<TInput, TOutput>(...)`) behave as before. New types: `InferAPISchemaOutput`, `APIInputSchema`, `DefineOperationWithSchemaOptions`.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/rpc@1.4.0
  - @zudojs/errors@1.3.0
  - @zudojs/serialization@1.2.0
  - @zudojs/security@1.3.0
  - @zudojs/queue@1.4.0
  - @zudojs/openapi@1.5.0
  - @zudojs/schema@1.2.0
  - @zudojs/types@1.2.0

## 1.1.1

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.1.0

### Minor Changes

- Round 10 fixes.

  - **edge/API-01 (security, fail-closed):** `APIExecutor` now validates `input` / `output` against `@zudojs/schema` schemas (and any schema with a `safeParse` method returning `{ success, data | issues }`, including Zod-style `error.issues`), in addition to Standard Schema. Previously a `@zudojs/schema` schema was silently skipped: invalid input reached the handler and output was neither checked nor stripped.
  - Behaviour change: a declared `input` / `output` that is neither a Standard Schema nor a `safeParse` schema is no longer treated as documentation. `defineOperation` and `APIOperationRegistry.register` throw a `TypeError`, and the executor answers a hand-rolled operation carrying one with an `APIInternalError` (500) without running the handler. A schema result in an unrecognised shape also fails closed (500).
  - New export: `isAPISchema(value)` and the `APISchemaIssue` / `APISchemaResult` types.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

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
