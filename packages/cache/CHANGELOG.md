# @zudojs/cache

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
