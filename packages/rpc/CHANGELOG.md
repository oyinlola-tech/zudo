# @zudojs/rpc

## 1.4.0

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
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/serialization@1.2.0
  - @zudojs/security@1.3.0
  - @zudojs/constants@1.1.2
  - @zudojs/schema@1.2.0
  - @zudojs/types@1.2.0

## 1.3.0

### Minor Changes

- Tightened three places where caller-controlled input was not bounded, and one
  where a generated document did not match the contract it described.

  - **`@zudojs/rpc`** — `assertValidRequest` now bounds every caller-controlled
    part of the frame, not just `payload`. `request.id` is capped at the new
    `MAX_RPC_REQUEST_ID_LENGTH` (128, overridable with
    `limits.maxRequestIdLength`, `0` to disable), and `metadata` is measured
    alongside `payload` against `limits.maxPayloadBytes`. Previously an
    unbounded `metadata` object reached middleware and handlers as
    `context.metadata` however large it was, and an unbounded `id` was echoed
    verbatim into both the success and the error response. `RPCServer.handle`
    no longer reflects an id that exceeds the limit. Frames that were already
    inside the limits are unaffected; a frame whose `payload` and `metadata`
    together now exceed `maxPayloadBytes` is rejected with
    `RPCInvalidRequestError` where it used to be accepted.

  - **`@zudojs/openapi`** — `addRoute` now detects duplicates on the OpenAPI path
    template rather than the source path, so `GET /users/:id` and
    `GET /users/{id}` are recognised as the same route and the second is
    rejected. Both used to register, and generation then silently replaced the
    first with the second: one operation disappeared from the published
    document with `validate()` reporting no errors. `hasRoute`, `setRoute` and
    `removeRoute` accept either spelling for the same route.

  - **`@zudojs/openapi`** — an object schema that strips unknown keys no longer
    emits `additionalProperties: false`. That keyword means "reject the
    payload", while `strip` accepts it and discards the extra key, so a client
    generated from such a document refused requests the service accepts. Only
    `.strict()` emits it now. This also removes a difference between
    `s.object({…})` and `s.object({…}).strip()`, which validate identically but
    used to document differently. **Regenerate any checked-in spec**: objects
    that are not `.strict()` lose their `additionalProperties: false`.

  - **`@zudojs/observability`** — queue-overflow reports from the batch log and
    span processors are rate limited. A stalled exporter used to make every
    subsequent `logger.info()` synchronously allocate an `Error` and re-enter
    the configured `onError` — usually writing to the sink that was already
    failing. The first drop is still reported immediately; after that, at most
    one report per minute, each carrying the running total.

  - **`@zudojs/observability`** — a span attribute named `__proto__` is now
    recorded instead of silently vanishing, on both span attributes and event
    attributes. Storing it by plain assignment invoked the prototype setter,
    which dropped the attribute and replaced the bag's prototype; the injected
    prototype then let unlimited further attributes past the `maxAttributes`
    cap. Inherited names such as `toString` are counted against the cap too.

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1
  - @zudojs/schema@1.1.1
  - @zudojs/constants@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **edge/RPC-01 (security):** `RPCServer.handle(request, { auth })` and `RPCDispatcher.dispatch(request, { auth })` accept trusted, transport-derived identity, exposed frozen as `context.auth`. Frame `metadata` is documented as caller-controlled; the README no longer teaches authenticating on `context.metadata.userId`.
  - **edge/RPC-02:** `context.input` now carries the schema-parsed input (stripped, defaulted, coerced), so middleware can authorise on the value the handler receives. `context.request.payload` stays raw. README corrected.
  - New exports: `RPCAuthContext`, `RPCContextOptions`; `createRPCContext` takes an optional third `options` argument. All additions are optional; existing calls are unchanged.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/schema@1.1.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- - `RPCServer.handle()` and `RPCDispatcher.dispatch()` accept a frame without `metadata` (it is optional on the wire); previously it crashed with a TypeError reported as `RPC_INTERNAL_ERROR`. `createRPCContext` defaults `metadata` to `{}`.
  - Errors thrown with `expose: false` — `RPCInternalError`, `RPCSerializationError`, a plain `RPCError` or a subclass that does not opt in — no longer put their message on the wire: the caller receives the error's code with the generic internal-error message, and the original error is passed to `onInternalError`. Messages of typed, exposed errors (`RPCTimeoutError`, `RPCValidationError`, auth, rate-limit, …) are unchanged.
  - A handler result that fails the procedure's `output` schema is now an `RPCInternalError` (server fault, reported to `onInternalError` with the failing paths) instead of an `RPC_VALIDATION_ERROR` with empty `details` that blamed the caller's input. `parseOutput` throws `RPCInternalError`.
  - `RPCClient` passes its effective timeout to the transport as `RPCTransportRequestOptions.timeout`, which was declared but never populated.
  - An `RPC_TIMEOUT` response is rebuilt on the client as an `RPCTimeoutError` carrying the server's message instead of "timed out after 0ms".
  - README rewritten: the usage example called APIs that do not exist (`createRPCProcedure({ ... })`, `new RPCDispatcher()`, `dispatcher.register`, `dispatcher.call`).

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/schema@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix the 34 findings from audit round 7 across the queue, rpc, plugins and runtime packages.

  **Availability**

  - `InMemoryQueue` no longer spins the event loop forever when a waiting job has no registered processor. `processTick` now claims only runnable jobs, so an unprocessable job is skipped instead of starving the process.
  - `RPCClient` drains its pending map when a call settles. Previously entries survived until their timeout fired, so a client that made more than ~1024 successful calls in 30 seconds refused all further work.
  - `RPCDispatcher` enforces `RPCProcedureOptions.timeout` (and a default), aborts the request signal when it elapses, honours `metadata.deadline`, and rejects payloads over `MAX_RPC_PAYLOAD_SIZE`.

  **Security**

  - The RPC server no longer returns internal exception text to callers. Unexpected failures answer with a fixed message and are reported to the new `onInternalError` hook for server-side logging.
  - `RPCAuthenticationError`, `RPCForbiddenError`, `RPCRateLimitedError`, `RPCTimeoutError` and friends keep their identity through dispatch and map to distinct wire codes instead of collapsing into `RPC_INTERNAL_ERROR`.
  - Incoming requests are validated before dispatch: frame shape, request id, procedure name pattern, metadata type and payload size. Procedures may declare `input`/`output` schemas, which the dispatcher enforces.
  - `LifecycleManager` scopes `context.getModuleContext()` to a module's declared dependencies.

  **Resource safety**

  - Timers that guard an operation are now cleared when the operation wins, in the queue timeout middleware, the RPC timeout helpers, and runtime shutdown. A cleanly stopped runtime no longer holds the process open for the full `shutdownTimeout`.
  - `InMemoryQueue.close()` drains in-flight jobs before tearing down, bounded by `closeTimeout`, and clears scheduled and retry timers.
  - Plugin `context.onDispose` / `registerDisposable` now reach the collection teardown actually drains, and `context.signal` aborts on shutdown. Neither previously did anything.
  - `PluginManager.start()` rolls back on failure, and `stop()` disposes plugins left in `installed`/`initialized`.
  - `Runtime.stop()` works from the `failed` state, and startup rollback destroys modules that initialized but never started.

  **Correctness**

  - Queue job selection no longer skips jobs with a negative priority.
  - Retry delays are clamped to the maximum timer delay, so a large exponential backoff no longer overflows into an immediate retry; jitter is available on both queue and RPC retry, and defaults to on for `retry()`.
  - Queue throughput counters are shared by reference and reported through `getStats()`.
  - Job payloads round-trip through the configured serializer, which was previously never used.
  - Plugin shutdown follows reverse dependency order; present optional dependencies participate in ordering; declared dependency versions are enforced.
  - Missing module dependencies are rejected by `resolveDependencies` instead of silently dropped.
  - Runtime readiness checks registered before startup are evaluated rather than overridden, run under a per-check timeout, and `parallelInitialization` is implemented.

  **Capabilities that were declared but never called**

  A follow-up sweep found more instances of the pattern the audit was tracking — an option or type in the public surface that nothing reads. Each is now honoured:

  - `Worker` ran jobs by invoking the processor directly, leaving every job it processed stuck in `active` forever with no retry, dead-lettering or middleware. Job execution now belongs to the queue: the new `Queue.runJob()` runs a claimed job through the queue's pipeline, and the worker dispatches through it.
  - A processor returning a primitive (`"done"`, `42`) threw a `TypeError` from `"success" in result` and was dead-lettered as a failure. Non-`JobResult` returns now complete normally and carry their value on `job:completed`.
  - `QueueOptions.stalledAfter` / `maxStalledCount` reclaim jobs left `active` by a consumer that died, dead-lettering a job that stalls repeatedly. `WorkerOptions.timeoutMs` is applied to jobs that carry no timeout of their own; the unimplemented `WorkerOptions.maxStalledCount` was removed in favour of the queue-level setting.
  - `RuntimeOptions.startupTimeout` was validated as positive and never enforced, so a module whose `onInitialize` never settled hung the boot forever. It now bounds startup.
  - `RuntimeOptions.trackHealth` now actually disables health derivation, and `RuntimeOptions.metadata` — required on `ResolvedRuntimeOptions` with no default, so `undefined` at runtime — has a default and is surfaced on the runtime context.
  - `PluginManagerOptions.hookTimeout` bounds a lifecycle hook with `PluginTimeoutError`, which was exported and never thrown; `allowedCapabilities` enforces `PluginMetadata.capabilities`, which was declared and never read.
  - `RPCInterceptor` and `createNoopRPCInterceptor` were exported with no way to register them. Interceptors now wrap every dispatch via `RPCDispatcherOptions.interceptors`.
  - `RPCProcedureOptions.idempotent` and `description` are reachable through the new `RPCProcedureRegistry.describe()`.
  - `RPCStreamingProcedure` is documented as not yet dispatchable — the registry accepts only `RPCProcedure` and `RPCTransport.send` resolves a single response — rather than left looking usable.

  **Breaking**

  - `Queue` gains required `claimNextJob()`, `releaseJob()`, `runJob()`, `isDisposed()` and `getDeadLetterJobs()` members; custom implementations must add them. Consumers that ran jobs from `getNextJob()` must switch to `claimNextJob()`, which claims the job.
  - `QueueStats` gains lifetime counters.
  - `createTimeout()` (RPC) returns `{ promise, cancel }` instead of a bare promise, and `createCancellableSignal()` returns `{ signal, cancel }` instead of an un-abortable signal.
  - `RPCTransport.send()` receives an options argument carrying the abort signal.
  - `executeShutdown()` resolves with a `ShutdownResult`; `LifecycleManager.rollback()` resolves with its failures.
  - `@zudojs/runtime` no longer exports `testRuntime` from the package root; import from `@zudojs/runtime/testing`. `createMockModule()` records calls itself rather than importing `vitest` via `require`, which crashed in ESM.
  - `RuntimeRegistry.unregister()` returns a boolean; `removeAndStop()` added.
  - `WorkerOptions.maxStalledCount` removed; use `QueueOptions.stalledAfter` and `QueueOptions.maxStalledCount`.
  - `RuntimeContext` gains a required `metadata` field.

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
