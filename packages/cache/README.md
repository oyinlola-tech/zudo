# @zudojs/cache

Cache abstraction with a memory adapter, namespaced tags, locking, events, middleware, and metrics for Zudojs applications.

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

Key parts are validated individually and must match `/^[a-zA-Z0-9._-]+$/`, so
use `.` rather than the `:` separator inside a key (`user.123`, not
`user:123`) — `:` is reserved for the `prefix:namespace:key` structure the key
builder produces.

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

## Observability

```typescript
const subscription = cache.subscribe("cache.miss", (event) => {
  metrics.increment("cache.miss", { key: event.key });
});

cache.getStats(); // { hits, misses, sets, deletes, errors, hitRate }
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
