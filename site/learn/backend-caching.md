---
title: "Caching — ZudoJS Academy"
description: "Build a cache from scratch: cache-aside with TTL, invalidation on writes, stampede protection, stale-while-revalidate, hit-rate metrics and what to cache."
source: https://zudojs.oyinlola.site/learn/backend-caching
---

LEVEL 7 · LESSON 13 OF 15

Backend building blocks Core

# Caching

Build a cache from scratch: cache-aside with TTL, invalidation on writes, stampede protection, stale-while-revalidate, hit-rate metrics and what to cache.

- **50 min** to read and try
- **You need:** Testing strategies, Type-safe API layers and Async TypeScript
- **You build:** An in-process product cache for a shop - TTL and LRU eviction, cache-aside reads, invalidation that survives a race, single-flight stampede protection, stale-while-revalidate, hit-rate metrics and a node:test suite

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what a cache buys and costs, and decide what data is safe to cache and for how long
- Implement cache-aside reads with a TTL and an LRU size limit, using an injected clock
- Invalidate on writes and prevent a slow reader from putting stale data back
- Protect a hot key from a stampede with single-flight and stale-while-revalidate
- Measure hit rate and evictions and use them to size a cache
- Fail open when a shared cache is down, and test cache behaviour deterministically

## The same row, three thousand times a minute

A grocery shop's product page shows the name and price of a product. Each view runs one query. On an ordinary day that is fine. During a flash sale, 5,000 shoppers a minute open the same three product pages, the database's CPU sits at 90%, and pages start to time out. The strange part: those three rows change maybe twice a day. The database is doing the same work thousands of times to produce the same answer.

Here is the product "database" this lesson uses. It is in memory, but every read waits 5 ms, like a real query over the network, and it counts its reads:

src/catalog-db.ts

```ts
export interface Product {
  readonly id: number;
  readonly name: string;
  readonly priceKobo: number;
}

export class CatalogDb {
  reads = 0;
  private readonly products = new Map<number, Product>([
    [1, { id: 1, name: "Rice, 5 kg", priceKobo: 950_000 }],
    [2, { id: 2, name: "Groundnut oil, 1 L", priceKobo: 250_050 }],
    [3, { id: 3, name: "Sugar, 1 kg", priceKobo: 120_000 }],
  ]);

  async findProduct(id: number): Promise<Product | undefined> {
    this.reads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return this.products.get(id);
  }

  async updatePrice(id: number, priceKobo: number): Promise<void> {
    const product = this.products.get(id);
    if (product !== undefined) this.products.set(id, { ...product, priceKobo });
  }
}

export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-US")}`;
}
```

no-cache.ts

```ts
import { CatalogDb } from "./src/catalog-db.js";

const db = new CatalogDb();
const started = Date.now();

for (let view = 0; view < 300; view++) {
  const productId = (view % 3) + 1;
  await db.findProduct(productId);
}

console.log("page views: 300, database reads:", db.reads);
console.log("slower than 1 second:", Date.now() - started > 1_000);
```

Output of `npx tsx no-cache.ts` and of the browser terminal

```ts
page views: 300, database reads: 300
slower than 1 second: true
```

Three hundred page views, three hundred reads, for three products. A **cache** keeps a copy of a result somewhere faster and closer, so repeated requests can skip the expensive work. This lesson builds one from scratch, with no library and no framework, so you see every decision a caching library makes for you, and every way caching goes wrong.

## What a cache buys, and what it costs

Caches exist because some places to fetch data are much slower than others. Rough orders of magnitude:

| Where the data is | Rough time to get it |
| --- | --- |
| A `Map` in your process's memory | well under a microsecond |
| A shared cache (Redis) in the same data centre | a fraction of a millisecond |
| A simple indexed database query | about a millisecond, much more under load |
| A complex query, a report, another company's API | tens of milliseconds to seconds |

Caches live at every layer: the browser (the `Cache-Control` header from [HTTP in depth](https://zudojs.oyinlola.site/learn/http-deep#headers)), a CDN in front of your site, your process's memory, a shared cache server such as Redis, and the database's own memory. This lesson is about the application layer: your code decides what to keep, for how long, and when to throw it away.

The price is always the same: a cache holds a **copy**, and a copy can be **stale**, out of date compared to the real data. Every caching decision is a trade: how stale may this be, in return for how much speed?

REASON IT OUT

### What is safe to cache?

For each piece of data, decide: cache it or not? If yes, for how long, and what happens when the copy is wrong? Think it through before reading on.

- A product's name and description
- A product's price
- How many bags of rice are left in stock
- A customer's wallet balance, used to approve a ₦50,000 purchase
- A customer's cart
- "Product 999 does not exist"

**Show the reasoning**

**Name and description:** yes, for minutes or hours. A stale description hurts nobody, and they change rarely. **Price:** yes, but it must be removed from the cache the moment it changes, because showing ₦9,500 and charging ₦9,900 is a complaint (or, in some countries, illegal). Checkout must use the real price, never the cached one. **Stock:** for display ("only a few left"), a few seconds is fine; for the decision to sell the last bag, never: that decision belongs in the database, in one statement, as in [BookStore API: validation and PostgreSQL](https://zudojs.oyinlola.site/learn/bookstore-data#repositories). **Wallet balance for approving a payment:** never. A stale balance approves a purchase the customer cannot pay for. Data used to *decide* something about money or permissions is read fresh.

**A cart:** it belongs to one customer, so the cache key must include the customer id. A cart cached under `cart` instead of `cart:42` would show one customer's cart to everyone: a data leak, not a performance bug. **"Does not exist":** yes, briefly. Otherwise a script requesting random ids sends every request to the database. This is called **negative caching**.

## Cache-aside with a TTL

The most common pattern is **cache-aside** (also called lazy loading). The application talks to the cache and the database itself:

```ts
read:   app ──get(key)──▶ cache ── hit ──▶ return the copy
                            │
                           miss
                            ▼
        app ──query──▶ database ──▶ app ──set(key, value, ttl)──▶ cache ──▶ return

write:  app ──update──▶ database ──▶ app ──delete(key)──▶ cache
```

Cache-aside: reads fill the cache on a miss; writes change the database and then remove the copy.

A **hit** means the value was in the cache; a **miss** means it was not. Every entry gets a **TTL** (time to live): after that many milliseconds it counts as gone. The TTL is the upper bound on staleness, and a safety net for every invalidation you forget.

First, time. A cache that calls `Date.now()` itself can only be tested by waiting. So the cache receives a `Clock`, the same idea as in [Type-safe API layers](https://zudojs.oyinlola.site/learn/ts-api-layers#services), and tests use a manual clock they can move forward:

src/clock.ts

```ts
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  private time = 0;

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}
```

The store itself. It is a `Map` with an expiry time per entry, plus a size limit. A cache without a limit is a memory leak with good intentions. When the cache is full, it evicts the **least recently used** entry (**LRU**). A JavaScript `Map` remembers insertion order, so moving an entry to the end on every read makes the first key always the least recently used one, the trick from [Linked lists and the LRU cache](https://zudojs.oyinlola.site/learn/dsa-linked-lists) without the list:

src/ttl-cache.ts

```ts
import type { Clock } from "./clock.js";

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  evictions = 0;

  constructor(
    private readonly clock: Clock,
    private readonly maxEntries = 1_000,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.clock.now() + ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
      this.evictions += 1;
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
```

Expired entries are removed when someone reads them. That is enough here, because the size limit bounds memory anyway; a real cache also sweeps expired keys in the background. And the cache-aside function, which also counts hits and misses:

src/cache-aside.ts

```ts
import type { TtlCache } from "./ttl-cache.js";

export interface CacheStats {
  hits: number;
  misses: number;
}

export async function cacheAside<V>(
  cache: TtlCache<V>,
  stats: CacheStats,
  key: string,
  ttlMs: number,
  load: () => Promise<V>,
): Promise<V> {
  const cached = cache.get(key);
  if (cached !== undefined) {
    stats.hits += 1;
    return cached;
  }
  stats.misses += 1;
  const value = await load();
  cache.set(key, value, ttlMs);
  return value;
}

export function hitRate(stats: CacheStats): string {
  const total = stats.hits + stats.misses;
  return total === 0 ? "n/a" : `${((stats.hits / total) * 100).toFixed(1)}%`;
}
```

with-cache.ts

```ts
import { cacheAside, hitRate } from "./src/cache-aside.js";
import { CatalogDb } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { systemClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

const db = new CatalogDb();
const cache = new TtlCache<Product | null>(systemClock);
const stats = { hits: 0, misses: 0 };

async function productPage(id: number): Promise<string> {
  const product = await cacheAside(cache, stats, `product:${id}`, 60_000, async () => (await db.findProduct(id)) ?? null);
  return product === null ? "404" : product.name;
}

for (let view = 0; view < 300; view++) await productPage((view % 3) + 1);

console.log("page views: 300, database reads:", db.reads);
console.log("hits:", stats.hits, "misses:", stats.misses, "hit rate:", hitRate(stats));
```

Output of `npx tsx with-cache.ts` and of the browser terminal

```ts
page views: 300, database reads: 3
hits: 297 misses: 3 hit rate: 99.0%
```

Three reads instead of three hundred: one per product, then every view is a hit. The loader returns `null` for a missing product, and `null` is cached too, so missing products are negatively cached for free. (The cache uses `undefined` to mean "not in the cache", which is why the loader must not return `undefined`.)

### Watching the TTL

With the manual clock, you can watch staleness happen. The price changes at the database, and nothing tells the cache:

ttl.ts

```ts
import { cacheAside } from "./src/cache-aside.js";
import { CatalogDb, naira } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

const clock = new ManualClock();
const db = new CatalogDb();
const cache = new TtlCache<Product | null>(clock);
const stats = { hits: 0, misses: 0 };
const price = async () => {
  const product = await cacheAside(cache, stats, "product:1", 60_000, async () => (await db.findProduct(1)) ?? null);
  return product === null ? "gone" : naira(product.priceKobo);
};

console.log("t=0s  ", await price(), "reads:", db.reads);
await db.updatePrice(1, 990_000);
clock.advance(30_000);
console.log("t=30s ", await price(), "reads:", db.reads, "(stale)");
clock.advance(30_000);
console.log("t=60s ", await price(), "reads:", db.reads);
```

Output of `npx tsx ttl.ts` and of the browser terminal

```ts
t=0s   ₦9,500 reads: 1
t=30s  ₦9,500 reads: 1 (stale)
t=60s  ₦9,900 reads: 2
```

For the rest of the minute, customers saw the old price. That is the deal a TTL offers: data is at most 60 seconds stale, and the database answers at most one read per product per minute. A shorter TTL means fresher data and more reads; a longer one, the opposite.

> TIP
>
> When thousands of keys are cached at the same moment (after a deploy, or by a warm-up job), they also expire at the same moment and all miss together. Adding a little randomness to each TTL, called **jitter** (for example 60 seconds ± 10%), spreads the expiries out. The second exercise adds it.

## Invalidation on write

Waiting for the TTL is not good enough for prices. When you change data, you **invalidate** the copy: delete it, so the next read loads the new value. Delete rather than update: writing the new value into the cache from the write path duplicates the loading logic and invites mistakes, while a delete always leads to a correct reload.

invalidate.ts

```ts
import { cacheAside } from "./src/cache-aside.js";
import { CatalogDb, naira } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

const db = new CatalogDb();
const cache = new TtlCache<Product | null>(new ManualClock());
const stats = { hits: 0, misses: 0 };
const key = (id: number) => `product:${id}`;

async function getProduct(id: number): Promise<Product | null> {
  return cacheAside(cache, stats, key(id), 60_000, async () => (await db.findProduct(id)) ?? null);
}

async function changePrice(id: number, priceKobo: number): Promise<void> {
  await db.updatePrice(id, priceKobo);
  cache.delete(key(id));
}

console.log(naira((await getProduct(1))!.priceKobo));
await changePrice(1, 990_000);
console.log(naira((await getProduct(1))!.priceKobo), "reads:", db.reads);
```

Output of `npx tsx invalidate.ts` and of the browser terminal

```ts
₦9,500
₦9,900 reads: 2
```

The order matters: update the database *first*, then delete the key. The other way round, a reader could slip in between, miss, load the old price from the database and cache it again.

### The race that remains

Even in the right order, one race is left. A reader misses and starts loading. While its query is on the way back, a writer changes the price and deletes the key. Then the reader, still holding the *old* price, writes it into the cache:

race.ts

```ts
import { cacheAside } from "./src/cache-aside.js";
import { CatalogDb, naira } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

const db = new CatalogDb();
const cache = new TtlCache<Product | null>(new ManualClock());
const stats = { hits: 0, misses: 0 };

let finishRead!: () => void;
const slowNetwork = new Promise<void>((resolve) => (finishRead = resolve));

const reader = cacheAside(cache, stats, "product:1", 60_000, async () => {
  const product = await db.findProduct(1);
  console.log("reader: read", naira(product!.priceKobo), "from the database");
  await slowNetwork;
  return product ?? null;
});

await new Promise((resolve) => setTimeout(resolve, 20));
await db.updatePrice(1, 990_000);
cache.delete("product:1");
console.log("writer: price is now ₦9,900, cache entry deleted");

finishRead();
await reader;
console.log("cache now says:", naira(cache.get("product:1")!.priceKobo), "for the next 60 seconds");
```

Output of `npx tsx race.ts` and of the browser terminal

```ts
reader: read ₦9,500 from the database
writer: price is now ₦9,900, cache entry deleted
cache now says: ₦9,500 for the next 60 seconds
```

The invalidation happened, and it was undone by a reader that started before it. It needs bad timing, but on a busy shop bad timing happens daily. The fix: every key gets a **generation** number. Invalidating a key increases its generation. A loader remembers the generation it started with, and only stores its result if the generation is still the same.

src/single-flight.ts

```ts
export class SingleFlight<V> {
  private readonly running = new Map<string, Promise<V>>();

  run(key: string, work: () => Promise<V>): Promise<V> {
    const existing = this.running.get(key);
    if (existing !== undefined) return existing;
    const started = work().finally(() => this.running.delete(key));
    this.running.set(key, started);
    return started;
  }
}
```

src/safe-cache.ts

```ts
import type { CacheStats } from "./cache-aside.js";
import { SingleFlight } from "./single-flight.js";
import type { TtlCache } from "./ttl-cache.js";

export class SafeCache<V> {
  private readonly generations = new Map<string, number>();
  private readonly flight = new SingleFlight<V>();
  readonly stats: CacheStats = { hits: 0, misses: 0 };

  constructor(private readonly cache: TtlCache<V>) {}

  async get(key: string, ttlMs: number, load: () => Promise<V>): Promise<V> {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.stats.hits += 1;
      return cached;
    }
    this.stats.misses += 1;
    const generation = this.generations.get(key) ?? 0;
    return this.flight.run(`${key}#${generation}`, async () => {
      const value = await load();
      if ((this.generations.get(key) ?? 0) === generation) this.cache.set(key, value, ttlMs);
      return value;
    });
  }

  invalidate(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    this.cache.delete(key);
  }
}
```

`SafeCache` uses `SingleFlight`, which you will meet properly in the next section: while one load for a key is running, other callers for the same key wait for it instead of starting their own. The flight key includes the generation, so a reader that arrives after an invalidation does not join a load that started before it.

race-fixed.ts

```ts
import { CatalogDb, naira } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { SafeCache } from "./src/safe-cache.js";
import { TtlCache } from "./src/ttl-cache.js";

const db = new CatalogDb();
const cache = new SafeCache(new TtlCache<Product | null>(new ManualClock()));

let finishRead!: () => void;
const slowNetwork = new Promise<void>((resolve) => (finishRead = resolve));

const reader = cache.get("product:1", 60_000, async () => {
  const product = await db.findProduct(1);
  await slowNetwork;
  return product ?? null;
});

await new Promise((resolve) => setTimeout(resolve, 20));
await db.updatePrice(1, 990_000);
cache.invalidate("product:1");

finishRead();
console.log("the slow reader got:", naira((await reader)!.priceKobo));
const next = await cache.get("product:1", 60_000, async () => (await db.findProduct(1)) ?? null);
console.log("the next reader gets:", naira(next!.priceKobo), "reads:", db.reads);
```

Output of `npx tsx race-fixed.ts` and of the browser terminal

```ts
the slow reader got: ₦9,500
the next reader gets: ₦9,900 reads: 2
```

The slow reader still gets the price that was true when it asked. But it no longer poisons the cache, and the next reader gets ₦9,900. Across several servers with a shared cache, the same idea is done with a version number stored in the value, or by deleting the key a second time shortly after the write; the TTL stays as the last line of defence.

### Keys

Invalidation is only as good as your keys. A few rules:

- **Put every input in the key.** A price shown in naira and in dollars needs `product:1:NGN` and `product:1:USD`. A page for one customer needs their id in the key. A missing input in the key serves one request's answer to another.
- **Namespace and version keys.** `shop:product:v2:1`. When the shape of the cached value changes in a new release, bump `v2` to `v3` and old entries are simply never read again.
- **Know which keys a write affects.** Changing product 1's price affects `product:1`, but also cached lists such as "rice products" and "today's deals". Caching libraries offer **tags** for this: every entry can carry tags like `product:1`, and one call deletes everything with a tag.

## Stampedes

The flash sale starts at 12:00. At 12:00:00 the cache for the rice page is empty (or the entry just expired), and 100 shoppers arrive in the same second. Each one misses, and each one queries the database. This is a **cache stampede** (also called a thundering herd or dogpile): the moment the cache is needed most, it protects nothing.

stampede.ts

```ts
import { cacheAside } from "./src/cache-aside.js";
import { CatalogDb } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { SingleFlight } from "./src/single-flight.js";
import { TtlCache } from "./src/ttl-cache.js";

async function flashSale(useSingleFlight: boolean): Promise<number> {
  const db = new CatalogDb();
  const cache = new TtlCache<Product | null>(new ManualClock());
  const stats = { hits: 0, misses: 0 };
  const flight = new SingleFlight<Product | null>();
  const load = async () => (await db.findProduct(1)) ?? null;

  const shoppers = Array.from({ length: 100 }, () =>
    cacheAside(cache, stats, "product:1", 60_000, useSingleFlight ? () => flight.run("product:1", load) : load),
  );
  await Promise.all(shoppers);
  return db.reads;
}

console.log("100 shoppers, empty cache, plain cache-aside: reads =", await flashSale(false));
console.log("100 shoppers, empty cache, single-flight:     reads =", await flashSale(true));
```

Output of `npx tsx stampede.ts` and of the browser terminal

```ts
100 shoppers, empty cache, plain cache-aside: reads = 100
100 shoppers, empty cache, single-flight:     reads = 1
```

**Single-flight** (also called request coalescing) is the fix inside one process: the first miss starts the load and stores the promise; everyone else awaits that same promise. `finally` removes it when it settles, whether it succeeded or failed, so a failed load is retried by the next caller instead of being remembered.

With several servers, each process has its own `SingleFlight`, so ten servers still send ten reads. That is usually fine. When it is not, the servers agree through a **lock** in the shared cache: the first to set a key such as `lock:product:1` (with Redis, `SET lock:product:1 <id> NX PX 5000`: only if absent, expiring after 5 seconds) does the load; the others wait briefly and read the cache. The lock needs an expiry, or a crashed server would hold it forever.

### Stale-while-revalidate

Single-flight still makes the first shopper wait for the database. **Stale-while-revalidate** (SWR) goes further: each entry is *fresh* for a while, then *stale but usable* for a longer while. A stale entry is returned immediately, and one background refresh replaces it. Nobody waits unless the entry is completely too old:

src/swr-cache.ts

```ts
import type { Clock } from "./clock.js";
import { SingleFlight } from "./single-flight.js";

interface Entry<V> {
  readonly value: V;
  readonly freshUntil: number;
  readonly staleUntil: number;
}

export class SwrCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly flight = new SingleFlight<V>();
  refreshErrors = 0;

  constructor(
    private readonly clock: Clock,
    private readonly freshMs: number,
    private readonly staleMs: number,
  ) {}

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const entry = this.entries.get(key);
    const now = this.clock.now();
    if (entry !== undefined && now < entry.freshUntil) return entry.value;
    if (entry !== undefined && now < entry.staleUntil) {
      this.refresh(key, load).catch(() => {
        this.refreshErrors += 1;
      });
      return entry.value;
    }
    return this.refresh(key, load);
  }

  private refresh(key: string, load: () => Promise<V>): Promise<V> {
    return this.flight.run(key, async () => {
      const value = await load();
      const now = this.clock.now();
      this.entries.set(key, { value, freshUntil: now + this.freshMs, staleUntil: now + this.freshMs + this.staleMs });
      return value;
    });
  }
}
```

swr.ts

```ts
import { CatalogDb, naira } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { SwrCache } from "./src/swr-cache.js";

const clock = new ManualClock();
const db = new CatalogDb();
const cache = new SwrCache<Product | null>(clock, 60_000, 300_000);
const load = async () => (await db.findProduct(1)) ?? null;
const show = async (label: string) => {
  const product = await cache.get("product:1", load);
  console.log(label, naira(product!.priceKobo), "reads:", db.reads);
};

await show("t=0s    miss, loaded:   ");
await db.updatePrice(1, 990_000);
clock.advance(70_000);
await show("t=70s   stale, served:  ");
await new Promise((resolve) => setTimeout(resolve, 20));
await show("t=70s   refreshed:      ");
clock.advance(400_000);
await show("t=470s  too old, loaded:");
```

Output of `npx tsx swr.ts` and of the browser terminal

```ts
t=0s    miss, loaded:    ₦9,500 reads: 1
t=70s   stale, served:   ₦9,500 reads: 2
t=70s   refreshed:       ₦9,900 reads: 2
t=470s  too old, loaded: ₦9,900 reads: 3
```

At 70 seconds the entry was stale. The shopper got ₦9,500 at once, and the refresh had already started in the background (the second read). A moment later the new price was in. Only after the stale window ended too did a shopper wait for the database again. A failed background refresh is counted, not thrown: the shopper already has an answer, and the next request tries again. The same idea exists in HTTP as `Cache-Control: max-age=60, stale-while-revalidate=300`.

## Measuring a cache

A cache you do not measure is a guess. The most important number is the **hit rate**: hits divided by all lookups. Next come the number of **evictions** (entries pushed out to make room) and the time a miss takes. This simulation sends 20,000 requests for 1,000 products, where a few products are much more popular than the rest, as in every real shop, and tries different sizes and TTLs:

hit-rate.ts

```ts
import { cacheAside, hitRate } from "./src/cache-aside.js";
import { ManualClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

function shoppers(count: number): number[] {
  let seed = 2026;
  const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  return Array.from({ length: count }, () => Math.floor(1 + 1_000 * random() ** 4));
}

async function simulate(maxEntries: number, ttlMs: number): Promise<string> {
  const clock = new ManualClock();
  const cache = new TtlCache<string>(clock, maxEntries);
  const stats = { hits: 0, misses: 0 };
  for (const productId of shoppers(20_000)) {
    clock.advance(50);
    await cacheAside(cache, stats, `product:${productId}`, ttlMs, async () => `product ${productId}`);
  }
  return `size ${String(maxEntries).padStart(4)}, ttl ${String(ttlMs / 1_000).padStart(3)}s: hit rate ${hitRate(stats).padStart(5)}, evictions ${cache.evictions}`;
}

console.log(await simulate(50, 300_000));
console.log(await simulate(200, 300_000));
console.log(await simulate(1_000, 300_000));
console.log(await simulate(1_000, 10_000));
```

Output of `npx tsx hit-rate.ts` and of the browser terminal

```ts
size   50, ttl 300s: hit rate 33.6%, evictions 13220
size  200, ttl 300s: hit rate 55.7%, evictions 8637
size 1000, ttl 300s: hit rate 86.2%, evictions 0
size 1000, ttl  10s: hit rate 42.0%, evictions 0
```

How to read it:

- A cache of 50 entries is too small for this traffic: it keeps evicting entries that are needed again soon (**churn**). Growing it to 200 and then 1,000 raises the hit rate, and at 1,000 nothing is evicted at all.
- With room for everything, the TTL decides. At 10 seconds, most entries expire before the next request for them arrives.
- The popular products are hits in every configuration. That skew is why caches work at all: a small cache that holds the popular items serves most of the traffic.

In production, export the hit and miss counters, the evictions and the load time as metrics ([Observability](https://zudojs.oyinlola.site/learn/zudo-observability) shows how), and watch them after every change. A hit rate that suddenly drops usually means a key changed shape, for example a new field that makes every key unique.

## When the cache fails

An in-process cache cannot fail on its own, but a shared cache server can be down, slow or full. The rule for a cache of data that also lives in the database: **fail open**. A broken cache must make the site slower, never broken. Every cache call is wrapped, errors are counted, and the request carries on to the database:

fail-open.ts

```ts
import { CatalogDb } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";

interface RemoteCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

const brokenRedis: RemoteCache = {
  get: async () => { throw new Error("connect ECONNREFUSED 10.0.0.7:6379"); },
  set: async () => { throw new Error("connect ECONNREFUSED 10.0.0.7:6379"); },
};

const db = new CatalogDb();
let cacheErrors = 0;

async function getProduct(cache: RemoteCache, id: number): Promise<Product | undefined> {
  const key = `product:${id}`;
  try {
    const hit = await cache.get(key);
    if (hit !== undefined) return JSON.parse(hit) as Product;
  } catch {
    cacheErrors += 1;
  }
  const product = await db.findProduct(id);
  if (product !== undefined) {
    cache.set(key, JSON.stringify(product), 60).catch(() => {
      cacheErrors += 1;
    });
  }
  return product;
}

console.log((await getProduct(brokenRedis, 1))?.name);
console.log((await getProduct(brokenRedis, 2))?.name);
await new Promise((resolve) => setTimeout(resolve, 0));
console.log("database reads:", db.reads, "cache errors:", cacheErrors);
```

Output of `npx tsx fail-open.ts` and of the browser terminal

```ts
Rice, 5 kg
Groundnut oil, 1 L
database reads: 2 cache errors: 4
```

Both products were served from the database; four cache errors were counted (two failed reads, two failed writes). In a real client, also give every cache call a short **timeout**: a cache that hangs for 30 seconds is worse than one that is down, because every request waits for it. And make sure the database can survive a while without the cache, or a cache outage becomes a database outage.

Other ways caching goes wrong:

- **Caching errors.** If a failed load is stored, the error is served for the whole TTL. `SafeCache` only stores successful values.
- **Per-user data under a shared key.** A leak, as the reasoning section showed. Review every key that holds personal data.
- **Unbounded keys.** A key built from raw user input (a search string, a URL with random query parameters) lets anyone fill your cache with junk and push out the useful entries. Normalise inputs, and cache only known shapes.
- **Serialisation.** A shared cache stores text or bytes. A `Date` stored as JSON comes back as a string; a `Map` comes back as `{}`. Convert values deliberately, like a DTO.
- **Several servers, several in-memory caches.** Invalidating on one server leaves the other servers' copies alone until their TTL ends. Use a shared cache, or broadcast invalidations (for example with Redis pub/sub), or accept the TTL as your staleness bound.

## Testing a cache

Caches are full of time and concurrency, the two things that make tests flaky. The manual clock removes time; counting loads and resolving promises by hand removes the concurrency guesswork. These four tests pin the promises `SafeCache` makes:

tests/safe-cache.test.tsNode.js only

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ManualClock } from "../src/clock.js";
import { SafeCache } from "../src/safe-cache.js";
import { TtlCache } from "../src/ttl-cache.js";

function setup() {
  const clock = new ManualClock();
  const cache = new SafeCache(new TtlCache<string>(clock));
  let loads = 0;
  const load = async () => `price v${++loads}`;
  return { clock, cache, load, loads: () => loads };
}

describe("SafeCache", () => {
  it("serves from the cache until the TTL ends", async () => {
    const { clock, cache, load, loads } = setup();
    await cache.get("product:1", 60_000, load);
    clock.advance(59_999);
    assert.equal(await cache.get("product:1", 60_000, load), "price v1");
    clock.advance(1);
    assert.equal(await cache.get("product:1", 60_000, load), "price v2");
    assert.equal(loads(), 2);
  });

  it("loads once for many concurrent misses", async () => {
    const { cache, load, loads } = setup();
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.get("product:1", 60_000, load)));
    assert.equal(new Set(results).size, 1);
    assert.equal(loads(), 1);
  });

  it("does not cache a failed load", async () => {
    const { cache } = setup();
    await assert.rejects(cache.get("product:1", 60_000, async () => { throw new Error("db down"); }), /db down/);
    assert.equal(await cache.get("product:1", 60_000, async () => "recovered"), "recovered");
  });

  it("does not store a value loaded before an invalidation", async () => {
    const { cache } = setup();
    let finish!: (value: string) => void;
    const slow = cache.get("product:1", 60_000, () => new Promise<string>((resolve) => (finish = resolve)));
    cache.invalidate("product:1");
    finish("old price");
    await slow;
    assert.equal(await cache.get("product:1", 60_000, async () => "new price"), "new price");
  });
});
```

Output of `npx tsx tests/safe-cache.test.ts`

```ts
▶ SafeCache
  ✔ serves from the cache until the TTL ends (2.401785ms)
  ✔ loads once for many concurrent misses (1.358021ms)
  ✔ does not cache a failed load (0.88309ms)
  ✔ does not store a value loaded before an invalidation (0.426518ms)
✔ SafeCache (7.493762ms)
ℹ tests 4
ℹ suites 1
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 136.317271
```

The first test checks the exact TTL boundary: at 59,999 ms the entry is alive, at 60,000 ms it is gone. The last one rebuilds the race from the invalidation section with no timers at all: the test itself decides when the slow load finishes.

## In production: a shared cache

An in-process cache is the fastest kind, but it is per server, lost on every restart and limited by the process's memory. Most backends also use a **shared cache**, usually Redis (or Valkey, a compatible fork). The operations are the same ones you just built, over the network. Try them with Docker and `redis-cli`; the output below is an example:

Example output

```bash
$ docker run --name shop-cache -p 6380:6379 -d redis:8-alpine
$ docker exec -it shop-cache redis-cli
127.0.0.1:6379> SET shop:product:v1:1 '{"id":1,"name":"Rice, 5 kg","priceKobo":950000}' EX 60
OK
127.0.0.1:6379> GET shop:product:v1:1
"{\"id\":1,\"name\":\"Rice, 5 kg\",\"priceKobo\":950000}"
127.0.0.1:6379> TTL shop:product:v1:1
(integer) 57
127.0.0.1:6379> DEL shop:product:v1:1
(integer) 1
127.0.0.1:6379> GET shop:product:v1:1
(nil)
```

`EX 60` is the TTL in seconds, `TTL` shows how long is left, and `DEL` is your invalidation. Configure a memory limit and an eviction policy (`maxmemory` and `maxmemory-policy allkeys-lru`), or Redis will refuse writes when it is full. Keep the cache on a private network with a password: a cache holds copies of your data. When you are done, `docker rm -f shop-cache` removes it.

Everything in this lesson (TTLs, keys, tags, locks, stampede protection, metrics, in-memory and Redis adapters) is what a caching library packages. [Caching](https://zudojs.oyinlola.site/learn/zudo-cache), in the ZudoJS course, shows `@zudojs/cache`, which provides exactly these building blocks, so you can use them without rewriting them in every project.

## Practice

TRY IT YOURSELF

### A shorter TTL for 'not found'

Missing products are cached for the full 60 seconds, like real ones. If product 4 is created a moment after someone asked for it, it stays invisible for a minute. Write `getProduct` so that found products are cached for 60 seconds and missing ones for 5.

**Show a solution**

negative-ttl.ts

```ts
import { CatalogDb } from "./src/catalog-db.js";
import type { Product } from "./src/catalog-db.js";
import { ManualClock } from "./src/clock.js";
import { TtlCache } from "./src/ttl-cache.js";

const clock = new ManualClock();
const db = new CatalogDb();
const cache = new TtlCache<Product | null>(clock);

async function getProduct(id: number): Promise<Product | null> {
  const key = `product:${id}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const product = (await db.findProduct(id)) ?? null;
  cache.set(key, product, product === null ? 5_000 : 60_000);
  return product;
}

await getProduct(1);
await getProduct(4);
clock.advance(6_000);
await getProduct(1);
await getProduct(4);
console.log("reads:", db.reads, "(product 1 once, product 4 twice)");
```

Output of `npx tsx negative-ttl.ts` and of the browser terminal

```ts
reads: 3 (product 1 once, product 4 twice)
```

Negative entries protect the database from floods of requests for ids that do not exist, but they should expire quickly, because "does not exist yet" is the most likely thing to change.

TRY IT YOURSELF

### Jitter

Write `withJitter(ttlMs, fraction, random)` that returns a TTL randomly spread by ± `fraction` (0.1 means ±10%). Take `random` as a parameter (a function returning a number from 0 to 1) so it can be tested. Show the spread for 1,000 keys with a TTL of 60 seconds.

**Show a solution**

jitter.ts

```ts
function withJitter(ttlMs: number, fraction: number, random: () => number): number {
  const spread = ttlMs * fraction;
  return Math.round(ttlMs - spread + random() * 2 * spread);
}

let seed = 7;
const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;

const ttls = Array.from({ length: 1_000 }, () => withJitter(60_000, 0.1, random));
console.log("shortest:", Math.min(...ttls) >= 54_000, "longest:", Math.max(...ttls) <= 66_000);
console.log("distinct expiry times:", new Set(ttls).size > 900);
console.log(withJitter(60_000, 0.1, () => 0), withJitter(60_000, 0.1, () => 0.5), withJitter(60_000, 0.1, () => 1));
```

Output of `npx tsx jitter.ts` and of the browser terminal

```ts
shortest: true longest: true
distinct expiry times: true
54000 60000 66000
```

Instead of 1,000 keys expiring in the same millisecond, their expiries spread over 12 seconds, so the database sees a gentle stream of reloads instead of one spike. Passing `random` in makes the edges (0, 0.5, 1) easy to check.

TRY IT YOURSELF

### The cart that everyone saw

This code caches carts. Find the bug, explain its effect, and fix it.

cart-cache.ts

```ts
async function getCart(customerId: number): Promise<Cart> {
  return cache.get("cart", 30_000, () => carts.findByCustomer(customerId));
}
```

**Show a solution**

The key `"cart"` does not contain the customer id. The first customer's cart is cached, and for the next 30 seconds every other customer gets it: their name, address and items. It is a privacy breach, and the checkout would charge the wrong customer for the wrong items. The fix is to put every input in the key:

cart-cache.ts

```ts
async function getCart(customerId: number): Promise<Cart> {
  return cache.get(`cart:${customerId}`, 30_000, () => carts.findByCustomer(customerId));
}
```

Better still, ask whether a cart needs caching at all. It is read by one person, changes often, and is cheap to load by primary key. Cache what is read by many and changes rarely.

## Recap

- A cache trades freshness for speed. Cache data read by many and changed rarely; never cache data used to decide about money or permissions; put every input, including the user, in the key.
- Cache-aside: read the cache, on a miss load and store with a TTL; on a write, update the database and then delete the key. The TTL bounds staleness and backs up every invalidation.
- Bound the cache's size (LRU) and inject the clock. Cache "not found" briefly.
- A slow reader can put stale data back after an invalidation; per-key generations (or versions) stop it.
- Single-flight turns a stampede of misses into one load; locks do it across servers; stale-while-revalidate serves the old value while one refresh runs.
- Measure hit rate, evictions and load time. Fail open with timeouts when a shared cache breaks.

Next: [Queues and background jobs](https://zudojs.oyinlola.site/learn/backend-queues), for work that should not happen while the customer waits.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
