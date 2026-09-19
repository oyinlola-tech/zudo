---
"@zudojs/cache": minor
---

Round 10 fixes:

- data/SER-02: `JsonCacheSerializer` no longer deserializes in `strict` mode, so a cached value carrying its own `$type` field (a domain discriminator) reads back unchanged instead of making every `get` throw. With the `@zudojs/serialization` escaping from this round, values whose `$type` collides with a built-in tag (`"Date"`, `"Map"`) round-trip too. The stale comment claiming the serializer ignored `allowUnsafeKeys` is gone. `stripUnsafeKeys` now runs only on the `preserveTypes: false` path; the type-preserving path relies on the serializer's own filtering.
- INF-07: new opt-in `CacheConfig.tagStore` accepts any `CacheTagStore`, so replicas sharing one adapter can share tag mappings and `invalidateByTag` reaches entries written by other instances. `CacheTagStore.removeKey`/`clear` may now return a promise and are awaited, and a new optional `trackedKeys()` lets pattern clears drop stale mappings. An injected store is never flushed by `disconnect()`.
- INF-08: an empty-string namespace is rejected with `CACHE_INVALID_KEY`, both in the config (`CacheService`, `DefaultKeyBuilder`) and per call (keys, patterns, tags, locks). It used to become "no namespace" and fall into the shared global keyspace.
- INF-12: when a lock's `release()` throws after the critical section already failed, the critical section's error is rethrown and the release error is attached to it as a non-enumerable `suppressed` property. It used to be replaced by the release error.

Behaviour changes: `namespace: ""` now throws. Values with a `$type` field are readable.
- **infra/SER-02 residual (phase 2):** `stripUnsafeKeys` (and so `JsonCacheSerializer` with `preserveTypes: false`) uses `SCHEMA_FORBIDDEN_KEYS` from `@zudojs/constants` instead of a local copy of the list. Same three keys; no behaviour change.
