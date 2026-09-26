# @zudojs/cache

## 1.2.4

### Patch Changes

- Round 12 (academy findings) — INFRA group: cache, container, logger, observability.

  **@zudojs/container**

  - `registerClass(token, Class, { inject })`, `classProvider(Class, inject)` and `provideClass(token, Class, inject)` now type-check the `inject` list against the constructor, the way `registerFactory` already did ([#42](https://github.com/oyinlola-tech/zudo/issues/42)). `inject: [CLOCK, DB]` against `constructor(db: Db, clock: Clock)` is a compile error, and so is omitting `inject` for a constructor with required parameters (which threw `ProviderResolutionError` at resolve time). Untyped string/symbol tokens check nothing, a non-tuple `ProviderToken[]` built at runtime accepts any constructor, and defaulted/optional parameters beyond the list are fine, so code that worked keeps compiling. New exported types: `InjectedConstructor`, `InjectedConstructorArgs`; `RegisterClassOptions` gained an optional `Deps` type parameter (defaulting to the old shape).
  - A missing dependency's error chain now ends at the missing token ([#62](https://github.com/oyinlola-tech/zudo/issues/62)): `Failed to resolve DueTodayReminder: No registration found for token "MAILER" (required by "DueTodayReminder"). (chain: DueTodayReminder -> MAILER)`, and `DependencyResolutionError.chain` includes it. The top-level `RegistrationNotFoundError` message is unchanged.
  - Documented that `autoRegisterClasses` treats a constructor whose parameters all have defaults (or a rest parameter) as zero-arg — it is auto-registered and built with no arguments, defaults applied, nothing injected ([#69](https://github.com/oyinlola-tech/zudo/issues/69)) — and that every `register*` call except `registerValue` defaults to `ContainerScope.TRANSIENT` ([#129](https://github.com/oyinlola-tech/zudo/issues/129)).

  **@zudojs/logger**

  - An `Error` nested inside metadata or context (`logger.error("x", { cause: err })`) is normalized when the entry is built into plain data — `{ name, message, stack, ...ownFields, cause }`, own fields redacted like any metadata, a self-referential `cause` becoming `"[Circular]"` — so a custom transport that stringifies `entry.metadata` sees the error instead of `{}` ([#67](https://github.com/oyinlola-tech/zudo/issues/67)). The built-in formatters render the same output as before, including `includeStackTrace: false` leaving nested stacks out. New exports: `LOGGER_ERROR_VALUE`, `isLogErrorValue()`, `LogErrorValue`. `redactLogValue()` applies the same normalization to Errors it meets.
  - The `Logger` level methods keep their single `(message, metadata?)` signature (a widened union broke structural consumers in an earlier release); the README now documents that `logger.error(message, err)` works at runtime and that the typed form is `log(level, message, { error, metadata })`, and notes that this package's default redaction and `@zudojs/core`'s `createLogRedactor` are separate APIs ([#118](https://github.com/oyinlola-tech/zudo/issues/118)).

  **@zudojs/observability**

  - `LogRecord` gained optional `requestId` and `correlationId`, stamped from the active `PropagationContext` alongside `traceId`/`spanId` (and omitted under `correlate: false`); the console log exporter writes them ([#123](https://github.com/oyinlola-tech/zudo/issues/123)).

  **@zudojs/cache**

  - Key-validation errors now report the operation that rejected the key (`get`, `set`, `lock_acquire`, `clear`, …) instead of `unknown`, in `error.operation`, `toJSON()`, batch results and `cache.error` events ([#140](https://github.com/oyinlola-tech/zudo/issues/140)).
  - Under the default `:` separator a key containing `:` is still rejected — `a:b` would collide with key `b` in namespace `a`, and a namespace-scoped `clear` would reach it — but the message now says why and what to do (use the `namespace` option, use `.`/`-` inside a part, or configure a different separator) ([#130](https://github.com/oyinlola-tech/zudo/issues/130), [#120](https://github.com/oyinlola-tech/zudo/issues/120)). `CACHE_KEY_PATTERN` and `CACHE_PATTERN_PART_PATTERN` now include `:`; the active separator is rejected separately, so `:` is usable inside keys only under another separator (`config: { separator: "/" }` plus `createMemoryCacheAdapter({ separator: "/" })`), where it cannot collide with the scope structure.
  - Documented that `get<TValue>()` is an unchecked assertion ([#5](https://github.com/oyinlola-tech/zudo/issues/5)).

- Updated dependencies []:
  - @zudojs/errors@1.4.0
  - @zudojs/serialization@1.3.0
  - @zudojs/types@1.3.0
  - @zudojs/constants@1.2.0

## 1.2.3

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/serialization@1.2.3
  - @zudojs/constants@1.1.4

## 1.2.2

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/constants@1.1.3
  - @zudojs/serialization@1.2.2

## 1.2.1

### Patch Changes

- [`397d66e`](https://github.com/oyinlola-tech/zudo/commit/397d66ed948ec06185b2eb392a1b364538a6b944) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - `ttl()` never reports `0` for a key that is still present. Rounding the remaining time down to whole milliseconds (new in 1.2.0) made a key in its last fraction of a millisecond read as `0`, which callers use to mean "expired"; it now reads as `1`.
- Updated dependencies [`e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/serialization@1.2.1

## 1.2.0

### Minor Changes

- **@zudojs/queue**

  - Polling honours `pollInterval` on every poll, not only the first. Unset, polls start at 50 ms and back off to 2000 ms while idle, as before. Work no longer waits for the next poll: `add()`, a delayed job coming due, an elapsed retry backoff, `resume()`, `process()`, `releaseJob()`, a reclaimed stalled job and a finished job all wake the poller at once. 40 instant jobs at concurrency 1 used to take about 2 s and now finish in tens of milliseconds, and a job added after an idle spell starts immediately instead of after up to 2 s.
  - New optional `Queue.onJobReady(listener)`, implemented by the in-memory queue. A `Worker` subscribes on `start()` and unsubscribes on `stop()`, so an idle worker claims a newly added job at once. `WorkerOptions.pollInterval` now bounds only how often an idle worker re-checks.
  - **Behaviour change: process lifetime.** Pending work keeps the Node.js process alive. While a queue has waiting, delayed, retrying or running jobs that one of its processors can run, its poll timer is referenced, so a script whose only work is a queue no longer exits before the jobs run. A started `Worker` keeps the process alive until `stop()` or `forceStop()`. An idle queue, a paused one, work that no processor handles, and a closed queue never hold the process open. Pass `keepAlive: false` (new on `QueueOptions` and `WorkerOptions`) to get back the old unreferenced timers.
  - **Behaviour change: payloads.** The default `JsonSerializer` now preserves types, so a `Date` in a payload reaches the processor as a `Date`, matching `Queue<{ d: Date }>`. `BigInt`, `Map`, `Set`, `Uint8Array` and `Error` round-trip too; `BigInt` used to be rejected and `Map`/`Set` flattened to `{}`. Output for plain JSON data is unchanged. `createJsonSerializer()` now defaults to `preserveTypes: true` as well; pass `preserveTypes: false` for plain JSON, where a `Date` becomes its ISO string.
  - `PassthroughSerializer` really passes payloads through. It carries the new `Serializer.passthrough` marker, and the in-memory queue stores such payloads by reference (class instances included), as with `serializePayloads: false`. Used standalone it still returns strings unchanged and JSON-encodes anything else, because the `Serializer` contract requires a string.
  - **Behaviour change: ordering.** Within a priority, a job is ordered by when it became runnable: when it was added, or when a delayed job's delay elapsed. A delayed job no longer jumps ahead of jobs that were already waiting when it came due. Priority still wins first, as documented. A retried job keeps its original place in line.
  - New 1-based `JobContext.attemptNumber` (`job.attempt + 1`), matching `ctx.attempt` in `@zudojs/scheduler`. `job.attempt` keeps its meaning (the number of attempts already made, `0` on the first run) because `shouldRetry`, `calculateRetryDelay`, `job:retrying` and `DeadLetterJob.attempts` are all built on it. Both are now documented.
  - `queue.events` works without configuration: a queue created without an `eventEmitter` gets an in-memory emitter (it used to get a silent no-op).

  **@zudojs/scheduler**

  - **Behaviour change: process lifetime.** A started scheduler keeps the Node.js process alive until `stop()`. Its timer used to be unreferenced, so a script that only ran a scheduler exited 0 with nothing run. The new `SchedulerOptions.keepAlive: false` restores the old behaviour.
  - `stop()` is idempotent. On a scheduler that never started, or one already stopped, it resolves (after waiting for any execution still settling) instead of rejecting with `SchedulerStoppedError`.
  - `Clock` is exported from the package root (`import type { Clock } from "@zudojs/scheduler"`); it used to fail with TS2305.
  - `CronParseError` messages are no longer garbled. The parser passed the reason and the expression in swapped order, producing `Invalid cron expression "Cron field "minute" value 99 is outside 0-59": 99 0 * * *.`; it now reads `Invalid cron expression "99 0 * * *": Cron field "minute" value 99 is outside 0-59.` The `expression` and `reason` metadata fields are swapped back into place too.
  - `getExecutions()` records the real attempt: `3` for a run that succeeded on its third attempt (it always said `1`). While a run is in flight the record shows the attempt in progress. `JobExecutor.execute` takes an optional seventh `hooks` argument (`{ onAttempt }`) that reports each attempt as it starts.
  - New `JobContext.attemptNumber`, an alias of the 1-based `ctx.attempt` under the name `@zudojs/queue` uses.

  **@zudojs/messaging**

  - **Behaviour change: cancellation.** An abort during the last or only handler now fails the dispatch with `MessageDispatchAbortedError` (`success: false`), even if that handler returns normally. It used to be reported as `success: true`. As with a timeout, the dispatch settles promptly and does not wait for a handler that ignores its signal. `handlerResults` still lists every handler that finished. This applies to both the bus and a dispatcher used directly.
  - `send(input, { context: { correlationId, causationId } })` puts those identifiers on the message it builds, unless the input carries its own. `createDerivedMessage` in a handler therefore continues the chain instead of starting a new one.

  **@zudojs/cache**

  - `getStats().errors` counts rejected input: an invalid key, namespace, pattern or tag now counts and emits `cache.error`, as an invalid TTL already did. `failSilently` still never hides invalid input.
  - **Behaviour change: error codes.** An invalid tag (`tags: [""]`, or one over-long or containing NUL) throws `ERR_INVALID_INPUT` (`ErrorCode.INVALID_INPUT`), the same code as an invalid key. It used to be `CACHE_OPERATION_FAILED`, which reads as an adapter fault.
  - Docs: the README said invalid keys throw `CACHE_INVALID_KEY`, but no such code has ever been thrown; the code is and remains `ERR_INVALID_INPUT`, so existing `code` checks keep working. The README now says so.
  - `ttl()` returns whole milliseconds, rounded down, on both the service and the memory adapter. It used to return values like `9999.52…` straight after `set({ ttl: 10_000 })`.

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/serialization@1.2.0
  - @zudojs/constants@1.1.2
  - @zudojs/types@1.2.0

## 1.1.1

### Patch Changes

- Cache and database correctness fixes.

  - `CacheService.invalidateByPattern` now awaits the tag purge it triggers, matching `clear()`. With an asynchronous tag store (a shared, Redis-backed one, for example) the tag-to-key mappings for the invalidated keys are now guaranteed to be gone by the time the call resolves, and a failure from the tag store is reported to the caller — or swallowed under `failSilently` — instead of escaping as an unhandled rejection that would terminate the process.
  - `toPrismaInclude` now validates one include level per frame, so its depth bound actually applies to the nested tree. A deeply nested `include` is refused with the documented `RangeError: Relation include depth exceeds the maximum of N` rather than overflowing the stack.
  - `toPrismaInclude` no longer treats a relation or `select` field whose name happens to be an `Object.prototype` member (`toString`, `valueOf`, `constructor`, `__proto__`, …) as a duplicate or silently drops it. Such names are now handled as ordinary keys.
  - `getOrSet` in the database cache no longer poisons a key permanently when the loader throws synchronously rather than returning a rejected promise. The failed load is evicted from the in-flight map and the next call invokes the loader again, as it already did for asynchronous failures.

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1
  - @zudojs/serialization@1.1.1
  - @zudojs/constants@1.1.1

## 1.1.0

### Minor Changes

- Round 10 fixes:

  - data/SER-02: `JsonCacheSerializer` no longer deserializes in `strict` mode, so a cached value carrying its own `$type` field (a domain discriminator) reads back unchanged instead of making every `get` throw. With the `@zudojs/serialization` escaping from this round, values whose `$type` collides with a built-in tag (`"Date"`, `"Map"`) round-trip too. The stale comment claiming the serializer ignored `allowUnsafeKeys` is gone. `stripUnsafeKeys` now runs only on the `preserveTypes: false` path; the type-preserving path relies on the serializer's own filtering.
  - INF-07: new opt-in `CacheConfig.tagStore` accepts any `CacheTagStore`, so replicas sharing one adapter can share tag mappings and `invalidateByTag` reaches entries written by other instances. `CacheTagStore.removeKey`/`clear` may now return a promise and are awaited, and a new optional `trackedKeys()` lets pattern clears drop stale mappings. An injected store is never flushed by `disconnect()`.
  - INF-08: an empty-string namespace is rejected with `CACHE_INVALID_KEY`, both in the config (`CacheService`, `DefaultKeyBuilder`) and per call (keys, patterns, tags, locks). It used to become "no namespace" and fall into the shared global keyspace.
  - INF-12: when a lock's `release()` throws after the critical section already failed, the critical section's error is rethrown and the release error is attached to it as a non-enumerable `suppressed` property. It used to be replaced by the release error.

  Behaviour changes: `namespace: ""` now throws. Values with a `$type` field are readable.
  - **infra/SER-02 residual (phase 2):** `stripUnsafeKeys` (and so `JsonCacheSerializer` with `preserveTypes: false`) uses `SCHEMA_FORBIDDEN_KEYS` from `@zudojs/constants` instead of a local copy of the list. Same three keys; no behaviour change.

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`, `5d6b957`, `d2b01bf`]:
  - @zudojs/constants@1.1.0
  - @zudojs/errors@1.1.0
  - @zudojs/serialization@1.1.0
  - @zudojs/types@1.1.0

## 1.0.1

### Patch Changes

- - `set()` on an existing key now replaces the key's tag mappings instead of accumulating them. Previously `set("k", v, { tags: ["a"] })` followed by `set("k", v2, { tags: ["b"] })` left `k` reachable by `invalidateByTag(["a"])`, so a stale tag could delete the new value.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/serialization@1.0.1

## 0.2.0

### Minor Changes

- [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix a tenant-isolation break in pattern operations, a ReDoS in glob translation, and scope tags and locks to their namespace.

  This closes 29 audit findings, one critical. Several are breaking; read before
  upgrading.

  **Pattern operations escaped tenant scoping (critical).** `build()` validated
  every key part, but `buildPattern()` validated nothing — so an untrusted
  `namespace` reaching `clear({ namespace })` or `invalidateByPattern()` could
  break out of its scope and wipe the entire cache. Validation is now symmetric:
  `clear({ namespace })`, `invalidateByPattern()` and `buildPattern()` throw
  `CacheError` (400) for a namespace outside `/^[a-zA-Z0-9._-]+$/`, for a pattern
  containing the separator or characters outside that alphabet plus `*`/`?`, for
  an empty pattern, and for a composed pattern over 256 characters.

  **ReDoS in glob translation.** The same unvalidated string reached
  `globToRegExp`, whose unbounded `*`→`.*` translation is catastrophically
  backtracking — a 24-star pattern hung the process for over 30 seconds in a live
  test. Now bounded, with a timing-bounded regression test.

  **Glob `*` no longer crosses the key separator.** `*` and `?` are segment-local;
  `**` spans segments. `invalidateByPattern("*")` on a namespace-less service used
  to delete every namespaced key and now deletes only un-namespaced ones — use
  `"**"` for the old behaviour. This is the change most likely to alter what your
  invalidations actually clear, so audit your patterns.

  **Tags are namespace-scoped.** `CacheTagOptions.namespace` was named `_options`
  and discarded in all four tag methods, so tags were a flat global map and one
  tenant's `invalidateByTag(["users"])` deleted another tenant's entries. A tag
  registered under namespace _N_ is now visible only to
  `invalidateByTag(..., { namespace: N })`. **Code that tagged under a namespace
  and invalidated without one — or the reverse — will now clear nothing.** Tags
  are also validated (non-empty, ≤128 chars, no NUL).

  **Locks are namespace-scoped and key-builder-qualified.** `CacheLockOptions.namespace`
  was read nowhere and lock keys bypassed the key builder entirely. `withLock("x")`
  now locks `prefix:namespace:x` and validates `x` as a key part, so a lock name
  containing `:` throws.

  **`withLock` no longer fails silently.** It discarded `release()`'s boolean —
  the only signal that a lease expired mid-critical-section — and had no lease
  renewal, so mutual exclusion could break with nothing reported. It now throws
  `CACHE_LOCK_LOST` (409) when the lease was lost, and `CACHE_DISABLED` (503) when
  `enabled: false`. The callback may receive an `AbortSignal`.

  **`JsonCacheSerializer` preserves types by default** (`preserveTypes: true`),
  changing the stored representation for `defaultSerializer`; pass
  `{ preserveTypes: false }` for the old behaviour. Deserialization strips
  `__proto__`, `constructor` and `prototype` keys.

  **The memory adapter is now LRU with a byte budget.** Reads refresh recency and
  entries evict once the estimated total exceeds `maxBytes` (default 50 MB), so a
  cache of very large values holds fewer entries than `maxEntries` suggests.
  `DEFAULT_MAX_MEMORY_BYTES` was exported with a docstring and read nowhere.

  **Removed exports:** `getSerializer`, `CacheStats.size` (it was always
  `undefined` — use `await cache.size()`), and the dead types `CacheResult`,
  `CacheValue`, `SerializableCacheValue`, `CacheExpirationInfo`, `CacheKeyParts`,
  `CacheEntryMetadata`, `CacheAdapterFactory` and a duplicate local
  `CacheErrorOptions`. `CacheErrorCode` members now match the codes the package
  actually emits — no error ever set `code` before.

  **Newly reachable:** the event surface (`CacheService.subscribe()`) and the
  middleware pipeline were both unreachable from `CacheService`. Also new:
  `batch()`, `size()`, `getLatencyStats()`, `getLatencyHistogram()`,
  `getHotKeys()`, `resetStats()`, `CacheConfig.middlewares`,
  `CacheConfig.lockStore`, `set(..., { metadata })`, a populated
  `CacheGetResult.entry`, namespace options on `invalidateByTag`/
  `invalidateByPattern`/`withLock`, `createMemoryCacheAdapter({ maxBytes, separator })`,
  `estimateValueBytes`, `stripUnsafeKeys`, `assertValidTag`, `CacheHealth.disabled`,
  and a populated `CacheSetEvent.ttl`.

  **Also fixed without an API change:** unbounded `keyToTags` growth after
  `invalidateByTag`; `getHotKeys()` freezing permanently at 1024 keys; the
  middleware chain skipping middlewares on a second `next()` and laundering
  `undefined` into a typed result; `failSilently` not applying to
  `clear`/`ttl`/`expire`/`invalidate*`; lock acquisition reporting contention as a
  store failure; entries expiring one millisecond late. Expiry and lock leases now
  use a monotonic clock, so a backward NTP step no longer extends TTLs.
  `disconnect()` clears in-flight computations and tag mappings.

  The README's only example was wrong on every line — including `if (!user)`
  against a `{ hit, value }` result, which type-checks and produces a cache that
  never fills. It has been rewritten and verified.

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/serialization@0.2.0
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
  - @zudojs/errors@1.0.0
  - @zudojs/serialization@1.0.0
  - @zudojs/types@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/serialization@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/serialization@0.1.1
