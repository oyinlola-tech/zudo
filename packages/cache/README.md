# @zudojs/cache

Cache abstraction with a memory adapter, namespaced tags, locking, events, middleware, and metrics for Zudojs applications.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-cache](https://zudojs.oyinlola.site/docs/packages-cache) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-cache.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/cache
```

## Quick Start

```typescript
import { createCacheService, createMemoryCacheAdapter } from "@zudojs/cache";

const cache = createCacheService({
  adapter: createMemoryCacheAdapter({ maxEntries: 1000 }),
  config: { defaultTtl: 60_000 },
});

interface User {
  id: string;
  name: string;
}

async function getUser(id: string): Promise<User> {
  // `get` returns a result wrapper, not the value: check `hit`, read `value`.
  const cached = await cache.get<User>(`user.${id}`);
  if (cached.hit) return cached.value!;

  const user = await fetchUserFromDb(id);
  await cache.set(`user.${id}`, user, { tags: ["users"] });
  return user;
}

// Or let the cache do it, with stampede protection:
const { value, cached } = await cache.getOrSet<User>(`user.${id}`, () =>
  fetchUserFromDb(id),
);
```

Key parts (prefix, namespace, key) are validated individually: letters,
digits, `.`, `_`, `-` and `:`, minus the active separator. With the default
`:` separator that means no `:` inside a key — `prefix:namespace:key` is the
structure the key builder produces, so a key `a:b` would collide with key `b`
in namespace `a`, and `clear({ namespace: "a" })` would delete it. Put the
scope in `namespace` (`cache.get("dashboard", { namespace: tenantId })`), use
`.` or `-` inside a key (`user.123`, not `user:123`), or, if your keys must
contain `:` (keys built by another library, say), configure a different
separator on both the service and the memory adapter:

```typescript
const cache = createCacheService({
  adapter: createMemoryCacheAdapter({ separator: "/" }),
  config: { separator: "/" },
});
await cache.set("tenant:kola:dashboard", totals); // zudojs/tenant:kola:dashboard
```

A rejected key throws a `CacheError` (`ERR_INVALID_INPUT`, status 400) whose
`operation` names the call that rejected it (`get`, `set`, `lock_acquire`,
`clear`, …) and whose message explains the separator rule.

## Features

- Pluggable cache adapters (memory built in; the `CacheAdapter` contract fits Redis and friends)
- TTL and entry-count eviction, plus an approximate memory budget (`maxBytes`), with LRU ordering
- Namespaced cache tags for bulk invalidation
- Namespaced in-process locking with lease renewal (pluggable `CacheLockStore` for distributed backends)
- Cache events, middleware, hit ratios, latency percentiles and hot keys

## Multi-tenancy

`namespace` is a scope boundary, not a pattern. It is validated everywhere it
is used — including inside glob patterns — so an untrusted namespace can never
widen an operation:

```typescript
await cache.set("u1", user, { namespace: tenantId, tags: ["users"] });

// Only this tenant's entries — a tenantId of "*" is rejected, not honoured.
await cache.clear({ namespace: tenantId });

// Only this tenant's tagged entries.
await cache.invalidateByTag(["users"], { namespace: tenantId });

// Locks are namespaced and key-builder-qualified too.
await cache.withLock("import", runImport, { namespace: tenantId });
```

In glob patterns, `*` matches within a single key segment and never crosses
the `:` separator; `**` as a whole segment spans namespaces deliberately.

An empty-string namespace is rejected, in the config and per call. A tenant id
that failed to resolve to `""` can therefore never fall through to the unscoped
global keyspace. Omit `namespace` to use that keyspace deliberately.

## Invalid input

A key, namespace, pattern or tag that fails validation throws a `CacheError`
whose `code` is `ErrorCode.INVALID_INPUT` from `@zudojs/errors` — the string
`"ERR_INVALID_INPUT"`. (Earlier docs named this `CACHE_INVALID_KEY`; no such
code has ever been thrown.) An invalid TTL uses its own code,
`"CACHE_INVALID_TTL"`.

```typescript
import { ErrorCode } from "@zudojs/errors";

try {
  await cache.get("");
} catch (error) {
  if (error instanceof CacheError && error.code === ErrorCode.INVALID_INPUT) {
    // reject the request: the key came from the caller
  }
}
```

Invalid input is a caller error, so `failSilently` never hides it. Each
rejection counts in `getStats().errors` and emits `cache.error`, exactly like
an invalid TTL or an adapter failure.

Since 1.2.0 an invalid tag (`tags: [""]`) is `ERR_INVALID_INPUT` too; it used
to be `CACHE_OPERATION_FAILED`, which reads as an adapter fault.

## Tags across instances

By default each `CacheService` keeps its tag mappings in process, so
`invalidateByTag` only sees entries written by the same instance. Replicas that
share one adapter must also share a tag store. Pass any `CacheTagStore`
implementation (for example one backed by Redis sets) as `config.tagStore`:

```typescript
const tagStore = createTagStore(); // or your shared implementation
const a = createCacheService({ adapter, config: { tagStore } });
const b = createCacheService({ adapter, config: { tagStore } });

await a.set("user.1", user, { tags: ["users"] });
await b.invalidateByTag(["users"]); // clears the entry a wrote
```

## Serialization

`JsonCacheSerializer` preserves `Date`, `BigInt`, `Map`, `Set` and `Uint8Array`
by default and drops `__proto__`, `constructor` and `prototype` keys on read.
A value with its own `$type` field (a domain discriminator) is ordinary data
and reads back unchanged.

## Observability

```typescript
const subscription = cache.subscribe("cache.miss", (event) => {
  metrics.increment("cache.miss", { key: event.key });
});

cache.getStats(); // { hits, misses, sets, deletes, errors, hitRate }
await cache.ttl("user.1"); // remaining whole milliseconds, rounded down
cache.getLatencyStats(CacheOperation.GET); // p50 / p95 / p99
cache.getHotKeys(10);
await cache.size();

subscription.unsubscribe();
```

Middlewares wrap every adapter operation and are configured on the service:

```typescript
const cache = createCacheService({
  adapter: createMemoryCacheAdapter(),
  config: {
    middlewares: [
      async (ctx, next) => {
        const span = tracer.start(ctx.operation);
        try {
          return await next(); // always return next()'s result
        } finally {
          span.end();
        }
      },
    ],
  },
});
```

## Use Cases

- API response caching
- Database query caching
- Session storage
- Rate limit counters
