# @zudojs/errors

## 1.3.2

### Patch Changes

- Fix graceful shutdown under `tsx watch`, make `generate middleware` produce a middleware the pipeline accepts, and answer an oversized request body with its 413.

  - **zudojs-cli: generated `src/server.ts` survives a second Ctrl+C.** The SIGINT/SIGTERM handlers were registered with `process.once`, so the `if (stopping) return` guard could never run. Under `npm run dev` (`tsx watch`), Ctrl+C delivers SIGINT twice. The second signal found no listener, and Node killed the process mid-shutdown before any graceful-shutdown log appeared. The handlers now use `process.on`. A repeated signal logs `Received SIGINT again: already shutting down.` while integrations drain, HTTP stops and the runtime stops. "Listening on …" is now logged after the handlers are registered. Every generated app uses this template: monolith, modular monolith, and the microservice gateway and services.
  - **zudojs-cli: `generate middleware <name>` writes an `HttpMiddleware` and registers it.** The schematic wrote `(ctx: unknown, next: () => Promise<void>) => Promise<void>`. Adding it to the pipeline failed tsc with TS2322, and it dropped the response `next()` produced. It now writes a function returning `HttpMiddleware` from `@zudojs/http` that returns `next()`'s response, and exports it from the `middlewares/index.ts` barrel. It also adds it to `src/server.ts` between the `zudojs:server-imports` and `zudojs:server-middleware` markers, so it runs after the security headers, CORS and rate limit and before routing. When the markers are missing, `server.ts` is left unchanged and the command prints the two lines to add by hand.
  - **@zudojs/errors: `SerializationPayloadTooLargeError` is an exposed 413 by default.** It was a 413 with `expose: false`, so `serializePublicError` answered an oversized request body with "An unexpected error occurred.". Its message holds only the two sizes, so it is now exposed. Like `SerializationDepthError`, it takes a third `{ statusCode?, expose? }` argument for a payload the server built itself.
  - **@zudojs/serialization: `serialize` keeps oversized output hidden.** `deserialize` bounds untrusted input, so an oversized string gets the exposed 413. The output of `serialize` was built by the server, so it now throws an unexposed 500 (`{ statusCode: 500, expose: false }`). `assertSizeWithinLimit` in `@zudojs/validation` guards untrusted input and now throws the exposed 413 without any change of its own.

  `@zudojs/serialization`: a too-deep payload found while restoring types in `deserialize` (`preserveTypes`) is now an exposed 400 (`UNTRUSTED_DEPTH_ERROR`) instead of a hidden 500, matching the parse-level depth guard.

## 1.3.1

### Patch Changes

- - **@zudojs/api:** a handler's context is now typed `APIHandlerContext` (`APIContext & { readonly signal: AbortSignal }`, newly exported), matching the runtime guarantee that every handler receives a signal. `ctx.signal` no longer needs a `!` under strict TypeScript. Contexts built by callers (`createAPIContext`, `executor.execute(op, input, context)`) may still omit the signal, and handlers annotated with the plain `APIContext` are still accepted.
  - **@zudojs/messaging:** `MessageDispatchAbortedError.cause` is now the abort signal's `reason` (for an abort during or between handlers, and for a signal that was already aborted). It used to be `undefined`.
  - **@zudojs/errors:** `MessageDispatchAbortedError` accepts a `cause` option, like `InvalidMessageError`.
  - **@zudojs/queue:** new `job:dead-lettered` event (`{ job, error, reason? }`), emitted once when a job is moved to the dead-letter store (attempts exhausted, or stalled `maxStalledCount` times), so dead-letter alerting no longer needs attempt arithmetic or polling `getStats().deadLettered`. The README now documents that `job:failed` fires on every failed attempt with `job.state` `"failed"` on retryable and final attempts alike; that behaviour is unchanged.

## 1.3.0

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

- **@zudojs/database**

  - Caller errors pass through transactions. A `@zudojs/errors` `BaseError` that is not a `DatabaseError` (a `NotFoundError`, `DomainError`, `ValidationError`, ...) thrown by a callback given to `DatabaseClient.transaction()`, `withTransaction()`, `TransactionManager.run()/execute()` or a unit of work still rolls the transaction back, but is now rethrown as the same instance instead of being wrapped in a 500 `DatabaseError`. It is logged at debug level instead of as an error. Driver and database failures, and any other thrown value, are normalised and logged as before. New `isNonDatabaseBaseError(error)` guard.
  - `paginateCursor` now sets `meta.previousCursor` on any non-empty page requested with a cursor, and accepts it to page backward (rows come back in the requested sort order). Backward cursors carry a reserved `$before: true` marker. New helpers: `getKeysetDirection`, `keysetFetchSort`, `reverseKeysetSort`, `KEYSET_BACKWARD_KEY`. `createKeysetCursor` takes an optional `direction`, `createKeysetPage` a `direction` option, and `buildKeysetWhere` honours backward cursors.
  - **Behaviour change:** a missing, forged, tampered or malformed cursor now throws a `ValidationError` (400, exposable, one issue on `cursor` whose `code` is `cursor_required`, `cursor_signature`, `cursor_malformed`, `cursor_payload` or `cursor_field`) instead of a `TypeError` that surfaced as a 500. This applies to `decodeCursor`, `validateCursorPayload`, `decodeKeysetCursor` and `paginateCursor`. The unexpected-field and non-primitive-field messages no longer quote the offending key. An invalid `secret` or sort definition is a programming error and still throws `TypeError`. New `createInvalidCursorError`.
  - The connection manager's reconnect back-off wait is no longer `unref`'d, so a script whose only pending work is a reconnect stays alive until it finishes. `disconnect()` and `destroy()` now cancel an in-progress reconnect, including its wait; before, the loop kept reconnecting after `disconnect()`.

  **@zudojs/storage**

  - **Behaviour change:** `BaseRepository.create()` and `update()` treat a property whose value is `undefined` as not provided and leave it out of the SQL, even when it is an own key. Before, it was written as `NULL`, which wiped columns when a partial DTO had optional fields that were not sent. An explicit `null` still writes `NULL`. An `update` whose properties are all `undefined` returns the current row.
  - New `writableColumns`, `filterableColumns` and `sortableColumns` options govern `create`/`update`, `count` filters and `findAll` sorting separately. Each one defaults to `columns`, so existing configs behave the same.
  - **Behaviour change:** `StorageLifecycleManager.drain()` and `shutdown()` visit components one at a time in reverse registration order, as teardown needs. Before, all of them started at once in registration order. A failing component still does not stop the others.
  - **Behaviour change:** contention no longer reports 504 (gateway timeout). `STORAGE_LOCK_ACQUIRE_TIMEOUT` is now 409, like `lockTimeoutError` in `@zudojs/errors` and `@zudojs/cache`'s lock errors. `STORAGE_CONNECTION_ACQUIRE_TIMEOUT` and `STORAGE_CONNECTION_TIMEOUT` are now 503 (service unavailable, retryable), like `@zudojs/database`'s pool and connection failures. Error codes are unchanged.

  **@zudojs/transactions**

  - Adapter handle accessors: `getTransactionHandle<T>(transaction)`, `currentTransactionHandle<T>(context?)` and `manager.getCurrentHandle<T>()` return what the adapter's `begin()` produced. A savepoint resolves to its connection and a participant to the joined transaction, and a non-transactional scope yields `undefined`.
  - `Transaction.signal` is a new `AbortSignal` that aborts with a `TransactionTimeoutError` when the transaction times out. A participant exposes the joined transaction's signal, and a savepoint's signal also aborts with its parent's. `run()` now stops waiting for a timed-out callback, rolls back, and rejects with `TransactionTimeoutError`. New `raceSignal` helper.
  - `timed_out` is emitted once per timeout (from the timer). It was emitted a second time when a timed-out transaction was committed.
  - **Behaviour change:** committing a rollback-only transaction throws `TransactionRollbackOnlyError`, a new `TransactionRollbackError` subclass with the message `commit refused: transaction marked rollback-only`, instead of the misleading "rollback failed". `instanceof TransactionRollbackError` and the error code still match.
  - **Behaviour change:** `manager.rollback()` on a committed transaction throws `TransactionStateError` instead of silently doing nothing, matching `Transaction.rollback()`. Rolling back an already rolled-back or failed transaction is still a no-op. `run()` no longer tries to roll back when an error (for example from an `afterCommit` hook) arrives after a successful commit.

  **@zudojs/serialization**

  - `new JSONSerializer({ transformers: registry })` and `createSerializer("json", { transformers })` keep the built-in transformers (Date, BigInt, Map, Set, Buffer, Error) behind your registry. Before, a custom registry silently replaced them all. Your registry is consulted first, so it can still override a built-in tag. Pass the new `builtins: false` to use only your registry. New `createBuiltinTransformers()` and exported `JSONSerializerOptions`.
  - A transformer's `serialize` may return just the value, which is wrapped as `{ $type, $value }` for you. Returning the full tagged object still works, since any plain object with its own string `$type` is taken as-is. Before, a bare return was written untagged and could not be revived. `deserialize` always receives the full tagged object. The contract is documented on `TypeTransformer`.
  - With `preserveTypes`, a value no transformer handles that JSON would write as `{}` (a `Map`, `Set`, `WeakMap`, `WeakSet`, `WeakRef`, `Promise`, `RegExp`, `Error`, `ArrayBuffer` or `DataView`) throws `SerializeError` naming the type instead of silently losing its contents. With the built-ins enabled this only happens for types that have no built-in transformer.

  **@zudojs/errors**

  - New `TransactionRollbackOnlyError extends TransactionRollbackError` for a commit refused because the transaction was marked rollback-only. `TransactionRollbackError` accepts an optional `message` option.

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

- Fix bugs that lesson writers reproduced in config, validation, container and runtime.

  **`@zudojs/config`**

  - NUMBER and BOOLEAN schemas now accept values from environment variables. Env values are always strings, so `manager.validate({ properties: { port: { type: ConfigValueType.NUMBER } } })` rejected `PORT=8080` as `TYPE_MISMATCH`. A `transform` could not help, because transforms run after the type check. String input is now coerced before the type check when the schema's type includes `NUMBER` or `BOOLEAN` and does not also accept `STRING` or `ANY`. Numbers are parsed strictly and in decimal only: `"8080"` passes, but `"80a"`, `"0x1F90"` and `""` are still rejected. Booleans use the existing `boolean()` convention: `true`/`false`, `1`/`0`, `yes`/`no`, `y`/`n` and `on`/`off`. `validate` and `transform` receive the coerced value. This applies to `validate()`, `resolve()` and the standalone `validateConfigValue`/`validateConfigObject`. **Behaviour change:** these functions used to reject a numeric or boolean string for a NUMBER/BOOLEAN schema and now accept it. Set the new schema option `coerce: false` to keep the old strict behaviour.
  - A typed getter called with a fallback now returns `T` instead of `T | undefined`. This covers `string`, `number`, `boolean`, `bigint`, `date`, `object` and `array` on `ConfigManager`, `ConfigResolver` and `ScopedConfigResolver`. `get(key, fallback)` is a new overload. It returns the stored value, or the fallback when the key is missing. Its literal fallback is widened through the new `ConfigWiden<T>` type, so `get("mode", "dev")` is typed `string`, not `"dev"`. Calls without a fallback keep their old types.
  - `store.getByPrefix()` and `store.getObjectByPrefix()` now ignore a trailing dot in the prefix. Before, `getByPrefix("db.")` returned `[]` and `getObjectByPrefix("db.")` returned `{}`. Now `"db"` and `"db."` select the same entries.
  - `ScopedConfigResolver` and `ConfigManager` gain the typed required accessors that the root resolver already had: `requiredString`, `requiredNumber`, `requiredBoolean` and `requiredDate`. Each one parses the value, checks it, and throws when the value is missing or does not parse. For example, with `DB__PORT=5432`, `scoped("db").requiredNumber("port")` returns `5432`. `required<T>()` still performs no conversion, because `T` is erased at runtime and cannot be checked safely. It now documents this and points to the typed variants.
  - `resolve()` and `resolveResult()` now take a `TypedConfigSchema<T>`. This union is keyed on `type`, so each value type accepts exactly the constraints the validator enforces: `{ type: NUMBER, min: 1 }` compiles, and `{ type: NUMBER, minLength: 1 }` is a compile error. The constraint shapes are exported as `ConfigStringConstraints`, `ConfigNumberConstraints`, `ConfigArrayConstraints` and `ConfigObjectConstraints`. `ConfigStringSchema` and `ConfigNumberSchema` are now built from them, with the same fields as before.
  - `validate` now receives the final value. The order is: coerce, type check, constraints, `transform`, then `validate` on the transformed value, which matches its `(value: T)` signature. A string that does not have the schema's type is passed to `transform` as a parser, and the transform's output must then have the type and pass the constraints. This lets `{ type: ARRAY, transform: (s) => String(s).split(",") }` accept `"a,b"`, and a hex parser accept `"1F90"` for a NUMBER. A non-string of the wrong type is still rejected without calling `transform`. **Behaviour change:** `validate` used to see the value before `transform` ran. A transform can now run on a string that fails the type check, but a result without the right type is still never returned.

  **`@zudojs/validation` / `@zudojs/errors`**

  - `assertDepthWithinLimit` and `assertNoCircularReference` now throw `SerializationDepthError` with `statusCode: 400` and `expose: true`. Before, the error was an unexposed 500, so a request body nested too deep surfaced as a hidden server error. The message contains only the observed depth and the limit. The error class is unchanged, so `instanceof` checks still match. **Behaviour change:** `@zudojs/serialization` calls these guards, so a depth failure from `JSONSerializer` (serialize or deserialize) is now a 400 as well.
  - `SerializationDepthError` takes an optional third constructor argument, `{ statusCode?, expose? }`. Without it, the error is still an unexposed 500. The new `UNTRUSTED_DEPTH_ERROR` constant holds the options the validation guards pass.

  **`@zudojs/container`**

  - `registerFactory`, `factoryProvider` and `provideFactory` now infer the factory's parameter types from the `inject` list. Each `Token<T>` or class token maps to `T`, so the README example `registerFactory(API, (db) => new Api(db), [DB])` compiles under strict mode, and a factory whose parameters do not match the tokens is a compile error. String and symbol tokens give `unknown`, as before. A factory typed `(...deps: unknown[]) => T` and a non-tuple `readonly ProviderToken[]` inject list still compile. The new types are `InjectedDependencies<Deps>` and `InjectedFactory<T, Deps>`. **Behaviour change:** a factory that declares more parameters than its inject list supplies is now a compile error.
  - Error messages and default registration names now show a symbol token by its description: `MissingService` instead of `Symbol(MissingService)`. `describeToken` returns the same string.
  - `autoRegisterClasses` only auto-registers a class whose constructor declares no required parameters (`Class.length === 0`). Before, `resolve(NeedsDep)` for `constructor(dep: Dep)` silently built the class with `dep = undefined`. It now throws `RegistrationNotFoundError`, naming the class and explaining how to register it with an `inject` list. `canResolve` and `resolveOptional` agree with this rule. Parameters with default values are not counted. **Behaviour change** for code that relied on the old silent construction.

  **`@zudojs/runtime`**

  - `start()` now passes through every state in order: `created → initializing → initialized → starting → running`. `initialized` and `starting` were declared but never entered, and `onReady` ran while the state was still `initializing`. `onInitialize` hooks now see `initializing` and `onReady` hooks see `starting`. The runtime publishes `runtime.initialized` and `runtime.starting` between the two phases, and both are back in `RuntimeEventMap`. **Behaviour change:** `RUNTIME_STATE_TRANSITIONS` no longer allows `initializing → running` or `initialized → running`.
  - `RuntimeInitializationError`, `RuntimeRollbackError` and `RuntimeSignalError` were exported but never thrown. They are now used:
    - `RuntimeInitializationError` now extends `RuntimeStartError` with `phase: "initialize"`, so existing `instanceof RuntimeStartError` checks still match. It is thrown when an `onInitialize` hook fails or the configuration manager fails to load. It also accepts a `failedModuleId`.
    - `RuntimeRollbackError` now extends `RuntimeStartError`. It is thrown when startup fails and the rollback that follows also fails, which used to be only logged. `phase`, `failedModuleId` and `cause` describe the startup failure. `originalError` keeps the error `start()` would otherwise have thrown, and `rollbackError` holds what failed during rollback, or an `AggregateError` when several modules failed. The message names both failures.
    - When a shutdown triggered by `SIGTERM`, `SIGINT` or a fatal error fails, the signal handler has no caller to throw to. It now logs a `RuntimeSignalError` with the failure as `cause`. `RuntimeSignalError` accepts an optional `{ cause }`.
  - `failed` is no longer a terminal state. `TERMINAL_STATES` is now `["stopped"]`, and `isTerminalState("failed")` is `false`, which is consistent with `stop()` being allowed from `failed` to clean up. **Behaviour change** for callers of `isTerminalState` and `TERMINAL_STATES`.
  - A failed start still rejects with `RuntimeStartError` that wraps the module's error. It does not re-throw the original. The README now documents this, including `error.cause` (the original error), `error.phase` and `error.failedModuleId`.
  - Container ownership is now documented and configurable. The container is passed in, so by default the caller owns it and `stop()` leaves it alone. The new option `disposeContainerOnStop: true` makes `stop()` dispose the container after every module has shut down. This also covers `stop()` on a runtime that never started. A disposal failure is recorded in `status.shutdownFailures` under the id `"(container)"` (exported as `CONTAINER_SHUTDOWN_ID`) and does not fail the stop. `createTestRuntime` creates its own container and now disposes it on stop. Pass `disposeContainerOnStop: false` to keep it.

- Guards now refuse with real status codes, and permission policies no longer grant access on their own.

  **Security — `@zudojs/permissions`: a policy's allow is no longer a grant (behaviour change).** An allowing policy used to grant the permission without any role check, so a "business-hours" policy handed `task:delete` to an actor with no roles, and the README taught that pattern. A policy is now, by default, an extra condition on top of RBAC/ABAC (`effect: "constrain"`): it can deny, but an allow only means "no objection", and the actor's roles, permissions or rules must still grant the permission. A policy that really establishes the right on its own, such as an ownership check, opts in with `effect: "grant"`. To get the old behaviour back for every policy that sets no `effect`, pass `createPermissionEngine({ defaultPolicyEffect: "grant" })`. **If you relied on a policy to grant access, those checks now deny until you add `effect: "grant"`.** A granting policy still never overrides a denial, and only the exact value `"grant"` grants (a typo constrains). An allow from constraining policies alone now reports `reason: "policy_pass"` internally. New exports: `PolicyEffect`, `policyGrants`, `DEFAULT_POLICY_EFFECT`.

  **Security / misreporting — denials were sent as `200`.** A route middleware that returned a plain `{ status, body, headers }` object had it ignored by `@zudojs/http`, so `authorize()` and the tenancy middleware refused requests (the handler never ran) but clients, caches and monitoring saw `200`. The fix is a small, explicit contract:

  - `@zudojs/middleware`: new `createGuardResponse({ status, body?, headers? })`, `isGuardResponse()`, the `GuardResponse` type and the `GUARD_RESPONSE` brand (`Symbol.for("zudojs.middleware.guardResponse")`). A structured body gets `content-type: application/json` by default. A status outside 100–599 throws `RangeError`.
  - `@zudojs/http`: the router, `HttpMiddlewarePipeline` and `RouteDispatcher` send a guard response with its status, headers and JSON body, keeping headers an outer middleware already set. `HttpMiddlewareResult` includes `GuardResponse`. New helpers `applyGuardResponse` and `guardResponseToContext`. An unbranded object keeps its previous meaning, so data with a `status` key is never read as a response. `@zudojs/http` now depends on `@zudojs/middleware`.
  - `@zudojs/permissions`: `createForbiddenResponse`, `createUnauthorizedResponse` and `createJsonResponse` (and therefore `authorize()`, `createRequirePermissionMiddleware`, `createRequirePermissionsMiddleware` and `createActorMiddleware({ requireActor: true })`) return guard responses. `PermissionHttpResponse` is now an alias of `GuardResponse` (same fields plus the brand). `createJsonResponse` throws `RangeError` for a status outside 100–599.
  - `@zudojs/tenancy`: `createResolveTenantMiddleware`, `createRequireTenantMiddleware`, `createTenantGuardMiddleware` and the helpers `createBadRequest`, `createUnauthorized`, `createForbidden`, `createNotFound`, `createJsonErrorResponse` return guard responses, including the custom `notFoundResponse` / `deniedResponse` bodies. New helper `createJsonResponse(status, body)`.

  **Middleware types are assignable to `@zudojs/http`.** The `HttpMiddleware` types mirrored in `@zudojs/permissions` and `@zudojs/tenancy` are now generic over what `next()` returns, so every exported guard can be put in a route's `middleware` list without `as never`. A hand-written middleware typed with these mirrors can no longer return a plain `{ status, body, headers }` object (it was never sent as a response); return `createGuardResponse(...)` instead. New type `HttpMiddlewareOutcome`.

  **`@zudojs/tenancy`: `createResolverChain([...])` infers its context.** The README Quick Start (`createResolverChain([createJwtResolver(), createDomainResolver({ repository }), createSubdomainResolver(...)])`) failed with TS2322 unless you wrote `<HttpResolverContext>`. The context is now the intersection of what the resolvers read; an explicit type argument still works. New type `ResolverChainContext`.

  **`@zudojs/auth`:**

  - `AccountLockedError` (423) and `AuthRateLimitError` (429) carry `retryAfterSeconds` and a `Retry-After` header in `headers`, which `@zudojs/http` copies onto the response; the lockout's value is the time left on the lock.
  - Distinct error codes (behaviour change for clients that match codes): `AccountLockedError` is `ERR_ACCOUNT_LOCKED`, `AccountDeactivatedError` is `ERR_ACCOUNT_DEACTIVATED`, and `TokenRevokedError` is `ERR_TOKEN_REVOKED`; all three used to be `ERR_FORBIDDEN`. **`TokenRevokedError` is now `401` (category authentication) instead of `403`**, since the client has to authenticate again.
  - `needsRehash()` returns `false` for a hash made with `@zudojs/crypto`'s own `hashPassword()` defaults (same N, r, p; 16-byte salt and 32-byte key), which it used to flag on every login.
  - Security: `login()` normalizes the identifier before `findUser()` sees it (NFKC, trim, and lower-case for an email address; usernames keep their case). Use the new `normalizeLoginIdentifier()` at registration so both sides agree. `normalizeIdentifier: false` passes the raw string, or supply your own function. Lockout counters were already case-insensitive.
  - New `createSessionForUser(userId, { method, userAgent?, ip?, metadata? })` issues a session and tokens for a user authenticated outside `login()`, such as the `@zudojs/auth-oauth` callback, without a password check. It is off by default: it throws `AuthConfigurationError` unless `method` is listed in the new `externalSessionMethods` option. It refuses unknown and deactivated users and records `metadata.authMethod` on the session. `@zudojs/auth` now depends on `@zudojs/types`.

  **`@zudojs/errors`:** new codes `ErrorCode.TOKEN_REVOKED`, `ErrorCode.ACCOUNT_LOCKED` and `ErrorCode.ACCOUNT_DEACTIVATED`.

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - - `@zudojs/schema`: new `isSchemaValidationError(error)` guard narrows a caught error so `error.issues` is typed `readonly SchemaIssue[]` without a cast (it also checks each issue's shape at runtime). `parse()` and `unwrapSchemaResult()` now throw `SchemaError<SchemaIssue>`.
  - `@zudojs/errors`: `SchemaError` is generic (`SchemaError<TIssue = unknown>`, likewise `SchemaErrorOptions` and `createSchemaError`); the default keeps existing code unchanged.
  - `@zudojs/schema`, `@zudojs/validation`: length and count messages use the singular for one ("at least 1 character", "at least 1 item") instead of "1 characters".
  - `@zudojs/types`: new `formatCount(count, singular, plural?)`.
  - `@zudojs/logger`: the console transport prints the formatted line instead of a record object that repeated the timestamp and level; an `Error` passed as the second argument of a level method (`logger.error("failed", err)`, common in JavaScript) is now logged as the entry's error with its stack instead of being read as empty metadata and dropped (the typed form remains `logger.log(level, message, { error, metadata })`); no trailing space before a stack trace. The level methods' signatures are unchanged.
  - `@zudojs/schema`: `string().url()` still accepts only `http`/`https` by default (so `javascript:` and `data:` URLs stay invalid), and now takes `url({ protocols: ["postgres", "postgresql", "redis", "rediss"] })` or `{ protocols: "any" }`, parsed with the WHATWG `URL` parser; a `postgres://` `DATABASE_URL` was refused. The doc comment now states the default.
  - `@zudojs/schema`: `date()`, `datetime()` and `time()` validate real values: month 01-12, a day that exists in that month (leap years included), hours 00-23, minutes and seconds 00-59 and a `±hh:mm` offset up to 23:59. `"2026-02-30"`, `"2026-13-45"` and `"2026-02-30T25:61:00Z"` used to pass.
  - `@zudojs/schema`: an optional key absent from the input stays absent from the parsed object instead of coming back as an own key set to `undefined` (a repository then wrote it as `NULL`); a key sent as `undefined` is kept. The inferred object type makes such keys optional properties (`{ b?: string | undefined }`, new exported `ObjectShapeOutput`), matching `exactOptionalPropertyTypes`.
  - `@zudojs/schema`: `partial()` no longer applies `.default()` to absent keys, so an update schema built with `partial()` no longer resets every defaulted field the caller left out. Present values are still validated.
  - `@zudojs/schema`: every primitive has `.optional()`, `.nullable()`, `.default()`, `.refine()` and `.transform()`: `boolean()`, `bigint()`, `symbol()`, `literal()`, `enum()`, the sentinel schemas and all `coerce` schemas (through the new `ModifiableSchema` base class). `schema.boolean().optional()` was a type error.
  - `@zudojs/schema`: `SchemaInput<typeof string().transform(fn)>` is the input type (`string`), not the output type; `TransformSchema<TIn, TOut>` now extends `Schema<TOut, TIn>`. Object, tuple and union inference read only the output type, so a transformed field keeps its output type in `Infer<>`. Compatibility: code that annotated a chained transform as `Schema<TOut>` must use `Schema<TOut, TIn>` (or `Schema<TOut, unknown>`).
  - `@zudojs/logger`: `entry.message` is again the raw message a transport receives. The formatter's rendering is in the new `entry.formatted` (the text or JSON line, or the JSON line of a structured formatter's record); a string formatter's output used to replace `message`. **Custom transports that printed `entry.message` to get the formatted line should print `entry.formatted ?? entry.message`** (or use the new `formatTransportLine(entry)`); the console transport does.
  - `@zudojs/logger`: with `createStructuredLoggerFormatter()`, the console transport prints one JSON line per record (cycles become `"[Circular]"`, BigInt a string) instead of a multi-line object; new `toJsonLogLine(record)` helper.
  - `@zudojs/logger`: `level` accepts level names in any case wherever a level is configured: `createLogger({ level: "error" })`, `setLevel("DEBUG")`, `child({ level: "trace" })` (type `LoggerLevelLike = LoggerLevel | LoggerLevelName | Uppercase<LoggerLevelName>`, new `resolveLoggerLevel()`). An unknown level now throws instead of silently disabling output. `Logger.setLevel` takes `LoggerLevelLike` and `Logger.child` the new `ChildLoggerOptionsInput`; `ChildLoggerOptions` is unchanged, and an implementation declared with a `LoggerLevel` / `ChildLoggerOptions` parameter still satisfies the interface (it may now be handed a name, which `resolveLoggerLevel()` converts).
  - `@zudojs/logger`: `createTextLoggerFormatter({ includeStackTrace: false })` prints an error as its name and message only (`error={"name":...,"message":...}`), and an `Error` inside metadata loses its stack too; the fallback used to serialize the stack, absolute paths included. `serializeLoggerValue` and `serializeLoggerError` take an optional flag to omit stacks.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.

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

- Hardens the type and error primitives against untrusted input, and makes a
  handful of failure paths report the error a caller can actually act on.

  - `BaseError` no longer overflows the stack when a deeply nested object or
    array is attached as a `cause`. The redaction walk is now bounded at 32
    levels and truncates with `"[MaxDepth]"`, exactly as metadata cloning
    already did, so `JSON.stringify`, `serializeError` with `includeCause` and
    `ErrorHandler.toLogObject` stay safe on a parsed request body.
    Attacker-controlled depth could previously raise a `RangeError` from inside
    the logging path.
  - `estimateSerializedSize(value)` now defaults to a finite budget
    (`SerializationLimits.MAX_SIZE`) instead of `Infinity`. Because every
    occurrence of a shared subtree is charged, an unbounded budget let a 1 KB
    payload of shared references burn minutes of CPU. Pass an explicit
    `Number.POSITIVE_INFINITY` if you need an exact measurement of input you
    trust; the returned value is otherwise capped at the budget.
  - `assertNoCircularReference` reports running out of depth as
    `SerializationDepthError` rather than dressing it up as
    `CircularReferenceError`, and `JSONSerializer.serialize` with
    `preserveTypes` passes the caller's `maxDepth` into it. A deep but perfectly
    acyclic payload used to be rejected as a cycle on that path while the fast
    path reported a depth error for the same input; the two now agree.
    `hasCircularReference` returns `false` for such a graph instead of `true`.
  - `isArrayOfType` reads every index rather than relying on
    `Array.prototype.every`, which skips holes. A sparse array such as
    `new Array(3)` no longer satisfies an arbitrary element guard.
  - A `$type` tag arriving from the wire is checked against
    `SerializationLimits.MAX_TYPE_TAG_LENGTH` before it is looked up, and is
    clipped before being quoted into an error message, so an over-long tag can
    no longer flood a log line.
  - The envelope trust boundary (`assertValidEnvelope`, `unwrapEnvelope`,
    `deserializeFromEnvelope`) throws `InvalidSerializedDataError` instead of a
    bare `Error`, a full `TransformerRegistry` throws `TransformerError`, and
    `unwrapSchemaResult` throws `SchemaError` carrying the recorded issues.
    Code that catches `Error` is unaffected; code that wants to turn hostile
    input into a 400 can now tell it apart from an internal bug.
  - `Schema.safeParse`'s documentation no longer claims it never throws: a
    callback defect or a `RangeError` from stack exhaustion is still
    deliberately allowed to escape rather than being laundered into a
    validation issue.

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - LEAF-02: `ErrorSerializer` and `ErrorHandler.toLogObject` redact array causes, and redact every field of a plain-object cause that only looks like a serialized BaseError. Only objects that a BaseError's `toJSON` really produced get BaseError treatment now.
  - LEAF-03: the cause depth limit (8) is counted across the whole chain, BaseError causes included. A 20 000-deep wrapper chain no longer overflows the stack in `toJSON`, `toLogObject`, `ErrorSerializer.serialize` or `ErrorHandler.toLogObject`.
  - LEAF-09 (behaviour change): `BaseError.toJSON()` / `toLogObject()` (and therefore `JSON.stringify(error)`) redact metadata values under sensitive keys and sensitive keys inside plain-object causes. The raw values stay on `error.metadata` / `error.cause`. `ErrorSerializer({ redactSensitiveData: false })` still returns raw values.
  - LEAF-10 (behaviour change): `ValidationError` / `SchemaError` `toJSON()` always replace issue values with a type description, including when `expose` is false. Raw values stay on `error.issues`.
  - LEAF-11: `redactIssueValues` drops `__proto__` / `constructor` / `prototype` keys, so a JSON-parsed issue cannot swap the output's prototype.
  - LEAF-13: `safeStringify` tracks the ancestor path, so a shared, non-cyclic sub-object is no longer printed as `[Circular]`.
  - LEAF-14: `sanitizeFragment` strips U+2028/U+2029 and the bidi marks, embeddings, overrides and isolates.
  - New classes that other packages defined locally (additive; consumers not switched yet): `TransactionError` and its 10 subclasses, `MiddlewareLimitExceededError`, `MiddlewareDepthExceededError`, `MiddlewareRateLimitError`, `MiddlewareAbortedError`, `TraversalLimitError`, `HttpMiddlewareError`, `HttpMiddlewarePipelineError`, `HttpRequestGuardError`, `OpenAPIError`, `AuthError`, `OAuthError`, `CqrsError`, `ObservabilityError`, `InvalidConstantError`, `ConstantContextError`. Also new: `ErrorCode.OAUTH_*` (the values equal `@zudojs/auth-oauth`'s code strings).
  - tooling/CONV-01 (phase 2): new `CLIValidationError`, `CLIGenerationError`, `CLINotInProjectError` and `CLITemplateError` (moved from `zudojs-cli`, same constructors, all `ApplicationError`s).
  - LEAF-18: `ErrorConstructor<T>` is now `abstract new (...args: never[]) => T` instead of `any[]`. Every constructor is still assignable.

## 1.0.1

### Patch Changes

- - A `sensitiveKeyPattern` carrying the `g` or `y` flag (passed to `redactErrorMetadata`, `sanitizeErrorMetadata`, `isSensitiveMetadataKey`, `ErrorSerializer` or `ErrorHandler`) no longer redacts on one call and leaks the same key on the next.
  - `ErrorSerializer` (and therefore `serializeError`/`ErrorHandler.toLogObject`) now applies `redactSensitiveData` to plain-object causes, which were previously copied verbatim into the serialized cause chain; the cause's shape (dates, arrays, class instances) is preserved and cycles stop at `"[Circular]"`.

## 0.2.0

### Minor Changes

- [`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Harden error classification, public serialization and metadata handling.

  These are behavioural changes. Code that compiles unchanged may now produce
  different HTTP status codes and different response bodies.

  **Native errors are no longer treated as client input.** `mapNativeError` (and
  `mapError` falling through to it) previously classified native `TypeError`,
  `RangeError` and `SyntaxError` as 400 client errors. They are overwhelmingly
  programmer bugs, not bad input, so they are now non-operational internal errors:
  **500, not exposed**. If your handler relied on a thrown `TypeError` surfacing to
  the client as a 400, register an explicit mapping rule with `mapErrorType` to
  restore that behaviour for the specific error type you mean.

  **Public 500 bodies no longer carry metadata.** The public serializers emitted
  `metadata` for non-exposed errors, leaking internal detail to clients. Metadata
  is now included only for exposed errors, or when the serializer is explicitly
  configured to include it. Clients that read `metadata` off a 500 response will
  now see it absent.

  **Corrected HTTP status codes.** Several errors returned a status that did not
  match their semantics and now map to the correct one: **412** (precondition
  failed), **413** (payload too large), **415** (unsupported media type), **423**
  (locked) and **502** (bad gateway). Assertions pinned to the previous codes will
  need updating.

  **Server-side registry errors are 500 and non-exposed.** Failures originating in
  the error registry itself are internal faults and are no longer reported as
  client errors.

  **`BaseError.withMetadata` no longer re-runs the constructor.** It previously
  rebuilt the error by invoking the subclass constructor, which re-ran any
  constructor side effects and discarded fields a subclass had set outside the
  constructor's argument path. It now clones the existing instance and merges
  metadata. Subclasses that depended on constructor re-execution to derive fields
  will see those fields preserved from the original instance instead of recomputed.

## 0.1.1

### Patch Changes

- Audit hardening (round 6):
  - `BaseError.withMetadata` clones the instance instead of re-running the constructor, so it works for every subclass regardless of constructor signature and preserves message, code, status, cause and own fields.
  - Public serialization (`serializePublicError`, `ErrorSerializer.serializePublic`, `ErrorHandler.toPublicResult` / `handlePublic`) never emits metadata for non-exposed errors unless keys are allow-listed via `publicMetadataKeys`; redaction is recursive, case-insensitive and pattern-based and is applied to cause chains. `ErrorHandler.toResult` is documented as the internal representation and `serialize` never includes a stack.
  - Native `TypeError` / `RangeError` / other `Error`s map to `ERR_INTERNAL_ERROR` (500, not exposed, non-operational) instead of exposed 400 validation errors. All normalizers (`toBaseError`, `normalizeToBaseError`, `normalizeUnknownError`, `ErrorHandler.normalize`) share one implementation (`normalizeUnknownToBaseError`) and keep the thrown value as `cause`.
  - Metadata is deep-cloned and deep-frozen; `__proto__` / `constructor` / `prototype` keys are dropped; cycles and excessive depth are guarded. New `redactErrorMetadata` (plus `SENSITIVE_METADATA_KEY_PATTERN`, `isSensitiveMetadataKey`) removes secrets; `sanitizeErrorMetadata` only removes unsupported values unless `{ redact: true }`.
  - `toJSON` is cycle-safe, depth-limited and includes nested native `cause.cause`; `getErrorCategory` / `getErrorSeverity` return real enum members; `isBaseError` and the other guards recognise instances from another installed copy of the package via a `Symbol.for` brand.
  - `HttpClientAbortError(request?, cause?, options?)` / `HttpClientNetworkError(message, request?, cause?, options?)` always treat the cause argument as the cause; `HttpClientError` defaults to category `network`, maps upstream status to 502 (429 passed through) and strips credentials/query from `url`.
  - `RequestBodyTooLargeError` is a 413; `TimeoutError` is only exposed by default for request timeouts; `ExternalServiceError` maps upstream 4xx to 502 (except 429); container/adapter registry errors and `RoutePatternError` are 500, not exposed and non-operational (`InvalidRoutePatternError` now extends `RoutePatternError`).
  - All HTTP status error classes use `ErrorCode.HTTP_*` members; new codes `CACHE`, `DATABASE_MIGRATION`, `RUNTIME`, `HTTP_CLIENT*`, `MESSAGE_BUS_DISPOSED` (the mis-cased `MESSAGE_BUSDisposed` member is deprecated). `storageNotFoundError` uses `STORAGE_NOT_FOUND`; `databaseMigrationError` uses `DATABASE_MIGRATION`.
  - `ErrorHandler` isolates reporter failures (`onReporterError` hook); `mapErrorType` accepts any error constructor; `createErrorMappingRule` / `mapErrorType` accept a declarative `ErrorMapping`; timeout factories accept an options object; `externalServiceUnavailableError` creates an `ExternalServiceError` (the `NetworkError` variant is `networkServiceUnavailableError`); `MethodNotAllowedError` serializes its methods; `cryptoSignatureError` picks its default message from the operation; enum guards use precomputed sets.
  - Packaging: `test` script, `vitest.config.ts`, `tsconfig.test.json` (tests are type-checked), `sideEffects: false`, source maps excluded from the tarball, stray self-referencing `errors` symlink removed.

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
