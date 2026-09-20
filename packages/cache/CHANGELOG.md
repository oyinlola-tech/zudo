# @zudojs/cache

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
