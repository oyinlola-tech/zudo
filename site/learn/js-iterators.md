---
title: "Iterables and iterators — ZudoJS Academy"
description: "Learn the protocol behind for...of, spread and destructuring, then write your own iterables: a number range and an API paginator that fetches pages lazily."
source: https://zudojs.oyinlola.site/learn/js-iterators
---

LEVEL 4 · LESSON 9 OF 20

Iteration and symbols Core

# Iterables and iterators

Learn the protocol behind for...of, spread and destructuring, then write your own iterables: a number range and an API paginator that fetches pages lazily.

- **50 min** to read and try
- **You need:** Loops, Arrays, Closures in depth and Prototypes in depth
- **You build:** A lazy paginator that walks an orders API page by page, stops fetching when the caller stops reading, and is tested with a fake API

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the iterable and iterator protocols and drive an iterator by hand with next()
- Predict what for...of, spread, destructuring and Array.from do with any iterable, including when they stop early
- Write reusable iterables such as a range, and tell a reusable iterable from a one-shot iterator
- Clean up resources with return() when a caller stops early
- Use iterator helpers to build lazy pipelines, and know when laziness helps
- Build and test a lazy paginator over a paged API

## Ten thousand orders, one page at a time

A shop's orders API never sends every order at once. It sends a **page**: a few orders plus a **cursor**, a token that says where the next page starts. When there is no cursor, you have reached the end. Here is a small fake of such an API, with three orders per page, and the first code a team writes against it:

problem.js

```ts
const ORDERS = [
  { id: "ORD-1", totalKobo: 450000 },
  { id: "ORD-2", totalKobo: 120000 },
  { id: "ORD-3", totalKobo: 980000 },
  { id: "ORD-4", totalKobo: 30000 },
  { id: "ORD-5", totalKobo: 2500000 },
  { id: "ORD-6", totalKobo: 75000 },
  { id: "ORD-7", totalKobo: 610000 },
];

let requests = 0;
function fetchOrdersPage(cursor = 0) {
  requests += 1;
  const items = ORDERS.slice(cursor, cursor + 3);
  const next = cursor + 3 < ORDERS.length ? cursor + 3 : null;
  return { items, nextCursor: next };
}

function loadAllOrders() {
  const all = [];
  let cursor = 0;
  while (cursor !== null) {
    const page = fetchOrdersPage(cursor);
    all.push(...page.items);
    cursor = page.nextCursor;
  }
  return all;
}

const firstBig = loadAllOrders().find((order) => order.totalKobo > 500000);
console.log(firstBig.id, "after", requests, "requests");
```

Output of `node problem.js` and of the browser terminal

```ts
ORD-3 after 3 requests
```

The answer was on the first page, yet the code fetched all three. With seven orders that is harmless. With ten thousand orders it means thousands of requests and every order held in memory at once, just to find one. There is a second problem: every part of the program that needs orders repeats the same `while (cursor !== null)` loop, and each copy is a place for a paging bug.

What you want is to write this, and have pages fetched only when the loop actually needs them:

```ts
for (const order of orders) {
  if (order.totalKobo > 500000) { found = order; break; }
}
```

`for...of` already works on arrays, strings, maps and sets. It is not special-cased for those types: it talks to them through a small agreement called the **iteration protocol**. Any object that follows the agreement works with `for...of`, spread, destructuring and many other parts of the language. This lesson teaches the agreement, and at the end you build an `orders` object that follows it and fetches lazily.

## The protocol: iterables and iterators

Two roles take part, and it is worth keeping the words apart from the start:

- An **iterator** is an object with a `next()` method. Each call to `next()` returns a small **result object** `{ value, done }`. While there are items, `done` is `false` and `value` is the item. When the items run out, `done` is `true`.
- An **iterable** is an object that can *give you* an iterator. It has a method stored under a special key, `Symbol.iterator`. Calling that method returns a fresh iterator.

`Symbol.iterator` is a **well-known symbol**: a unique value built into the language, used as a property key so it can never clash with a normal property name like `"next"` or `"items"`. You met symbols briefly in [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#two-families); [Symbols](https://zudojs.oyinlola.site/learn/js-symbols) covers them fully. For now, read `obj[Symbol.iterator]` as "the method that starts iterating this object".

You can do by hand what `for...of` does for you. Ask an array for its iterator, then call `next()` until `done` is `true`:

by-hand.js

```ts
const cart = ["rice", "beans", "oil"];

const iterator = cart[Symbol.iterator]();
console.log(iterator.next());
console.log(iterator.next());
console.log(iterator.next());
console.log(iterator.next());
console.log(iterator.next());
```

Output of `node by-hand.js` and of the browser terminal

```json
{ value: 'rice', done: false }
{ value: 'beans', done: false }
{ value: 'oil', done: false }
{ value: undefined, done: true }
{ value: undefined, done: true }
```

Three things to notice. The iterator keeps its own position: each `next()` moves one step. When it is finished, it stays finished: calling `next()` again keeps returning `done: true`. And the array itself did not change; the position lives in the iterator, not in the array.

```ts
 iterable (the cart array)                iterator (one walk over it)
 ┌──────────────────────────┐   calls    ┌──────────────────────────┐
 │ [Symbol.iterator]()  ────┼──────────► │ position: 0              │
 └──────────────────────────┘  returns   │ next() → { value, done } │
                                         └──────────────────────────┘
 Ask the iterable for a new iterator every time you want to start from the beginning.
```

The iterable starts walks; each iterator is one walk with its own position.

### Why two objects instead of one?

Because you often need several walks over the same data at the same time. Comparing every order with every other order needs two positions over the same list. If the list itself stored "where am I", the two walks would fight over it. With separate iterators, each walk has its own position:

two-walks.js

```ts
const sizes = ["S", "M", "L"];

for (const shirt of sizes) {
  const pairs = [];
  for (const trousers of sizes) pairs.push(shirt + trousers);
  console.log(pairs.join(" "));
}
```

Output of `node two-walks.js` and of the browser terminal

```ts
SS SM SL
MS MM ML
LS LM LL
```

Each `for...of` asked the array for its own iterator, so the inner loop starting again did not disturb the outer one.

## for...of under the hood

You met `for...of` in [Loops](https://zudojs.oyinlola.site/learn/js-loops#for-of). Here is what it really does, written out with a `while` loop. This version behaves the same as `for (const item of cart) console.log(item)`:

desugar.js

```ts
const cart = ["rice", "beans", "oil"];

const iterator = cart[Symbol.iterator]();
while (true) {
  const result = iterator.next();
  if (result.done) break;
  const item = result.value;
  console.log(item);
}
```

Output of `node desugar.js` and of the browser terminal

```ts
rice
beans
oil
```

That is the whole mechanism: get an iterator once, call `next()` until `done`, and give each `value` to the loop body. There is one more step, for when the loop ends *early*, which you will see in [Stopping early: return()](#cleanup).

It also explains the error you get when you give `for...of` something that is not iterable. A plain object has no `Symbol.iterator` method, so the very first step fails:

not-iterable.js

```ts
const order = { id: "ORD-1", totalKobo: 450000 };

console.log(typeof order[Symbol.iterator]);
try {
  for (const part of order) console.log(part);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

for (const [key, value] of Object.entries(order)) {
  console.log(key, value);
}
```

Output of `node not-iterable.js` and of the browser terminal

```ts
undefined
TypeError: order is not iterable
id ORD-1
totalKobo 450000
```

Plain objects are deliberately not iterable: it is not obvious whether you want their keys, their values or both. `Object.entries` answers that question and gives you an array, which is iterable.

### for...of is not for...in

`for...in` is an older loop that walks an object's *property names* (as strings), including inherited enumerable ones. It knows nothing about the iteration protocol. On an array it gives you indexes as strings, and any extra property someone attached:

for-in.js

```ts
const prices = [500, 700];
prices.currency = "NGN";

for (const key in prices) console.log("in:", key, typeof key);
for (const price of prices) console.log("of:", price);
```

Output of `node for-in.js` and of the browser terminal

```ts
in: 0 string
in: 1 string
in: currency string
of: 500
of: 700
```

Use `for...of` for the items of anything iterable. Use `Object.keys`/`Object.entries` with `for...of` when you mean the properties of a plain object.

## Who else speaks the protocol

Once an object is iterable, many parts of the language accept it, because they all use `Symbol.iterator` and `next()` internally. These are called **consumers** of the protocol:

| Consumer | Example | Reads |
| --- | --- | --- |
| `for...of` | `for (const x of it)` | until done, or until `break` |
| Spread | `[...it]`, `Math.max(...it)` | everything |
| Array destructuring | `const [first, second] = it` | only as many as it needs |
| `Array.from` | `Array.from(it, fn)` | everything |
| Collections | `new Set(it)`, `new Map(pairs)` | everything |
| Promise combinators | `Promise.all(it)` | everything |
| `Object.fromEntries` | `Object.fromEntries(pairs)` | everything |
| `yield*` | inside a generator | everything (see [Generators](https://zudojs.oyinlola.site/learn/js-generators)) |

To *see* the protocol being used, wrap an array's iterator in one that reports each call. This is a first custom iterable: an object whose `[Symbol.iterator]` method returns an object with `next()`. Square brackets around the method name make it a **computed key**, so the method's key is the symbol itself:

spy.js

```ts
function spy(label, items) {
  return {
    [Symbol.iterator]() {
      const inner = items[Symbol.iterator]();
      return {
        next() {
          const result = inner.next();
          console.log(`  ${label}: next() -> ${result.done ? "done" : result.value}`);
          return result;
        },
      };
    },
  };
}

const skus = ["RICE-5", "OIL-1", "SALT"];

console.log("spread:");
const copy = [...spy("spread", skus)];

console.log("destructuring two:");
const [first, second] = spy("destructure", skus);
console.log(first, second, copy.length);
```

Output of `node spy.js` and of the browser terminal

```ts
spread:
  spread: next() -> RICE-5
  spread: next() -> OIL-1
  spread: next() -> SALT
  spread: next() -> done
destructuring two:
  destructure: next() -> RICE-5
  destructure: next() -> OIL-1
RICE-5 OIL-1 3
```

Spread reads until `done`. Destructuring two names calls `next()` exactly twice and never asks for the third item. That difference matters as soon as producing an item costs something, such as a network request: destructuring the first order from a paginator should fetch one page, not all of them.

### Strings iterate by code point

Built-in iterables decide for themselves what an "item" is. A string's iterator gives you **code points** (whole Unicode characters), not the 16-bit units that `.length` and `[index]` count. An emoji such as a shopping bag takes two of those units:

string-iter.js

```ts
const label = "₦5🛍";

console.log(label.length);
console.log([...label]);
console.log([...label].length);
console.log(label[2] === "🛍");
```

Output of `node string-iter.js` and of the browser terminal

```ts
4
[ '₦', '5', '🛍' ]
3
false
```

So `[...text].length` counts characters more honestly than `text.length`. It still counts some things a person sees as one symbol (flags, skin-tone emoji) as several; [Strings in depth](https://zudojs.oyinlola.site/learn/js-strings) covers that last step with `Intl.Segmenter`.

### Maps and Sets hand out several iterators

A `Map` is iterable (its default items are `[key, value]` pairs), and it also has `keys()`, `values()` and `entries()`, which each return an iterator. Arrays have the same three methods. These return iterators, not arrays, which leads to the most common iterator surprise.

## Reusable iterables and one-shot iterators

Built-in iterators are themselves iterable: their `[Symbol.iterator]()` method returns *the same iterator*, `this`. That is what lets you write `for (const price of stock.values())`. But an iterator can only be walked once, because it keeps its position:

one-shot.js

```ts
const stock = new Map([
  ["RICE-5", 12],
  ["OIL-1", 0],
  ["SALT", 40],
]);

const counts = stock.values();
console.log(counts[Symbol.iterator]() === counts);

const total = [...counts].reduce((sum, n) => sum + n, 0);
const highest = Math.max(...counts);
console.log(total, highest);

console.log(Math.max(...stock.values()));
```

Output of `node one-shot.js` and of the browser terminal

```ts
true
52 -Infinity
40
```

The first spread used up `counts`. The second spread got an iterator that was already finished, so `Math.max()` received no arguments at all, and the maximum of nothing is `-Infinity`. No error, just a wrong number. Asking the map again, `stock.values()`, gives a fresh iterator and the correct answer.

The rule to remember:

- An **iterable** such as an array, a map or a set can be walked many times. Each walk asks for a new iterator.
- An **iterator** is one walk. Store it in a variable only when you mean to share that one walk between several readers.

When a function receives "something iterable" and needs to read it twice, copy it into an array first: `const list = [...input]`. When you *write* an iterable, return a fresh iterator from every `[Symbol.iterator]()` call, so your object behaves like an array and not like a used-up iterator.

## Writing your own: a range

JavaScript has no built-in way to say "the numbers from 1 to 5". Receipts, invoice numbers, days of a booking and seat numbers all need one. A `range` is the classic first custom iterable, because it shows the key idea: the numbers never exist in memory as a list. Each one is computed when `next()` asks for it.

range.js

```ts
export function range(start, end, step = 1) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new TypeError("start and end must be numbers");
  if (step === 0 || !Number.isFinite(step)) throw new RangeError("step must be a non-zero number");

  return {
    [Symbol.iterator]() {
      let current = start;
      return {
        next() {
          const inside = step > 0 ? current < end : current > end;
          if (!inside) return { value: undefined, done: true };
          const value = current;
          current += step;
          return { value, done: false };
        },
      };
    },
  };
}
```

use-range.js

```ts
import { range } from "./range.js";

console.log([...range(1, 6)]);
console.log([...range(0, 50, 10)]);
console.log([...range(5, 0, -1)]);
console.log([...range(3, 3)]);

const nights = range(12, 15);
for (const day of nights) console.log(`Room 7 booked for Oct ${day}`);
console.log("walk again:", [...nights].join(","));

try {
  range(1, 10, 0);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node use-range.js` and of the browser terminal

```json
[ 1, 2, 3, 4, 5 ]
[ 0, 10, 20, 30, 40 ]
[ 5, 4, 3, 2, 1 ]
[]
Room 7 booked for Oct 12
Room 7 booked for Oct 13
Room 7 booked for Oct 14
walk again: 12,13,14
RangeError: step must be a non-zero number
```

The design decisions in those few lines:

- **The end is excluded**, like `slice(start, end)`. `range(12, 15)` gives three nights, and `end - start` is the count. Pick one convention and keep it everywhere.
- **The position lives inside `[Symbol.iterator]()`**, in a closure ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#private-state)). Every walk gets its own `current`, which is why walking `nights` a second time works.
- **A step of 0 is refused** at creation. It would make `current` never move and every loop over the range infinite. Checking in `range()`, not in `next()`, reports the mistake where it was made.
- **Negative steps count down**, so the "still inside?" test flips direction.

The last lines show the validation working: a step of 0 is refused with a `RangeError` the moment the range is created, before anyone tries to loop over it.

## Stopping early: return()

Some iterators hold something that must be released: an open database cursor, a file handle, a lock on a page of results. If the caller reads to the end, the iterator knows it is finished and can release it when it returns `done: true`. But the caller may stop early: a `break`, a `return` from the surrounding function, an exception in the loop body, or destructuring that only needs two items.

For that case the protocol has an optional second method, `return()`. When a consumer stops before `done`, it calls `iterator.return()` if the method exists. That is the step missing from the `while` version earlier. Here a fake database cursor logs when it opens and closes:

return.js

```ts
function openCursor(rows) {
  return {
    [Symbol.iterator]() {
      console.log("  cursor opened");
      let index = 0;
      let open = true;
      const close = () => {
        if (open) console.log("  cursor closed");
        open = false;
      };
      return {
        next() {
          if (index >= rows.length) {
            close();
            return { value: undefined, done: true };
          }
          return { value: rows[index++], done: false };
        },
        return() {
          close();
          return { value: undefined, done: true };
        },
      };
    },
  };
}

const rows = ["ORD-1", "ORD-2", "ORD-3"];

console.log("read all:");
for (const id of openCursor(rows)) console.log(" ", id);

console.log("break:");
for (const id of openCursor(rows)) {
  console.log(" ", id);
  if (id === "ORD-2") break;
}

console.log("throw:");
try {
  for (const id of openCursor(rows)) throw new Error(`cannot ship ${id}`);
} catch (error) {
  console.log(" ", error.message);
}

console.log("destructure one:");
const [firstId] = openCursor(rows);
console.log(" ", firstId);
```

Output of `node return.js` and of the browser terminal

```ts
read all:
  cursor opened
  ORD-1
  ORD-2
  ORD-3
  cursor closed
break:
  cursor opened
  ORD-1
  ORD-2
  cursor closed
throw:
  cursor opened
  cursor closed
  cannot ship ORD-1
destructure one:
  cursor opened
  cursor closed
  ORD-1
```

In every case the cursor closed exactly once. Notice the order in the "throw" case: the cursor was closed *before* the `catch` block ran, because `for...of` calls `return()` on its way out, the same way a `finally` block would run. The `open` flag makes `close` safe to call twice, which is a good habit for any cleanup.

> WATCH OUT
>
> Calling `next()` yourself, in a `while` loop, gives you none of this. If you stop early, calling `return()` is your job. Prefer `for...of` and destructuring, which do it for you.

## Laziness and infinite sequences

A range computes each number when asked. That property is called **laziness**: no work happens until someone calls `next()`. It has a surprising consequence: an iterable can be **infinite**, as long as nobody tries to read all of it.

An invoice number generator is a natural example. Invoices never "run out"; you just take the next one:

invoice-numbers.js

```ts
function invoiceNumbers(prefix, start = 1) {
  return {
    [Symbol.iterator]() {
      let n = start;
      return {
        next: () => ({ value: `${prefix}-${String(n++).padStart(5, "0")}`, done: false }),
      };
    },
  };
}

const numbers = invoiceNumbers("INV-2026", 98);
const orders = ["ORD-1", "ORD-2", "ORD-3"];

const iterator = numbers[Symbol.iterator]();
for (const order of orders) {
  console.log(order, "->", iterator.next().value);
}
```

Output of `node invoice-numbers.js` and of the browser terminal

```ts
ORD-1 -> INV-2026-00098
ORD-2 -> INV-2026-00099
ORD-3 -> INV-2026-00100
```

This iterator never returns `done: true`. Walking it with a `for...of` without a `break`, or spreading it with `[...numbers]`, would run forever and then crash when memory runs out. That is the price of infinite sequences: the *consumer* must decide when to stop. The next section shows a clean way to do that.

## Iterator helpers: map, filter and take, lazily

Arrays have `map`, `filter` and friends, but they only work on arrays, and each one builds a whole new array before the next starts. Since ES2025, iterators have their own versions, the **iterator helpers**, on `Iterator.prototype`: `map`, `filter`, `take`, `drop`, `flatMap`, plus finishing methods `toArray`, `reduce`, `forEach`, `some`, `every` and `find`. They exist in Node.js 22 and later and in current Chrome, Firefox and Safari.

The difference is not the syntax, it is the order of the work. Watch both versions find the first two large orders:

lazy-vs-eager.js

```ts
const totals = [450000, 120000, 980000, 30000, 2500000, 75000];

console.log("array methods (eager):");
const eager = totals
  .map((kobo) => { console.log("  map", kobo); return kobo / 100; })
  .filter((naira) => naira > 4000)
  .slice(0, 2);
console.log(eager);

console.log("iterator helpers (lazy):");
const lazy = totals
  .values()
  .map((kobo) => { console.log("  map", kobo); return kobo / 100; })
  .filter((naira) => naira > 4000)
  .take(2)
  .toArray();
console.log(lazy);
```

Output of `node lazy-vs-eager.js` and of the browser terminal

```ts
array methods (eager):
  map 450000
  map 120000
  map 980000
  map 30000
  map 2500000
  map 75000
[ 4500, 9800 ]
iterator helpers (lazy):
  map 450000
  map 120000
  map 980000
[ 4500, 9800 ]
```

The array version mapped all six totals, built an array, filtered it into another array, then threw most of it away. The iterator version pulls one item at a time through the whole chain: `toArray` asks `take`, which asks `filter`, which asks `map`, which asks the array's iterator. As soon as `take(2)` has two items it stops asking, so the last three totals were never touched. `totals.values()` is the step that turns the array into an iterator.

Laziness is what makes infinite sequences usable. `take` is the "decide when to stop" from the previous section:

helpers-infinite.js

```ts
function naturals() {
  let n = 1;
  return Iterator.from({ next: () => ({ value: n++, done: false }) });
}

const firstSeats = naturals()
  .filter((seat) => seat % 13 !== 0)
  .map((seat) => `Seat ${seat}`)
  .drop(10)
  .take(4)
  .toArray();
console.log(firstSeats);

const firstOver = naturals().find((n) => n * n > 2000);
console.log(firstOver);
```

Output of `node helpers-infinite.js` and of the browser terminal

```json
[ 'Seat 11', 'Seat 12', 'Seat 14', 'Seat 15' ]
45
```

The seat numbering skips unlucky multiples of 13, drops the first ten seats (reserved for staff), and takes four. `find` stops at the first match, which is why searching an infinite sequence ends.

### Iterator.from: giving your iterators the helpers

The helpers live on `Iterator.prototype`. Built-in iterators inherit from it (the prototype chain from [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#chain)). An iterator you write as a plain object literal does not, so it has no `map`. `Iterator.from(x)` fixes that. It takes an iterable (and calls its `[Symbol.iterator]()`) or a bare object with `next()`. If the iterator it gets already inherits from `Iterator.prototype`, as built-in ones do, it returns it unchanged; otherwise it wraps it in one that does, so the helpers appear:

iterator-from.js

```ts
const plain = {
  items: ["RICE-5", "OIL-1", "SALT"],
  [Symbol.iterator]() {
    let i = 0;
    return { next: () => (i < this.items.length ? { value: this.items[i++], done: false } : { value: undefined, done: true }) };
  },
};

const raw = plain[Symbol.iterator]();
console.log(typeof raw.map);

const wrapped = Iterator.from(plain);
console.log(typeof wrapped.map);
console.log(wrapped.map((sku) => sku.toLowerCase()).toArray());
```

Output of `node iterator-from.js` and of the browser terminal

```ts
undefined
function
[ 'rice-5', 'oil-1', 'salt' ]
```

### When to use which

- Data already in a small array that you need several times: array methods. They are familiar, and the result is a reusable array.
- Large, expensive, streaming or infinite sources, or when you will stop early: iterator helpers. They do only the work that is needed and hold one item at a time.
- Remember that a helper chain is an *iterator*: one-shot. Call `toArray()` at the end if you need to keep the results.

> NOTE
>
> A newer proposal adds `Iterator.concat` (join several iterables). At the time of writing, Chrome has it but Node.js 24 does not, so this course does not rely on it. Check an API in every runtime you deploy to before you depend on it.

## When iteration goes wrong

Most iteration bugs come from forgetting that an iterator is live: it reads the collection as it goes, rather than taking a snapshot at the start.

### Changing an array while you walk it

An array iterator checks the array's current length on every `next()`. Adding items inside the loop means the loop will also visit them. A "buy one, get one free" rule that pushes the free item into the same cart would never end; here a guard stops it after a few turns:

mutate-array.js

```ts
const cart = ["shirt", "shoes"];
let turns = 0;

for (const item of cart) {
  turns += 1;
  if (turns > 5) {
    console.log("stopped: the loop kept finding new items");
    break;
  }
  cart.push(`free ${item}`);
}
console.log(cart.length, cart.slice(0, 4));

const safeCart = ["shirt", "shoes"];
for (const item of [...safeCart]) safeCart.push(`free ${item}`);
console.log(safeCart);
```

Output of `node mutate-array.js` and of the browser terminal

```ts
stopped: the loop kept finding new items
7 [ 'shirt', 'shoes', 'free shirt', 'free shoes' ]
[ 'shirt', 'shoes', 'free shirt', 'free shoes' ]
```

Walking a copy (`[...safeCart]`) freezes the list of items to visit, so changes to the original do not affect the loop. Even better, do not change a collection while walking it: build a new array of results instead.

### Deleting from a Map or Set while walking it

`Map` and `Set` define this case precisely: deleting an entry that has not been visited yet means it is skipped; entries added during the walk are visited. Deleting the *current* entry is safe, which makes "remove expired items" loops simple:

map-delete.js

```ts
const sessions = new Map([
  ["s1", { user: "ada", expiresAt: 100 }],
  ["s2", { user: "chidi", expiresAt: 900 }],
  ["s3", { user: "tunde", expiresAt: 50 }],
]);

const now = 500;
for (const [id, session] of sessions) {
  if (session.expiresAt < now) sessions.delete(id);
}
console.log([...sessions.keys()]);
```

Output of `node map-delete.js` and of the browser terminal

```json
[ 's2' ]
```

### A summary of the traps

| Symptom | Cause | Fix |
| --- | --- | --- |
| Second loop over a value does nothing, or `Math.max` gives `-Infinity` | It was an iterator, already used up | Ask the iterable again, or copy to an array once |
| Your iterable works once, then yields nothing | `[Symbol.iterator]()` returns the same iterator every time | Create the position inside `[Symbol.iterator]()` |
| Loop never ends | Infinite iterable spread or looped without a stop; items added during the loop; step of 0 | `take`/`break`; iterate a copy; validate arguments |
| `x is not iterable` | A plain object, `undefined` or `null` given to `for...of` or spread | Use `Object.entries`; default missing lists to `[]` |
| Resources left open after `break` | No `return()`, or `next()` called by hand | Implement `return()`; consume with `for...of` |

## Before you build: the orders paginator

REASON IT OUT

### Design a lazy paginator

You will now turn the paging loop from the first section into an iterable, so that any code can write `for (const order of orders)`. Before reading the code, think through:

- When should the first request happen: when the paginator is created, or when someone starts iterating?
- A caller finds what it needs on page 1 and `break`s. How many pages should have been fetched?
- What if the API returns an empty page with a cursor? What if the very first page is empty with no cursor?
- Two parts of the program iterate the same `orders` object. Should they share one position, or each start from the first page?
- What should happen if the API returns the *same* cursor it was given?

**Show the reasoning**

- **When to fetch**: only inside `next()`, and only when the current page's items are used up. Creating the paginator costs nothing; a paginator that nobody reads never makes a request.
- **Early stop**: exactly one page. `next()` fetches a page only when the buffer is empty *and* there is a cursor to follow, so a `break` after an item from page 1 never triggers page 2.
- **Empty pages**: an empty page with a cursor is legal for some APIs (for example, when every item on it was filtered out on the server). The paginator must keep fetching, in a loop, until it has an item or the cursor is `null`. An empty first page with no cursor means "no orders", and the loop must simply end.
- **Several walks**: each `for...of` should start again from page 1, like an array. So the cursor and the buffer live inside `[Symbol.iterator]()`, not on the paginator object.
- **Repeated cursor**: that is a server bug that would make the loop spin forever, fetching the same page. The paginator should refuse to follow a cursor it has already seen, and throw a clear error.

## Build: a lazy paginator

The paginator takes the function that fetches one page, so it works for any API with the `{ items, nextCursor }` shape. That also makes it easy to test, because a test can pass a fake.

paginate.js

```ts
export function paginate(fetchPage, { firstCursor = null } = {}) {
  return {
    [Symbol.iterator]() {
      let buffer = [];
      let cursor = firstCursor;
      let started = false;
      let finished = false;
      const seen = new Set();

      function loadNextPage() {
        if (started && cursor === null) {
          finished = true;
          return;
        }
        if (cursor !== null && seen.has(cursor)) throw new Error(`cursor repeated: ${cursor}`);
        if (cursor !== null) seen.add(cursor);
        started = true;
        const page = fetchPage(cursor);
        buffer = [...page.items];
        cursor = page.nextCursor ?? null;
      }

      return {
        next() {
          while (buffer.length === 0 && !finished) loadNextPage();
          if (buffer.length === 0) return { value: undefined, done: true };
          return { value: buffer.shift(), done: false };
        },
        return() {
          buffer = [];
          finished = true;
          return { value: undefined, done: true };
        },
      };
    },
  };
}
```

How it works:

- `buffer` holds the unread items of the current page. `next()` hands them out one by one with `shift()` (a page is small, so removing from the front is cheap here).
- When the buffer is empty, `next()` loads pages in a `while` loop until it has an item or there are no more pages. That loop is what handles empty pages in the middle.
- `started` separates "the first request, with no cursor yet" from "the server said there is no next page". Both have `cursor === null`.
- `return()` marks the walk finished, so an early stop never triggers another request.

Now the fake API from the start, with a counter, and the loop you wanted to write:

orders-api.js

```ts
export const ORDERS = [
  { id: "ORD-1", totalKobo: 450000 },
  { id: "ORD-2", totalKobo: 120000 },
  { id: "ORD-3", totalKobo: 980000 },
  { id: "ORD-4", totalKobo: 30000 },
  { id: "ORD-5", totalKobo: 2500000 },
  { id: "ORD-6", totalKobo: 75000 },
  { id: "ORD-7", totalKobo: 610000 },
];

export function createFakeApi(orders, pageSize = 3) {
  const api = {
    requests: 0,
    fetchOrdersPage(cursor) {
      api.requests += 1;
      const start = cursor === null ? 0 : Number(cursor);
      const next = start + pageSize < orders.length ? String(start + pageSize) : null;
      return { items: orders.slice(start, start + pageSize), nextCursor: next };
    },
  };
  return api;
}
```

main.js

```ts
import { paginate } from "./paginate.js";
import { ORDERS, createFakeApi } from "./orders-api.js";

const api = createFakeApi(ORDERS);
const orders = paginate(api.fetchOrdersPage);
console.log("requests after creating:", api.requests);

let firstBig = null;
for (const order of orders) {
  if (order.totalKobo > 500000) {
    firstBig = order;
    break;
  }
}
console.log(firstBig.id, "after", api.requests, "request");

const [first, second] = orders;
console.log(first.id, second.id, "after", api.requests, "requests");

const allIds = Iterator.from(orders).map((order) => order.id).toArray();
console.log(allIds.join(" "), "after", api.requests, "requests");
```

Output of `node main.js` and of the browser terminal

```ts
requests after creating: 0
ORD-3 after 1 request
ORD-1 ORD-2 after 2 requests
ORD-1 ORD-2 ORD-3 ORD-4 ORD-5 ORD-6 ORD-7 after 5 requests
```

Creating the paginator made no request. Finding the first big order cost one request instead of three. Destructuring two orders started a new walk from page 1 and fetched one more page. Reading everything took three pages. And `orders` works with `for...of`, destructuring and iterator helpers, because it follows the protocol.

### Testing the paginator

The edge cases from the reasoning step each deserve a test. A fake `fetchPage` built from a list of pages lets each test describe exactly what the server returns:

paginate.test.js

```ts
import { paginate } from "./paginate.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

function fakePages(pages) {
  const calls = [];
  const fetchPage = (cursor) => {
    calls.push(cursor);
    return pages[cursor ?? "start"];
  };
  return { calls, fetchPage };
}

{
  const { calls, fetchPage } = fakePages({ start: { items: [], nextCursor: null } });
  check("no orders at all", [...paginate(fetchPage)], []);
  check("one request for an empty result", calls.length, 1);
}
{
  const { fetchPage } = fakePages({
    start: { items: ["A"], nextCursor: "p2" },
    p2: { items: [], nextCursor: "p3" },
    p3: { items: ["B"], nextCursor: null },
  });
  check("skips an empty page in the middle", [...paginate(fetchPage)], ["A", "B"]);
}
{
  const { calls, fetchPage } = fakePages({
    start: { items: ["A", "B"], nextCursor: "p2" },
    p2: { items: ["C"], nextCursor: null },
  });
  const [first] = paginate(fetchPage);
  check("destructuring one item fetches one page", [first, calls], ["A", [null]]);
}
{
  const { calls, fetchPage } = fakePages({
    start: { items: ["A"], nextCursor: "p2" },
    p2: { items: ["B"], nextCursor: null },
  });
  const orders = paginate(fetchPage);
  check("walk 1", [...orders], ["A", "B"]);
  check("walk 2 starts again", [...orders], ["A", "B"]);
  check("requests for two walks", calls.length, 4);
}
{
  const { fetchPage } = fakePages({
    start: { items: ["A"], nextCursor: "p2" },
    p2: { items: ["B"], nextCursor: "p2" },
  });
  let message = null;
  try {
    [...paginate(fetchPage)];
  } catch (error) {
    message = error.message;
  }
  check("refuses a repeated cursor", message, "cursor repeated: p2");
}
```

Output of `node paginate.test.js` and of the browser terminal

```ts
PASS no orders at all -> []
PASS one request for an empty result -> 1
PASS skips an empty page in the middle -> ["A","B"]
PASS destructuring one item fetches one page -> ["A",[null]]
PASS walk 1 -> ["A","B"]
PASS walk 2 starts again -> ["A","B"]
PASS requests for two walks -> 4
PASS refuses a repeated cursor -> "cursor repeated: p2"
```

Checking `calls`, not just the items, is what tests the laziness. A paginator that fetched every page up front would still return the right items, and only the request count would catch it.

### Real APIs are asynchronous: Symbol.asyncIterator

A real `fetch` returns a promise ([Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#promises)), and a synchronous `next()` cannot wait for it. For that case there is a twin protocol: an **async iterable** has a `[Symbol.asyncIterator]()` method, its iterator's `next()` returns a *promise* of `{ value, done }`, and you consume it with `for await...of` inside an `async` function or a module. The design stays the same:

paginate-async.js

```ts
export function paginateAsync(fetchPage) {
  return {
    [Symbol.asyncIterator]() {
      let buffer = [];
      let cursor = null;
      let started = false;
      return {
        async next() {
          while (buffer.length === 0 && !(started && cursor === null)) {
            const page = await fetchPage(cursor);
            started = true;
            buffer = [...page.items];
            cursor = page.nextCursor ?? null;
          }
          if (buffer.length === 0) return { value: undefined, done: true };
          return { value: buffer.shift(), done: false };
        },
      };
    },
  };
}
```

main-async.js

```ts
import { paginateAsync } from "./paginate-async.js";
import { ORDERS, createFakeApi } from "./orders-api.js";

const api = createFakeApi(ORDERS);
const slowFetch = async (cursor) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return api.fetchOrdersPage(cursor);
};

let totalKobo = 0;
for await (const order of paginateAsync(slowFetch)) {
  totalKobo += order.totalKobo;
}
console.log(`₦${totalKobo / 100} from ${api.requests} requests`);
```

Output of `node main-async.js` and of the browser terminal

```ts
₦47650 from 3 requests
```

Writing `next()` by hand, with its buffer and flags, is a lot of bookkeeping for "loop over pages and hand out items". [Generators](https://zudojs.oyinlola.site/learn/js-generators), the next lesson, let you write the same paginator as an ordinary loop with `yield`, and JavaScript builds the iterator for you. Understanding the protocol first is what makes generators easy to reason about.

### In production

- **Cursor paging, not offset paging.** Paging with `?offset=20&limit=10` skips or repeats items when orders are inserted or deleted between requests. An opaque cursor from the server, as used here, does not.
- **Cap the walk.** A paginator that follows cursors forever can run up a large bill or hit rate limits. Accept a `maxPages` option, or let callers use `take`.
- **Retries belong to one page.** Wrap `fetchPage` in a retry for temporary network errors, so a failure on page 40 does not restart the walk from page 1.
- **Memory stays flat.** Only one page is held at a time, which is the whole reason to iterate instead of loading everything. Code that spreads the paginator into an array (`[...orders]`) throws that benefit away; do that only when the result is known to be small.

## Practice

TRY IT YOURSELF

### Round-robin ticket assignment

Support tickets are assigned to agents in turn: Ada, Chidi, Tunde, Ada, Chidi, and so on, forever. Write `cycle(items)`, an infinite iterable that repeats the items of an array in order. Use it to assign five tickets, and use `take` to list the first four turns. What should happen with an empty array?

**Show a solution**

cycle.js

```ts
function cycle(items) {
  const list = [...items];
  if (list.length === 0) throw new RangeError("cycle needs at least one item");
  return {
    [Symbol.iterator]() {
      let i = 0;
      return Iterator.from({
        next: () => ({ value: list[i++ % list.length], done: false }),
      });
    },
  };
}

const agents = cycle(["Ada", "Chidi", "Tunde"]);
const tickets = ["T-101", "T-102", "T-103", "T-104", "T-105"];

const who = agents[Symbol.iterator]();
for (const ticket of tickets) console.log(ticket, "->", who.next().value);

console.log(Iterator.from(agents).take(4).toArray());

try {
  cycle([]);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node cycle.js` and of the browser terminal

```ts
T-101 -> Ada
T-102 -> Chidi
T-103 -> Tunde
T-104 -> Ada
T-105 -> Chidi
[ 'Ada', 'Chidi', 'Tunde', 'Ada' ]
RangeError: cycle needs at least one item
```

An empty array would make `list[i % 0]` read `list[NaN]`, which is `undefined`, forever: an infinite stream of "nobody". Refusing it at creation is the same choice as refusing a step of 0 in `range`. Copying with `[...items]` makes the cycle independent of later changes to the caller's array.

TRY IT YOURSELF

### Make a cart iterable

Write a `Cart` class that stores quantities in a `Map` from SKU to quantity, with `add(sku, qty)`. Make it iterable so that `for (const line of cart)` gives objects `{ sku, qty }`, and `[...cart]` works. Walking it twice must work.

**Show a solution**

cart-iterable.js

```ts
class Cart {
  #lines = new Map();

  add(sku, qty = 1) {
    this.#lines.set(sku, (this.#lines.get(sku) ?? 0) + qty);
    return this;
  }

  [Symbol.iterator]() {
    return this.#lines
      .entries()
      .map(([sku, qty]) => ({ sku, qty }));
  }
}

const cart = new Cart().add("RICE-5", 2).add("OIL-1").add("RICE-5");

for (const line of cart) console.log(line);
console.log([...cart].length, [...cart][0].qty);
```

Output of `node cart-iterable.js` and of the browser terminal

```json
{ sku: 'RICE-5', qty: 3 }
{ sku: 'OIL-1', qty: 1 }
2 3
```

A class can define `[Symbol.iterator]()` as a method with a computed name. Here it borrows the `Map`'s own iterator and reshapes each entry with the `map` helper. Because it calls `entries()` every time, every walk is a fresh one. The private `#lines` field keeps callers from changing quantities except through `add`.

TRY IT YOURSELF

### Batch inserts with chunk

Saving 10,000 orders one row at a time is slow; databases prefer batches. Write `chunk(iterable, size)`, a lazy iterable that yields arrays of up to `size` items from any iterable, including a paginator or an infinite sequence. The last batch may be shorter.

**Show a solution**

chunk.js

```ts
function chunk(iterable, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive whole number");
  return {
    [Symbol.iterator]() {
      const source = iterable[Symbol.iterator]();
      let finished = false;
      return {
        next() {
          if (finished) return { value: undefined, done: true };
          const batch = [];
          while (batch.length < size) {
            const result = source.next();
            if (result.done) {
              finished = true;
              break;
            }
            batch.push(result.value);
          }
          return batch.length ? { value: batch, done: false } : { value: undefined, done: true };
        },
        return() {
          finished = true;
          source.return?.();
          return { value: undefined, done: true };
        },
      };
    },
  };
}

const orderIds = ["ORD-1", "ORD-2", "ORD-3", "ORD-4", "ORD-5", "ORD-6", "ORD-7"];
for (const batch of chunk(orderIds, 3)) console.log("INSERT", batch);

let n = 0;
const endless = { [Symbol.iterator]: () => ({ next: () => ({ value: ++n, done: false }) }) };
const [firstBatch, secondBatch] = chunk(endless, 2);
console.log(firstBatch, secondBatch);
```

Output of `node chunk.js` and of the browser terminal

```ts
INSERT [ 'ORD-1', 'ORD-2', 'ORD-3' ]
INSERT [ 'ORD-4', 'ORD-5', 'ORD-6' ]
INSERT [ 'ORD-7' ]
[ 1, 2 ] [ 3, 4 ]
```

`chunk` pulls from the source only when a batch is asked for, so it works on the endless sequence. Its `return()` passes the early stop on to the source with `source.return?.()` (optional chaining, because `return` is optional), so a paginator or cursor underneath is closed too. Forwarding `return()` is the detail most hand-written wrappers forget.

## Recap

- An **iterator** has `next()`, which returns `{ value, done }`. An **iterable** has `[Symbol.iterator]()`, which returns a new iterator.
- `for...of`, spread, array destructuring, `Array.from`, `new Map/Set`, `Promise.all` and `Object.fromEntries` all consume iterables through that protocol. Destructuring reads only what it needs.
- Iterables can be walked many times; iterators are one-shot. Create the position inside `[Symbol.iterator]()` so your own iterables are reusable.
- When a consumer stops early (`break`, `throw`, `return`, destructuring), it calls the iterator's optional `return()`. Put cleanup there.
- Iterators are lazy, so they can be infinite. Iterator helpers (`map`, `filter`, `take`, `drop`, `toArray`, …) build lazy pipelines; `Iterator.from` gives them to your own iterators.
- A paginator is an iterable that fetches a page only when its buffer is empty. Test the number of requests, not just the items. For promises, use `Symbol.asyncIterator` and `for await...of`.

Next: [Generators](https://zudojs.oyinlola.site/learn/js-generators), which write iterators like these as ordinary loops with `yield`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
