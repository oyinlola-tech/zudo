---
title: "Hash maps and sets — ZudoJS Academy"
description: "Build a hash table from scratch with hashing, buckets, collisions and resizing, then use Map and Set for lookups, counting, dedupe and two-sum."
source: https://zudojs.oyinlola.site/learn/dsa-hash-maps
---

LEVEL 3 · LESSON 3 OF 21

Data structures Core

# Hash maps and sets

Build a hash table from scratch with hashing, buckets, collisions and resizing, then use Map and Set for lookups, counting, dedupe and two-sum.

- **55 min** to read and try
- **You need:** Big O and complexity, Arrays and strings under the hood, and Classes
- **You build:** A tested hash table with chaining and resizing, used as a session store, plus Map and Set solutions for counting, grouping, dedupe and two-sum

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a hash function and buckets give O(1) average lookups
- Implement a hash table with separate chaining and resizing, and count its steps
- Explain collisions, load factor and why the worst case is O(n)
- Choose between Map, a plain object and Set, and avoid their traps
- Solve lookup, counting, grouping, dedupe and two-sum problems in O(n)

## Finding a session on every request

When a user logs in to a banking app, the server creates a **session**: a random token that the browser sends back with every request, and a record saying which user it belongs to. Every request starts with the same question: "whose token is this?"

The first version stored sessions in an array and searched it:

session-array.js

```ts
function findSession(sessions, token, counter) {
  for (const session of sessions) {
    counter.steps++;
    if (session.token === token) return session;
  }
  return null;
}

function makeSessions(n) {
  return Array.from({ length: n }, (_, i) => ({ token: `sess-${i}-${(i * 2654435761) >>> 0}`, userId: `USR-${i}` }));
}

for (const n of [1000, 10000, 100000]) {
  const sessions = makeSessions(n);
  const counter = { steps: 0 };
  for (let r = 0; r < 100; r++) findSession(sessions, sessions[Math.floor(((r + 0.5) * n) / 100)].token, counter);
  console.log(`${n} sessions: ${counter.steps / 100} steps per request on average`);
}
```

Output of `node session-array.js` and of the browser terminal

```ts
1000 sessions: 501 steps per request on average
10000 sessions: 5001 steps per request on average
100000 sessions: 50001 steps per request on average
```

A linear search: O(n) per request. With 100,000 people logged in, every single request scans tens of thousands of sessions before it can even start its real work.

What you want is the array's superpower, O(1) access by index, but with a *string* as the index. If you could turn each token into a number, and use that number as the position in an array, you would jump straight to the session. That is exactly what a **hash table** does, and it is the structure behind JavaScript's `Map`, `Set` and objects. In this lesson you build one, measure it, break it, and then use the built-in versions for the problems they solve every day.

## Hash functions

A **hash function** turns a key (here, a string) into a number called its **hash**. A good one has three properties:

1. **Deterministic**: the same key always gives the same hash. Otherwise you could store a session and never find it again.
2. **Fast**: it reads the key once, O(length of the key).
3. **Spreads keys evenly**: similar keys get very different hashes, so they do not pile up in the same place.

The table keeps an array of **buckets**. The bucket for a key is its hash modulo the number of buckets: `hash % buckets.length`, a number from 0 to `buckets.length - 1`. Here are two hash functions: a naive one that adds the character codes, and FNV-1a, a small, well-known hash that mixes every character into the result with an XOR and a multiplication:

hash-functions.js

```ts
function sumHash(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h += key.charCodeAt(i);
  return h;
}

function fnv1a(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619); // 32-bit multiplication
  }
  return h >>> 0; // as an unsigned 32-bit number
}

for (const key of ["SAVE20", "SAVE02", "SAVE21"]) {
  console.log(key.padEnd(7), String(sumHash(key)).padEnd(5), fnv1a(key));
}

function spread(hash, buckets) {
  const counts = new Array(buckets).fill(0);
  for (let i = 1; i <= 1000; i++) counts[hash(`SKU-${i}`) % buckets]++;
  return counts.join(" ");
}
console.log("sumHash:", spread(sumHash, 8));
console.log("fnv1a:  ", spread(fnv1a, 8));
```

Output of `node hash-functions.js` and of the browser terminal

```ts
SAVE20  401   184911066
SAVE02  401   2164272750
SAVE21  402   201688685
sumHash: 124 128 127 125 124 124 124 124
fnv1a:   124 124 125 124 128 125 124 126
```

Two lessons hide in this output. First, `sumHash` gives `"SAVE20"` and `"SAVE02"` the same hash: every anagram collides, because addition ignores order. Second, on `SKU-1` to `SKU-1000` the weak `sumHash` spreads the keys just as evenly as FNV-1a, only because those keys happen to count up evenly. Even distribution on one set of keys proves nothing; the [worst case section](#worst-case) feeds it keys that all land in one bucket. FNV-1a mixes each character into all the bits, so order matters and small changes scatter.

> NOTE
>
> `Math.imul` multiplies two numbers as 32-bit integers, the way C would, and `>>> 0` reinterprets the result as unsigned. Without them the product would be a float that loses precision. Real engines use stronger hash functions than FNV-1a, but the shape is the same.

## Collisions and chaining

A **collision** happens when two different keys land in the same bucket. Collisions are unavoidable: there are far more possible keys than buckets. (With 8 buckets, the ninth key must share. Even with a million buckets, keys are unlimited.) A hash table needs a rule for sharing:

- **Separate chaining**: each bucket holds a small list of `[key, value]` entries. To find a key, compute its bucket and scan that short list. This is what you will build.
- **Open addressing**: every bucket holds at most one entry; on a collision, try the next bucket (*linear probing*) until you find a free one. It uses memory more compactly and is what many engines use internally. Exercise 3 builds it.

```ts
 buckets (8)       chains of [key, value]
 +---+
 | 0 | -> ["sess-a", USR-7]
 | 1 |
 | 2 | -> ["sess-k", USR-2] -> ["sess-q", USR-9]     (a collision)
 | 3 | -> ["sess-c", USR-4]
 | 4 |
 | 5 | -> ["sess-m", USR-1]
 | 6 |
 | 7 | -> ["sess-x", USR-3]
 +---+
```

Separate chaining: each bucket holds a short list of the entries whose keys hash to it.

A lookup costs: one hash (O(key length), which is fixed for tokens of fixed length, so O(1)), one array index (O(1)), and a scan of one chain. The whole game is keeping chains short.

## Build a hash table

REASON IT OUT

### Design the session store before coding it

Before you read the implementation, decide:

1. What should `set` do when the key is already in the table?
2. What must `get` compare to be sure it found the right session, given that other keys share the bucket?
3. The table starts with 8 buckets. What happens to the chain lengths when 100,000 users log in, and what should the table do about it?
4. Could two different tokens have the same hash? If so, is that a security problem for a session store?
5. What about a key that is not a string, such as a user object?

**Show the reasoning**

1. Replace the value, and do not grow `size`. A table never holds the same key twice.
2. The full key, with `===`. The hash only chooses the bucket; equal hashes do not mean equal keys.
3. With a fixed 8 buckets, chains grow to about `n / 8`, and lookups become O(n) again. The table must **resize**: when the average chain length (the load factor) passes a limit, allocate more buckets and move every entry to its new bucket.
4. Yes, collisions happen, but they are harmless for correctness because `get` compares full keys: two tokens in one bucket are still told apart. Security depends on the tokens being unguessable (random), not on the hash.
5. This table hashes strings, so it only accepts string keys. `Map` accepts any value as a key, comparing objects by identity, which you will see below.

Here is the table. It uses FNV-1a by default, chains in each bucket, counts every entry it compares in `steps`, and doubles its buckets whenever the **load factor** (entries divided by buckets) goes above `maxLoad`:

hash-table.js

```ts
export function fnv1a(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class HashTable {
  constructor({ buckets = 8, maxLoad = 0.75, hash = fnv1a } = {}) {
    this.buckets = Array.from({ length: buckets }, () => []);
    this.size = 0;
    this.maxLoad = maxLoad;
    this.hash = hash;
    this.steps = 0;
    this.resizes = 0;
  }

  get loadFactor() {
    return this.size / this.buckets.length;
  }

  bucketFor(key) {
    if (typeof key !== "string") throw new TypeError("keys must be strings");
    return this.buckets[this.hash(key) % this.buckets.length];
  }

  set(key, value) {
    const bucket = this.bucketFor(key);
    for (const entry of bucket) {
      this.steps++;
      if (entry[0] === key) {
        entry[1] = value; // existing key: replace the value
        return this;
      }
    }
    bucket.push([key, value]);
    this.size++;
    if (this.loadFactor > this.maxLoad) this.resize(this.buckets.length * 2);
    return this;
  }

  get(key) {
    for (const [k, v] of this.bucketFor(key)) {
      this.steps++;
      if (k === key) return v;
    }
    return undefined;
  }

  has(key) {
    for (const [k] of this.bucketFor(key)) {
      this.steps++;
      if (k === key) return true;
    }
    return false;
  }

  delete(key) {
    const bucket = this.bucketFor(key);
    const i = bucket.findIndex(([k]) => k === key);
    if (i === -1) return false;
    bucket[i] = bucket[bucket.length - 1]; // chains have no order: swap with the last, then pop
    bucket.pop();
    this.size--;
    return true;
  }

  resize(count) {
    const old = this.buckets;
    this.buckets = Array.from({ length: count }, () => []);
    for (const bucket of old) {
      for (const [k, v] of bucket) this.bucketFor(k).push([k, v]); // rehash: new bucket count, new positions
    }
    this.resizes++;
  }

  longestChain() {
    let longest = 0;
    for (const bucket of this.buckets) longest = Math.max(longest, bucket.length);
    return longest;
  }
}
```

Try it as a session store:

sessions.js

```ts
import { HashTable } from "./hash-table.js";

const sessions = new HashTable();
sessions.set("sess-9f2a", { userId: "USR-1", role: "customer" });
sessions.set("sess-11bc", { userId: "USR-2", role: "teller" });
sessions.set("sess-9f2a", { userId: "USR-1", role: "admin" }); // same key: replaced

console.log(sessions.size, sessions.get("sess-9f2a").role, sessions.get("sess-0000"));
console.log(sessions.has("sess-11bc"), sessions.delete("sess-11bc"), sessions.has("sess-11bc"), sessions.size);
try {
  sessions.set({ userId: "USR-3" }, "oops");
} catch (error) {
  console.log(error.name + ": " + error.message);
}
```

Output of `node sessions.js` and of the browser terminal

```ts
2 admin undefined
true true false 1
TypeError: keys must be strings
```

`delete` uses a small trick: the order inside a chain does not matter, so instead of `splice` (which shifts the rest, as you saw in [the previous lesson](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#insert-delete)) it moves the last entry into the gap and pops. That removal is O(1) once the entry is found.

## Load factor and resizing

The **load factor** is `size / buckets`: the average chain length. With a good hash, the expected cost of a lookup is about `1 + load factor / 2` comparisons for a key that exists. Keep the load factor under a constant and every lookup is O(1) on average, however many entries there are. Measure it with 1,000 to 100,000 sessions, with resizing and without:

load-factor.js

```ts
import { HashTable } from "./hash-table.js";

const token = (i) => `sess-${i}-${(i * 2654435761) >>> 0}`;

for (const n of [1000, 10000, 100000]) {
  for (const [label, options] of [["resizing", {}], ["fixed 8 buckets", { maxLoad: Infinity }]]) {
    if (label !== "resizing" && n > 10000) continue; // the fixed table is too slow to try
    const table = new HashTable(options);
    for (let i = 0; i < n; i++) table.set(token(i), `USR-${i}`);
    table.steps = 0;
    for (let i = 0; i < n; i++) table.get(token(i));
    console.log(
      `${String(n).padEnd(6)} ${label.padEnd(15)} buckets ${String(table.buckets.length).padEnd(6)} ` +
        `load ${table.loadFactor.toFixed(2).padEnd(7)} steps per get ${(table.steps / n).toFixed(2).padEnd(7)} longest chain ${table.longestChain()}`,
    );
  }
}
```

Output of `node load-factor.js` and of the browser terminal

```ts
1000   resizing        buckets 2048   load 0.49    steps per get 1.25    longest chain 4
1000   fixed 8 buckets buckets 8      load 125.00  steps per get 63.26   longest chain 140
10000  resizing        buckets 16384  load 0.61    steps per get 1.30    longest chain 5
10000  fixed 8 buckets buckets 8      load 1250.00 steps per get 625.91  longest chain 1303
100000 resizing        buckets 262144 load 0.38    steps per get 1.19    longest chain 6
```

With resizing, a lookup costs about 1.2 to 1.3 comparisons whether the table holds a thousand or a hundred thousand sessions: O(1) on average. With 8 fixed buckets, each lookup scans about `n / 16` entries: O(n), no better than the array.

A resize is expensive: every entry is **rehashed** into the new, bigger bucket array, O(n). But because the bucket count doubles, resizes happen at sizes 7, 13, 25, 49, …, roughly doubling each time, exactly like the growable array in [the complexity lesson](https://zudojs.oyinlola.site/learn/dsa-complexity#amortized). Their total cost is O(n) for `n` inserts, so `set` is **amortized O(1)**. The trade-off is memory: a load factor of 0.75 means at least a quarter of the buckets are empty on average, and more just after a resize.

| Operation | Average | Worst case |
| --- | --- | --- |
| `get`, `has` | O(1) | O(n): every key in one chain |
| `set` | O(1) amortized | O(n): a long chain, or a resize |
| `delete` | O(1) | O(n) |
| iterate all entries | O(n + buckets) | O(n + buckets) |
| find the smallest key, keys in sorted order | O(n), O(n log n) | a hash table has no order to use |

The last row matters when you choose a structure: hashing scatters keys on purpose, so "the next session after this one" or "all orders between two dates" is a full scan. Ordered questions need a sorted array or a tree (see [the trees lesson](https://zudojs.oyinlola.site/learn/dsa-trees)).

## The worst case: when every key collides

O(1) is an average that assumes the hash spreads your keys. If an attacker can choose keys that all collide, every key lands in one chain and every operation becomes O(n). Give the table the weak `sumHash` and feed it keys that are permutations of the same letters, so they all have the same character sum:

hash-flooding.js

```ts
import { HashTable } from "./hash-table.js";

function sumHash(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h += key.charCodeAt(i);
  return h;
}

function permutations(letters) {
  if (letters.length <= 1) return [letters];
  const out = [];
  for (let i = 0; i < letters.length; i++) {
    const rest = letters.slice(0, i) + letters.slice(i + 1);
    for (const p of permutations(rest)) out.push(letters[i] + p);
  }
  return out;
}

const hostileKeys = permutations("ABCDEF"); // 720 keys, all with the same character sum
for (const [name, hash] of [["sumHash", sumHash], ["fnv1a", undefined]]) {
  const table = new HashTable(hash ? { hash } : {});
  for (const key of hostileKeys) table.set(key, true);
  console.log(`${name}: ${hostileKeys.length} keys, ${table.steps} comparisons to insert, longest chain ${table.longestChain()}`);
}
```

Output of `node hash-flooding.js` and of the browser terminal

```ts
sumHash: 720 keys, 258840 comparisons to insert, longest chain 720
fnv1a: 720 keys, 818 comparisons to insert, longest chain 6
```

With the weak hash, all 720 keys share one chain and inserting them costs `n²/2` comparisons. This is a real attack called **hash flooding**: in 2011, researchers showed that sending a web server a form or JSON body with many thousands of colliding keys could keep a CPU busy for minutes with one request. The defences:

- **Seeded hashes.** Engines, including V8, mix a secret random seed into their string hashes so that an attacker cannot predict which keys collide.
- **Limit input size.** Cap the number of keys and the body size your server accepts before parsing them.
- **Know the worst case.** When you implement a hash table yourself, remember that "O(1)" silently means "O(1) on average with a good hash".

## Map versus a plain object

JavaScript gives you two built-in hash tables for key-value data: `Map` and the plain object. They are not interchangeable. An object's keys are always strings (or symbols), and every object inherits properties from `Object.prototype`:

object-traps.js

```ts
const phoneBook = {};
phoneBook["Ada"] = "0803 000 0001";

console.log("constructor" in phoneBook, typeof phoneBook["constructor"]); // inherited, not yours
console.log(phoneBook["Bola"], phoneBook["toString"] === undefined);

const counts = {};
counts["__proto__"] = 5; // a user-supplied key that is special on objects
console.log(Object.keys(counts).length);

const byId = {};
byId[1] = "number one";
byId["1"] = "string one"; // same key: numbers become strings
console.log(Object.keys(byId), byId[1]);

const ada = { id: "USR-1" };
const bola = { id: "USR-2" };
const lastSeen = {};
lastSeen[ada] = "09:00";
lastSeen[bola] = "10:30"; // both objects become the key "[object Object]"
console.log(Object.keys(lastSeen), lastSeen[ada]);
```

Output of `node object-traps.js` and of the browser terminal

```ts
true function
undefined false
0
[ '1' ] string one
[ '[object Object]' ] 10:30
```

Every line is a bug waiting to happen when keys come from data: a customer called "constructor", a product code `"__proto__"` silently dropped, the number `1` and the string `"1"` merged, and all objects sharing one key. `Map` has none of these problems:

map-keys.js

```ts
const ada = { id: "USR-1" };
const bola = { id: "USR-2" };

const lastSeen = new Map();
lastSeen.set(ada, "09:00").set(bola, "10:30").set(1, "number one").set("1", "string one");
lastSeen.set("__proto__", 5).set("constructor", "a customer's name");

console.log(lastSeen.size, lastSeen.get(ada), lastSeen.get(1), lastSeen.get("1"));
console.log(lastSeen.get("__proto__"), lastSeen.has("toString"));
console.log(lastSeen.get({ id: "USR-1" })); // a different object, even though it looks equal
console.log([...lastSeen.keys()].map((k) => (typeof k === "object" ? k.id : k)).join(", "));
```

Output of `node map-keys.js` and of the browser terminal

```ts
6 09:00 number one string one
5 false
undefined
USR-1, USR-2, 1, 1, __proto__, constructor
```

Map keys can be any value. Objects are compared by **identity** (the same object in memory), not by content, so `{ id: "USR-1" }` written twice gives two different keys. When you want "equal content means same key", build a string key yourself, such as `user.id`. Maps also iterate in insertion order and have an O(1) `size`.

|  | `Map` | plain object |
| --- | --- | --- |
| key types | any value; objects by identity | strings and symbols (numbers are converted) |
| inherited keys | none | `constructor`, `toString`, `__proto__`, … |
| order | insertion order | integer-like keys ascending first, then insertion order |
| size | `map.size`, O(1) | `Object.keys(obj).length`, O(n) |
| JSON | not directly | yes |
| best for | dictionaries: keys from data, frequent adds and deletes | records with a fixed set of known property names |

The rule of thumb: an object is a *record* (a user has a name, an email, a role), a `Map` is a *dictionary* (any number of customers, looked up by ID). If you must use an object as a dictionary, create it with `Object.create(null)` so that it has no prototype, and never let raw user input choose keys on objects that other code shares; the security course covers the "prototype pollution" attacks that exploit this.

## Sets

A `Set` is a hash table with keys and no values: it answers "is this in the collection?" in O(1) on average and never holds duplicates. It uses the same equality as `Map` (identity for objects; `NaN` equals `NaN`).

sets.js

```ts
const viewed = ["SKU-1", "SKU-2", "SKU-1", "SKU-3", "SKU-2"];
console.log([...new Set(viewed)]);

const vips = new Set(["CUS-1", "CUS-4"]);
const activeToday = new Set(["CUS-1", "CUS-2", "CUS-4", "CUS-5"]);
console.log(activeToday.has("CUS-5"), activeToday.size);
console.log([...activeToday.intersection(vips)], [...activeToday.difference(vips)]);
console.log(vips.isSubsetOf(activeToday), [...vips.union(new Set(["CUS-9"]))]);
```

Output of `node sets.js` and of the browser terminal

```json
[ 'SKU-1', 'SKU-2', 'SKU-3' ]
true 4
[ 'CUS-1', 'CUS-4' ] [ 'CUS-2', 'CUS-5' ]
true [ 'CUS-1', 'CUS-4', 'CUS-9' ]
```

`[...new Set(list)]` removes duplicates in O(n) and keeps the first occurrence of each, in order. The set operations `union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`, `isSupersetOf` and `isDisjointFrom` arrived in ES2025 and are available in Node.js 22+ and current browsers. Each is O(size of the sets involved), because each membership test is O(1).

## What hash maps are for

Almost every "make this faster" story in application code ends with a `Map` or a `Set`. The four patterns below cover most of them.

### Lookup: index once, find many times

A checkout receives a cart of SKUs and needs each product's price. Searching the catalogue for each SKU is O(n · m). Building a `Map` once is O(n), and then each lookup is O(1):

catalogue.js

```ts
const catalogue = [
  { sku: "RICE-5KG", name: "Rice 5kg", kobo: 850000 },
  { sku: "OIL-1L", name: "Vegetable oil 1L", kobo: 240000 },
  { sku: "SALT-500G", name: "Salt 500g", kobo: 30000 },
];
const bySku = new Map(catalogue.map((p) => [p.sku, p]));

const cart = [
  { sku: "OIL-1L", quantity: 2 },
  { sku: "RICE-5KG", quantity: 1 },
  { sku: "SUGAR-1KG", quantity: 1 },
];
let total = 0;
for (const line of cart) {
  const product = bySku.get(line.sku);
  if (!product) {
    console.log(`unknown product ${line.sku}: skipped`);
    continue;
  }
  total += product.kobo * line.quantity;
}
console.log(`total ₦${(total / 100).toFixed(2)}`);
```

Output of `node catalogue.js` and of the browser terminal

```ts
unknown product SUGAR-1KG: skipped
total ₦13300.00
```

### Counting: how often does each thing appear?

best-sellers.js

```ts
const sold = ["OIL-1L", "RICE-5KG", "OIL-1L", "SALT-500G", "OIL-1L", "RICE-5KG"];

const counts = new Map();
for (const sku of sold) counts.set(sku, (counts.get(sku) ?? 0) + 1);

const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2);
console.log(counts.get("OIL-1L"), counts.get("BEANS-2KG") ?? 0);
console.log(top);
```

Output of `node best-sellers.js` and of the browser terminal

```ts
3 0
[ [ 'OIL-1L', 3 ], [ 'RICE-5KG', 2 ] ]
```

Counting is O(n); sorting the `k` distinct products is O(k log k). This **frequency counter** also solved the anagram check in the previous lesson, and it gets [a lesson of its own](https://zudojs.oyinlola.site/learn/pattern-frequency).

### Grouping and dedupe by key

group-dedupe.js

```ts
const orders = [
  { id: "ORD-1", customer: "CUS-1", kobo: 500000 },
  { id: "ORD-2", customer: "CUS-2", kobo: 120000 },
  { id: "ORD-1", customer: "CUS-1", kobo: 500000 }, // the payment webhook arrived twice
  { id: "ORD-3", customer: "CUS-1", kobo: 80000 },
];

const unique = [...new Map(orders.map((o) => [o.id, o])).values()];
console.log(unique.map((o) => o.id).join(" "));

const byCustomer = Map.groupBy(unique, (o) => o.customer);
for (const [customer, list] of byCustomer) {
  const total = list.reduce((sum, o) => sum + o.kobo, 0);
  console.log(customer, list.length, `₦${total / 100}`);
}
```

Output of `node group-dedupe.js` and of the browser terminal

```ts
ORD-1 ORD-2 ORD-3
CUS-1 2 ₦5800
CUS-2 1 ₦1200
```

A `Set` of objects would not have removed the duplicate order: the two `ORD-1` objects are different objects. Keying a `Map` by `id` dedupes by content (here the last copy of each id wins, while keeping the position of the first). `Map.groupBy` (ES2024) builds a `Map` from a key to the list of items with that key in one O(n) pass.

### Two-sum: have I already seen the other half?

A customer has a gift card worth exactly ₦10,000 and wants two different products that use it up. The brute force tries every pair: O(n²). The hash map version walks the list once and, for each price, asks whether the *complement* (the amount still needed) has been seen already:

two-sum.js

```ts
function pairForCardNested(prices, target, counter) {
  for (let i = 0; i < prices.length; i++) {
    for (let j = i + 1; j < prices.length; j++) {
      counter.steps++;
      if (prices[i] + prices[j] === target) return [i, j];
    }
  }
  return null;
}

function pairForCardMap(prices, target, counter) {
  const seen = new Map(); // price -> index
  for (let i = 0; i < prices.length; i++) {
    counter.steps++;
    const need = target - prices[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(prices[i], i);
  }
  return null;
}

const small = [4500, 7000, 2500, 5500, 3000];
console.log(pairForCardMap(small, 10000, { steps: 0 }), pairForCardNested(small, 10000, { steps: 0 }));
console.log(pairForCardMap([5000], 10000, { steps: 0 }), pairForCardMap([5000, 5000], 10000, { steps: 0 }));

const big = Array.from({ length: 4000 }, (_, i) => 100 + i * 2); // no pair sums to an odd target
for (const fn of [pairForCardNested, pairForCardMap]) {
  const counter = { steps: 0 };
  fn(big, 10001, counter);
  console.log(fn.name, counter.steps, "steps");
}
```

Output of `node two-sum.js` and of the browser terminal

```json
[ 0, 3 ] [ 0, 3 ]
null [ 0, 1 ]
pairForCardNested 7998000 steps
pairForCardMap 4000 steps
```

Checking `seen` *before* adding the current price is what stops a single ₦5,000 item from pairing with itself, while two separate ₦5,000 items still match. O(n) time, O(n) extra space. If the prices were sorted, [two pointers](https://zudojs.oyinlola.site/learn/pattern-two-pointers) would solve it in O(n) time with O(1) space; that pattern comes later in the course.

## Failure cases

- **Objects as keys are compared by identity.** Two equal-looking objects are two keys; a copy of an object is a new key. Key by a stable ID string instead.
- **Keys that change after insertion.** If you build a key from mutable data (`\`${user.email}\``) and the email changes, the entry is stored under the old key and `get` with the new one finds nothing. Key by something immutable.
- **Normalization.** `"ada@shop.ng"` and `"Ada@Shop.ng "` are different keys. Normalize (trim, lower-case) at the boundary, before you hash.
- **Unbounded growth.** A session `Map` that never deletes expired sessions grows until the process runs out of memory. Every cache or store needs an eviction rule: expiry times, or a size limit with least-recently-used eviction, which [the linked lists lesson](https://zudojs.oyinlola.site/learn/dsa-linked-lists) builds.
- **Relying on order you did not define.** A `Map` keeps insertion order, an object reorders integer-like keys, and a hand-made hash table (like the one above) iterates in bucket order, which changes after a resize.
- **Special numbers.** `Map` treats `NaN` as equal to itself and `0` as equal to `-0`. Floats as keys are fragile anyway: `0.1 + 0.2` is not the key `0.3`. Use integer kobo, not naira with decimals.

## Testing a hash table

You have a perfect reference implementation for free: `Map`. Run the same long random sequence of operations against both and compare every answer. A fixed-seed random generator (here **xorshift**, which scrambles a 32-bit number with shifts and XORs) makes the "random" sequence the same on every run, so a failure can be reproduced. Then test the parts a random test may not hit on purpose: collisions (with a hash that always returns 0) and resizing.

hash-table-tests.js

```ts
import { HashTable } from "./hash-table.js";

function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
}

function xorshift(seed) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

// 1. Same answers as Map for 20,000 random operations on 300 possible keys
const random = xorshift(2024);
const table = new HashTable();
const reference = new Map();
let mismatches = 0;
const ops = { set: 0, get: 0, delete: 0 };
for (let i = 0; i < 20000; i++) {
  const key = `CUS-${Math.floor(random() * 300)}`;
  const r = random();
  if (r < 0.5) {
    ops.set++;
    table.set(key, i);
    reference.set(key, i);
  } else if (r < 0.8) {
    ops.get++;
    if (table.get(key) !== reference.get(key)) mismatches++;
  } else {
    ops.delete++;
    if (table.delete(key) !== reference.delete(key)) mismatches++;
  }
  if (table.size !== reference.size) mismatches++;
}
check(`agrees with Map (${ops.set} sets, ${ops.get} gets, ${ops.delete} deletes)`, mismatches === 0);

// 2. Every key collides: still correct, just slow
const allCollide = new HashTable({ hash: () => 0 });
for (let i = 0; i < 50; i++) allCollide.set(`K-${i}`, i);
allCollide.delete("K-10");
check("all keys in one bucket: lookups still correct", allCollide.get("K-49") === 49 && allCollide.get("K-10") === undefined);
check("all keys in one bucket: size is right", allCollide.size === 49);

// 3. Resizing keeps every entry and the load factor bounded
const growing = new HashTable({ buckets: 2 });
for (let i = 0; i < 5000; i++) growing.set(`SKU-${i}`, i);
let allThere = true;
for (let i = 0; i < 5000; i++) if (growing.get(`SKU-${i}`) !== i) allThere = false;
check(`after ${growing.resizes} resizes every entry is found`, allThere);
check(`load factor ${growing.loadFactor.toFixed(2)} stays at or below 0.75`, growing.loadFactor <= 0.75);
```

Output of `node hash-table-tests.js` and of the browser terminal

```ts
PASS agrees with Map (10093 sets, 5954 gets, 3953 deletes)
PASS all keys in one bucket: lookups still correct
PASS all keys in one bucket: size is right
PASS after 12 resizes every entry is found
PASS load factor 0.61 stays at or below 0.75
```

Printing the operation counts proves the random test exercised all three operations. A test that only ever called `set` would pass without testing `delete` at all.

## Hash maps in production

- **Use the built-ins.** `Map` and `Set` are implemented in C++ inside the engine, with seeded hashes and tuned resizing. Write your own hash table to understand them, not to replace them.
- **An in-memory session store only works on one server.** As soon as you run two server processes, a session created on one is unknown to the other. Shared stores such as Redis are, at heart, a hash table on a separate server that every process can reach.
- **Bound every map.** Give each cache or store a maximum size or an expiry rule. A `Map` that only grows is the most common memory leak in Node.js services.
- **Memory per entry is not free.** Each entry costs the key, the value and the table's own overhead (buckets that are empty on purpose). A million small entries can take tens of megabytes; measure with `process.memoryUsage()` before you cache everything.
- **Cap untrusted keys.** Limit request body sizes and the number of fields you accept, so that no single request can insert millions of keys.

## Practice

TRY IT YOURSELF

### The first repeated payment reference

A payment provider sometimes sends the same transfer twice. Write `firstRepeat(references)` that returns the first reference that appears for the second time (the earliest second occurrence), or `null`. It must be O(n).

**Show a solution**

first-repeat.js

```ts
function firstRepeat(references) {
  const seen = new Set();
  for (const ref of references) {
    if (seen.has(ref)) return ref;
    seen.add(ref);
  }
  return null;
}

console.log(firstRepeat(["TRF-7", "TRF-3", "TRF-9", "TRF-3", "TRF-7"]));
console.log(firstRepeat(["TRF-1", "TRF-2"]));
console.log(firstRepeat([]));
```

Output of `node first-repeat.js` and of the browser terminal

```ts
TRF-3
null
null
```

`TRF-7` appears first, but `TRF-3` repeats first (at position 3, before `TRF-7` repeats at position 4). One pass, O(1) average per `has`/`add`: O(n) time, O(n) space.

TRY IT YOURSELF

### Case-insensitive phone book

Support staff look customers up by email, and they type emails in any case with stray spaces. Write a `PhoneBook` class backed by a `Map` with `add(email, phone)` and `find(email)`, so that `" Ada@Shop.NG"` finds the entry added as `"ada@shop.ng"`.

**Show a solution**

phone-book.js

```ts
class PhoneBook {
  #entries = new Map();

  static #key(email) {
    return email.trim().toLowerCase();
  }

  add(email, phone) {
    this.#entries.set(PhoneBook.#key(email), phone);
    return this;
  }

  find(email) {
    return this.#entries.get(PhoneBook.#key(email)) ?? null;
  }

  get size() {
    return this.#entries.size;
  }
}

const book = new PhoneBook();
book.add("ada@shop.ng", "0803 000 0001").add("BOLA@shop.ng", "0805 000 0002");
book.add("Ada@Shop.ng", "0803 999 9999"); // same customer: replaces
console.log(book.find(" Ada@Shop.NG"), book.find("bola@SHOP.ng"), book.find("chidi@shop.ng"), book.size);
```

Output of `node phone-book.js` and of the browser terminal

```ts
0803 999 9999 0805 000 0002 null 2
```

Normalizing inside the class means callers cannot forget it. The `#entries` field is private, so no one can insert an unnormalized key behind the class's back.

TRY IT YOURSELF

### Open addressing

Build a tiny hash set of strings with **linear probing**: a fixed array of 16 slots; to add a key, start at `fnv1a(key) % 16` and move to the next slot (wrapping around at the end) until you find the key or an empty slot. Implement `add` and `has`, and count probes. What happens when the array is full?

**Show a solution**

linear-probing.js

```ts
function fnv1a(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class ProbingSet {
  constructor(capacity = 16) {
    this.slots = new Array(capacity).fill(null);
    this.size = 0;
    this.probes = 0;
  }

  #find(key) {
    let i = fnv1a(key) % this.slots.length;
    for (let tries = 0; tries < this.slots.length; tries++) {
      this.probes++;
      if (this.slots[i] === null || this.slots[i] === key) return i;
      i = (i + 1) % this.slots.length; // next slot, wrapping around
    }
    return -1; // every slot is taken by other keys
  }

  add(key) {
    const i = this.#find(key);
    if (i === -1) throw new RangeError("set is full");
    if (this.slots[i] === null) {
      this.slots[i] = key;
      this.size++;
    }
    return this;
  }

  has(key) {
    const i = this.#find(key);
    return i !== -1 && this.slots[i] === key;
  }
}

const vouchers = new ProbingSet();
for (let i = 1; i <= 12; i++) vouchers.add(`SAVE${i}`);
console.log(vouchers.size, vouchers.has("SAVE7"), vouchers.has("SAVE99"), "probes:", vouchers.probes);
for (let i = 13; i <= 16; i++) vouchers.add(`SAVE${i}`);
try {
  vouchers.add("SAVE17");
} catch (error) {
  console.log(vouchers.size, error.message);
}
```

Output of `node linear-probing.js` and of the browser terminal

```ts
12 true false probes: 24
16 set is full
```

Probing keeps entries in one flat array (no chains), which is compact and cache-friendly, but clusters of occupied slots grow and make probes longer as the table fills. That is why open-addressing tables resize at a lower load factor, often around 0.5 to 0.7, and never let themselves become full. Deleting is also tricky: emptying a slot would break the probe chain of keys stored after it, so real implementations leave a "deleted" marker (a *tombstone*) instead.

## Summary

- A hash table turns a key into a number with a hash function, then uses `hash % buckets` as an array index: O(1) average lookup by any key.
- Collisions are unavoidable. Separate chaining keeps a short list per bucket; open addressing probes for the next free slot.
- The load factor (entries / buckets) is the average chain length. Resizing by doubling keeps it bounded, so operations stay O(1) on average and `set` is amortized O(1).
- The worst case is O(n) per operation, when keys collide. Attackers can cause it (hash flooding); seeded hashes and input limits defend against it.
- Use `Map` for dictionaries (any key type, no inherited keys, insertion order, O(1) `size`) and objects for fixed records. Object keys compare by identity.
- `Set` gives O(1) membership, dedupe and the ES2025 set operations.
- Most speed-ups in application code are one of four patterns: lookup by key, counting, grouping and dedupe by key, and "have I seen the complement?" (two-sum).

Next: [Stacks and queues](https://zudojs.oyinlola.site/learn/dsa-stacks-queues), the structures behind undo buttons, print queues and job workers.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
