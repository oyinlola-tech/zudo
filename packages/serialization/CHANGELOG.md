# @zudojs/serialization

## 1.3.0

### Minor Changes

- Round 12 (academy findings) for the TYPES group.

  **Security default change — `@zudojs/errors` ([#38](https://github.com/oyinlola-tech/zudo/issues/38)).** `serializePublicError`, `ErrorSerializer.serializePublic` and `ErrorHandler.toPublicResult` no longer publish the metadata of an error just because it has `expose: true`. `expose` says the _message_ is safe for a client; the metadata of an exposed error (decline codes, upstream ids, internal state) was going out with it. Metadata is now published only for keys named in `publicMetadataKeys`, or, with the new opt-in `exposeMetadata: true` on `ErrorSerializerOptions` / `ErrorHandlerOptions`, for exposed errors as before (still redacted). If your API relied on exposed metadata reaching clients, set `publicMetadataKeys` (preferred) or `exposeMetadata: true`.

  - `@zudojs/errors` ([#111](https://github.com/oyinlola-tech/zudo/issues/111)): public serialization now carries `issues` for an exposable `ValidationError`, `SchemaError` or any exposed error with an `issues` array, with submitted values replaced by type descriptions (`PublicErrorResponse.issues`, `PublicErrorHandlerResult.issues`). Non-exposed errors never contribute issues.
  - `@zudojs/errors` ([#92](https://github.com/oyinlola-tech/zudo/issues/92)): `new ExternalServiceError("msg")` from JavaScript (or any call that omits the options object) constructs with `service: "unknown"` instead of throwing a `TypeError` from inside the error constructor. The TypeScript signature still requires `service`.
  - `@zudojs/errors` ([#133](https://github.com/oyinlola-tech/zudo/issues/133)): `ServiceUnavailableError` exposes its message by default, like `APIUnavailableError` and `RPCUnavailableError`; a 503 message is written for the client. Pass `expose: false` to keep it internal. Metadata is not exposed by this (see [#38](https://github.com/oyinlola-tech/zudo/issues/38)).
  - `@zudojs/errors` ([#39](https://github.com/oyinlola-tech/zudo/issues/39)): `BaseError.code` / `BaseErrorOptions.code` document that `ErrorCode | string` is a deliberately open set; narrow with `isErrorCode()` before an exhaustive `switch`.
  - `@zudojs/errors` ([#48](https://github.com/oyinlola-tech/zudo/issues/48), for `@zudojs/middleware` and `@zudojs/http`): `MiddlewareRateLimitError` is now a 429 with `ErrorCode.RATE_LIMITED` (was a 500 with `ERR_MIDDLEWARE_EXECUTION`), an exposed message, severity `WARNING`, `metadata { limit, windowMs, retryAfterMs }` and a `headers` property `{ "retry-after": "<whole seconds, at least 1>" }` that `@zudojs/http`'s error response copies onto the reply. `MiddlewareTimeoutError` is a 504 (code and `expose: false` unchanged). Anything matching the rate-limit error on `code === "ERR_MIDDLEWARE_EXECUTION"` must match `ERR_RATE_LIMITED` instead; nothing in the monorepo did.
  - `@zudojs/errors` (request from the HTTP group): `RouteConflictError(path, method, options?)` takes an optional third argument `{ message?, reason?, cause? }`. `reason` is recorded in `metadata.reason` and reported as "A route for METHOD /path conflicts with an existing route: <reason>"; `message` replaces the text entirely. Code and the two-argument form are unchanged.
  - `@zudojs/validation` ([#57](https://github.com/oyinlola-tech/zudo/issues/57)): `estimateSerializedSize` / `assertSizeWithinLimit` charge strings their UTF-8 size as JSON writes them (quotes and escapes included) instead of `length * 2`; a thousand "₦" estimated at 2,013 bytes against 3,002 on the wire, so a size limit let larger bodies through. Object keys are measured the same way. Estimates for non-ASCII payloads go up accordingly.
  - `@zudojs/validation` ([#58](https://github.com/oyinlola-tech/zudo/issues/58)): `validate()`, `isValid()`, `parse()` and the validators built from them throw `ConfigurationError` (not a bare `Error`) when the Zod schema has an async `refine`/`transform`, and the message names `validateAsync()`.
  - `@zudojs/validation` ([#59](https://github.com/oyinlola-tech/zudo/issues/59)): `ValidationRegistry` misuse (unknown rule, duplicate registration, empty name, rule without implementation) throws `ConfigurationError` with `component: "ValidationRegistry"`; message text is unchanged. `createValidationError()` defaults to `VALIDATION_INVALID_INPUT` instead of `VALIDATION_UNKNOWN` (the `ValidationError` constructor's default is unchanged). `not()` without a message says `Value must not satisfy the "one of" constraint.` rather than naming `one_of`; `combineConstraints()` lists the member messages; `everyItem()` says "Every item must satisfy: …"; `formatIssues()` prints a path-less issue without a leading colon.
  - `@zudojs/schema` ([#60](https://github.com/oyinlola-tech/zudo/issues/60)): `string().min()/max()/length()` count Unicode code points (an emoji is one character), matching `@zudojs/validation`'s `minLength`. The DoS ceiling on string length counts the same way. A string of astral characters that previously failed `min()` or passed `max()` by UTF-16 units may now be judged differently.
  - `@zudojs/schema` ([#61](https://github.com/oyinlola-tech/zudo/issues/61)): `isSchemaValidationError()` also recognises `@zudojs/validation`'s `SchemaValidationError` (any `BaseError` with `ERR_SCHEMA_VALIDATION` and an issue list), so an error mapper keyed on it keeps the `issues` of validation-package errors. Recognition uses `isBaseError`, so a second installed copy of `@zudojs/errors` is handled.
  - `@zudojs/schema` ([#72](https://github.com/oyinlola-tech/zudo/issues/72)): `schema.enum([...])` and `schema.literal(...)` use `const` type parameters, so their literal types survive when written inline inside `union([...])` or an object shape; `UnionSchema.parse()` now returns the literal union `Infer<>` promised instead of `string`.
  - `@zudojs/schema` ([#73](https://github.com/oyinlola-tech/zudo/issues/73)): `object()`, `array()`, `record()`, `map()`, `set()` and `intersection()` extend `ModifiableSchema`, so `.refine()`, `.optional()`, `.nullable()`, `.default()` and `.transform()` chain on them as on primitives.
  - `@zudojs/serialization` ([#74](https://github.com/oyinlola-tech/zudo/issues/74)): `SerializationMetadata.version` is documented as the envelope's wire-format version (`SERIALIZATION_SCHEMA_VERSION`), and `createEnvelope()` now throws `SerializationError` for a version this build cannot read back (previously `{ version: 2 }` was accepted and then refused by `unwrapEnvelope` in the same process). New optional `metadata.type` and `metadata.schemaVersion` carry the application's message name and shape version verbatim; `serializeToEnvelope()` takes them as a fifth argument, and `assertValidEnvelope()` checks their types.
  - `@zudojs/types`: new `characterLength(value)` (code points) and `jsonStringByteLength(value)` (UTF-8 bytes of `JSON.stringify(value)`), the shared helpers behind [#57](https://github.com/oyinlola-tech/zudo/issues/57) and [#60](https://github.com/oyinlola-tech/zudo/issues/60).
  - `@zudojs/constants` ([#36](https://github.com/oyinlola-tech/zudo/issues/36), [#40](https://github.com/oyinlola-tech/zudo/issues/40)): `createUserId`, `createEventId`, `createRequestId`, `createCorrelationId`, `createSessionId`, `createMessageId`, `createMessageCausationId` and `createTokenId` throw `InvalidConstantError` for an empty string or a non-string (the value is never echoed); new `assertIdentifier(id, label)`. `Brand<T, B>` documents that the brand is compile-time only and why the key is a string rather than a `unique symbol`.
  - `@zudojs/constants` ([#37](https://github.com/oyinlola-tech/zudo/issues/37)): `formatDuration(-90_000)` is "-1m 30s" instead of "-90000ms"; the two-unit truncation is documented.
  - `@zudojs/constants` ([#35](https://github.com/oyinlola-tech/zudo/issues/35)): the `Clock`/`Random`/`systemClock`/`systemRandom`/`createMockClock`/`createMockRandom` exports are marked `@deprecated` in favour of `@zudojs/types`, which owns them; nothing is removed.
  - `@zudojs/errors` ([#100](https://github.com/oyinlola-tech/zudo/issues/100)): `AdapterTimeoutError` answers `504` and `AdapterConnectionError` `503` (were `500`); both stay unexposed.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/validation@1.2.0
  - @zudojs/types@1.3.0
  - @zudojs/constants@1.2.0

## 1.2.3

### Patch Changes

- Fix graceful shutdown under `tsx watch`, make `generate middleware` produce a middleware the pipeline accepts, and answer an oversized request body with its 413.

  - **zudojs-cli: generated `src/server.ts` survives a second Ctrl+C.** The SIGINT/SIGTERM handlers were registered with `process.once`, so the `if (stopping) return` guard could never run. Under `npm run dev` (`tsx watch`), Ctrl+C delivers SIGINT twice. The second signal found no listener, and Node killed the process mid-shutdown before any graceful-shutdown log appeared. The handlers now use `process.on`. A repeated signal logs `Received SIGINT again: already shutting down.` while integrations drain, HTTP stops and the runtime stops. "Listening on …" is now logged after the handlers are registered. Every generated app uses this template: monolith, modular monolith, and the microservice gateway and services.
  - **zudojs-cli: `generate middleware <name>` writes an `HttpMiddleware` and registers it.** The schematic wrote `(ctx: unknown, next: () => Promise<void>) => Promise<void>`. Adding it to the pipeline failed tsc with TS2322, and it dropped the response `next()` produced. It now writes a function returning `HttpMiddleware` from `@zudojs/http` that returns `next()`'s response, and exports it from the `middlewares/index.ts` barrel. It also adds it to `src/server.ts` between the `zudojs:server-imports` and `zudojs:server-middleware` markers, so it runs after the security headers, CORS and rate limit and before routing. When the markers are missing, `server.ts` is left unchanged and the command prints the two lines to add by hand.
  - **@zudojs/errors: `SerializationPayloadTooLargeError` is an exposed 413 by default.** It was a 413 with `expose: false`, so `serializePublicError` answered an oversized request body with "An unexpected error occurred.". Its message holds only the two sizes, so it is now exposed. Like `SerializationDepthError`, it takes a third `{ statusCode?, expose? }` argument for a payload the server built itself.
  - **@zudojs/serialization: `serialize` keeps oversized output hidden.** `deserialize` bounds untrusted input, so an oversized string gets the exposed 413. The output of `serialize` was built by the server, so it now throws an unexposed 500 (`{ statusCode: 500, expose: false }`). `assertSizeWithinLimit` in `@zudojs/validation` guards untrusted input and now throws the exposed 413 without any change of its own.

  `@zudojs/serialization`: a too-deep payload found while restoring types in `deserialize` (`preserveTypes`) is now an exposed 400 (`UNTRUSTED_DEPTH_ERROR`) instead of a hidden 500, matching the parse-level depth guard.

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/constants@1.1.4
  - @zudojs/validation@1.1.2

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/validation@1.1.1

## 1.2.1

### Patch Changes

- Post-release fixes.

  - **database:** `new UserRepository(prisma.user)` with a real generated Prisma 7 client failed strict type-checking (TS2345). A generated delegate's methods are generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, …>)`) and their argument types (`select?: UserSelect | null`) cannot be assigned from one hand-written argument shape. `RepositoryDelegate` now accepts any argument list, the same way `PrismaClientLike.$transaction` already did, and still checks return types, so a delegate whose rows do not match the entity is still rejected. A generated delegate is passed with no cast. `BaseRepository#delegate` is typed by the new `RepositoryDelegateOperations`, the arguments the repository passes, so a subclass that calls `this.delegate.findMany({ where })` compiles as before.
  - **queue:** `QueueOptions.deadLetterStore` was typed `DeadLetterStore<never>`, so `createInMemoryDeadLetterStore()` (a `DeadLetterStore<unknown>`) and `createInMemoryDeadLetterStore<T>()` for a `Queue<T>` were both rejected with TS2322. It is now `DeadLetterStore<unknown>`, which accepts either with no annotation. A store already annotated `<never>` still compiles.
  - **container:** `registerClass(TOKEN, Service)` (and `{ useClass }`, `classProvider`, `provideClass`) with no `inject` list built a class whose constructor needs arguments, passing `undefined` for each one. 1.2.0 fixed this only for auto-registration. Registering is still allowed, but resolving now throws `ProviderResolutionError` naming the class, the parameter count and the `inject: [...]` fix. Constructors with no parameters, or only defaulted ones, are unaffected.
  - **runtime:** a failed stop published `runtime.failed` (`phase: "stop"`) twice, once from the shutdown sequence and once from the runtime. An `onShutdown` that outlives `shutdownTimeout` under `SIGTERM` now leaves the runtime `failed`, sets exit code 1 and publishes `runtime.failed` once. `RuntimeEventType` lacked `"runtime.initialized"` and `"runtime.starting"`, which `RuntimeEventMap` declares and the runtime publishes. It is now derived from the map (`keyof RuntimeEventMap`), and `RuntimeModuleEventType` from the `runtime.module.*` keys, so the two cannot drift again.
  - **serialization:** the `SerializeError` for a value JSON would write as `{}` said "a Error" and "a ArrayBuffer", and told the caller to "keep the built-in transformers enabled" even when they were on. It now uses the right article ("an Error"). It suggests the built-ins only when they are disabled and one of them handles the type. Otherwise it suggests registering a transformer.

  `@zudojs/runtime`: a module failure during startup publishes `runtime.failed` once (from startup, naming the failing module) instead of twice.

- [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - **@zudojs/schema:** issue messages and the `received` field now name `null`, arrays and `NaN` correctly. `object().safeParse(null)` said "Expected object, received object". It now says "received null". `string().safeParse([])` says "received array", and `number().safeParse(NaN)` says "received NaN". One shared helper covers every schema, including the coercion schemas.

  **@zudojs/serialization:** a deserialized `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `EvalError`, `URIError` or `AggregateError` is rebuilt with its own constructor, so `instanceof` holds. Any other name still falls back to `Error` with `name` set. A rebuilt error's `.stack` is now only its header line (`"TypeError: bad input"`). Before, it carried the deserializer's own frames, which made it look like the original stack. A wire stack sent with `includeStack` is still exposed as `originalStack`.

  **@zudojs/testing:** the overrides passed to `createStub()` are now own, enumerable properties of the stub, so `Object.keys`, spreading and `expect.objectContaining` see them. A stub no longer answers `asymmetricMatch` with a function, which made Vitest treat it as a matcher. `createSpyMethod(...).restore()` no longer clears `calls`, `results` and `errors`. It only puts the original method back.

  **@zudojs/logger:** `createLogger({ redact: false })` now turns off redaction. Before, `false` was spread into `{}` and redaction stayed on. `redact` accepts `true`, `false` or the existing options object, and `{ enabled: false }` still works.

## 1.2.0

### Minor Changes

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

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/validation@1.1.0
  - @zudojs/constants@1.1.2
  - @zudojs/types@1.2.0

## 1.1.1

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

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/validation@1.0.3
  - @zudojs/types@1.1.1
  - @zudojs/constants@1.1.1

## 1.1.0

### Minor Changes

- Round 10 fixes.

  - **data/SER-01 / cross/X-04 (security):** with `preserveTypes`, a plain object that has its own string `$type` key is written escaped as `{"$type":"Object","$value":{...}}` and read back as that plain object, so user data can no longer be revived as a `Map`, `Error`, `BigInt`, `Date` or `Buffer`. New export `ESCAPED_OBJECT_TAG` (`"Object"`), which `registerTransformer` refuses. Payloads written before this change remain readable (unescaped tags are revived as before). A tag whose transformer rejects it (for example `{"$type":"Date","$value":"nope"}`) now reads back as a plain object instead of making the record unreadable; with `strict: true` it throws `TransformerError` / `InvalidSerializedDataError`.
  - **data/SER-03 (DoS):** BigInt tags are limited to 4096 decimal digits and validated before `BigInt()` runs; serializing a larger BigInt throws `SerializeError`.
  - **data/SER-04:** failures throw `@zudojs/errors` classes: `SerializationPayloadTooLargeError`, `SerializationDepthError`, `InvalidSerializedDataError` (invalid JSON — now also outside strict mode, where a raw `SyntaxError` used to escape — and unknown or malformed tags under `strict`), `TransformerError`, and `SerializeError` for an invalid `Date` (previously a raw `RangeError`). Messages are unchanged.
  - **data/SER-05:** `createSerializer` accepts every serialize/deserialize option (`maxSize`, `maxDepth`, `strict`, `allowUnsafeKeys`, `includeStack`, ...) as an instance default.
  - **data/VAL-01:** `serialize({ preserveTypes: true })` handles sparse arrays (via the `@zudojs/validation` fix and an index loop).
  - **data/SER-03 (phase 2):** the BigInt digit bound now comes from `SerializationLimits.MAX_BIGINT_DIGITS` in `@zudojs/constants` (still 4096), shared with `@zudojs/schema`'s coercion.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `d2b01bf`, `5d6b957`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/types@1.1.0
  - @zudojs/validation@1.0.2

## 1.0.1

### Patch Changes

- - `JSONSerializer.serialize` / `deserialize` (and `createSerializer("json")`) honour an explicit `maxDepth` on the fast path too. It was only read when `preserveTypes` was on, so a per-call or per-instance depth limit was silently ignored for plain JSON.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/validation@1.0.1
  - @zudojs/constants@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Close 34 audit findings across the scheduler, schema, security and serialization packages.

  Several of these are behavioural changes. Code that compiles unchanged may now
  reject input it previously accepted, or accept input it previously rejected.

  ## @zudojs/security

  **Attack detection is no longer order-dependent.** `XSS_PATTERNS` and the
  internal null-byte and control-character patterns carried the `g` flag while
  being used with `RegExp.test`, which advances `lastIndex` and resumes from there
  on the next call. `containsXss`, `isSafeString` and `detectThreats` returned
  `false` on every second call for the same payload. The flag is gone, and
  `withoutStickyFlags` is exported so callers can normalise their own patterns.

  **`generateCspNonce` no longer throws.** It called `require("node:crypto")` from
  an ESM module; the import is now top-level. It also rejects a nonce shorter than
  16 bytes.

  **Cookies are validated before serialization.** `serializeCookie` and
  `createSecureCookie` now percent-encode the value and reject an unsafe name,
  attribute, `Max-Age` or `Expires`. `SameSite=None` and `Partitioned` require
  `Secure`.

  **Forwarding headers are no longer trusted by default.** `extractClientIp` took
  the leftmost `X-Forwarded-For` entry, which any client controls. It now takes
  `{ trustProxy, remoteAddress }` and walks in from the right; with no trusted
  proxies it uses the socket address.

  **Rate limiting is a real sliding window.** Denied requests no longer accrue
  into their own bucket, the window slides rather than resetting on a fixed
  boundary, the key store has a bound with least-recently-seen eviction, and
  `defaultHandler` applies when no handler is configured.

  **Request targets reject CR and LF**, literal or percent-encoded. Traversal
  detection now decodes to a fixed point instead of pattern-matching encoded
  forms, so `.%2e` and `%2e.` are caught.

  **`isSafeUrl` allowlists protocols and range-checks addresses** — 127.0.0.0/8,
  169.254.0.0/16, 100.64.0.0/10, 0.0.0.0/8, IPv4-mapped IPv6, `fc00::/7`,
  `fe80::/10` and internal hostname suffixes are blocked, and public 172.32+ is no
  longer blocked by mistake. `isPrivateHostname` is exported for post-resolution
  checks. This still cannot stop DNS rebinding; the docblock says so.

  **CSRF** cookies carry `Secure`, tokens are HMAC-SHA256 at full width rather
  than a truncated secret-suffix hash, `sessionId` binds a token to a session,
  `expiration` is enforced as a maximum age, and `verifyDoubleSubmit` compares the
  cookie and request tokens in constant time.

  **CORS** refuses a wildcard origin combined with credentials, emits
  `Vary: Origin` whenever the origin is reflected, normalises a `/g` regex origin,
  and can validate the requested method and headers.

  **`sanitizeObject`** keeps nested arrays as arrays, survives cycles, and stops
  at `maxDepth`.

  Smaller fixes: `sanitizeHeaderValue` strips every null byte; `Content-Length` is
  validated as `1*DIGIT` with an optional maximum; `validateBodyFraming` rejects
  `Content-Length` + `Transfer-Encoding` and conflicting lengths; body limits route
  on the parsed media type, so a form post gets the JSON limit rather than the
  100 MB upload limit; `generateSecurityHeaders` ships a default CSP and HSTS,
  sends `X-XSS-Protection: 0`, and rejects a config value containing CRLF.

  ## @zudojs/scheduler

  **`CronTrigger` implements cron.** It previously returned `after + 60_000` and
  never read the expression, so every cron job ran once a minute. There is now a
  real five-field parser with ranges, steps, lists, names and macros; invalid
  expressions throw at construction, and an unsupported timezone is rejected
  rather than ignored.

  **Recurring schedules recur.** Nothing re-enqueued them, so `every()` and
  `cron()` fired exactly once. One-shot schedules are now retired instead of
  leaking, and `MAX_SCHEDULES` is enforced.

  **`ScheduleHandle` is bound to its scheduler.** `pause`, `resume` and `cancel`
  were no-ops on a detached object and `nextRun()` always returned `undefined`.

  **Job failures are reported and jobs are cancellable.** The empty catch block is
  replaced by an `onError` hook; `RetryPolicy` is implemented (fixed, linear and
  exponential backoff with `maxDelay` and jitter); executions run under a real
  `AbortController` that a timeout or `stop()` can fire; concurrency is bounded by
  `maxConcurrency`; and `OverlapPolicy` is applied. `stop()` is now async and takes
  `{ drain, timeoutMs }`.

  Smaller fixes: `parseDuration` supports `ms` and `w` and compound values, and
  rejects zero, negative and out-of-range durations that produced an Invalid Date
  whose `NaN` timestamp corrupted heap ordering; `PriorityQueue.enqueue` refuses a
  non-finite `nextRunAt`; a past fire time follows the misfire policy instead of
  throwing; timeouts raise `SchedulerJobTimeoutError` and carry the original error
  as `cause`; the scheduler and executor share one clock; and `define()` validates
  the job.

  `Scheduler` now takes an options object. The positional form still works.

  ## @zudojs/schema

  **Discriminated unions work.** The lookup was keyed on `schema._type` — the
  string `"object"` for every variant — so no input ever matched. Variants are now
  keyed on the literal value at the discriminator, with duplicate and missing
  literals rejected at construction.

  **Depth and cycle guards are wired up.** `isMaxDepthExceeded` was exported and
  never called, and `ctx.seen` was threaded through every context and never read.
  Composite schemas now enforce both. The internal failure signal is a dedicated
  class, so a bare `catch {}` no longer swallows a `RangeError` from stack
  exhaustion and reports circular input as a success.

  **`.default()` applies to a missing object key.** A defaulted property was
  classified as required, so it could never be omitted.

  **`.passthrough()` passes keys through** — it behaved identically to `.strip()`.
  `pick`, `omit`, `partial`, `required`, `extend` and `merge` now carry the
  unknown-key strategy and required-key set.

  Smaller fixes: an unrecognised format string throws instead of disabling the
  check; `.regex()` strips `g`/`y`; strings and arrays get default length bounds
  before any pattern runs; coercion accepts the documented `"1"`/`"0"` boolean
  strings and rejects empty, `Infinity`, hex and symbol input, and coerced values
  can now be constrained; union failures carry per-branch reasons; intersection
  refuses to spread primitives; tuple elements stay aligned when one fails; Map and
  Set entries get their own issue paths; object shape keys use a `hasOwnProperty`
  guard; `multipleOf` tolerates floating-point representation and rejects a zero
  step; records use the parsed key; and `schema.bigint()` and `schema.symbol()` are
  implemented rather than throwing "not yet implemented".

  ## @zudojs/serialization

  **Prototype pollution is fixed.** `restoreValue` and `transformValue` assigned
  `result[key]`, so a `__proto__` key replaced the reconstructed object's
  prototype. Both now use `defineProperty` and drop forbidden keys.
  `allowUnsafeKeys` — declared with zero references — is implemented, and reinstates
  them as real own properties.

  **An unknown `$type` tag is data, not a crash.** Any peer could stop a consumer
  with `{"$type":"anything"}`, and legitimate payloads carrying a `$type` field
  were unparseable. Strict mode still reports it. `deserialize` is now
  size-bounded; `maxSize` previously applied only on the way out.

  **Map and Set round-trip their children.** Deserialization dispatched to the
  transformer without restoring children first, so a Map of Dates came back full
  of raw `{$type, $value}` objects.

  **Error stacks are opt-in** via `includeStack`, and a wire-supplied stack is
  carried as `originalStack` rather than overwriting the real one.

  **Envelope metadata is enforced**: the schema version is checked, malformed
  envelopes raise a domain error, `contentType` is derived from the format,
  an unsupported encoding is rejected, and `createSerializer`'s `pretty` and
  `preserveTypes` options are applied instead of discarded.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/types@0.2.0
  - @zudojs/validation@0.2.0

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
  - @zudojs/types@1.0.0
  - @zudojs/validation@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/validation@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/validation@0.1.1
