---
title: "@zudojs/cache — Caching, Adapters & Invalidation"
description: "@zudojs/cache reference: CacheService, memory adapter, tag-based invalidation, distributed locking, metrics and middleware for ZudoJS apps."
source: https://zudojs.oyinlola.site/docs/packages-cache
---

v1.2.0

# @zudojs/cache

Keep copies of slow results so you can serve them again fast, with expiry, tags, locks and per-tenant scoping.

CACHING TTL INVALIDATION LOCKING

## OVERVIEW

A *cache* is a small, fast store where you keep copies of results that were expensive to produce: a database row, an API response, a rendered page. The next time you need the same result, you read the copy instead of doing the slow work again.

`@zudojs/cache` gives you one object, a `CacheService`, with `get`, `set`, `delete` and a few helpers. Behind it sits an *adapter*, which is the actual storage. The package ships an in-memory adapter. To use Redis or another store, you implement the `CacheAdapter` interface and pass it in.

On top of plain storage it adds what real apps need: entries that expire on their own (TTL), tags that let you delete related entries together, locks so two workers do not run the same slow job at once, and namespaces that keep one tenant's data away from another's.

When you need it

- The same slow read happens many times.
- Many users see the same data (product lists, settings, flags).
- You want to stop duplicate work under load.
- Your app serves several tenants and each needs its own scope.

When you don't

- The data changes on every request.
- You must not lose the data. A cache can drop entries at any time; use a database.
- You need one cache shared by several processes and have no adapter for a shared store yet. The memory adapter lives in a single process.

## INSTALLATION

Install the package. It pulls in `@zudojs/errors`, `@zudojs/types` and `@zudojs/serialization` on its own. It needs Node 24 or newer.

```bash
$ npm install @zudojs/cache
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This creates a cache backed by memory, stores one value for 60 seconds, and reads it back. The `{ name: string }` in angle brackets tells TypeScript what type the value has.

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({
  adapter: createMemoryCacheAdapter(),
  config: { defaultTtl: 60_000 }, // entries live for 60 seconds
});

await cache.set("user.123", { name: "Alice" });

const result = await cache.get<{ name: string }>("user.123");
console.log(result.hit, result.value);
// true { name: "Alice" }

const missing = await cache.get("user.999");
console.log(missing.hit, missing.value);
// false null
```

A read that finds the entry is a *hit*; one that does not is a *miss*. `get` never returns the value on its own. It returns an object, and you check `hit` before you trust `value`.

> WATCH OUT
>
>
>
> The key is `user.123` with a dot, not `user:123`. The colon is reserved. The next section explains why.

## KEYS AND NAMESPACES

A *key* is the name you store a value under. Before the key reaches the adapter, a *key builder* turns it into a full key of the form `prefix:namespace:key`. The default prefix is `zudojs` and the default separator is `:`, so `set("user.123", ...)` is stored as `zudojs:user.123`.

Every part is checked. A part may only contain letters, digits, `.`, `_`, `-` and `:`, and it must not contain the active separator — so with the default `:` separator a part never contains `:`. The full key may be at most 256 characters. A bad key throws a `CacheError` right away, with code `ERR_INVALID_INPUT` and `statusCode` 400; since v1.2.4 its `operation` names the call that rejected it (`get`, `set`, `lock_acquire`, `clear`, …) instead of `unknown`, and the message explains the separator rule. Since v1.2.0 that rejection is also counted in `getStats().errors` and emitted as a `cache.error` event, like an invalid TTL.

The separator is the only thing that marks where the namespace ends and your key begins. If your key could contain it, `set("admin:x")` would land inside the `admin` namespace and `clear({ namespace: "admin" })` would delete it. Rejecting the separator in each part closes that hole. If your keys must contain `:` (keys built by another library, say), change the separator on both the service and the memory adapter — `createCacheService({ adapter: createMemoryCacheAdapter({ separator: "/" }), config: { separator: "/" } })` stores `set("tenant:kola:dashboard")` as `zudojs/tenant:kola:dashboard`, and `:` can no longer collide with the scope structure.

You can see what the key builder produces by using it directly.

```ts
import { createKeyBuilder } from "@zudojs/cache";

const keys = createKeyBuilder({ prefix: "myapp" });

console.log(keys.build("user.1"));
// "myapp:user.1"
console.log(keys.build("user.1", { namespace: "auth" }));
// "myapp:auth:user.1"

keys.build("user:1");
// throws CacheError (code ERR_INVALID_INPUT): Invalid cache key part "user:1"
```

### Namespaces and tenant isolation

A *namespace* is a label that groups a set of keys. Two entries with the same key but different namespaces are different entries. A *tenant* is one customer or organisation in an app that serves many; giving each tenant its own namespace keeps their cached data apart.

You can set the namespace once for a whole service with `config.namespace`, or per call with `{ namespace }`. Reads, writes, `clear`, tag invalidation and locks all stay inside the namespace they were given. An empty-string namespace is rejected in the config and per call, so a tenant id that resolved to `""` never falls into the global keyspace. The error is a `CacheError` with code `ERR_INVALID_INPUT` and `statusCode` 400, the same one an invalid key throws.

This stores the same key under two tenants and then clears only one of them.

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

await cache.set("u1", { name: "Alice" }, { namespace: "tenant-a" });
await cache.set("u1", { name: "Bob" },   { namespace: "tenant-b" });

const a = await cache.get("u1", { namespace: "tenant-a" });
const b = await cache.get("u1", { namespace: "tenant-b" });
console.log(a.value, b.value);
// { name: "Alice" } { name: "Bob" }

console.log(await cache.clear({ namespace: "tenant-a" }));
// { cleared: 1 }
console.log(await cache.has("u1", { namespace: "tenant-b" }));
// true

// A namespace is validated like a key part, so a wildcard is rejected.
await cache.clear({ namespace: "*" });
// throws CacheError
```

For one service per tenant, pass the namespace in the config and drop it from every call.

```ts
const tenantA = createCacheService({
  adapter: createMemoryCacheAdapter(),
  config: { namespace: "tenant-a" },
});
await tenantA.set("u1", { name: "Alice" }); // stored as zudojs:tenant-a:u1
```

> DANGER
>
>
>
> A namespace that comes from a request (a tenant id, a header) is safe to pass in: the cache validates it and throws rather than widening the operation. The one thing it cannot do is guess the right tenant for you. Always pass the namespace on every call, or use one service per tenant.

**Common mistake:** building keys with a colon, such as `\`user:${id}\`` or a tenancy helper's `tenant:kola:dashboard`. Use a dot or a dash inside a key and let the `namespace` option carry the scope (`get("dashboard", { namespace: tenantId })`), or configure a different separator as shown above.

## TTL: HOW LONG AN ENTRY LIVES

*TTL* stands for time to live. It is the number of milliseconds an entry stays valid after you store it. When the time is up, the entry is treated as missing. The default is 5 minutes (`DEFAULT_TTL_MS`).

You set it once with `config.defaultTtl` and override it per call with `{ ttl }`. Pass `null` for an entry that never expires. A TTL of 0, a negative number, or more than 24 hours (`MAX_TTL_MS`) throws.

Expiry is lazy: nothing runs on a timer. An expired entry is dropped the next time it is read or when the adapter makes room. The memory adapter also evicts the least recently used entries once it holds more than `maxEntries` (10,000) or roughly `maxBytes` (50 MB).

This stores two entries with different lifetimes, checks how long they have left, and extends one.

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

await cache.set("timed",   "v", { ttl: 10_000 });
await cache.set("forever", "v", { ttl: null });

console.log(await cache.ttl("timed"));   // 9998 (whole milliseconds left, rounded down; yours may differ slightly)
console.log(await cache.ttl("forever")); // null  (never expires)
console.log(await cache.ttl("missing")); // undefined (no such key)

console.log(await cache.expire("timed", 60_000)); // true, now ~60 s left

await cache.set("bad", "v", { ttl: 0 });
// throws CacheError
```

> TIP
>
>
>
> Timers use a monotonic clock, so a system clock jump does not stretch or shorten a TTL. `set` returns `{ success, key, expiresAt }`; `expiresAt` is a `Date` for display only.

**Common mistake:** writing `ttl: 0` to mean "keep forever". Zero is rejected. Use `ttl: null`.

## GETORSET: READ, OR COMPUTE AND STORE

Most code that uses a cache does the same three steps: look in the cache, and on a miss do the slow work, store the result, and return it. `getOrSet` does those steps for you.

It also protects against a *stampede*. If 50 requests miss the same key at the same moment, only one of them runs your function; the other 49 wait for that result. Without this, all 50 would hit the database together.

This fetches a user twice. The database function runs once; the second call is served from the cache.

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

interface User { id: string; name: string; }

const cache = createCacheService({
  adapter: createMemoryCacheAdapter({ maxEntries: 1000 }),
  config: { defaultTtl: 60_000 },
});

async function fetchUserFromDb(id: string): Promise<User> {
  console.log("hitting the database");
  return { id, name: "Alice" };
}

const first  = await cache.getOrSet<User>("user.123", () => fetchUserFromDb("123"));
const second = await cache.getOrSet<User>("user.123", () => fetchUserFromDb("123"));

console.log(first.cached, second.cached); // false true
console.log(second.value.name);          // "Alice"
```

You should see `hitting the database` printed exactly once. `getOrSet` returns `{ value, cached }`; `value` is always present, and `cached` tells you whether it came from the cache.

The third argument takes the same options as `set` (`ttl`, `tags`, `namespace`) plus `forceRefresh`, which skips the read and recomputes.

```ts
const fresh = await cache.getOrSet<User>(
  "user.123",
  () => fetchUserFromDb("123"),
  { ttl: 300_000, tags: ["users"], forceRefresh: true },
);
console.log(fresh.cached); // false
```

If you write the three steps by hand, check `hit`, not the value.

```ts
async function getUser(id: string): Promise<User> {
  const cached = await cache.get<User>(`user.${id}`);
  if (cached.hit) return cached.value!;

  const user = await fetchUserFromDb(id);
  await cache.set(`user.${id}`, user, { tags: ["users"] });
  return user;
}
```

**Common mistake:** `if (!cached) fetch...`. The result object is never falsy, so that branch never runs, the cache never fills, and every call hits the database. Check `cached.hit`.

## TAGS AND INVALIDATION

*Invalidation* means removing entries that are no longer correct, for example after a user changes their name. You can delete one key with `delete`, but often you do not know every key that is now stale. Tags and patterns solve that.

### Tags

A *tag* is a label you attach to an entry when you store it. One entry can carry several tags. Later, `invalidateByTag` deletes every entry that carries any of the tags you name, without you listing the keys.

Tag mappings are per service instance by default. Replicas sharing one adapter must share a tag store: pass `config.tagStore` (any `CacheTagStore`, e.g. Redis-set backed).

This tags three entries and then removes everything tagged `users`.

```ts
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

await cache.set("user.1", { name: "Alice" }, { tags: ["users"] });
await cache.set("user.2", { name: "Bob" },   { tags: ["users", "admins"] });
await cache.set("post.1", { title: "Hi" },   { tags: ["posts"] });

console.log(await cache.invalidateByTag(["users"])); // { cleared: 2 }
console.log(await cache.has("user.1"));                // false
console.log(await cache.has("post.1"));                // true
```

Tags live inside a namespace. A tag added under `tenant-a` is only visible to `invalidateByTag(tags, { namespace: "tenant-a" })` or to a service configured with that namespace. A tag must be a non-empty string of at most 128 characters with no NUL character. Since v1.2.0 an invalid tag, including `tags: [""]`, throws `ERR_INVALID_INPUT` (status 400), the same code as an invalid key; it used to surface as `CACHE_OPERATION_FAILED`, which reads like an adapter fault.

> WATCH OUT
>
>
>
> If you tag an entry under a namespace and later call `invalidateByTag` without that namespace (or the other way round), nothing is cleared and no error is thrown. The scope must match on both sides.

### Patterns

A *pattern* is a key with wildcards: `*` matches any run of characters and `?` matches one character. `invalidateByPattern` and `clear({ pattern })` delete every key that matches. The pattern is prefixed and namespaced just like a key.

This removes every key that starts with `user.` and leaves the rest.

```ts
await cache.set("user.1", "alice");
await cache.set("user.2", "bob");
await cache.set("post.1", "hello");

console.log(await cache.invalidateByPattern("user.*")); // { cleared: 2 }
console.log(await cache.has("post.1"));                  // true
```

`*` never crosses the `:` separator, so a pattern cannot reach into a namespace you did not name. On a service with no namespace, `invalidateByPattern("*")` removes only un-namespaced keys. To wipe across every namespace on purpose, use `"**"`. A pattern may only contain the key characters plus `*` and `?`; anything else throws.

### Clearing everything

`clear()` with no arguments empties the whole cache and forgets every tag.

```ts
console.log(await cache.clear()); // { cleared: 1 }
```

**Common mistake:** expecting `invalidateByPattern("*")` to clear tenants' entries too. It stops at the separator. Use `clear({ namespace })` per tenant, or `"**"` if you really mean everything.

## LOCKS: ONE AT A TIME

A *lock* is a named ticket that only one piece of code can hold at a time. While you hold it, anyone else who asks for the same name has to wait or give up. Use it around work that must not run twice at once, such as an import job or a counter update.

`withLock(name, fn, options)` takes the lock, runs `fn`, and releases the lock even if `fn` throws. The lock is a *lease*: it has a TTL (30 seconds by default) and is renewed while `fn` runs, so a slow job does not lose it. If the lease is lost anyway, the call throws instead of pretending it worked.

This runs a job under a lock and returns its result.

```ts
import { createCacheService, createMemoryCacheAdapter, isCacheError } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

const imported = await cache.withLock(
  "nightly-import",
  async (signal) => {
    // Only one caller is in here at a time.
    // `signal` aborts if the lease is lost mid-way.
    return 42;
  },
  { ttl: 10_000, retryAttempts: 3 },
);
console.log(imported); // 42
```

If someone already holds the lock, `withLock` retries 3 times, 100 ms apart, then throws a `CacheError` with code `CACHE_LOCK_UNAVAILABLE`. This shows that by asking for the same lock from inside itself.

```ts
try {
  await cache.withLock("import", async () => {
    await cache.withLock("import", async () => "inner", { retryAttempts: 0 });
  });
} catch (error) {
  if (isCacheError(error)) console.log(error.message);
  // Could not acquire lock "zudojs:import" for exclusive operation.
}
```

Lock names go through the key builder, so they are validated like keys and scoped by namespace. `withLock("import", fn, { namespace: "tenant-a" })` and the same call for `tenant-b` do not block each other.

> WATCH OUT
>
>
>
> The built-in lock store lives in one process. Two Node processes using it do not see each other's locks. For that you pass your own `CacheLockStore` (for example one backed by Redis) as `config.lockStore`. To share locks between several services in the same process, pass the exported `defaultLockStore`.

**Common mistake:** a lock name with a colon, like `"job:1"`. It is rejected just as a key would be. Use `"job.1"`.

## SEEING WHAT THE CACHE DOES

The service counts hits, misses, sets, deletes and errors (including rejected input: an invalid key, namespace, pattern, tag or TTL), and it emits an *event* (a small message you can listen for) on every operation. Stats are on by default; turn them off with `config.collectStats: false`, after which `getStats()` returns `null`.

This listens for misses, does a few reads, and prints the counters.

```ts
import { createCacheService, createMemoryCacheAdapter, CacheOperation } from "@zudojs/cache";

const cache = createCacheService({ adapter: createMemoryCacheAdapter() });

const subscription = cache.subscribe("cache.miss", (event) => {
  console.log("miss:", event.key);
});

await cache.get("absent");        // prints: miss: zudojs:absent
await cache.set("present", 1);
await cache.get("present");

console.log(cache.getStats());
// { hits: 1, misses: 1, sets: 1, deletes: 0, errors: 0, hitRate: 0.5 }
console.log(cache.getLatencyStats(CacheOperation.GET)?.count); // 2
console.log(cache.getHotKeys(10));  // [ { key: "zudojs:present", hits: 1 } ]
console.log(await cache.size()); // 1

subscription.unsubscribe();
```

Event names are `cache.hit`, `cache.miss`, `cache.set`, `cache.delete`, `cache.clear` and `cache.error`; subscribe to `"*"` for all of them. Event keys are full keys, prefix included. `healthCheck()` returns `{ healthy, adapter, latencyMs, checkedAt }` and is a cheap probe for a readiness endpoint.

> TIP
>
>
>
> Set `config.failSilently: true` in production if a broken cache should look like a miss rather than crash a request. Key validation errors and lock failures still throw, because those are bugs, not outages.

## API REFERENCE

Everything below is exported from `@zudojs/cache`. Most apps only need the first two functions and the `CacheService` methods.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createCacheService({ adapter, config?, keyBuilder? })` | Builds the `CacheService` you call from app code. | `adapter` is required. |
| `createMemoryCacheAdapter(options?)` | In-process adapter backed by a `Map`. | Options: `maxEntries`, `maxBytes`, `defaultTtl`, `separator`. |
| `createKeyBuilder({ prefix?, separator?, namespace? })` | Builds and validates full keys. | Pass as `keyBuilder` to the service, or use `build()` directly. |
| `createLockManager(options?)` | Stand-alone lock manager with `acquire()` and `withLock()`. | The service has its own; use this only outside a service. |
| `createCacheStore`, `createTagStore`, `createInvalidationManager`, `createCacheMetrics` | Factories for the internal pieces the service composes. | Only needed when you build your own service-like wrapper. |
| `isCacheError(value)` | Type guard for `CacheError`. | Use in `catch` blocks. |
| `assertValidTag(tag)` | Throws if a tag is empty, too long or malformed. | The service calls it for you. |
| `estimateValueBytes(value)` | Approximate size the memory adapter charges for a value. | Handy for tuning `maxBytes`. |
| `stripUnsafeKeys(value)` | Removes `__proto__`, `constructor`, `prototype` from a deserialized object. | Applied by `JsonCacheSerializer`. |

### CacheService methods

| Name | What it does | Notes |
| --- | --- | --- |
| `get<T>(key, { namespace? })` | Reads one entry. | Returns `{ hit, value, entry? }`. |
| `set(key, value, { ttl?, tags?, namespace?, overwrite?, metadata? })` | Writes one entry. | Returns `{ success, key, expiresAt, skipped? }`. `overwrite: false` skips existing keys. |
| `has(key, opts?)` / `delete(key, opts?)` | Existence check / removal. | `delete` returns `{ deleted, key }`. |
| `getOrSet<T>(key, fn, opts?)` | Read, or compute and store. | Returns `{ value, cached }`. Options add `forceRefresh`. |
| `ttl(key, opts?)` / `expire(key, ttl, opts?)` | Remaining lifetime / set a new lifetime. | `ttl` returns whole ms (rounded down, since v1.2.0), `null` (never) or `undefined` (missing). |
| `clear({ namespace?, pattern? })` | Removes everything, or only matching entries. | Returns `{ cleared }`. |
| `invalidateByTag(tags, { namespace? })` | Removes entries carrying any of the tags. | Scoped to the namespace. |
| `invalidateByPattern(pattern, { namespace? })` | Removes entries matching a glob. | `*` stops at `:`; `**` spans. |
| `withLock<T>(name, fn, { ttl?, retryAttempts?, namespace? })` | Runs `fn` while holding a lock. | Throws `CACHE_LOCK_UNAVAILABLE`, `CACHE_LOCK_LOST` or `CACHE_DISABLED`. |
| `batch(operations, { namespace? })` | Runs a list of `{ type: "get" \| "set" \| "delete", key, value?, options? }` in order. | One result per operation; a failure does not stop the rest. |
| `subscribe(eventType \| "*", handler)` | Listens for cache events. | Returns `{ unsubscribe }`. |
| `getStats()`, `getLatencyStats(op)`, `getLatencyHistogram(op)`, `getHotKeys(n?)`, `resetStats()`, `size()` | Counters, percentiles, hot keys, live entry count. | Return `null` when `collectStats` is off (`size()` excepted). |
| `healthCheck()`, `connect()`, `disconnect()` | Probe the adapter / lifecycle hooks. | The memory adapter needs neither `connect` nor `disconnect`. |

### CacheConfig options

| Name | What it does | Notes |
| --- | --- | --- |
| `enabled` | Kill switch. When `false`, reads miss, writes no-op, `withLock` throws. | Default `true`. |
| `defaultTtl` | TTL used when a call passes none. | Default `300_000` (5 min). `null` = never. |
| `namespace`, `prefix`, `separator` | Key layout: `prefix:namespace:key`. | Defaults: none, `"zudojs"`, `":"`. |
| `failSilently` | Swallow adapter errors and return a neutral result. | Default `false`. Validation and lock errors still throw. |
| `collectStats` | Track counters and latencies. | Default `true`. |
| `serializer` | Copy values on the way in and out (`JsonCacheSerializer`, `RawCacheSerializer`, or your own). | Without one the memory adapter stores objects by reference. |
| `middlewares` | Functions `(ctx, next) => Promise` wrapping every adapter call. | First entry is outermost. Always return `next()`'s result. |
| `lockStore` | Where locks are kept. | Default: a fresh in-process store. Pass `defaultLockStore` to share. |
| `tagStore` | Where tag→key mappings are kept. | Default: a fresh per-instance store. Replicas sharing one adapter must share one (any `CacheTagStore`). |

### Classes and instances

| Name | What it does | Notes |
| --- | --- | --- |
| `CacheService` | The class behind `createCacheService`. | Construct with `new CacheService({ adapter, config? })` if you prefer. |
| `MemoryCacheAdapter` | The class behind `createMemoryCacheAdapter`. | LRU eviction by count and by estimated bytes. |
| `DefaultKeyBuilder`, `defaultKeyBuilder` | Key builder class and a shared instance with defaults. | Has `build`, `buildPattern`, `namespace(ns)`. |
| `JsonCacheSerializer`, `defaultSerializer` | JSON serializer that keeps `Date`, `Map`, `Set` and `BigInt`. | `new JsonCacheSerializer({ preserveTypes: false })` for plain JSON. |
| `RawCacheSerializer`, `rawSerializer` | Pass-through serializer. | For adapters that serialize themselves. |
| `InMemoryLockStore`, `defaultLockStore`, `CacheLockManager` | Lock storage and the manager that retries and renews. | Implement `CacheLockStore` for a distributed store. |
| `DefaultCacheStore`, `InMemoryTagStore`, `CacheInvalidationManager`, `InMemoryCacheMetrics` | Internal building blocks. | Exposed for advanced composition and tests. |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `CacheAdapter` | Contract a storage backend implements. | `name`, `get`, `set`, `delete`, `has`, `clear`, plus optional `keys`, `getMany`, `setMany`, `deleteMany`, `ttl`, `expire`, `size`, `connect`, `disconnect`. |
| `CacheConfig` | The `config` object above. |  |
| `CacheGetResult<T>`, `CacheSetResult`, `CacheDeleteResult`, `CacheClearResult` | Return shapes of the basic operations. | `CacheGetResult.entry` carries `createdAt`, `expiresAt`, `tags`, `metadata` on a hit. |
| `CacheOrComputeOptions`, `CacheOrComputeResult<T>` | Options and result of `getOrSet`. |  |
| `CacheBatchOperation`, `CacheBatchResult` | Input and output of `batch`. |  |
| `CacheTTL` | `number \| null`. |  |
| `CacheStats`, `CacheHealth` | Return shapes of `getStats` and `healthCheck`. | `CacheHealth.disabled` is `true` when `enabled: false`. |
| `CacheEvent`, `CacheEventType`, `CacheEventHandler`, `CacheEventSubscription` | Event surface for `subscribe`. | Per-event types: `CacheHitEvent`, `CacheMissEvent`, `CacheSetEvent`, `CacheDeleteEvent`, `CacheClearEvent`, `CacheErrorEvent`. |
| `CacheMiddleware`, `CacheMiddlewareContext` | Shape of a middleware and the `{ key, operation, startedAt }` it receives. |  |
| `CacheLockStore`, `CacheLock`, `CacheLockOptions` | Contracts for custom lock backends. |  |
| `CacheSerializer` | `{ serialize(value), deserialize(value) }`. |  |
| `CacheKeyBuilder`, `CacheKeyOptions`, `CacheTagStore`, `CacheTagOptions`, `CacheMetrics`, `CacheStore` | Contracts for the internal pieces. |  |

### Errors

Every error thrown by this package is a `CacheError` from `@zudojs/errors`, re-exported here together with its factories.

| Name | What it does | Notes |
| --- | --- | --- |
| `CacheError`, `isCacheError` | Error class and type guard. | Has `message`, `code`, `statusCode`, `operation`, `key`. |
| `CacheErrorCode` | Codes this package sets: `CACHE_DISABLED`, `CACHE_OPERATION_FAILED`, `CACHE_INVALID_TTL`, `CACHE_MIDDLEWARE_RESULT_MISSING`, `CACHE_LOCK_UNAVAILABLE`, `CACHE_LOCK_ACQUIRE_FAILED`, `CACHE_LOCK_LOST`. | Type only. An invalid key, namespace, pattern, tag or lock name throws with the shared code `ERR_INVALID_INPUT` (`ErrorCode.INVALID_INPUT`, status 400), which is not in this union. There is no `CACHE_INVALID_KEY` code. Before v1.2.0 an invalid tag surfaced as `CACHE_OPERATION_FAILED`. |
| `CacheOperation` | Enum of operation names (`GET`, `SET`, `DELETE`, `LOCK_ACQUIRE`, ...). | Pass to `getLatencyStats`. |
| `cacheInvalidKeyError`, `cacheSerializationError`, `cacheDeserializationError`, `cacheConnectionError`, `cacheTimeoutError`, `cacheAdapterNotConfiguredError` | Factories for building a `CacheError` of each kind. | Useful inside a custom adapter. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| `DEFAULT_TTL_MS`, `MIN_TTL_MS`, `MAX_TTL_MS` | 5 minutes, 1 ms, 24 hours. | TTL range accepted by `set`. |
| `DEFAULT_PREFIX`, `DEFAULT_SEPARATOR`, `MAX_KEY_LENGTH` | `"zudojs"`, `":"`, 256. |  |
| `CACHE_KEY_PATTERN`, `CACHE_PATTERN_PART_PATTERN`, `MAX_TAG_LENGTH` | Regexes for key parts and glob parts; tag limit (128). |  |
| `DEFAULT_LOCK_TTL_MS`, `DEFAULT_LOCK_RETRY_ATTEMPTS`, `DEFAULT_LOCK_RETRY_DELAY_MS` | 30 s, 3, 100 ms. |  |
| `DEFAULT_MAX_ENTRIES`, `DEFAULT_MAX_MEMORY_BYTES`, `EXPIRED_PURGE_INTERVAL_MS` | 10,000 entries, 50 MB, 30 s purge interval. | Memory adapter defaults. |
| `MAX_LATENCY_SAMPLES`, `MAX_TRACKED_KEYS`, `LATENCY_BUCKETS` | 1,000 samples, 1,024 hot keys, histogram edges in ms. | Metrics limits. |

## COMMON MISTAKES

- **Treating `get()`'s result as the value.** `if (!result)` is never true, so the miss branch never runs and the cache never fills. Check `result.hit` and read `result.value`.
- **Colons in keys, tags or lock names.** `set("user:1", ...)` throws a `CacheError` because `:` is the separator. Write `user.1` and put the scope in the namespace.
- **Tagging in one namespace and invalidating in another.** The call returns `{ cleared: 0 }` and stale data stays. Pass the same `namespace` to `set` and `invalidateByTag`, or configure it once on the service.
- **Using `"*"` to mean "everything".** `*` stops at the separator, so namespaced keys survive. Use `clear()` for all, `clear({ namespace })` per tenant, or `"**"` when you really want to cross namespaces.
- **`ttl: 0` for "never expire".** Zero is rejected with `CACHE_INVALID_TTL`. Use `ttl: null`.
- **Expecting the memory adapter to be shared.** Each process, and each `createMemoryCacheAdapter()` call, has its own store and its own locks. For several servers you need an adapter and a `lockStore` backed by a shared system such as Redis.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — defines `CacheError` and the error codes you will catch.
- [@zudojs/serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) — the JSON engine behind `JsonCacheSerializer`; reach for it when you need the same type-preserving JSON elsewhere.
- [@zudojs/tenancy](https://zudojs.oyinlola.site/docs/packages-tenancy.md) — resolves the current tenant so you have a namespace to pass to the cache.
- [@zudojs/lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) — a place to call `connect()` and `disconnect()` when your app starts and stops.

## COMPLETE EXPORT INDEX

Every name `@zudojs/cache` exports from its package root at v1.2.4 — **104** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 104 exports**

Classes (12)

`CacheError` `CacheInvalidationManager` `CacheLockManager` `CacheService` `DefaultCacheStore` `DefaultKeyBuilder` `InMemoryCacheMetrics` `InMemoryLockStore` `InMemoryTagStore` `JsonCacheSerializer` `MemoryCacheAdapter` `RawCacheSerializer`

Functions (18)

`assertValidTag` `cacheAdapterNotConfiguredError` `cacheConnectionError` `cacheDeserializationError` `cacheInvalidKeyError` `cacheSerializationError` `cacheTimeoutError` `createCacheMetrics` `createCacheService` `createCacheStore` `createInvalidationManager` `createKeyBuilder` `createLockManager` `createMemoryCacheAdapter` `createTagStore` `estimateValueBytes` `isCacheError` `stripUnsafeKeys`

Interfaces (40)

`BaseCacheEvent` `CacheAdapter` `CacheBatchOperation` `CacheBatchResult` `CacheClearEvent` `CacheClearOptions` `CacheClearResult` `CacheConfig` `CacheDeleteEvent` `CacheDeleteManyResult` `CacheDeleteResult` `CacheEntry` `CacheErrorEvent` `CacheErrorOptions` `CacheEventSubscription` `CacheGetResult` `CacheHealth` `CacheHealthChecker` `CacheHitEvent` `CacheKeyBuilder` `CacheKeyOptions` `CacheKeysOptions` `CacheLock` `CacheLockOptions` `CacheLockStore` `CacheMetrics` `CacheMiddlewareContext` `CacheMissEvent` `CacheOrComputeOptions` `CacheOrComputeResult` `CacheSerializationOptions` `CacheSerializer` `CacheSetEvent` `CacheSetManyOptions` `CacheSetOptions` `CacheSetResult` `CacheStats` `CacheStore` `CacheTagOptions` `CacheTagStore`

Type aliases (11)

`CacheErrorCode` `CacheEvent` `CacheEventHandler` `CacheEventType` `CacheExpiration` `CacheKey` `CacheMiddleware` `CacheNamespace` `CacheTag` `CacheTTL` `MaybePromise`

Constants (22)

`CACHE_KEY_PATTERN` `CACHE_PATTERN_PART_PATTERN` `DEFAULT_LOCK_RETRY_ATTEMPTS` `DEFAULT_LOCK_RETRY_DELAY_MS` `DEFAULT_LOCK_TTL_MS` `DEFAULT_MAX_ENTRIES` `DEFAULT_MAX_MEMORY_BYTES` `DEFAULT_PREFIX` `DEFAULT_SEPARATOR` `DEFAULT_TTL_MS` `defaultKeyBuilder` `defaultLockStore` `defaultSerializer` `EXPIRED_PURGE_INTERVAL_MS` `LATENCY_BUCKETS` `MAX_KEY_LENGTH` `MAX_LATENCY_SAMPLES` `MAX_TAG_LENGTH` `MAX_TRACKED_KEYS` `MAX_TTL_MS` `MIN_TTL_MS` `rawSerializer`

Enums (1)

`CacheOperation`
