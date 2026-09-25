---
title: "Generators — ZudoJS Academy"
description: "Write iterators as ordinary loops with function* and yield, then stream order lines lazily from a paged API into a CSV export, with cleanup that always runs."
source: https://zudojs.oyinlola.site/learn/js-generators
---

LEVEL 4 · LESSON 10 OF 20

Iteration and symbols Core

# Generators

Write iterators as ordinary loops with function* and yield, then stream order lines lazily from a paged API into a CSV export, with cleanup that always runs.

- **50 min** to read and try
- **You need:** Iterables and iterators, Closures in depth and Recursion
- **You build:** A streaming CSV export of order lines that reads a paged API lazily, stops early without leaking, and is tested with a fake API

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a generator pauses at yield and resumes on next(), and predict the order of its output
- Rewrite a hand-written iterator as a generator, including reusable iterables and class iterators
- Build lazy, infinite and composed sequences with generators and yield*
- Clean up with try/finally, and explain what return() and throw() do to a paused generator
- Use async generators and for await...of to stream a paged API
- Build and test a streaming export pipeline

## Thirty lines of bookkeeping

In [Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators#build) you built a paginator that fetches pages only when they are needed. It works, but look at how much of it is bookkeeping rather than logic: a buffer, a `started` flag, a `finished` flag, a `while` loop inside `next()`, a separate `return()`. Now the reporting team wants more: an export that walks every order, then every **line** of every order (one product, a quantity, a price), and writes one CSV row per line. Doing that by hand means an iterator over pages, holding an iterator over orders, holding an iterator over lines, each with its own position variables.

Here is a small taste of that style: just the "lines of all orders" part, written as a hand-made iterator.

by-hand.js

```ts
const orders = [
  { id: "ORD-1", lines: [{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }] },
  { id: "ORD-2", lines: [] },
  { id: "ORD-3", lines: [{ sku: "SALT", qty: 4 }] },
];

function allLines(orders) {
  return {
    [Symbol.iterator]() {
      let orderIndex = 0;
      let lineIndex = 0;
      return {
        next() {
          while (orderIndex < orders.length) {
            const order = orders[orderIndex];
            if (lineIndex < order.lines.length) {
              const line = order.lines[lineIndex++];
              return { value: { orderId: order.id, ...line }, done: false };
            }
            orderIndex++;
            lineIndex = 0;
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

for (const line of allLines(orders)) console.log(line);
```

Output of `node by-hand.js` and of the browser terminal

```json
{ orderId: 'ORD-1', sku: 'RICE-5', qty: 2 }
{ orderId: 'ORD-1', sku: 'OIL-1', qty: 1 }
{ orderId: 'ORD-3', sku: 'SALT', qty: 4 }
```

It works, but the logic you actually have in your head, "for each order, for each line, hand out the line", is buried. You had to turn two nested loops inside out into two index variables, because `next()` must *return* after every item and remember where it was. Every early return is a chance for an off-by-one bug.

The same iterator as a **generator**:

as-generator.js

```ts
const orders = [
  { id: "ORD-1", lines: [{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }] },
  { id: "ORD-2", lines: [] },
  { id: "ORD-3", lines: [{ sku: "SALT", qty: 4 }] },
];

function* allLines(orders) {
  for (const order of orders) {
    for (const line of order.lines) {
      yield { orderId: order.id, ...line };
    }
  }
}

for (const line of allLines(orders)) console.log(line);
```

Output of `node as-generator.js` and of the browser terminal

```json
{ orderId: 'ORD-1', sku: 'RICE-5', qty: 2 }
{ orderId: 'ORD-1', sku: 'OIL-1', qty: 1 }
{ orderId: 'ORD-3', sku: 'SALT', qty: 4 }
```

Same output, and the code reads exactly like the idea: two ordinary nested loops. The function can *pause* in the middle of both loops, hand out a line, and later carry on from exactly that spot. This lesson explains how that pausing works, what it costs, and how to use it: lazy and infinite sequences, delegation, cleanup, and, at the end, a streaming CSV export built from small generators.

## function*, yield and the generator object

A **generator function** is declared with an asterisk: `function*`. Inside it, the keyword `yield` hands out a value and pauses. Calling a generator function is different from calling a normal function in one important way: **the body does not run**. Instead you get back a **generator object**, which is an iterator. The body only runs when you call `next()`, and only until the next `yield`:

pause.js

```ts
function* checkoutSteps() {
  console.log("  [start: validate cart]");
  yield "cart ok";
  console.log("  [charge card]");
  yield "paid";
  console.log("  [send receipt]");
  return "done";
}

const steps = checkoutSteps();
console.log("created, nothing ran yet");
console.log(steps.next());
console.log(steps.next());
console.log(steps.next());
console.log(steps.next());
```

Output of `node pause.js` and of the browser terminal

```ts
created, nothing ran yet
  [start: validate cart]
{ value: 'cart ok', done: false }
  [charge card]
{ value: 'paid', done: false }
  [send receipt]
{ value: 'done', done: true }
{ value: undefined, done: true }
```

Follow the output line by line:

1. Calling `checkoutSteps()` printed nothing. It only created the generator object, paused before the first line of the body.
2. The first `next()` ran the body up to the first `yield`, which became `{ value: "cart ok", done: false }`.
3. Each later `next()` resumed right after the `yield` where it stopped, with all local variables intact, and ran to the next `yield`.
4. The `return` statement finished the generator: its value arrived with `done: true`. After that, the generator is finished for good.

```ts
  gen = fn()          next()             next()              next() → return
 ┌───────────┐  ┌──────────────┐  ┌──────────────┐     ┌───────────────┐
 │ suspended │─►│   running    │─►│  suspended   │ ─► …│   completed   │
 │ at start  │  │ until yield  │  │ at a yield   │     │ done: true    │
 └───────────┘  └──────────────┘  └──────────────┘     └───────────────┘
   body not run   locals live on     resumes here on      every next() now
                  between calls      the next next()      returns done: true
```

A generator moves between these states. Only next(), return() and throw() move it.

A generator's local variables live on between calls, the way a closure's variables do ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#environments)): the paused call's environment is kept alive inside the generator object. That is what replaces the index variables you had to manage by hand.

### A generator object is an iterator, and iterable

Because the generator object has `next()` and a `[Symbol.iterator]()` that returns itself, every consumer from the last lesson accepts it: `for...of`, spread, destructuring, `Array.from`. It also inherits from `Iterator.prototype`, so the iterator helpers work on it directly:

consumers.js

```ts
function* vatRates() {
  yield 0.075;
  yield 0.05;
  yield 0;
}

console.log([...vatRates()]);
const [standard] = vatRates();
console.log(standard);
console.log(vatRates().map((rate) => `${rate * 100}%`).toArray());

const gen = vatRates();
console.log(gen[Symbol.iterator]() === gen);
console.log([...gen], [...gen]);
```

Output of `node consumers.js` and of the browser terminal

```json
[ 0.075, 0.05, 0 ]
0.075
[ '7.5%', '5%', '0%' ]
true
[ 0.075, 0.05, 0 ] []
```

The last line is the one-shot rule from [the previous lesson](https://zudojs.oyinlola.site/learn/js-iterators#one-shot). A generator *object* is one walk. To walk again, call the generator *function* again, which creates a new object.

## Rewriting iterators as generators

### A range

The `range` from the previous lesson needed an object, a `[Symbol.iterator]` method, a `next` method and result objects. As a generator, the loop you would naturally write *is* the iterator:

range.js

```ts
function* range(start, end, step = 1) {
  if (step === 0) throw new RangeError("step must not be 0");
  for (let n = start; step > 0 ? n < end : n > end; n += step) {
    yield n;
  }
}

console.log([...range(1, 6)]);
console.log([...range(10, 0, -3)]);

const nights = range(12, 15);
console.log([...nights], [...nights]);

try {
  range(1, 5, 0);
  console.log("no error yet");
  [...range(1, 5, 0)];
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node range.js` and of the browser terminal

```json
[ 1, 2, 3, 4, 5 ]
[ 10, 7, 4, 1 ]
[ 12, 13, 14 ] []
no error yet
RangeError: step must not be 0
```

Two differences from the hand-written version, both caused by "the body does not run until `next()`":

- `range(12, 15)` is now a one-shot generator object, not a reusable iterable. The second spread got nothing.
- The validation moved: `range(1, 5, 0)` did not throw. The `throw` is part of the body, so it only runs on the first `next()`. A bug can now surface far from the line that caused it.

### Reusable iterables with a generator method

Both problems have the same fix: validate in a normal function, and put the generator in the `[Symbol.iterator]` method, written `*[Symbol.iterator]()`. Every walk calls that method, so every walk gets a new generator:

range-reusable.js

```ts
export function range(start, end, step = 1) {
  if (step === 0 || !Number.isFinite(step)) throw new RangeError("step must be a non-zero number");
  return {
    *[Symbol.iterator]() {
      for (let n = start; step > 0 ? n < end : n > end; n += step) yield n;
    },
  };
}
```

use-range.js

```ts
import { range } from "./range-reusable.js";

const nights = range(12, 15);
console.log([...nights], [...nights]);

try {
  range(1, 5, 0);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node use-range.js` and of the browser terminal

```json
[ 12, 13, 14 ] [ 12, 13, 14 ]
RangeError: step must be a non-zero number
```

This is the pattern to use for anything that should behave like a collection. It also works in classes: a `Cart` can define `*[Symbol.iterator]() { yield* this.#lines.values(); }`, and `yield*` is explained [below](#delegation).

### The paginator in eight lines

Here is the paginator from the previous lesson as a generator. Compare it with the version that needed a buffer and three flags:

paginate.js

```ts
export function* paginate(fetchPage) {
  let cursor = null;
  do {
    const page = fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
}
```

The "buffer" is gone: the generator simply pauses inside `yield* page.items` (which hands out each item of the page in turn) until the caller asks for more. When the caller stops early, the generator stays paused and no further page is ever fetched. The `do...while` expresses "always fetch the first page, then follow cursors until there are none", which the hand-written version needed a `started` flag for. You will test this paginator in the [build](#build).

## Lazy and infinite sequences

Because a generator only runs when asked, an infinite loop inside one is fine, as long as the consumer stops. That makes generators the natural way to describe sequences that have no natural end.

### Retry delays with exponential backoff

When a payment provider times out, you retry, but not immediately and not forever. A common rule is **exponential backoff**: wait 200 ms, then 400, 800, 1,600, doubling each time, never more than a cap. The rule is an infinite sequence; how many attempts to make is a separate decision:

backoff.js

```ts
function* backoff({ firstMs = 200, factor = 2, maxMs = 5000 } = {}) {
  let delay = firstMs;
  while (true) {
    yield delay;
    delay = Math.min(delay * factor, maxMs);
  }
}

console.log(backoff().take(8).toArray());

for (const [attempt, waitMs] of backoff({ firstMs: 100, maxMs: 1000 }).take(3).map((ms, i) => [i + 1, ms])) {
  console.log(`attempt ${attempt} failed, retrying in ${waitMs} ms`);
}
```

Output of `node backoff.js` and of the browser terminal

```json
[
   200,  400,  800,
  1600, 3200, 5000,
  5000, 5000
]
attempt 1 failed, retrying in 100 ms
attempt 2 failed, retrying in 200 ms
attempt 3 failed, retrying in 400 ms
```

The generator describes the delays and nothing else; `take(3)` decides how many attempts. Separating "what the sequence is" from "how much of it you use" is the main design benefit of lazy sequences. (The helpers' `map` passes a counter as the second argument, like the array version, which gives the attempt number.)

### Composing generators

Small generators that take an iterable and yield a transformed one can be chained like pipes. This is how the iterator helpers work inside, and writing a few yourself shows why nothing runs until the end of the chain pulls:

compose.js

```ts
function* withVat(lines, rate) {
  for (const line of lines) {
    console.log(`  vat on ${line.sku}`);
    yield { ...line, vatKobo: Math.round(line.priceKobo * line.qty * rate) };
  }
}

function* over(lines, minKobo) {
  for (const line of lines) {
    if (line.priceKobo * line.qty >= minKobo) yield line;
  }
}

function* first(items, count) {
  if (count <= 0) return;
  for (const item of items) {
    yield item;
    if (--count === 0) return;
  }
}

const lines = [
  { sku: "RICE-5", qty: 2, priceKobo: 850000 },
  { sku: "SALT", qty: 1, priceKobo: 20000 },
  { sku: "OIL-1", qty: 3, priceKobo: 320000 },
  { sku: "TV-55", qty: 1, priceKobo: 45000000 },
];

const pipeline = first(over(withVat(lines, 0.075), 500000), 2);
console.log("pipeline built");
for (const line of pipeline) console.log(line.sku, line.vatKobo);
```

Output of `node compose.js` and of the browser terminal

```ts
pipeline built
  vat on RICE-5
RICE-5 127500
  vat on SALT
  vat on OIL-1
OIL-1 72000
```

Building the pipeline printed nothing. Each line then flowed through all three stages before the next one started, and the TV was never processed because `first` returned after two items. Note the `return` right after the second `yield` in `first`: checking *after* yielding means it stops without pulling one extra item from upstream. Checking before would have run `withVat` on the TV for nothing.

## Delegation with yield*

`yield* iterable` hands out every value of another iterable, one by one, as if the generator had yielded them itself. It works with any iterable: arrays, strings, sets, other generators. You used it on `page.items` in the paginator.

Its real power shows on recursive data. A shop's product categories form a tree, and listing every category with its full path is a recursive walk ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion#nested-data)). With a generator, the recursive call is delegated with `yield*`, and the caller gets a flat, lazy stream:

categories.js

```ts
const catalog = {
  name: "Shop",
  children: [
    { name: "Food", children: [{ name: "Grains", children: [] }, { name: "Oils", children: [] }] },
    { name: "Electronics", children: [{ name: "TVs", children: [{ name: "OLED", children: [] }] }] },
  ],
};

function* categoryPaths(node, prefix = "") {
  const path = prefix ? `${prefix} > ${node.name}` : node.name;
  yield path;
  for (const child of node.children) {
    yield* categoryPaths(child, path);
  }
}

for (const path of categoryPaths(catalog)) console.log(path);

const firstElectronics = categoryPaths(catalog).find((p) => p.includes("Electronics"));
console.log("found:", firstElectronics);
```

Output of `node categories.js` and of the browser terminal

```ts
Shop
Shop > Food
Shop > Food > Grains
Shop > Food > Oils
Shop > Electronics
Shop > Electronics > TVs
Shop > Electronics > TVs > OLED
found: Shop > Electronics
```

Without `yield*` you would have to collect every child's paths into an array and return it, building the whole list before the caller sees the first path. With it, `find` stops the walk the moment it has a match, and the deeper categories are never visited.

### What yield* evaluates to

A generator's `return` value is not handed out by `for...of` (the loop stops at `done: true` and ignores its value). But `yield*` gives that value back as the result of the `yield*` expression. That lets a delegated generator report something to its parent, such as a count:

yield-star-value.js

```ts
function* orderLines(order) {
  for (const line of order.lines) yield `${order.id},${line.sku},${line.qty}`;
  return order.lines.length;
}

function* allRows(orders) {
  let total = 0;
  for (const order of orders) {
    const count = yield* orderLines(order);
    total += count;
  }
  return total;
}

const orders = [
  { id: "ORD-1", lines: [{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }] },
  { id: "ORD-2", lines: [{ sku: "SALT", qty: 4 }] },
];

const rows = allRows(orders);
console.log([...rows]);

const again = allRows(orders);
let result = again.next();
while (!result.done) result = again.next();
console.log("lines written:", result.value);
```

Output of `node yield-star-value.js` and of the browser terminal

```json
[ 'ORD-1,RICE-5,2', 'ORD-1,OIL-1,1', 'ORD-2,SALT,4' ]
lines written: 3
```

Spread dropped the return value, like `for...of`. The manual `next()` loop saw it on the final result. Keep this in mind: if a value matters to the caller, `yield` it; a `return` value is only visible to code that reads the final result itself, or to a parent using `yield*`.

## Sending values in: next(value)

`yield` is an expression, not just a statement. When the generator resumes, `yield` evaluates to the argument that was passed to that `next()` call. So a caller can send values *into* a paused generator. A till that keeps a running total shows the idea:

till.js

```ts
function* till() {
  let totalKobo = 0;
  while (true) {
    const scanned = yield totalKobo;
    if (scanned === undefined) continue;
    totalKobo += scanned;
  }
}

const lane = till();
console.log(lane.next(999).value);
console.log(lane.next(850000).value);
console.log(lane.next(20000).value);
console.log(lane.next().value);
```

Output of `node till.js` and of the browser terminal

```ts
0
850000
870000
870000
```

The first `next(999)` printed 0: the argument of the **first** `next()` is always thrown away, because at that moment the generator has not reached any `yield` that could receive it. It only starts the body and runs to the first `yield`. Each later argument becomes the value of the `yield` the generator was paused on.

This two-way style is how some libraries write state machines and how `async`/`await` was emulated before it existed: a runner calls `next(result)` with each resolved promise. In everyday code it is rare, and a small class or closure is usually clearer. Use it when you meet it; reach for it only when the pause-and-resume shape really fits.

## Cleanup: return(), throw() and finally

In the previous lesson, closing a cursor early needed a hand-written `return()` method. A generator gets `return()` for free, and uses the language's own cleanup tool: a `try`/`finally` around the `yield`s. When a consumer stops early, the generator is resumed as if a `return` statement stood at the paused `yield`, so its `finally` block runs:

finally.js

```ts
function* openCursor(rows) {
  console.log("  cursor opened");
  try {
    for (const row of rows) yield row;
  } finally {
    console.log("  cursor closed");
  }
}

const rows = ["ORD-1", "ORD-2", "ORD-3"];

console.log("break:");
for (const id of openCursor(rows)) {
  console.log(" ", id);
  if (id === "ORD-2") break;
}

console.log("find:");
console.log(" ", openCursor(rows).find((id) => id.endsWith("1")));

console.log("manual return():");
const cursor = openCursor(rows);
cursor.next();
console.log(" ", cursor.return("stopped"));
console.log(" ", cursor.next());
```

Output of `node finally.js` and of the browser terminal

```ts
break:
  cursor opened
  ORD-1
  ORD-2
  cursor closed
find:
  cursor opened
  cursor closed
  ORD-1
manual return():
  cursor opened
  cursor closed
  { value: 'stopped', done: true }
  { value: undefined, done: true }
```

Every early exit closed the cursor. `return(value)` finished the generator and reported `value` with `done: true`.

### throw(): an error at the pause point

`gen.throw(error)` resumes the generator by *throwing* the error at the paused `yield`. If the generator catches it, it can recover and keep yielding; if not, the error comes out of the `throw()` call, and the generator is finished. A price feed that must skip a corrupt price instead of dying is an example of the first case:

throw.js

```ts
function* priceFeed(prices) {
  for (const price of prices) {
    try {
      yield price;
    } catch (error) {
      console.log(`  feed: skipped ${price} (${error.message})`);
    }
  }
}

const feed = priceFeed([850000, -1, 320000]);
console.log(feed.next().value);
console.log(feed.next().value);
console.log(feed.throw(new Error("negative price")).value);
console.log(feed.next());
```

Output of `node throw.js` and of the browser terminal

```ts
850000
-1
  feed: skipped -1 (negative price)
320000
{ value: undefined, done: true }
```

The consumer rejected `-1` by throwing into the generator. The generator's `catch` logged it, the loop moved on, and the `throw()` call itself returned the next yielded value. You will rarely call `throw()` yourself, but async generators and some stream libraries use it to deliver errors, and knowing it exists explains why a `try` around `yield` can catch errors that come from outside.

### The generator that never finishes

There is one case where `finally` does not run: a paused generator that nobody finishes and nobody calls `return()` on. If you call `next()` by hand and then simply drop the generator, it stays paused until the garbage collector frees it, and the `finally` never runs:

abandoned.js

```ts
function* lockSeat(seat) {
  console.log(`  lock ${seat}`);
  try {
    yield seat;
  } finally {
    console.log(`  unlock ${seat}`);
  }
}

console.log("abandoned:");
const booking = lockSeat("12A");
booking.next();
console.log("  (dropped without return)");

console.log("with try/finally in the caller:");
const safe = lockSeat("12B");
try {
  safe.next();
} finally {
  safe.return();
}
```

Output of `node abandoned.js` and of the browser terminal

```ts
abandoned:
  lock 12A
  (dropped without return)
with try/finally in the caller:
  lock 12B
  unlock 12B
```

Seat 12A is locked forever. `for...of`, spread, destructuring and the iterator helpers always finish or `return()` the generator, so this only bites code that drives `next()` by hand. When you do, pair it with `try`/`finally` and `return()`, as with 12B.

## Common generator mistakes

### yield inside a callback

`yield` only works directly in the generator's own body. A callback such as the one passed to `forEach` is a separate function, so `yield` inside it is not allowed; the code does not even parse:

yield-callback.js

```ts
const source = `
  function* skus(lines) {
    lines.forEach((line) => {
      yield line.sku;
    });
  }
`;
try {
  new Function(source);
} catch (error) {
  console.log(error.name);
}

function* skus(lines) {
  for (const line of lines) yield line.sku;
}
console.log([...skus([{ sku: "RICE-5" }, { sku: "SALT" }])]);
```

Output of `node yield-callback.js` and of the browser terminal

```ts
SyntaxError
[ 'RICE-5', 'SALT' ]
```

Use `for...of` inside generators, or `yield*` over a mapped iterable (`yield* lines.values().map((l) => l.sku)`).

### A summary of the traps

| Symptom | Cause | Fix |
| --- | --- | --- |
| Second loop gets nothing | A generator object is one-shot | Call the generator function again, or use `*[Symbol.iterator]()` |
| Validation error appears later than expected, or never | The body, including checks at its top, runs on the first `next()` | Validate in a normal wrapper function that returns the generator |
| Calling the function "does nothing" | Generator bodies do not run until something iterates | Iterate it; a generator used only for side effects is a design smell |
| Return value missing | `for...of` and spread ignore the `done: true` value | `yield` it, or read it with `yield*` or a manual loop |
| Cleanup never runs | A hand-driven generator was dropped while paused | Call `return()` in a `finally`; prefer `for...of` |
| `SyntaxError` at `yield` | `yield` inside a callback or a normal function | Use a `for...of` loop in the generator body |

## Async generators

The previous lesson ended with an asynchronous paginator written by hand for `Symbol.asyncIterator`. An **async generator**, `async function*`, combines both features: you can `await` inside it, and each `yield` hands a value to a `for await...of` loop. Its `next()` returns a promise. Here is the real-world paginator, fetching over an asynchronous API:

async-paginate.js

```ts
const PAGES = {
  start: { items: ["ORD-1", "ORD-2"], nextCursor: "c2" },
  c2: { items: ["ORD-3"], nextCursor: "c3" },
  c3: { items: ["ORD-4", "ORD-5"], nextCursor: null },
};
let requests = 0;

async function fetchPage(cursor) {
  requests += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return PAGES[cursor ?? "start"];
}

async function* paginate(fetchPage) {
  let cursor = null;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

for await (const id of paginate(fetchPage)) {
  console.log(id);
  if (id === "ORD-3") break;
}
console.log("requests:", requests);
```

Output of `node async-paginate.js` and of the browser terminal

```ts
ORD-1
ORD-2
ORD-3
requests: 2
```

It is the synchronous paginator with two words added: `async` and `await`. Laziness still holds: `break` after ORD-3 meant the third page was never requested. The pieces fit together in a way worth remembering:

- `for await...of` waits for each item; the loop body runs one item at a time, so pages are fetched in sequence, never all at once.
- Node's readable streams, such as files read with `fs.createReadStream`, are async iterables too, so `for await (const chunk of stream)` works on them ([Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams#readable)).
- Fetching pages in parallel is a topic of [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators); cancelling a slow request and limiting how many run at once are topics of [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency).

## Before you build: the order lines export

REASON IT OUT

### Design a streaming CSV export

Finance wants a CSV file with one row per order line: `orderId,sku,qty,lineTotalKobo`, for every order in the orders API, which returns pages of orders. There could be millions of lines. Before reading the code, think through:

- Which parts of the job should be separate generators, so each can be tested on its own?
- What must the file contain when there are no orders at all?
- A SKU or order id could contain a comma or a double quote. What happens to the CSV if you write it as it is?
- An operator stops the export after the first 1,000 rows to check it. How many pages should have been fetched, and what must still be cleaned up?
- How can a test show that the export is streaming, and not building everything in memory first?

**Show the reasoning**

- **Stages**: `paginate` (pages to orders), `orderLines` (orders to lines, with `yield*`), `toCsv` (lines to text rows, header first). Each takes an iterable and yields, so each can be fed a plain array in a test.
- **No orders**: the header row, and nothing else. A file with a header tells the reader "the export ran and found nothing"; an empty file looks like a crash.
- **Commas and quotes**: an unquoted comma splits one field into two and shifts every column after it. Fields that contain a comma, a quote or a newline must be wrapped in quotes, with inner quotes doubled (`"` becomes `""`). That is the CSV rule (RFC 4180).
- **Early stop**: only as many pages as were needed for 1,000 rows. The writer (a file, here a fake) must be closed in a `finally`, so a stop or an error still closes it.
- **Proving it streams**: count the API requests when the consumer stops early. A version that loaded everything first would have made every request.

## Build: a streaming CSV export

The paginator you already wrote, in `paginate.js` above, is the first stage. The other stages each fit in a few lines:

export.js

```ts
import { paginate } from "./paginate.js";

export function* orderLines(orders) {
  for (const order of orders) {
    for (const line of order.lines) {
      yield {
        orderId: order.id,
        sku: line.sku,
        qty: line.qty,
        lineTotalKobo: line.qty * line.priceKobo,
      };
    }
  }
}

export function csvField(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const COLUMNS = ["orderId", "sku", "qty", "lineTotalKobo"];

export function* toCsv(rows) {
  yield COLUMNS.join(",");
  for (const row of rows) {
    yield COLUMNS.map((column) => csvField(row[column])).join(",");
  }
}

export function exportOrders(fetchPage, writer, { maxRows = Infinity } = {}) {
  let written = 0;
  try {
    for (const text of toCsv(orderLines(paginate(fetchPage)))) {
      writer.write(text + "\n");
      written += 1;
      if (written > maxRows) break;
    }
  } finally {
    writer.close();
  }
  return Math.max(written - 1, 0);
}
```

`exportOrders` is the only place with side effects: it pulls rows through the pipeline and writes them. The `finally` closes the writer however the loop ends. `maxRows` counts data rows; the header is row 0, hence `written > maxRows` and `written - 1`. The limit is checked right *after* writing a row, for the same reason `first` checked after yielding: checking at the top of the loop would only happen once the next row had already been pulled through the pipeline, and pulling it can fetch a page that nobody needs. Now a fake API and a fake writer, so everything runs in memory:

fakes.js

```ts
export function createFakeOrdersApi(orders, pageSize = 2) {
  const api = {
    requests: 0,
    fetchPage: (cursor) => {
      api.requests += 1;
      const start = cursor === null ? 0 : Number(cursor);
      const end = start + pageSize;
      return { items: orders.slice(start, end), nextCursor: end < orders.length ? String(end) : null };
    },
  };
  return api;
}

export function createMemoryWriter() {
  const writer = {
    text: "",
    closed: false,
    write(chunk) {
      if (writer.closed) throw new Error("write after close");
      writer.text += chunk;
    },
    close() {
      writer.closed = true;
    },
  };
  return writer;
}

export const ORDERS = [
  { id: "ORD-1", lines: [{ sku: "RICE-5", qty: 2, priceKobo: 850000 }, { sku: "OIL-1", qty: 1, priceKobo: 320000 }] },
  { id: "ORD-2", lines: [{ sku: 'TV "55', qty: 1, priceKobo: 45000000 }] },
  { id: "ORD-3", lines: [] },
  { id: "ORD-4", lines: [{ sku: "SALT,FINE", qty: 3, priceKobo: 20000 }] },
];
```

main.js

```ts
import { exportOrders } from "./export.js";
import { ORDERS, createFakeOrdersApi, createMemoryWriter } from "./fakes.js";

const api = createFakeOrdersApi(ORDERS);
const file = createMemoryWriter();
const rows = exportOrders(api.fetchPage, file);

console.log(file.text.trimEnd());
console.log(`${rows} rows, ${api.requests} requests, closed: ${file.closed}`);
```

Output of `node main.js` and of the browser terminal

```ts
orderId,sku,qty,lineTotalKobo
ORD-1,RICE-5,2,1700000
ORD-1,OIL-1,1,320000
ORD-2,"TV ""55",1,45000000
ORD-4,"SALT,FINE",3,60000
4 rows, 2 requests, closed: true
```

The quote in `TV "55` was doubled and the field wrapped; the comma in `SALT,FINE` was protected; ORD-3, with no lines, produced no rows. Four orders at two per page took two requests.

### Testing the export

export.test.js

```ts
import { csvField, exportOrders, orderLines, toCsv } from "./export.js";
import { ORDERS, createFakeOrdersApi, createMemoryWriter } from "./fakes.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

check("plain field", csvField("RICE-5"), "RICE-5");
check("comma is quoted", csvField("a,b"), '"a,b"');
check("quotes are doubled", csvField('say "hi"'), '"say ""hi"""');
check("newline is quoted", csvField("line1\nline2"), '"line1\nline2"');

check("no orders: header only", [...toCsv(orderLines([]))], ["orderId,sku,qty,lineTotalKobo"]);

{
  const api = createFakeOrdersApi(ORDERS, 1);
  const file = createMemoryWriter();
  const rows = exportOrders(api.fetchPage, file, { maxRows: 2 });
  check("maxRows stops early", rows, 2);
  check("only the pages needed", api.requests, 1);
  check("closed after early stop", file.closed, true);
}
{
  const file = createMemoryWriter();
  const failingFetch = (cursor) => {
    if (cursor !== null) throw new Error("API down");
    return { items: ORDERS.slice(0, 1), nextCursor: "1" };
  };
  let message = null;
  try {
    exportOrders(failingFetch, file);
  } catch (error) {
    message = error.message;
  }
  check("error reaches the caller", message, "API down");
  check("closed after an error", file.closed, true);
  check("rows before the error were written", file.text.split("\n").length - 1, 3);
}
```

Output of `node export.test.js` and of the browser terminal

```ts
PASS plain field -> "RICE-5"
PASS comma is quoted -> "\"a,b\""
PASS quotes are doubled -> "\"say \"\"hi\"\"\""
PASS newline is quoted -> "\"line1\nline2\""
PASS no orders: header only -> ["orderId,sku,qty,lineTotalKobo"]
PASS maxRows stops early -> 2
PASS only the pages needed -> 1
PASS closed after early stop -> true
PASS error reaches the caller -> "API down"
PASS closed after an error -> true
PASS rows before the error were written -> 3
```

Three things these tests check that are easy to forget:

- **Each stage alone.** `csvField` and `toCsv` are tested with plain values and arrays, no API needed. Small generators are small units.
- **Laziness, by counting requests.** With one order per page and `maxRows: 2`, the first order's two lines are enough: one request. An export that loaded all pages first would fail this test.
- **Errors propagate through the pipeline.** The API error was thrown inside `paginate`, travelled through `orderLines` and `toCsv` untouched, and reached the caller of `exportOrders`, after the `finally` closed the file. Generators do not swallow errors; an error thrown inside one comes out of the `next()` call that ran it. [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design) discusses who should handle it.

### In production

- **Use async generators for real I/O.** A real API and a real file are asynchronous. The same stages become `async function*`, the loop becomes `for await`, and a Node writable stream replaces the fake writer. Respect the stream's backpressure ([Streams and buffers](https://zudojs.oyinlola.site/learn/node-streams#writable)) so a fast producer cannot fill memory.
- **Memory stays flat.** At any moment the pipeline holds one page of orders and one row of text. That is the reason to stream; a single `[...rows]` in the middle of the pipeline would silently undo it.
- **A generator is single-use state.** Never store one in a module-level variable to share between requests: the first request would use it up, and the second would get nothing.
- **Keep side effects at the edges.** The stages here are pure transformations; only `exportOrders` writes. That split is what made every stage testable with arrays.

## Practice

TRY IT YOURSELF

### Batches as a generator

The previous lesson's `chunk(iterable, size)` needed a hand-written `next()` and `return()`. Write `batches(iterable, size)` as a generator: it yields arrays of up to `size` items, the last one possibly shorter. Validate `size` before any iteration happens. Check that stopping early also stops the source.

**Show a solution**

batches.js

```ts
function batches(iterable, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive whole number");
  return (function* () {
    let batch = [];
    for (const item of iterable) {
      batch.push(item);
      if (batch.length === size) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) yield batch;
  })();
}

for (const batch of batches(["ORD-1", "ORD-2", "ORD-3", "ORD-4", "ORD-5"], 2)) console.log("INSERT", batch);

function* source() {
  try {
    for (let n = 1; ; n++) yield n;
  } finally {
    console.log("source closed");
  }
}
const [firstBatch] = batches(source(), 3);
console.log(firstBatch);

try {
  batches([], 0);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node batches.js` and of the browser terminal

```ts
INSERT [ 'ORD-1', 'ORD-2' ]
INSERT [ 'ORD-3', 'ORD-4' ]
INSERT [ 'ORD-5' ]
source closed
[ 1, 2, 3 ]
RangeError: size must be a positive whole number
```

The wrapper validates immediately and returns a generator made by an inner `function*` that is called on the spot. Early stop needs no extra code: when destructuring calls `return()` on the outer generator, it finishes at its paused `yield`, which exits the `for...of` inside it, which calls `return()` on the source, whose `finally` runs. Cleanup travels down the whole chain automatically.

TRY IT YOURSELF

### Retry with backoff

Write `retry(task, delays)`, where `task` is a function that may throw and `delays` is any iterable of wait times (such as `backoff().take(3)`). Call `task`; if it throws, take the next delay, log it and try again. When the delays run out, throw the last error. To keep the example fast, log the delays instead of waiting.

**Show a solution**

retry.js

```ts
function* backoff({ firstMs = 200, factor = 2, maxMs = 5000 } = {}) {
  for (let delay = firstMs; ; delay = Math.min(delay * factor, maxMs)) yield delay;
}

function retry(task, delays) {
  const waits = delays[Symbol.iterator]();
  for (let attempt = 1; ; attempt++) {
    try {
      return task(attempt);
    } catch (error) {
      const next = waits.next();
      if (next.done) throw error;
      console.log(`attempt ${attempt} failed (${error.message}), waiting ${next.value} ms`);
    }
  }
}

const flaky = (attempt) => {
  if (attempt < 3) throw new Error("gateway timeout");
  return "charged";
};
console.log(retry(flaky, backoff().take(5)));

try {
  retry(() => { throw new Error("card declined"); }, backoff().take(2));
} catch (error) {
  console.log("gave up:", error.message);
}
```

Output of `node retry.js` and of the browser terminal

```ts
attempt 1 failed (gateway timeout), waiting 200 ms
attempt 2 failed (gateway timeout), waiting 400 ms
charged
attempt 1 failed (card declined), waiting 200 ms
attempt 2 failed (card declined), waiting 400 ms
gave up: card declined
```

The retry loop does not know the backoff rule, and the backoff generator does not know about retries: `take(n)` joins them. In a real service, the task and the waiting are asynchronous (`await` a timer), and you only retry errors that can succeed on a second try: a timeout, yes; "card declined", no. Deciding which errors are retryable is part of [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design#recover).

TRY IT YOURSELF

### Paths to every file

A storage bucket is a tree of folders with `files` (names) and `folders`. Write a generator `filePaths(folder, prefix)` that yields the full path of every file, depth first, using `yield*` for subfolders. Then use it to find the first `.pdf` without walking the rest.

**Show a solution**

file-paths.js

```ts
const bucket = {
  name: "invoices",
  files: ["readme.txt"],
  folders: [
    { name: "2025", files: ["jan.csv", "feb.pdf"], folders: [] },
    { name: "2026", files: ["mar.pdf"], folders: [{ name: "drafts", files: ["apr.txt"], folders: [] }] },
  ],
};

let visited = 0;
function* filePaths(folder, prefix = "") {
  visited += 1;
  const here = `${prefix}${folder.name}/`;
  for (const file of folder.files) yield here + file;
  for (const sub of folder.folders) yield* filePaths(sub, here);
}

console.log([...filePaths(bucket)]);
visited = 0;
console.log(filePaths(bucket).find((path) => path.endsWith(".pdf")), "folders visited:", visited);
```

Output of `node file-paths.js` and of the browser terminal

```json
[
  'invoices/readme.txt',
  'invoices/2025/jan.csv',
  'invoices/2025/feb.pdf',
  'invoices/2026/mar.pdf',
  'invoices/2026/drafts/apr.txt'
]
invoices/2025/feb.pdf folders visited: 2
```

Only two folders were opened to find the first PDF. With a real storage API, each folder would be a request, and the lazy walk saves every request after the match.

## Recap

- Calling a `function*` returns a generator object and runs nothing. Each `next()` runs the body to the next `yield`, and pauses with its local variables intact. `return` finishes it with `done: true`.
- A generator object is an iterator and is iterable, and has the iterator helpers. It is one-shot: call the function again, or define `*[Symbol.iterator]()`, for a reusable iterable. Validate arguments in a normal wrapper, because the body starts late.
- Generators make lazy and infinite sequences (backoff delays, ids) and composable pipeline stages. `yield*` delegates to another iterable, flattens recursive walks, and evaluates to the delegate's return value.
- `yield` receives the argument of the next `next(value)`; the first argument is ignored.
- Early exits call `return()`, which runs `finally` blocks around the paused `yield`. `throw(error)` raises an error there. A hand-driven generator that is dropped while paused never runs its `finally`.
- `async function*` with `for await...of` streams asynchronous sources, such as paged APIs and Node streams, one item at a time.

Next: [Symbols](https://zudojs.oyinlola.site/learn/js-symbols), the unique keys behind `Symbol.iterator`, and the other hooks they let your objects plug into.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
