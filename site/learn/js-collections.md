---
title: "Collections in depth — ZudoJS Academy"
description: "Choose between Map, Set, WeakMap, WeakSet and WeakRef by how they compare keys, keep order and hold memory; build a bounded cache and object-keyed memos."
source: https://zudojs.oyinlola.site/learn/js-collections
---

LEVEL 4 · LESSON 6 OF 20

Built-in objects Core

# Collections in depth

Choose between Map, Set, WeakMap, WeakSet and WeakRef by how they compare keys, keep order and hold memory; build a bounded cache and object-keyed memos.

- **50 min** to read and try
- **You need:** Hash maps and sets, Sets, Types in depth, and Numbers in depth
- **You build:** A bounded LRU price cache on top of Map, memoisation keyed by cart objects with WeakMap, and de-duplication of orders by id, all with tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Predict how Map and Set compare keys and in what order they iterate, including while they are being changed
- Build a bounded LRU cache with Map and explain why an unbounded cache is a memory leak
- Use WeakMap and WeakSet to attach data to objects without keeping them alive
- Explain what WeakRef and FinalizationRegistry promise and what they do not
- Group, de-duplicate and combine data with Map.groupBy and the set methods
- Choose the right collection for a cache, an index, a registry or private data

## The cache that never forgot

A shop's checkout service computes the price of a cart: discounts, delivery, VAT. It is slow, and the same cart object is priced several times while one request is handled (the page, the summary and the payment step all ask). A developer adds a cache, a `Map` from the cart object to its price:

leaky-cache.js

```ts
const priceCache = new Map();
let computed = 0;

function priceCart(cart) {
  if (priceCache.has(cart)) return priceCache.get(cart);
  computed += 1;
  const total = cart.lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0);
  priceCache.set(cart, total);
  return total;
}

function handleRequest(i) {
  const cart = { id: `CART-${i}`, lines: [{ priceKobo: 850000, qty: 1 + (i % 3) }] };
  priceCart(cart);
  priceCart(cart);
  return priceCart(cart);
}

for (let i = 0; i < 10000; i++) handleRequest(i);

console.log("computed:", computed);
console.log("entries kept:", priceCache.size);
```

Output of `node leaky-cache.js` and of the browser terminal

```ts
computed: 10000
entries kept: 10000
```

The cache works: each cart is priced once instead of three times. But after 10,000 requests it still holds 10,000 carts. Every request's cart finished long ago, yet the `Map` refers to each one, so none of them can ever be freed. In production that is a **memory leak**: the process grows until it slows down and is killed.

A collection is more than "a place to put things". Every one answers three questions differently: *how are keys compared*, *in what order do entries come out*, and *does holding an entry keep its key alive*. [Hash maps and sets](https://zudojs.oyinlola.site/learn/dsa-hash-maps#map-vs-object) compared `Map` with plain objects and [Sets](https://zudojs.oyinlola.site/learn/logic-sets) covered set operations. This lesson answers the three questions precisely, fixes this cache twice (with a size limit and with a weak key), and ends with a guide to picking the right collection.

## How Map and Set compare keys

`Map` and `Set` decide whether two keys are the same with an algorithm the specification calls **SameValueZero**. It is `===` with one change: `NaN` equals `NaN`. Like `===`, it treats `+0` and `-0` as the same, and it compares objects by **identity**: two objects are the same key only if they are the same object in memory.

same-value-zero.js

```ts
const prices = new Map();
prices.set(NaN, "no price yet");
prices.set(-0, "free");
console.log(prices.get(NaN), prices.get(0), prices.size);

console.log(new Set([0, -0, NaN, NaN, "0"]).size);

const seen = new Set();
seen.add({ sku: "RICE-5KG" });
console.log(seen.has({ sku: "RICE-5KG" }));

const key = ["RICE-5KG", "Lagos"];
const deliveryFee = new Map([[key, 150000]]);
console.log(deliveryFee.get(["RICE-5KG", "Lagos"]), deliveryFee.get(key));
```

Output of `node same-value-zero.js` and of the browser terminal

```ts
no price yet free 2
3
false
undefined 150000
```

The last two lines are the classic mistake. An array or object literal creates a *new* object every time it is evaluated, so looking it up never finds the entry. When a key is made of several parts, such as a product and a city, you have two options:

- Build a **string key** from the parts: `\`${sku}|${city}\``. Pick a separator that cannot appear in the parts, or two different pairs can produce the same string.
- Use **nested maps**: a map from product to a map from city to fee. That avoids the separator problem, and lets you read all cities of one product.

composite-keys.js

```ts
const fees = new Map();

function setFee(sku, city, kobo) {
  if (!fees.has(sku)) fees.set(sku, new Map());
  fees.get(sku).set(city, kobo);
}

function getFee(sku, city) {
  return fees.get(sku)?.get(city);
}

setFee("RICE-5KG", "Lagos", 150000);
setFee("RICE-5KG", "Abuja", 250000);
setFee("OIL-1L", "Lagos", 50000);

console.log(getFee("RICE-5KG", "Abuja"), getFee("OIL-1L", "Abuja"), getFee("SALT", "Lagos"));
console.log([...fees.get("RICE-5KG").keys()]);

const flat = new Map([["a|b", 1]]);
console.log(flat.has(["a", "b"].join("|")), ["a|b", ""].join("|") === ["a", "b|"].join("|"));
```

Output of `node composite-keys.js` and of the browser terminal

```ts
250000 undefined undefined
[ 'Lagos', 'Abuja' ]
true true
```

The last line is the separator problem: `"a|b"` + `""` and `"a"` + `"b|"` both become `"a|b|"`. With product codes and city names you control, a separator such as `|` is fine; with free text, use nested maps or `JSON.stringify([a, b])`, which escapes its parts.

## Iteration order, and changing a collection while looping

A `Map` and a `Set` iterate in **insertion order**: the order in which keys were first added. Two details make that order useful:

- Setting an existing key *changes its value but not its position*.
- Deleting a key and adding it again moves it to the *end*.

insertion-order.js

```ts
const recent = new Map([["RICE", 1], ["OIL", 2], ["SALT", 3]]);

recent.set("RICE", 10);
console.log([...recent.keys()]);

recent.delete("RICE");
recent.set("RICE", 10);
console.log([...recent.keys()]);

console.log(recent.keys().next().value);
```

Output of `node insertion-order.js` and of the browser terminal

```json
[ 'RICE', 'OIL', 'SALT' ]
[ 'OIL', 'SALT', 'RICE' ]
OIL
```

"Delete and re-add moves to the end" plus "the first key is the oldest" is all you need for a least-recently-used cache, which you will build shortly. `map.keys()` returns an **iterator**: an object that produces values one at a time when you call `next()` ([Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators) explains the protocol). Asking for just the first one is O(1).

### Changing a Map during a loop

Unlike some languages, JavaScript allows adding and deleting while you iterate a `Map` or `Set`, with clear rules: an entry deleted before the loop reaches it is skipped, and an entry added during the loop is visited later in the same loop.

mutate-while-iterating.js

```ts
const queue = new Map([["ORD-1", "paid"], ["ORD-2", "cancelled"], ["ORD-3", "paid"]]);

for (const [id, status] of queue) {
  console.log("visit", id, status);
  if (id === "ORD-1") {
    queue.delete("ORD-2");
    queue.set("ORD-4", "paid");
  }
}
console.log([...queue.keys()]);

const ids = new Set(["A"]);
let visits = 0;
for (const id of ids) {
  visits += 1;
  if (visits < 5) ids.add(`${id}+`);
}
console.log(visits, ids.size);
```

Output of `node mutate-while-iterating.js` and of the browser terminal

```ts
visit ORD-1 paid
visit ORD-3 paid
visit ORD-4 paid
[ 'ORD-1', 'ORD-3', 'ORD-4' ]
5 5
```

The rule is safe, but it has a trap: a loop that adds a new entry for every entry it visits never ends. The second loop only stops because of the counter. When a loop must change the collection it walks, iterate over a snapshot instead: `for (const id of [...ids])`.

## Fix one: a bounded cache

An unbounded cache is a leak with good intentions. The simplest fix is a **size limit** plus an **eviction policy**: the rule for which entry to remove when the cache is full. **Least recently used** (LRU) evicts the entry that was read or written longest ago, on the bet that recently used entries will be used again soon. With a `Map`, "recently used" is simply "near the end":

lru.js

```ts
export class LruCache {
  #max;
  #entries = new Map();
  hits = 0;
  misses = 0;

  constructor(max) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError(`max must be a positive integer, got ${max}`);
    this.#max = max;
  }

  get(key) {
    if (!this.#entries.has(key)) {
      this.misses += 1;
      return undefined;
    }
    const value = this.#entries.get(key);
    this.#entries.delete(key);
    this.#entries.set(key, value);
    this.hits += 1;
    return value;
  }

  set(key, value) {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value;
      this.#entries.delete(oldest);
    }
    return this;
  }

  get size() {
    return this.#entries.size;
  }

  keys() {
    return [...this.#entries.keys()];
  }
}
```

Every operation is O(1): `has`, `get`, `delete` and `set` on a `Map` are constant time on average, and so is reading the first key. `get` uses `has` rather than checking for `undefined`, so a cached `undefined` still counts as a hit. Now the price cache keyed by product code, as a catalogue service would use it:

lru-demo.js

```ts
import { LruCache } from "./lru.js";

const cache = new LruCache(3);
const loads = [];

function priceOf(sku) {
  const cached = cache.get(sku);
  if (cached !== undefined) return cached;
  loads.push(sku);
  const price = { "RICE-5KG": 850000, "OIL-1L": 320000, "SALT": 45000, "BEANS": 610000 }[sku];
  cache.set(sku, price);
  return price;
}

for (const sku of ["RICE-5KG", "OIL-1L", "RICE-5KG", "SALT", "BEANS", "OIL-1L", "RICE-5KG"]) priceOf(sku);

console.log("loaded from database:", loads);
console.log("cache now:", cache.keys(), `hits ${cache.hits}, misses ${cache.misses}`);
```

Output of `node lru-demo.js` and of the browser terminal

```ts
loaded from database: [ 'RICE-5KG', 'OIL-1L', 'SALT', 'BEANS', 'OIL-1L', 'RICE-5KG' ]
cache now: [ 'BEANS', 'OIL-1L', 'RICE-5KG' ] hits 1, misses 6
```

Follow the sequence: when `BEANS` arrives the cache is full with `OIL-1L`, `RICE-5KG`, `SALT` (oldest first, because `RICE-5KG` was just read). `OIL-1L` is the least recently used, so it is evicted, and the next request for it is a miss. Loading it again evicts `RICE-5KG`, so the last request misses too. The cache never holds more than 3 entries, whatever the traffic, but this run also shows the limit of LRU: four products used in rotation with room for three means almost every request misses. Size a cache for the *working set*, the keys in active use, and watch its hit rate in production.

> TIP
>
> A size limit bounds memory, but not *staleness*: a cached price can be wrong after the shop changes it. Real caches add a time-to-live (TTL) per entry or delete entries when the data changes. Across several server processes, each has its own in-memory cache, so they can disagree; shared caches such as Redis solve that, as [the ZudoJS cache lesson](https://zudojs.oyinlola.site/learn/zudo-cache) shows.

## Sets beyond de-duplication

[Sets](https://zudojs.oyinlola.site/learn/logic-sets#operations) introduced `union`, `intersection`, `difference` and the subset tests. Two further details make them more useful in real code.

### The set methods accept "set-like" objects

The argument of `intersection`, `difference` and friends does not have to be a `Set`. It only needs a `size`, a `has` method and a `keys` method. A `Map` has all three, so you can intersect a set of product codes with a map of stock levels directly:

set-like.js

```ts
const inCart = new Set(["RICE-5KG", "OIL-1L", "SALT"]);
const stock = new Map([["RICE-5KG", 4], ["BEANS", 0], ["OIL-1L", 2]]);

console.log(inCart.intersection(stock));
console.log(inCart.difference(stock));

try {
  inCart.union(["BEANS"]);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(inCart.union(new Set(["BEANS"])).size);
```

Output of `node set-like.js` and of the browser terminal

```ts
Set(2) { 'RICE-5KG', 'OIL-1L' }
Set(1) { 'SALT' }
TypeError: The .size property is NaN
4
```

`difference` answers "which cart items does the shop not stock at all?". An array is *not* set-like (it has no `size`), so wrap it in `new Set(…)` first. The error message is confusing; now you know what it means.

### De-duplicating objects by a key

A set de-duplicates by identity, which is useless for objects that arrive from JSON: two copies of the same order are two different objects. De-duplicate by a key with a `Map`, choosing whether the first or the last copy wins:

dedupe.js

```ts
const webhookEvents = [
  { orderId: "ORD-1", status: "pending" },
  { orderId: "ORD-2", status: "paid" },
  { orderId: "ORD-1", status: "paid" },
  { orderId: "ORD-3", status: "pending" },
  { orderId: "ORD-2", status: "paid" },
];

console.log(new Set(webhookEvents).size);

const lastWins = new Map(webhookEvents.map((event) => [event.orderId, event]));
console.log([...lastWins.values()]);

const firstWins = new Map();
for (const event of webhookEvents) {
  if (!firstWins.has(event.orderId)) firstWins.set(event.orderId, event);
}
console.log([...firstWins.values()].map((e) => `${e.orderId}:${e.status}`).join(" "));
```

Output of `node dedupe.js` and of the browser terminal

```ts
5
[
  { orderId: 'ORD-1', status: 'paid' },
  { orderId: 'ORD-2', status: 'paid' },
  { orderId: 'ORD-3', status: 'pending' }
]
ORD-1:pending ORD-2:paid ORD-3:pending
```

Building a map from `[key, value]` pairs lets later pairs overwrite earlier ones, so the *last* status wins while each order keeps the position of its *first* appearance. For payment notifications that is usually what you want: the newest status. The "first wins" version keeps the original record, for example the first time a customer registered.

## Grouping and converting

`Map.groupBy(items, keyFn)` (ES2024) builds a map from each key to the array of items with that key. `Object.groupBy` does the same into a null-prototype object. Use the `Map` version when keys are not strings, or when they come from data:

group-by.js

```ts
const orders = [
  { id: "ORD-1", status: "paid", totalKobo: 1250000 },
  { id: "ORD-2", status: "pending", totalKobo: 450000 },
  { id: "ORD-3", status: "paid", totalKobo: 800000 },
  { id: "ORD-4", status: "refunded", totalKobo: 300000 },
];

const byStatus = Map.groupBy(orders, (order) => order.status);
for (const [status, list] of byStatus) {
  const total = list.reduce((sum, o) => sum + o.totalKobo, 0);
  console.log(status.padEnd(9), list.length, `₦${total / 100}`);
}

const bigOrSmall = Map.groupBy(orders, (order) => order.totalKobo >= 800000);
console.log(bigOrSmall.get(true).map((o) => o.id), bigOrSmall.get(false).map((o) => o.id));
```

Output of `node group-by.js` and of the browser terminal

```ts
paid      2 ₦20500
pending   1 ₦4500
refunded  1 ₦3000
[ 'ORD-1', 'ORD-3' ] [ 'ORD-2', 'ORD-4' ]
```

The boolean keys in the last example would become the strings `"true"` and `"false"` with `Object.groupBy`. Groups appear in the order their key was first seen.

### Maps, Sets and JSON

JSON has no map or set type, and `JSON.stringify` prints them as empty objects, silently. Convert explicitly on the way out and on the way in. `structuredClone` ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#copies)) copies them properly:

collections-json.js

```ts
const stock = new Map([["RICE-5KG", 4], ["OIL-1L", 2]]);
const tags = new Set(["sale", "new"]);

console.log(JSON.stringify({ stock, tags }));

const body = JSON.stringify({ stock: Object.fromEntries(stock), tags: [...tags] });
console.log(body);

const parsed = JSON.parse(body);
const restored = { stock: new Map(Object.entries(parsed.stock)), tags: new Set(parsed.tags) };
console.log(restored.stock.get("OIL-1L"), restored.tags.has("sale"));

const copy = structuredClone(stock);
copy.set("RICE-5KG", 0);
console.log(stock.get("RICE-5KG"), copy.get("RICE-5KG"));
```

Output of `node collections-json.js` and of the browser terminal

```json
{"stock":{},"tags":{}}
{"stock":{"RICE-5KG":4,"OIL-1L":2},"tags":["sale","new"]}
2 true
4 0
```

`Object.fromEntries` works when the keys are strings. For other keys, send the entries array, `[...map]`, which JSON can hold as an array of pairs.

## Fix two: WeakMap, data that does not keep its key alive

Back to the leaking price cache. Its keys are cart objects, and the cached price is only useful while the cart itself is in use. That is exactly the case for a **WeakMap**. A `WeakMap` holds its keys **weakly**: the entry does not count as a reference to the key. When nothing else in the program can reach the cart, the garbage collector may free it, and the entry disappears with it.

To make that possible, a `WeakMap` gives up everything that would reveal which keys are still there: it has no `size`, no `keys()`, no iteration and no `clear()`. Its keys must be objects (or symbols that were not created with `Symbol.for`), because a primitive such as `"CART-1"` can always be recreated and so could never be collected.

weak-cache.js

```ts
const priceCache = new WeakMap();
let computed = 0;

function priceCart(cart) {
  if (priceCache.has(cart)) return priceCache.get(cart);
  computed += 1;
  const total = cart.lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0);
  priceCache.set(cart, total);
  return total;
}

for (let i = 0; i < 10000; i++) {
  const cart = { id: `CART-${i}`, lines: [{ priceKobo: 850000, qty: 1 + (i % 3) }] };
  priceCart(cart);
  priceCart(cart);
  priceCart(cart);
}
console.log("computed:", computed);
console.log(typeof priceCache.size, Symbol.iterator in priceCache);

for (const bad of ["CART-1", Symbol.for("cart")]) {
  try {
    priceCache.set(bad, 0);
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `node weak-cache.js` and of the browser terminal

```ts
computed: 10000
undefined false
TypeError: Invalid value used as weak map key
TypeError: Invalid value used as weak map key
```

The behaviour of the cache is the same, but it can no longer leak: each cart's entry lives exactly as long as the cart. You cannot see that from inside a normal program, which is the point. In Node.js you can force a garbage collection for a demonstration, using an internal flag that you should never use in real code. A `WeakRef` (below) lets you ask whether an object still exists:

weak-gc.jsNode.js only

```ts
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const collectGarbage = vm.runInNewContext("gc");

const cache = new WeakMap();
let cart = { id: "CART-1", lines: new Array(100000).fill({ priceKobo: 850000, qty: 1 }) };
cache.set(cart, 85000000000);
const probe = new WeakRef(cart);

console.log("before:", probe.deref()?.id, cache.has(cart));
cart = null;

await new Promise((resolve) => setTimeout(resolve, 0));
collectGarbage();
console.log("after:", probe.deref());
```

Output of `node weak-gc.js`

```ts
before: CART-1 true
after: undefined
```

Once the only strong reference, `cart`, is gone, the collector frees the cart together with its cache entry. The `setTimeout` is needed because a `WeakRef` keeps its target alive until the current piece of synchronous work finishes. [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory) goes deeper into reachability and leaks.

### Which fix?

The two fixes solve different problems. The WeakMap cache is right when the *key object* defines the lifetime: one cart, one request, one DOM node. The LRU cache is right when keys are primitives such as product codes that never "die", or when you want entries to outlive the objects that created them. Many systems use both.

### Private data and metadata for objects you do not own

Before `#private` fields existed, WeakMaps were the standard way to keep private per-instance data. Today they remain the tool for attaching data to objects you *cannot* add fields to: objects from a library, frozen objects, or objects that must not change shape, such as a request object shared by middleware:

metadata.js

```ts
const requestStart = new WeakMap();
const requestUser = new WeakMap();

function timing(request) {
  requestStart.set(request, 1_700_000_000_000);
}

function auth(request) {
  if (request.headers.authorization === "Bearer token-ada") requestUser.set(request, { id: "USR-1", name: "Ada" });
}

function handler(request) {
  const user = requestUser.get(request);
  return `${user ? user.name : "guest"} started at ${requestStart.get(request)}`;
}

const request = Object.freeze({ path: "/cart", headers: { authorization: "Bearer token-ada" } });
timing(request);
auth(request);
console.log(handler(request));
console.log(Object.keys(request), requestUser.has({ ...request }));
```

Output of `node metadata.js` and of the browser terminal

```ts
Ada started at 1700000000000
[ 'path', 'headers' ] false
```

The request is frozen, so no middleware can add a property to it, yet each one attaches its own data. Nobody else can read the user without the `requestUser` map, and when the request is finished, the metadata goes with it. A copy of the request (`{ ...request }`) is a different object and has no metadata.

## WeakSet: marking objects

A `WeakSet` is a set of objects held weakly: it can only answer "have I marked this object?". It fits "already processed" flags on objects whose lifetime you do not control. A common use is cycle detection when walking object graphs, such as serialising a data structure where an order refers to its customer and the customer refers back to the order:

weakset-cycles.js

```ts
function toPlain(value, seen = new WeakSet()) {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  const out = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) out[key] = toPlain(child, seen);
  seen.delete(value);
  return out;
}

const customer = { id: "CUS-1", name: "Ada", orders: [] };
const order = { id: "ORD-1", customer };
customer.orders.push(order);

console.log(JSON.stringify(toPlain(order)));

const sharedAddress = { city: "Lagos" };
console.log(JSON.stringify(toPlain({ billing: sharedAddress, shipping: sharedAddress })));
```

Output of `node weakset-cycles.js` and of the browser terminal

```json
{"id":"ORD-1","customer":{"id":"CUS-1","name":"Ada","orders":["[circular]"]}}
{"billing":{"city":"Lagos"},"shipping":{"city":"Lagos"}}
```

`seen` holds the objects on the *current path*: each one is added on the way down and removed on the way back. That is why the shared address, used twice but not in a cycle, is copied both times. A `Set` would work here too; the `WeakSet` guarantees that a long-lived `seen` could never keep objects alive by accident.

## WeakRef and FinalizationRegistry, briefly

Two more weak tools exist. A **WeakRef** holds a single object weakly: `ref.deref()` returns the object if it still exists, or `undefined` once it has been collected (the `probe` above used one). A **FinalizationRegistry** lets you register a callback that *may* run some time after an object has been collected. Together they allow a cache of large values that are cheap to rebuild, such as rendered monthly reports, which the engine may reclaim when memory is short.

Treat both as optimisations only. The specification deliberately promises very little: an object may be collected late or never, different engines behave differently, and a finalization callback may not run at all, for example when the process exits. Never use them for program logic such as releasing a lock, closing a file or saving data; use explicit `close()` methods and `try...finally` for that. [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory#weak) builds the report cache with both and shows where it can surprise you.

## Choosing a collection

| Need | Use | Because |
| --- | --- | --- |
| A record with known fields (a user, an order) | Plain object or class | Fixed names, JSON-friendly |
| A dictionary with keys from data (id → product) | `Map` | Any key, no inherited keys, insertion order, O(1) `size` |
| Membership, de-duplication of primitives, set algebra | `Set` | O(1) `has`, set methods |
| A cache with primitive keys | `Map` with a size limit (LRU) and a TTL | Bounded memory, controlled staleness |
| Data about an object that should die with it | `WeakMap` | Entry lives exactly as long as the key |
| "Seen" or "processed" marks on objects | `WeakSet` | No leak, no need to clean up |
| Optional cache of large re-creatable objects | `WeakRef` (+ `FinalizationRegistry`) | Engine may reclaim; never for correctness |

## Before you build: a cart pricing cache

REASON IT OUT

### What should be cached, under which key, and for how long?

The checkout prices a cart several times per request, and looks up product prices from a slow catalogue. You will build two caches and test them. Before reading the code, think through:

- The cart price depends on the cart's lines. If code adds a line to the same cart object after the price was cached, what does a WeakMap cache keyed by the cart return? How can you prevent that?
- Product prices are looked up by SKU string. Why can this cache not be a WeakMap? What bounds its memory, and what bounds how stale a price can be?
- Can a cached value be `undefined` or `0` (a free gift)? What does `if (cache.get(key))` do then?
- Two requests ask for the same uncached SKU at the same moment. How many catalogue lookups happen? Does it matter?

**Show the reasoning**

- It returns the old price: the key is the same object, so the cache cannot tell the cart changed. Either make carts immutable (every change creates a new cart object, so a changed cart is a new key) or clear the entry in the only method allowed to change lines. The build freezes carts and creates a new one on every change.
- Strings are primitives and are never collected, so a WeakMap refuses them. A size limit (LRU) bounds memory; a time-to-live bounds staleness, and deleting the entry when a price is edited makes it fresh at once.
- Truthiness checks treat `0` as a miss and recompute free gifts forever. Use `has(key)` to decide hit or miss.
- Both miss and both load. For a price that is harmless. For expensive loads, cache the *promise* of the value instead of the value, so the second request waits for the first load: [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency#races) builds exactly that.

## Build: a checkout's two caches

The LRU class from earlier gets a time-to-live. The clock is passed in, so tests can move time forward without waiting:

ttl-cache.js

```ts
export class TtlLruCache {
  #max;
  #ttlMs;
  #now;
  #entries = new Map();

  constructor({ max, ttlMs, now = () => Date.now() }) {
    this.#max = max;
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  has(key) {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    if (this.#now() >= entry.expiresAt) {
      this.#entries.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    if (!this.has(key)) return undefined;
    const entry = this.#entries.get(key);
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs });
    if (this.#entries.size > this.#max) this.#entries.delete(this.#entries.keys().next().value);
    return this;
  }

  delete(key) {
    return this.#entries.delete(key);
  }

  get size() {
    return this.#entries.size;
  }
}
```

The pricing module uses a `WeakMap` for cart totals, keyed by frozen cart objects, and the TTL cache for product prices:

pricing.js

```ts
import { TtlLruCache } from "./ttl-cache.js";

export function createPricing({ catalogue, now }) {
  const prices = new TtlLruCache({ max: 1000, ttlMs: 60_000, now });
  const totals = new WeakMap();
  const stats = { catalogueLookups: 0, totalsComputed: 0 };

  function priceOf(sku) {
    if (prices.has(sku)) return prices.get(sku);
    stats.catalogueLookups += 1;
    const kobo = catalogue.get(sku);
    if (kobo === undefined) throw new Error(`unknown product ${sku}`);
    prices.set(sku, kobo);
    return kobo;
  }

  function totalOf(cart) {
    if (!Object.isFrozen(cart)) throw new TypeError("carts must be frozen to be cached");
    if (totals.has(cart)) return totals.get(cart);
    stats.totalsComputed += 1;
    const total = cart.lines.reduce((sum, line) => sum + priceOf(line.sku) * line.qty, 0);
    totals.set(cart, total);
    return total;
  }

  return { priceOf, totalOf, stats, forget: (sku) => prices.delete(sku) };
}

export function createCart(lines = []) {
  return Object.freeze({ lines: Object.freeze(lines.map((line) => Object.freeze({ ...line }))) });
}

export function addLine(cart, sku, qty) {
  return createCart([...cart.lines, { sku, qty }]);
}
```

`addLine` never changes a cart; it returns a new frozen one, so a changed cart is automatically a new cache key. The same idea of immutable values runs through [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional). Now a request's worth of calls:

checkout-demo.js

```ts
import { addLine, createCart, createPricing } from "./pricing.js";

let clock = 0;
const catalogue = new Map([["RICE-5KG", 850000], ["OIL-1L", 320000], ["GIFT-BAG", 0]]);
const pricing = createPricing({ catalogue, now: () => clock });

const cart = createCart([{ sku: "RICE-5KG", qty: 2 }, { sku: "GIFT-BAG", qty: 1 }]);
console.log(pricing.totalOf(cart), pricing.totalOf(cart), pricing.totalOf(cart));

const bigger = addLine(cart, "OIL-1L", 1);
console.log(pricing.totalOf(bigger), pricing.totalOf(cart));
console.log(pricing.stats);

catalogue.set("RICE-5KG", 900000);
console.log(pricing.priceOf("RICE-5KG"));
clock += 60_000;
console.log(pricing.priceOf("RICE-5KG"), pricing.stats.catalogueLookups);
```

Output of `node checkout-demo.js` and of the browser terminal

```ts
1700000 1700000 1700000
2020000 1700000
{ catalogueLookups: 3, totalsComputed: 2 }
850000
900000 4
```

Three calls with the same cart compute once. The bigger cart is a new object, so it is computed once too, while the original is still cached. The free gift bag is cached although its price is 0, because the cache checks `has`. The price change in the catalogue is invisible until the entry expires, 60 seconds later on the fake clock: the TTL is the maximum staleness you accept.

## Testing caches

A cache must never change *what* a program returns, only how often the slow path runs. So cache tests check two things: the values are correct, and the number of slow calls is what you expect. A controllable clock makes expiry testable in microseconds:

cache.test.js

```ts
import { LruCache } from "./lru.js";
import { TtlLruCache } from "./ttl-cache.js";
import { addLine, createCart, createPricing } from "./pricing.js";

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const lru = new LruCache(2).set("a", 1).set("b", 2);
lru.get("a");
lru.set("c", 3);
check("LRU evicts least recently used", lru.keys(), ["a", "c"]);
check("LRU stores undefined as a hit", new LruCache(1).set("x", undefined).get("x"), undefined);

let now = 0;
const ttl = new TtlLruCache({ max: 10, ttlMs: 100, now: () => now });
ttl.set("RICE", 850000);
now = 99;
check("fresh before TTL", ttl.get("RICE"), 850000);
now = 100;
check("expired at TTL", ttl.has("RICE"), false);
check("expired entry removed", ttl.size, 0);

const catalogue = new Map([["A", 100], ["B", 0]]);
const pricing = createPricing({ catalogue, now: () => 0 });
const cart = createCart([{ sku: "A", qty: 3 }, { sku: "B", qty: 5 }]);
check("total", pricing.totalOf(cart), 300);
pricing.totalOf(cart);
check("computed once", pricing.stats.totalsComputed, 1);
check("zero price cached", pricing.stats.catalogueLookups, 2);
check("new cart, new total", pricing.totalOf(addLine(cart, "A", 1)), 400);

let error = null;
try {
  pricing.totalOf({ lines: [] });
} catch (e) {
  error = e.name;
}
check("unfrozen cart refused", error, "TypeError");

pricing.forget("A");
catalogue.set("A", 200);
check("forget refreshes price", pricing.priceOf("A"), 200);
```

Output of `node cache.test.js` and of the browser terminal

```ts
PASS LRU evicts least recently used -> ["a","c"]
PASS LRU stores undefined as a hit -> undefined
PASS fresh before TTL -> 850000
PASS expired at TTL -> false
PASS expired entry removed -> 0
PASS total -> 300
PASS computed once -> 1
PASS zero price cached -> 2
PASS new cart, new total -> 400
PASS unfrozen cart refused -> "TypeError"
PASS forget refreshes price -> 200
```

## In production

- **Every cache needs a bound.** Either a size limit, a TTL, a weak key, or a lifetime tied to something that ends (one request). "Grows forever" is the most common memory leak in long-running Node.js services.
- **Caches do not change results.** If turning a cache off changes behaviour (other than speed), it is a bug: stale data, keys that are not unique enough, or mutable keys.
- **In-memory caches are per process.** With several instances behind a load balancer, each has its own copy, and invalidation must reach all of them. Use a shared cache for data that must agree across instances.
- **Convert collections at boundaries.** `JSON.stringify` prints Maps and Sets as `{}` without an error. Convert to objects or arrays explicitly when sending or storing.
- **Do not use WeakRef or finalizers for correctness.** Close resources explicitly.
- **Measure before optimising.** A `Map` lookup costs nanoseconds; a cache only pays off when the thing it saves (a database query, a heavy calculation) is much slower than the cache bookkeeping.

## Practice

TRY IT YOURSELF

### Count views per product, top three

Given a list of product views (SKU strings), build a `Map` of counts in one pass and print the three most viewed products with their counts, most viewed first; ties keep the order of first appearance.

**Show a solution**

top-views.js

```ts
const views = ["RICE", "OIL", "RICE", "SALT", "BEANS", "OIL", "RICE", "SALT", "YAM", "OIL"];

const counts = new Map();
for (const sku of views) counts.set(sku, (counts.get(sku) ?? 0) + 1);

const top = [...counts].toSorted((a, b) => b[1] - a[1]).slice(0, 3);
console.log(counts);
console.log(top);
```

Output of `node top-views.js` and of the browser terminal

```ts
Map(5) {
  'RICE' => 3,
  'OIL' => 3,
  'SALT' => 2,
  'BEANS' => 1,
  'YAM' => 1
}
[ [ 'RICE', 3 ], [ 'OIL', 3 ], [ 'SALT', 2 ] ]
```

`counts.get(sku) ?? 0` starts new keys at 0; setting an existing key keeps its position, so the map is in order of first appearance. `toSorted` is stable ([Sorting algorithms](https://zudojs.oyinlola.site/learn/dsa-sorting)), which is why ties keep that order.

TRY IT YOURSELF

### Memoise by object

Write `memoizeByObject(fn)` that returns a function of one object argument that calls `fn` at most once per object, using a `WeakMap`. It must also cache results that are `undefined`. Show with a counter that repeated calls with the same object do not call `fn` again, and that an equal-looking object does.

**Show a solution**

memoize-object.js

```ts
function memoizeByObject(fn) {
  const cache = new WeakMap();
  return (obj) => {
    if (cache.has(obj)) return cache.get(obj);
    const result = fn(obj);
    cache.set(obj, result);
    return result;
  };
}

let calls = 0;
const discountFor = memoizeByObject((customer) => {
  calls += 1;
  return customer.vip ? 1000 : undefined;
});

const ada = { id: "CUS-1", vip: true };
const bola = { id: "CUS-2", vip: false };
console.log(discountFor(ada), discountFor(ada), discountFor(bola), discountFor(bola));
console.log(calls);
discountFor({ id: "CUS-1", vip: true });
console.log(calls);
```

Output of `node memoize-object.js` and of the browser terminal

```ts
1000 1000 undefined undefined
2
3
```

`has` distinguishes "cached as `undefined`" from "not cached". The equal-looking object is a different key, so it costs a third call; that is the price of keying by identity.

TRY IT YOURSELF

### Which customers need a reminder?

You have a `Set` of customers with an open cart and a `Map` from customer id to the date of their last order. Using the set methods and the fact that a `Map` is set-like, print the customers with an open cart who have *never* ordered, and those who have ordered before.

**Show a solution**

reminders.js

```ts
const openCart = new Set(["CUS-1", "CUS-2", "CUS-3", "CUS-4"]);
const lastOrder = new Map([["CUS-2", "2026-08-30"], ["CUS-4", "2026-09-10"], ["CUS-9", "2026-01-01"]]);

console.log("never ordered:", [...openCart.difference(lastOrder)]);
console.log("ordered before:", [...openCart.intersection(lastOrder)].map((id) => `${id} (${lastOrder.get(id)})`));
```

Output of `node reminders.js` and of the browser terminal

```ts
never ordered: [ 'CUS-1', 'CUS-3' ]
ordered before: [ 'CUS-2 (2026-08-30)', 'CUS-4 (2026-09-10)' ]
```

The map provides `size`, `has` and `keys`, which is all the set methods need, so no temporary set of ids is built.

## Recap

- `Map` and `Set` compare keys with SameValueZero: like `===`, except `NaN` equals `NaN`; objects by identity. Use string keys or nested maps for composite keys.
- They iterate in insertion order; re-setting keeps the position, delete-and-set moves to the end. Entries added during a loop are visited; deleted ones are skipped.
- An unbounded cache is a memory leak. A `Map` makes an O(1) LRU cache; add a TTL to bound staleness.
- The set methods accept set-like objects (`size`, `has`, `keys`), including maps. De-duplicate objects by a key with a `Map`. `Map.groupBy` groups by any key.
- JSON drops Maps and Sets silently; convert with `Object.fromEntries`, `[...map]` and `[...set]`.
- `WeakMap` and `WeakSet` hold object keys weakly: entries live as long as their key, and in exchange there is no size or iteration. Use them for per-object caches, metadata and marks.
- `WeakRef` and `FinalizationRegistry` are optimisation tools with weak guarantees; never rely on them for correctness.

Next: [Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates), where delivery dates in Lagos and in UTC stop agreeing at midnight.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
