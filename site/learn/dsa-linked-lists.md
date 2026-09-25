---
title: "Linked lists and the LRU cache — ZudoJS Academy"
description: "Build singly and doubly linked lists in JavaScript, reverse them, detect cycles, and use one to build an O(1) LRU cache for product lookups."
source: https://zudojs.oyinlola.site/learn/dsa-linked-lists
---

LEVEL 3 · LESSON 5 OF 21

Data structures Core

# Linked lists and the LRU cache

Build singly and doubly linked lists in JavaScript, reverse them, detect cycles, and use one to build an O(1) LRU cache for product lookups.

- **55 min** to read and try
- **You need:** Big O and complexity, Hash maps and sets, Stacks and queues, and this, prototypes and classes
- **You build:** A singly linked list, a doubly linked list with sentinels, a cycle detector and an LRU cache for product prices, all tested

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Build a singly linked list and state the cost of each operation compared with an array
- Reverse a linked list in place and detect a cycle in O(1) extra space
- Build a doubly linked list with sentinel nodes and remove any node in O(1)
- Build an LRU cache from a Map and a doubly linked list, with O(1) get and set
- Decide when a linked list beats an array, and when it does not

## A cache that got slower than the service

A shop's product page shows a live price that comes from a pricing service. Each call to the service takes about 200 milliseconds, and popular products are viewed thousands of times an hour. So the team caches prices in memory. Memory is limited, so the cache holds at most 1,000 products; when it is full and a new product arrives, it throws out the product that was **least recently used**. That rule is called **LRU eviction**: a product nobody has looked at for a while is the one least likely to be needed soon.

The first version kept the keys in an array in order of use, most recent first, next to a `Map` of prices. Every hit had to move its key to the front:

array-lru.js

```ts
class ArrayLRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.prices = new Map();
    this.order = []; // most recently used first
    this.moves = 0; // array slots shifted by indexOf, splice and unshift
  }

  #touch(sku) {
    const at = this.order.indexOf(sku);
    if (at !== -1) {
      this.moves += at + (this.order.length - at - 1); // scan to find it, then close the gap
      this.order.splice(at, 1);
    }
    this.moves += this.order.length; // unshift moves everything right
    this.order.unshift(sku);
  }

  get(sku) {
    if (!this.prices.has(sku)) return undefined;
    this.#touch(sku);
    return this.prices.get(sku);
  }

  set(sku, kobo) {
    this.prices.set(sku, kobo);
    this.#touch(sku);
    if (this.order.length > this.capacity) this.prices.delete(this.order.pop());
  }
}

for (const capacity of [100, 1000]) {
  const cache = new ArrayLRU(capacity);
  for (let i = 0; i < capacity; i++) cache.set(`SKU-${i}`, 150000);
  cache.moves = 0;
  for (let r = 0; r < 10000; r++) cache.get(`SKU-${(r * 7) % capacity}`);
  console.log(`capacity ${capacity}: ${cache.moves / 10000} slot moves per cache hit`);
}
```

Output of `node array-lru.js` and of the browser terminal

```ts
capacity 100: 198 slot moves per cache hit
capacity 1000: 1998 slot moves per cache hit
```

Every hit costs O(n): `indexOf` scans for the key, `splice` closes the gap and `unshift` opens one at the front. A cache exists to make lookups cheap, and this one's cost grows with its size.

What the cache needs is a list in which you can take out an item *from the middle* and put it back at the front *without moving anything else*, and find it without scanning. The `Map` can do the finding. The rest is the job of a **linked list**. This lesson builds one from scratch, uses it for reversing and cycle detection, and finishes with an LRU cache whose `get` and `set` are both O(1).

## Nodes and pointers

A linked list stores each item in its own small object, a **node**, holding the value and a reference to the next node. In JavaScript, a reference to an object is often called a **pointer**. The list itself only remembers the first node, the **head** (and often the last one, the **tail**). The last node's `next` is `null`.

```ts
  head                                              tail
   |                                                  |
   v                                                  v
 +---------+------+    +---------+------+    +---------+------+
 | ORD-101 | next-+--> | ORD-102 | next-+--> | ORD-103 | null |
 +---------+------+    +---------+------+    +---------+------+
   (anywhere in memory)  (anywhere in memory)  (anywhere in memory)
```

A singly linked list: every node points to the next; only the head and tail are known directly.

Compare this with an array ([the arrays lesson](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#memory)). The nodes are *not* side by side in memory, so there is no address formula: to reach the fifth node you must follow four `next` pointers. Indexing is O(n). In exchange, inserting or removing next to a node you already hold only rewires a pointer or two. Nothing shifts.

## A singly linked list

This version keeps both `head` and `tail`, so adding at either end is O(1), and a `size` counter, so the length is O(1) too:

singly-linked-list.js

```ts
export class SinglyLinkedList {
  head = null;
  tail = null;
  size = 0;

  pushFront(value) {
    const node = { value, next: this.head };
    this.head = node;
    if (this.tail === null) this.tail = node; // the list was empty
    this.size++;
    return node;
  }

  pushBack(value) {
    const node = { value, next: null };
    if (this.tail === null) this.head = node;
    else this.tail.next = node;
    this.tail = node;
    this.size++;
    return node;
  }

  popFront() {
    if (this.head === null) throw new RangeError("popFront on an empty list");
    const node = this.head;
    this.head = node.next;
    if (this.head === null) this.tail = null; // it was the only node
    this.size--;
    return node.value;
  }

  insertAfter(node, value) {
    const created = { value, next: node.next };
    node.next = created;
    if (this.tail === node) this.tail = created;
    this.size++;
    return created;
  }

  remove(predicate) {
    let previous = null;
    for (let node = this.head; node !== null; previous = node, node = node.next) {
      if (!predicate(node.value)) continue;
      if (previous === null) this.head = node.next;
      else previous.next = node.next;
      if (this.tail === node) this.tail = previous;
      this.size--;
      return node.value;
    }
    return undefined;
  }

  at(index) {
    let node = this.head;
    for (let i = 0; i < index && node !== null; i++) node = node.next;
    return node?.value;
  }

  toArray() {
    const out = [];
    for (let node = this.head; node !== null; node = node.next) out.push(node.value);
    return out;
  }
}
```

singly-demo.js

```ts
import { SinglyLinkedList } from "./singly-linked-list.js";

const orders = new SinglyLinkedList();
orders.pushBack("ORD-102");
const first = orders.pushFront("ORD-101");
orders.pushBack("ORD-104");
orders.insertAfter(orders.head.next, "ORD-103");
console.log(orders.toArray(), orders.size, orders.at(2));

console.log(orders.remove((id) => id === "ORD-103"), orders.toArray());
console.log(orders.remove((id) => id === "ORD-104"), "tail is now", orders.tail.value);
console.log(orders.popFront(), orders.popFront(), orders.size, orders.head, orders.tail);
console.log(first.value, first.next === null ? "first node no longer linked from the list" : "");
```

Output of `node singly-demo.js` and of the browser terminal

```json
[ 'ORD-101', 'ORD-102', 'ORD-103', 'ORD-104' ] 4 ORD-103
ORD-103 [ 'ORD-101', 'ORD-102', 'ORD-104' ]
ORD-104 tail is now ORD-102
ORD-101 ORD-102 0 null null
ORD-101
```

Most of the code is about **edge cases**: the empty list, the list with one node, removing the head, removing the tail. Those are where linked list bugs live, and the tests at the end of this lesson aim at each of them. Notice also that after `popFront`, the old first node still points at the second one; that is harmless, because nothing points *to* it any more, and the garbage collector frees it.

| Operation | Singly linked list (head + tail) | Array |
| --- | --- | --- |
| read item `i` | O(i) | O(1) |
| add at the front | O(1) | O(n) |
| add at the back | O(1) | O(1) amortized |
| remove the first item | O(1) | O(n) |
| remove the last item | O(n): you need the node *before* the tail | O(1) |
| insert or remove after a node you hold | O(1) | O(n) |
| find a value | O(n) | O(n) |

A singly linked list with a tail is a perfect queue (`pushBack` + `popFront`, both O(1)), another fix for the slow `shift` queue from [the queues lesson](https://zudojs.oyinlola.site/learn/dsa-stacks-queues#queue). The painful row is "remove the last item": a node does not know its predecessor. The doubly linked list below fixes that.

## Reversing a list in place

A delivery route is stored as a linked list of stops; the driver's return trip is the same list reversed. Reversing in place means turning every `next` arrow around, using three pointers: `previous` (the part already reversed), `current` (the node being turned) and `next` (saved before the arrow is overwritten, or the rest of the list would be lost).

```ts
 before:        Depot -> Ikeja -> Yaba -> null

 step 1:  null <- Depot    Ikeja -> Yaba -> null      previous = Depot, current = Ikeja
 step 2:  null <- Depot <- Ikeja    Yaba -> null      previous = Ikeja, current = Yaba
 step 3:  null <- Depot <- Ikeja <- Yaba              previous = Yaba,  current = null

 after:   head = Yaba -> Ikeja -> Depot -> null
```

Each step saves current.next, points current back at previous, then moves both pointers one node on.

reverse.js

```ts
import { SinglyLinkedList } from "./singly-linked-list.js";

function reverse(list) {
  let previous = null;
  let current = list.head;
  list.tail = list.head; // the old head becomes the tail
  while (current !== null) {
    const next = current.next; // save the rest of the list
    current.next = previous; // turn the arrow around
    previous = current;
    current = next;
  }
  list.head = previous;
  return list;
}

function fromArray(values) {
  const list = new SinglyLinkedList();
  for (const v of values) list.pushBack(v);
  return list;
}

console.log(reverse(fromArray(["Depot", "Ikeja", "Yaba", "Lekki"])).toArray());
for (const values of [[], ["Depot"], ["Depot", "Ikeja"]]) {
  const list = reverse(fromArray(values));
  console.log(JSON.stringify(list.toArray()), "head:", list.head?.value ?? null, "tail:", list.tail?.value ?? null);
}
```

Output of `node reverse.js` and of the browser terminal

```json
[ 'Lekki', 'Yaba', 'Ikeja', 'Depot' ]
[] head: null tail: null
["Depot"] head: Depot tail: Depot
["Ikeja","Depot"] head: Ikeja tail: Depot
```

Each node is visited once: O(n) time, and only three pointers: O(1) extra space. A recursive version is shorter to write, but it keeps one stack frame per node, O(n) space, and overflows the call stack on long lists (see [space complexity](https://zudojs.oyinlola.site/learn/dsa-complexity#space)). Forgetting to save `next` before overwriting `current.next` is the classic bug: the loop ends after one node, and the rest of the list is gone.

## Detecting a cycle

An expense-approval system stores, for each approver, the next person who must approve: Ada, then her manager Bola, then the finance lead Chidi, then nobody. That chain is a linked list. One day an admin sets Chidi's "next approver" to Ada by mistake. Now the chain is a **cycle**: following `next` never reaches `null`, and any loop that walks the chain runs forever, freezing the approval request.

REASON IT OUT

### How can code tell that a chain loops?

1. A chain has no length field you can trust. Walking it until `null` never ends if there is a cycle. What could you remember as you walk?
2. That idea costs memory proportional to the chain. Can you detect the cycle with only a fixed number of variables?
3. What should the approval system do once it knows there is a cycle?

**Show the reasoning**

1. Remember every node you have visited, in a `Set`. If you ever reach a node that is already in the set, you have come round a loop. O(n) time and O(n) space.
2. Yes: walk two pointers at different speeds. A "slow" pointer moves one node per step, a "fast" one moves two. With no cycle, the fast pointer reaches `null`. With a cycle, both end up going round the loop, and each step the fast one gains one node on the slow one, so it must land on it exactly. This is **Floyd's cycle detection**, known as the tortoise and the hare. O(n) time, O(1) space; the proof is below the code.
3. Refuse the configuration change that created the cycle (validate before saving), and make every walker defensive: stop and report an error instead of looping. Detecting at write time is better than detecting at read time.

cycles.js

```ts
function chain(names, loopBackTo = -1) {
  const nodes = names.map((name) => ({ value: name, next: null }));
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].next = nodes[i + 1];
  if (loopBackTo >= 0) nodes.at(-1).next = nodes[loopBackTo];
  return nodes[0] ?? null;
}

function hasCycleSet(head) {
  const seen = new Set();
  for (let node = head; node !== null; node = node.next) {
    if (seen.has(node)) return true;
    seen.add(node);
  }
  return false;
}

function hasCycleFloyd(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}

const cases = [
  ["valid chain", chain(["Ada", "Bola", "Chidi"])],
  ["Chidi -> Ada", chain(["Ada", "Bola", "Chidi"], 0)],
  ["Chidi -> Bola", chain(["Ada", "Bola", "Chidi"], 1)],
  ["Ada approves herself", chain(["Ada"], 0)],
  ["one approver", chain(["Ada"])],
  ["nobody", chain([])],
];
for (const [label, head] of cases) {
  console.log(label.padEnd(21), hasCycleSet(head), hasCycleFloyd(head));
}
```

Output of `node cycles.js` and of the browser terminal

```ts
valid chain           false false
Chidi -> Ada          true true
Chidi -> Bola         true true
Ada approves herself  true true
one approver          false false
nobody                false false
```

The `Set` stores node *objects*, compared by identity, not the names: two different approvers can have the same name, and that is not a cycle. Floyd's version needs only two variables, which matters when the chain is huge or you are checking many chains.

Why Floyd's pointers must meet, and how fast. Say the chain has `n` nodes and ends in a loop of `L` nodes. With no loop, the fast pointer reaches `null` after about n/2 steps. With a loop, the slow pointer enters it after at most `n − L` steps (the length of the part before the loop), and the fast pointer is already inside. From then on, measure how far the fast pointer is *behind* the slow one around the loop: some distance `d` smaller than `L`. Each step the slow pointer moves 1 and the fast pointer 2, so `d` shrinks by exactly 1. It cannot skip over 0, so they meet within `L` more steps, before the slow pointer finishes one lap. So the slow pointer takes at most `n` steps before they meet: O(n) time.

Two pointers moving at different speeds is a pattern of its own, the **fast and slow pointers**. The exercise at the end of this lesson uses it to find the middle of a list, and [the two pointers lesson](https://zudojs.oyinlola.site/learn/pattern-two-pointers) adds a second phase that finds the node where the loop *starts*, which is what support needs to fix the data.

## A doubly linked list with sentinels

In a **doubly linked list** every node also points to the node before it, with `prev`. That costs one more pointer per node, and buys O(1) removal of *any* node you hold: its neighbours are right there, in both directions.

A second trick removes almost all the edge cases: two permanent dummy nodes called **sentinels**, one before the first real node and one after the last. The list is never truly empty (the sentinels point at each other), so inserting and removing never have to check for `null` or update `head` and `tail` separately.

```ts
  +------+     +---------+     +---------+     +------+
  | HEAD | <-> | SKU-7   | <-> | SKU-2   | <-> | TAIL |
  +------+     +---------+     +---------+     +------+
  sentinel     most recent     least recent    sentinel
```

A doubly linked list with sentinels: every real node always has a real prev and next.

doubly-linked-list.js

```ts
export class DoublyLinkedList {
  #head = { prev: null, next: null }; // sentinel before the first node
  #tail = { prev: null, next: null }; // sentinel after the last node
  size = 0;

  constructor() {
    this.#head.next = this.#tail;
    this.#tail.prev = this.#head;
  }

  #insertBetween(node, before, after) {
    node.prev = before;
    node.next = after;
    before.next = node;
    after.prev = node;
    this.size++;
    return node;
  }

  pushFront(value) {
    return this.#insertBetween({ value }, this.#head, this.#head.next);
  }

  pushBack(value) {
    return this.#insertBetween({ value }, this.#tail.prev, this.#tail);
  }

  remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = node.next = null; // detach, so a stale reference cannot corrupt the list
    this.size--;
    return node.value;
  }

  moveToFront(node) {
    this.remove(node);
    this.#insertBetween(node, this.#head, this.#head.next);
  }

  first() {
    return this.size === 0 ? null : this.#head.next;
  }

  last() {
    return this.size === 0 ? null : this.#tail.prev;
  }

  toArray() {
    const out = [];
    for (let node = this.#head.next; node !== this.#tail; node = node.next) out.push(node.value);
    return out;
  }

  toArrayBackwards() {
    const out = [];
    for (let node = this.#tail.prev; node !== this.#head; node = node.prev) out.push(node.value);
    return out;
  }
}
```

doubly-demo.js

```ts
import { DoublyLinkedList } from "./doubly-linked-list.js";

const recent = new DoublyLinkedList();
const rice = recent.pushBack("RICE");
const oil = recent.pushBack("OIL");
recent.pushBack("SALT");
console.log(recent.toArray(), recent.toArrayBackwards());

recent.moveToFront(oil); // viewed again
console.log(recent.toArray());
recent.remove(rice); // from the middle, O(1)
console.log(recent.toArray(), recent.size, recent.first().value, recent.last().value);
recent.remove(recent.last());
recent.remove(recent.first());
console.log(recent.toArray(), recent.size, recent.first(), recent.last());
```

Output of `node doubly-demo.js` and of the browser terminal

```json
[ 'RICE', 'OIL', 'SALT' ] [ 'SALT', 'OIL', 'RICE' ]
[ 'OIL', 'RICE', 'SALT' ]
[ 'OIL', 'SALT' ] 2 OIL SALT
[] 0 null null
```

Compare `remove` here with `remove` in the singly linked list: no search for the previous node, no special case for the head or the tail. Two pointer updates, O(1). The price of `remove(node)` is that the caller must already hold the node. Finding a node by value is still O(n), unless something else remembers where each node is. That something is a `Map`.

## Build: an LRU cache for product prices

REASON IT OUT

### Before you build the cache

1. Which operations count as "using" a product: `get`, `set`, both?
2. What should happen when you `set` a product that is already cached, with a new price?
3. What should a cache with capacity 0 do? Or a negative capacity?
4. A product's price changes in the pricing service. The cache still has the old one. Is that the LRU's problem?
5. Two customers open the same uncached product at the same moment. How many calls reach the pricing service?

**Show the reasoning**

1. Both. A product that was just read or just written is "recently used" and moves to the front.
2. Replace the price and move the product to the front, without growing the cache and without evicting anything.
3. Capacity 0 is a legitimate "cache disabled" setting in configuration, but a negative or non-integer capacity is a bug: reject it in the constructor with a `RangeError`. (The version below requires at least 1; a disabled cache is simpler to express by not using one.)
4. Staleness is a separate concern from eviction. LRU decides *what to throw out when full*; it says nothing about how long an entry is valid. Real caches add an expiry time (TTL, time to live) or are told to delete an entry when the price changes (invalidation).
5. Two, with a simple cache: both miss and both call the service. Under heavy traffic this is called a **cache stampede**. The fix is to cache the *promise* of the first call, so the second request waits for it instead of making its own.

The design: a `Map` from SKU to its node, for O(1) lookup, and a doubly linked list of nodes in recency order, most recent at the front. A hit finds the node through the map and moves it to the front: O(1). An insert into a full cache removes the node at the back (the least recently used) and deletes its key from the map: O(1).

```ts
  Map (sku -> node)                  doubly linked list, most recent first
  +----------+------+
  | "SKU-7"  |  *---+------+
  | "SKU-2"  |  *---+----+ |    HEAD <-> [SKU-9] <-> [SKU-7] <-> [SKU-2] <-> TAIL
  | "SKU-9"  |  *---+--+ | |               ^           ^           ^
  +----------+------+  | | +---------------|-----------+           |
                       | +-----------------|-----------------------+
                       +-------------------+          evict from here when full
```

The map finds any node in O(1); the list keeps them in order of use and gives up its last node on eviction.

lru-cache.js

```ts
import { DoublyLinkedList } from "./doubly-linked-list.js";

export class LRUCache {
  #nodes = new Map(); // key -> list node holding { key, value }
  #order = new DoublyLinkedList(); // most recently used first
  hits = 0;
  misses = 0;
  evictions = 0;

  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be an integer of at least 1");
    this.capacity = capacity;
  }

  get size() {
    return this.#nodes.size;
  }

  get(key) {
    const node = this.#nodes.get(key);
    if (node === undefined) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.#order.moveToFront(node);
    return node.value.value;
  }

  set(key, value) {
    const existing = this.#nodes.get(key);
    if (existing !== undefined) {
      existing.value.value = value;
      this.#order.moveToFront(existing);
      return this;
    }
    this.#nodes.set(key, this.#order.pushFront({ key, value }));
    if (this.#nodes.size > this.capacity) {
      const oldest = this.#order.last();
      this.#order.remove(oldest);
      this.#nodes.delete(oldest.value.key); // the node stores its key for exactly this moment
      this.evictions++;
    }
    return this;
  }

  keys() {
    return this.#order.toArray().map((entry) => entry.key);
  }
}
```

Now use it in front of the (simulated) pricing service. `price(sku)` asks the cache first and only calls the service on a miss:

lru-demo.js

```ts
import { LRUCache } from "./lru-cache.js";

let serviceCalls = 0;
function priceFromService(sku) {
  serviceCalls++;
  return 100000 + sku.length * 1000; // stands in for a slow network call
}

const cache = new LRUCache(3);
function price(sku) {
  let kobo = cache.get(sku);
  if (kobo === undefined) {
    kobo = priceFromService(sku);
    cache.set(sku, kobo);
  }
  return kobo;
}

for (const sku of ["RICE", "OIL", "RICE", "SALT", "BEANS", "RICE", "OIL"]) {
  price(sku);
  console.log(`${sku.padEnd(5)} -> cache ${cache.keys().join(" ")}`);
}
console.log(`hits ${cache.hits}, misses ${cache.misses}, evictions ${cache.evictions}, service calls ${serviceCalls}`);
```

Output of `node lru-demo.js` and of the browser terminal

```ts
RICE  -> cache RICE
OIL   -> cache OIL RICE
RICE  -> cache RICE OIL
SALT  -> cache SALT RICE OIL
BEANS -> cache BEANS SALT RICE
RICE  -> cache RICE BEANS SALT
OIL   -> cache OIL RICE BEANS
hits 2, misses 5, evictions 2, service calls 5
```

Follow the trace. When `BEANS` arrives the cache is full, and `OIL` is evicted, not `RICE`: `RICE` was read again two steps earlier, which moved it to the front. At the end, `OIL` has to be fetched from the service again, and `SALT`, now the least recently used, is evicted in its place. Every `get` and `set` did a constant amount of work: one map operation and a few pointer updates.

Now compare it with the array version from the start of the lesson on a bigger cache. Both do the same work and return the same prices; only the cost of keeping the recency order differs:

lru-compare.js

```ts
import { LRUCache } from "./lru-cache.js";

class ArrayLRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.prices = new Map();
    this.order = [];
  }
  #touch(key) {
    const at = this.order.indexOf(key);
    if (at !== -1) this.order.splice(at, 1);
    this.order.unshift(key);
  }
  get(key) {
    if (!this.prices.has(key)) return undefined;
    this.#touch(key);
    return this.prices.get(key);
  }
  set(key, value) {
    this.prices.set(key, value);
    this.#touch(key);
    if (this.order.length > this.capacity) this.prices.delete(this.order.pop());
    return this;
  }
}

function workload(cache, capacity) {
  for (let i = 0; i < capacity; i++) cache.set(`SKU-${i}`, 100000 + i);
  let total = 0;
  const start = performance.now();
  for (let r = 0; r < 20000; r++) total += cache.get(`SKU-${(r * 7919) % capacity}`);
  return { ms: performance.now() - start, total };
}

workload(new LRUCache(100), 100); // warm-up
const capacity = 5000;
const withArray = workload(new ArrayLRU(capacity), capacity);
const withList = workload(new LRUCache(capacity), capacity);
console.log("same prices returned:", withArray.total === withList.total);
console.log(`capacity ${capacity}: the linked LRU is over 10 times faster:`, withArray.ms > 10 * withList.ms);
```

Output of `node lru-compare.js` and of the browser terminal

```ts
same prices returned: true
capacity 5000: the linked LRU is over 10 times faster: true
```

Each hit on the linked cache is one map lookup and a `moveToFront`: a `remove` (two pointer updates, plus clearing the node's own two) and an insert (four updates). That count is the same for a cache of 100 products or 100,000: O(1). The array version pays for `indexOf`, `splice` and `unshift`, about `2n` slot moves per hit.

> TIP
>
> In JavaScript you can also build an LRU cache from a `Map` alone, because a `Map` remembers insertion order: to mark a key as used, `delete` it and `set` it again (it moves to the end); to evict, take the first key from `map.keys().next().value` (`keys()` returns an iterator; `next().value` is its first item). Both are O(1) amortized: V8 keeps a `Map`'s entries in an array in insertion order, a delete leaves a hole there, and the holes are cleared out when the table is rebuilt. The explicit list is still worth knowing: it is how LRU caches are built in most languages, and it lets you add features such as "peek without touching" or per-entry sizes.

## When a linked list beats an array, and when it does not

Big O says a linked list wins at inserting and removing in the middle. Real machines add two costs that Big O ignores:

- **Memory per item.** Each node is a separate object with its own header plus one or two pointers. A list of a million numbers uses several times the memory of an array of a million numbers.
- **Cache locality.** A CPU reads memory in blocks and keeps recently read blocks in a small, very fast **cache**. An array's items sit side by side, so one block brings in many items at once. A list's nodes can be anywhere, so walking it can mean a slow trip to main memory for every node.

locality.js

```ts
function bestTime(fn, runs = 5) {
  fn();
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

const n = 1000000;
const amounts = Array.from({ length: n }, (_, i) => i % 100);

let inOrder = null; // nodes created one after another: often close together in memory
for (let i = n - 1; i >= 0; i--) inOrder = { value: i % 100, next: inOrder };

let seed = 42; // nodes linked in a shuffled order: like a list built up over hours of traffic
const random = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), (seed >>> 0) / 4294967296);
const nodes = Array.from({ length: n }, (_, i) => ({ value: i % 100, next: null }));
const order = nodes.map((_, i) => i);
for (let i = n - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
for (let i = 0; i < n - 1; i++) nodes[order[i]].next = nodes[order[i + 1]];
const scattered = nodes[order[0]];

const sumArray = () => { let s = 0; for (let i = 0; i < amounts.length; i++) s += amounts[i]; return s; };
const sumList = (head) => () => { let s = 0; for (let node = head; node !== null; node = node.next) s += node.value; return s; };

console.log("same sums:", sumArray() === sumList(inOrder)() && sumArray() === sumList(scattered)());
const arrayMs = bestTime(sumArray);
console.log("array is faster than the list built in order:", arrayMs < bestTime(sumList(inOrder)));
console.log("array is over 10 times faster than the scattered list:", 10 * arrayMs < bestTime(sumList(scattered)));
```

Output of `node locality.js` and of the browser terminal

```ts
same sums: true
array is faster than the list built in order: true
array is over 10 times faster than the scattered list: true
```

Both lists do exactly the same O(n) work as the array, and both lose. The scattered one loses badly, and real long-lived lists (like an LRU cache that has been reordered millions of times) look like the scattered one. So the practical rule:

| Use an array when… | Use a linked list when… |
| --- | --- |
| you read by index or scan the whole collection often | you must remove or move items in the middle, and you already hold a reference to them (LRU cache, schedulers) |
| you mostly add and remove at the end | you add and remove at both ends and cannot use a ring buffer |
| you sort, binary search or slice | you splice whole lists together in O(1) (join the tail of one to the head of another) |
| memory matters | you cannot tolerate the occasional O(n) resize of a growing array |

In everyday JavaScript, arrays, `Map` and `Set` cover most needs. Linked lists earn their place inside other structures: the LRU cache, hash table chains ([the chaining you built](https://zudojs.oyinlola.site/learn/dsa-hash-maps#collisions) could use one), adjacency lists in [graphs](https://zudojs.oyinlola.site/learn/dsa-graphs), and the free lists inside memory allocators.

## Testing linked structures

Linked list bugs usually leave the structure *inconsistent*: a `prev` pointer that disagrees with a `next`, a size that does not match the number of nodes, a tail that is not the last node. So test **invariants** (facts that must always hold) after every operation, and compare against a simple reference: here an array for the list, and a slow but obviously correct array-based LRU for the cache.

linked-tests.js

```ts
import { DoublyLinkedList } from "./doubly-linked-list.js";
import { LRUCache } from "./lru-cache.js";

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

// 1. Doubly linked list vs an array, invariants after every operation
const random = xorshift(99);
const list = new DoublyLinkedList();
const reference = [];
const handles = []; // nodes we can remove directly, like the LRU does
let broken = 0;
for (let i = 0; i < 5000; i++) {
  const r = random();
  if (r < 0.35) {
    handles.push(list.pushBack(i));
    reference.push(i);
  } else if (r < 0.6) {
    handles.push(list.pushFront(i));
    reference.unshift(i);
  } else if (handles.length > 0) {
    const [node] = handles.splice(Math.floor(random() * handles.length), 1);
    reference.splice(reference.indexOf(node.value), 1);
    list.remove(node);
  }
  const forwards = list.toArray();
  const backwards = list.toArrayBackwards().reverse();
  if (list.size !== reference.length || forwards.join() !== reference.join() || backwards.join() !== forwards.join()) broken++;
}
check(`5000 random operations: size, forward and backward order always agree (final size ${list.size})`, broken === 0);

// 2. LRU cache vs a slow reference LRU built on an array
function referenceLRU(capacity) {
  const entries = []; // [key, value], most recent first
  return {
    get(key) {
      const i = entries.findIndex(([k]) => k === key);
      if (i === -1) return undefined;
      const [entry] = entries.splice(i, 1);
      entries.unshift(entry);
      return entry[1];
    },
    set(key, value) {
      const i = entries.findIndex(([k]) => k === key);
      if (i !== -1) entries.splice(i, 1);
      entries.unshift([key, value]);
      if (entries.length > capacity) entries.pop();
    },
    keys: () => entries.map(([k]) => k),
  };
}

const fast = new LRUCache(4);
const slow = referenceLRU(4);
let disagreements = 0;
for (let i = 0; i < 20000; i++) {
  const key = `SKU-${Math.floor(random() * 10)}`;
  if (random() < 0.5) {
    if (fast.get(key) !== slow.get(key)) disagreements++;
  } else {
    fast.set(key, i);
    slow.set(key, i);
  }
  if (fast.keys().join() !== slow.keys().join()) disagreements++;
}
check(`LRU matches the reference for 20000 operations (${fast.hits} hits, ${fast.misses} misses, ${fast.evictions} evictions)`, disagreements === 0);

// 3. Edge cases
const one = new LRUCache(1);
one.set("A", 1).set("B", 2);
check("capacity 1 keeps only the newest key", one.get("A") === undefined && one.get("B") === 2 && one.size === 1);
let rejected = 0;
for (const bad of [0, -1, 2.5, "3"]) {
  try {
    new LRUCache(bad);
  } catch (error) {
    if (error instanceof RangeError) rejected++;
  }
}
check("invalid capacities are rejected", rejected === 4);
```

Output of `node linked-tests.js` and of the browser terminal

```ts
PASS 5000 random operations: size, forward and backward order always agree (final size 1058)
PASS LRU matches the reference for 20000 operations (3899 hits, 6029 misses, 6068 evictions)
PASS capacity 1 keeps only the newest key
PASS invalid capacities are rejected
```

The printed counts matter again: they prove the random test produced hits, misses *and* evictions. A test in which the cache never filled up would never have exercised eviction, the part most likely to be wrong.

## LRU caches in production

- **Use a tested implementation.** For Node.js, the `lru-cache` npm package is the standard choice; ZudoJS's [`@zudojs/cache`](https://zudojs.oyinlola.site/learn/zudo-cache) gives you caching with adapters, tags and locking. Build your own to understand them, as you did here.
- **Bound by size, not only by count.** 1,000 small prices and 1,000 product images are very different amounts of memory. Production caches can limit the total size of the values.
- **Add expiry.** LRU decides what to evict when the cache is full; a TTL decides when an entry is too old to trust. Prices, permissions and sessions all need one.
- **Invalidate on change.** When a price changes, delete it from the cache at the same moment, or accept that customers may see the old price until the TTL runs out. Decide which, deliberately.
- **Prevent stampedes.** Cache the pending promise of the first request for a missing key, so concurrent requests share one call to the slow service.
- **One cache per process.** Each server process has its own in-memory cache, so they can disagree. A shared cache (Redis, which has LRU eviction built in) keeps one copy for all processes, at the cost of a network round trip.
- **Measure the hit rate.** `hits / (hits + misses)` tells you whether the cache is worth its memory. A low hit rate often means the capacity is too small for the working set, or the keys are too specific.

## Practice

TRY IT YOURSELF

### The middle stop

A delivery route is a singly linked list and nobody stored its length. Find the middle stop in one pass, using a slow pointer and a fast pointer. For an even number of stops, return the second of the two middle ones.

**Show a solution**

middle.js

```ts
function fromArray(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = { value: values[i], next: head };
  return head;
}

function middle(head) {
  let slow = head;
  let fast = head;
  while (fast !== null && fast.next !== null) {
    slow = slow.next;
    fast = fast.next.next;
  }
  return slow?.value ?? null;
}

console.log(middle(fromArray(["Depot", "Ikeja", "Yaba", "Surulere", "Lekki"])));
console.log(middle(fromArray(["Depot", "Ikeja", "Yaba", "Lekki"])));
console.log(middle(fromArray(["Depot"])), middle(fromArray([])));
```

Output of `node middle.js` and of the browser terminal

```ts
Yaba
Yaba
Depot null
```

When the fast pointer (two steps at a time) reaches the end, the slow one (one step) has covered half the distance. With 5 stops the loop runs twice and stops on the 3rd; with 4 stops it also runs twice (the fast pointer lands on `null`) and stops on the 3rd, the second middle. If you want the *first* middle of an even list, return `null` for an empty list first, then loop while `fast.next !== null && fast.next.next !== null`. O(n) time, O(1) space, one pass. It is the same pair of pointers as Floyd's cycle detection.

TRY IT YOURSELF

### Merge two sorted event logs

Two payment terminals each keep a linked list of transactions sorted by time. Merge them into one sorted list *by relinking the existing nodes* (no new nodes except one dummy head). What are the time and extra space?

**Show a solution**

merge-lists.js

```ts
function fromArray(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = { value: values[i], next: head };
  return head;
}

function toArray(head) {
  const out = [];
  for (let node = head; node !== null; node = node.next) out.push(node.value);
  return out;
}

function mergeSorted(a, b) {
  const dummy = { value: null, next: null };
  let tail = dummy;
  while (a !== null && b !== null) {
    if (a.value.time <= b.value.time) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a !== null ? a : b; // attach whatever is left: already sorted
  return dummy.next;
}

const terminalA = fromArray([{ time: "09:01", id: "A1" }, { time: "09:07", id: "A2" }, { time: "09:30", id: "A3" }]);
const terminalB = fromArray([{ time: "09:05", id: "B1" }, { time: "09:07", id: "B2" }]);
console.log(toArray(mergeSorted(terminalA, terminalB)).map((t) => `${t.time} ${t.id}`).join(" | "));
console.log(toArray(mergeSorted(null, fromArray([{ time: "10:00", id: "B9" }]))).length);
```

Output of `node merge-lists.js` and of the browser terminal

```ts
09:01 A1 | 09:05 B1 | 09:07 A2 | 09:07 B2 | 09:30 A3
1
```

O(n + m) time, and O(1) extra space, because the existing nodes are relinked instead of copied. The dummy head removes the special case for "which list starts the result". Using `<=` keeps equal times in their original order (A2 before B2), which makes the merge **stable**, a property [the sorting lesson](https://zudojs.oyinlola.site/learn/dsa-sorting) relies on.

TRY IT YOURSELF

### Remove every cancelled order

Remove every node whose order is cancelled from a singly linked list, including at the head and in a row, in one pass. Return the new head. Use a dummy node so the head is not a special case.

**Show a solution**

remove-all.js

```ts
function fromArray(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = { value: values[i], next: head };
  return head;
}

function ids(head) {
  const out = [];
  for (let node = head; node !== null; node = node.next) out.push(node.value.id);
  return out.join(" ") || "(empty)";
}

function removeCancelled(head) {
  const dummy = { value: null, next: head };
  let previous = dummy;
  while (previous.next !== null) {
    if (previous.next.value.status === "cancelled") previous.next = previous.next.next; // unlink; stay put
    else previous = previous.next;
  }
  return dummy.next;
}

const make = (statuses) => fromArray(statuses.map((status, i) => ({ id: `ORD-${i + 1}`, status })));
console.log(ids(removeCancelled(make(["cancelled", "paid", "cancelled", "cancelled", "paid"]))));
console.log(ids(removeCancelled(make(["cancelled", "cancelled"]))));
console.log(ids(removeCancelled(make([]))));
```

Output of `node remove-all.js` and of the browser terminal

```ts
ORD-2 ORD-5
(empty)
(empty)
```

After unlinking, `previous` stays where it is, because its new `next` has not been checked yet. That is the linked-list version of the skipped-item bug from [the arrays lesson](https://zudojs.oyinlola.site/learn/dsa-arrays-strings#cancelled-orders), and here it is avoided by not advancing. O(n) time, O(1) extra space, and unlike `splice`, nothing ever shifts.

## Summary

- A linked list stores each item in a node that points to the next one. There is no index formula: reaching item `i` is O(i), but inserting or removing next to a node you hold is O(1).
- A singly linked list with a head and a tail is an O(1) queue. Removing its last item is O(n), because nodes do not know their predecessor.
- Reverse in place with three pointers (`previous`, `current`, saved `next`): O(n) time, O(1) space.
- Detect a cycle with a `Set` of visited nodes (O(n) space) or with Floyd's slow and fast pointers (O(1) space).
- A doubly linked list with sentinels removes any node in O(1) with no special cases.
- An LRU cache is a `Map` (key to node) plus a doubly linked list in recency order: O(1) `get`, `set` and eviction.
- Arrays usually win in practice because of memory use and cache locality; linked lists win when you move or remove items you already hold a reference to.

Next: [Trees and binary search trees](https://zudojs.oyinlola.site/learn/dsa-trees), where each node points to several children instead of one next node.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
