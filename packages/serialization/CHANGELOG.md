# @zudojs/serialization

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
