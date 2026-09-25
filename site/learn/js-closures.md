---
title: "Closures in depth — ZudoJS Academy"
description: "See how closures really work through lexical environments, then use them for private state, function factories, memoization and cleanup, without leaking memory."
source: https://zudojs.oyinlola.site/learn/js-closures
---

LEVEL 2 · LESSON 14 OF 19

Scope, closures and recursion Foundation

# Closures in depth

See how closures really work through lexical environments, then use them for private state, function factories, memoization and cleanup, without leaking memory.

- **45 min** to read and try
- **You need:** Scope and how code runs, Functions, and Objects in depth
- **You build:** A per-account daily transfer limit with a fake clock for testing, plus a memoized fee calculator with a size limit

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Draw the lexical environments behind any closure and predict what it sees
- Keep state private with closures and choose between a closure and a class
- Explain and fix the loop closure bug in all its forms
- Write function factories such as once and a configured fee calculator
- Memoize a pure function with a bounded cache
- Spot what a closure keeps alive and avoid the listener leak

## Two customers, one daily limit

A savings app lets each customer transfer at most ₦50,000 per day. The first version keeps the running total in a variable at the top of the module, the simplest place a beginner can think of:

problem.js

```ts
const DAILY_LIMIT_KOBO = 5000000;
let sentTodayKobo = 0;

function authorizeTransfer(customer, amountKobo) {
  if (sentTodayKobo + amountKobo > DAILY_LIMIT_KOBO) {
    return `${customer}: refused`;
  }
  sentTodayKobo += amountKobo;
  return `${customer}: sent ₦${amountKobo / 100}`;
}

console.log(authorizeTransfer("Ada", 3000000));
console.log(authorizeTransfer("Chidi", 3000000));

sentTodayKobo = 0;
console.log(authorizeTransfer("Ada", 3000000));
```

Output of `node problem.js` and of the browser terminal

```ts
Ada: sent ₦30000
Chidi: refused
Ada: sent ₦30000
```

Two bugs sit in these few lines:

1. Chidi was refused because of *Ada's* transfer. There is one `sentTodayKobo` for the whole program, but the rule is per customer.
2. Any code in the module can write `sentTodayKobo = 0` and wipe the limit. Here it is one obvious line; in a real codebase it is one line in a file you never read.

What you need is state that belongs to one customer, and that only the limit logic can change. You already met the tool in [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#closures): a **closure**, a function together with the variables it remembers from where it was created. That lesson showed *what* a closure does. This one shows *how* it works, so you can predict every case, and then uses it for the jobs closures do in real backends: private state, configured functions, caching, and cleanup. At the end you fix this limiter properly and test it.

## Lexical environments: the model behind closures

To predict what a closure sees, you need one mental model. JavaScript keeps variables in **lexical environments** (the specification's name; you can think "scope objects"). An environment is a table of names and their current values, plus a link to the environment around it, called its **outer** environment.

- When a module starts, it gets a module environment. Its outer is the global environment (where `console` and `Math` live).
- Every *call* of a function creates a **new** environment for that call's parameters and local variables. Blocks with `let` or `const` inside get one too.
- When a function is *created*, it stores a hidden reference to the environment it was created in. The specification calls it `[[Environment]]`.
- When a function runs, its new call environment's outer link is set to that stored `[[Environment]]`, not to the caller's. That is exactly why scope is *lexical*: it follows where code is written.

To look up a name, JavaScript checks the current environment, then its outer, then that one's outer, until it reaches the global environment. A closure is nothing more than a function whose stored environment is still needed after the call that created it has returned.

environments.js

```ts
function createAccount(owner) {
  let balanceKobo = 0;

  function deposit(amountKobo) {
    balanceKobo += amountKobo;
    return balanceKobo;
  }
  function balance() {
    return `${owner}: ₦${balanceKobo / 100}`;
  }
  return { deposit, balance };
}

const ada = createAccount("Ada");
const chidi = createAccount("Chidi");

ada.deposit(250000);
ada.deposit(100000);
chidi.deposit(5000);

console.log(ada.balance());
console.log(chidi.balance());
```

Output of `node environments.js` and of the browser terminal

```ts
Ada: ₦3500
Chidi: ₦50
```

Here is what exists in memory after those lines, drawn as boxes. Arrows are references:

```ts
 global environment        { console, Math, ... }
        ^ outer
 module environment        { createAccount, ada, chidi }
        ^ outer                          ^ outer
 call env #1                       call env #2
 { owner: "Ada",                   { owner: "Chidi",
   balanceKobo: 350000 }             balanceKobo: 5000 }
   ^            ^                    ^            ^
 ada.deposit  ada.balance       chidi.deposit  chidi.balance
 ([[Environment]] of each function points at the call that created it)
```

Three facts follow directly from the drawing, and they explain every closure puzzle you will meet:

1. **Each call makes a fresh environment.** Ada and Chidi each have their own `balanceKobo`.
2. **Functions created in the same call share that call's environment.** `ada.deposit` and `ada.balance` see the same `balanceKobo`, which is why the balance reflects both deposits.
3. **The environment holds variables, not snapshots.** A closure reads the current value each time it runs.

### Nested environments

Environments chain as deep as your functions nest. Each level can see everything outwards, and nothing inwards:

nested.js

```ts
const currency = "NGN";

function createShop(shopName) {
  let ordersPlaced = 0;

  return function createCheckout(customer) {
    let itemsInCart = 0;

    return function addItem(sku) {
      itemsInCart += 1;
      ordersPlaced += 1;
      return `${shopName}/${customer}: ${sku} (cart ${itemsInCart}, shop ${ordersPlaced}, ${currency})`;
    };
  };
}

const lagosShop = createShop("Lagos");
const adaAdds = lagosShop("Ada");
const tundeAdds = lagosShop("Tunde");

console.log(adaAdds("RICE-5"));
console.log(adaAdds("OIL-1"));
console.log(tundeAdds("SALT"));
```

Output of `node nested.js` and of the browser terminal

```ts
Lagos/Ada: RICE-5 (cart 1, shop 1, NGN)
Lagos/Ada: OIL-1 (cart 2, shop 2, NGN)
Lagos/Tunde: SALT (cart 1, shop 3, NGN)
```

`itemsInCart` lives in each `createCheckout` call, so Ada and Tunde have separate carts. `ordersPlaced` lives one level out, in the single `createShop("Lagos")` call, so both checkouts share and increase it. `currency` is in the module environment and everyone sees it. Where a variable is declared decides who shares it.

## Variables, not values

[Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#closures) showed that a closure sees later changes to a variable. The flip side catches people all the time: when you *want* a snapshot, you must make one. Copy the value into a variable that will not change, or pass it as an argument, which creates a new variable in the new call:

snapshot.js

```ts
let exchangeRate = 1500;

const liveQuote = (usd) => `₦${usd * exchangeRate}`;

function quoteWithRate(rate) {
  return (usd) => `₦${usd * rate}`;
}
const lockedQuote = quoteWithRate(exchangeRate);

console.log(liveQuote(10), lockedQuote(10));
exchangeRate = 1650;
console.log(liveQuote(10), lockedQuote(10));
```

Output of `node snapshot.js` and of the browser terminal

```ts
₦15000 ₦15000
₦16500 ₦15000
```

`liveQuote` reads `exchangeRate` from the module environment every time, so it follows the new rate. `lockedQuote` reads `rate`, a parameter of the call `quoteWithRate(1500)`. Nothing ever assigns to that parameter again, so it keeps 1500 forever. A shop that shows a customer a price and then charges them at checkout needs exactly this: a quote locked at the rate they saw.

## Private state

The first fix for the limiter is to move the total into a function call, so each customer gets one, and nothing outside can reach it. Compare three ways to hold a balance:

private.js

```ts
const plain = { balanceKobo: 0, deposit(amountKobo) { this.balanceKobo += amountKobo; } };
plain.deposit(1000);
plain.balanceKobo = 99999999;
console.log("plain object:", plain.balanceKobo);

function createAccount() {
  let balanceKobo = 0;
  return Object.freeze({
    deposit(amountKobo) {
      if (!Number.isInteger(amountKobo) || amountKobo <= 0) throw new RangeError("bad amount");
      balanceKobo += amountKobo;
    },
    balance: () => balanceKobo,
  });
}

const account = createAccount();
account.deposit(1000);
try {
  account.balanceKobo = 99999999;
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
try {
  account.balance = () => 99999999;
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log("closure:", account.balance());

class Account {
  #balanceKobo = 0;
  deposit(amountKobo) {
    this.#balanceKobo += amountKobo;
  }
  balance() {
    return this.#balanceKobo;
  }
}
const classAccount = new Account();
classAccount.deposit(1000);
console.log("class:", classAccount.balance());
```

Output of `node private.js` and of the browser terminal

```ts
plain object: 99999999
TypeError: Cannot add property balanceKobo, object is not extensible
TypeError: Cannot assign to read only property 'balance' of object '#<Object>'
closure: 1000
class: 1000
```

The plain object trusts every caller. The closure version keeps `balanceKobo` in the call environment, where no outside code can name it. Freezing the returned object (see [Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#locking)) also stops someone from replacing `balance` with a fake function. The class version uses a `#private` field, which you will meet properly in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#members), two lessons from now, and reaches the same goal.

### Closure or class?

|  | Closure (factory function) | Class with `#private` fields |
| --- | --- | --- |
| Privacy | Complete: the variables have no name outside | Complete: `#field` is a syntax error outside the class |
| `this` | Not used, so methods can be passed as callbacks safely | Methods lose `this` when passed as callbacks (see [this in depth](https://zudojs.oyinlola.site/learn/js-this)) |
| Memory per object | Every object gets its own copy of every method function | Methods live once on the prototype and are shared |
| `instanceof`, inheritance | No | Yes |

Both are good. A closure fits a handful of long-lived objects (a limiter per customer, a service, a store) and callback-heavy code. A class fits large numbers of objects of one kind, such as a million order lines, where sharing methods saves memory. ZudoJS uses closures of exactly this shape: `createRateLimiter` from `@zudojs/security` keeps its request counts in a `Map` inside the factory call and returns a function that checks them.

## Closures in loops

The loop bug from [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#kinds) makes complete sense with environments. Here it is without timers: each loop turn stores a function that will send a reminder later.

loops.js

```ts
const customers = ["Ada", "Chidi", "Tunde"];

const withVar = [];
for (var i = 0; i < customers.length; i++) {
  withVar.push(() => `remind ${customers[i]} (#${i})`);
}
console.log(withVar.map((send) => send()));

const withLet = [];
for (let j = 0; j < customers.length; j++) {
  withLet.push(() => `remind ${customers[j]} (#${j})`);
}
console.log(withLet.map((send) => send()));
```

Output of `node loops.js` and of the browser terminal

```json
[
  'remind undefined (#3)',
  'remind undefined (#3)',
  'remind undefined (#3)'
]
[ 'remind Ada (#0)', 'remind Chidi (#1)', 'remind Tunde (#2)' ]
```

- `var i` lives in the environment of the whole module (or function), and there is only one. All three arrows point at that one environment, and when they run, `i` is 3. `customers[3]` is `undefined`: the bug is not just a wrong number, it reads past the end of the array.
- `let j` in a `for` head gets special treatment: JavaScript creates a **new environment for every turn** of the loop and copies the current value of `j` into it before the turn starts. Each arrow captures its own turn's environment.

### let alone is not the fix

The per-turn copy only happens for a `let` declared *in the `for` head*. A `let` declared outside the loop is one variable, and you get the old bug back:

while-loop.js

```ts
const customers = ["Ada", "Chidi", "Tunde"];
const reminders = [];

let index = 0;
while (index < customers.length) {
  reminders.push(() => `remind #${index}`);
  index += 1;
}
console.log(reminders.map((send) => send()).join(", "));

const fixed = [];
let n = 0;
while (n < customers.length) {
  const position = n;
  fixed.push(() => `remind #${position}`);
  n += 1;
}
console.log(fixed.map((send) => send()).join(", "));

const best = customers.map((name, position) => () => `remind ${name} (#${position})`);
console.log(best.map((send) => send()).join(", "));
```

Output of `node while-loop.js` and of the browser terminal

```ts
remind #3, remind #3, remind #3
remind #0, remind #1, remind #2
remind Ada (#0), remind Chidi (#1), remind Tunde (#2)
```

The rule that always works: **capture a variable that never changes after the closure is made**. A `const` inside the loop body is a new variable each turn (the block gets a new environment each time). Array methods such as `map` and `forEach` are even simpler: every item is a separate call, so every callback has its own parameters.

### The IIFE in old code

Before `let` existed, the only way to get a new environment was to call a function. You will see this pattern in older code, called an **IIFE** (Immediately Invoked Function Expression): a function written and called on the spot.

iife.js

```ts
var reminders = [];
for (var i = 0; i < 3; i++) {
  (function (position) {
    reminders.push(function () {
      return "remind #" + position;
    });
  })(i);
}
console.log(reminders.map(function (send) { return send(); }).join(", "));
```

Output of `node iife.js` and of the browser terminal

```ts
remind #0, remind #1, remind #2
```

Each turn calls the anonymous function with the current `i`, and the call's parameter `position` lives in a fresh environment. It works, but in new code, `let`, `const` and array methods do the same job more clearly.

## Function factories

A **function factory** is a function that builds and returns another function, configured by the arguments you gave the factory. The returned function remembers the configuration through its closure. You met a tiny one in [Functions](https://zudojs.oyinlola.site/learn/js-functions#callbacks) (`multiplier`). Real ones read configuration once and then run many times:

fee-factory.js

```ts
function createFeeCalculator({ percent, minKobo, capKobo }) {
  if (percent < 0 || minKobo > capKobo) throw new RangeError("invalid fee settings");
  const rate = percent / 100;

  return function feeFor(amountKobo) {
    const raw = Math.round(amountKobo * rate);
    return Math.min(Math.max(raw, minKobo), capKobo);
  };
}

const transferFee = createFeeCalculator({ percent: 0.5, minKobo: 1000, capKobo: 200000 });
const cardFee = createFeeCalculator({ percent: 1.5, minKobo: 0, capKobo: 500000 });

for (const amountKobo of [50000, 5000000, 90000000]) {
  console.log(amountKobo, transferFee(amountKobo), cardFee(amountKobo));
}
```

Output of `node fee-factory.js` and of the browser terminal

```ts
50000 1000 750
5000000 25000 75000
90000000 200000 500000
```

The settings are checked once, in the factory, and the `rate` is computed once. Each fee function then only does the work that depends on the amount. The rest of the program only sees `transferFee(amount)` and never has to pass the settings around again. This is called **partial application**: supplying some of the inputs now and the rest later. [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional) takes it further.

### Wrapping a function: once

A factory can also take a function and return an improved version of it. A classic example protects against a double click on "Pay": the payment must run **once**, however many times the handler is called:

once.js

```ts
function once(fn) {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

let charges = 0;
const payOrder = once((orderId, amountKobo) => {
  charges += 1;
  return `charged ₦${amountKobo / 100} for ${orderId}`;
});

console.log(payOrder("ORD-7", 1170000));
console.log(payOrder("ORD-7", 1170000));
console.log(payOrder("ORD-8", 500));
console.log("charges:", charges);
```

Output of `node once.js` and of the browser terminal

```ts
charged ₦11700 for ORD-7
charged ₦11700 for ORD-7
charged ₦11700 for ORD-7
charges: 1
```

`called` and `result` are private to this one wrapper. Note what the third line shows: a different order also got the first result, because `once` ignores its arguments after the first call. That is correct for "initialise the database connection once", and dangerous for payments in general. For real payments, protection against duplicates is keyed by the order id and stored in the database, a topic called **idempotency**, which you will meet in the backend lessons.

## Memoization

**Memoization** means remembering the results of a function so that a repeated call with the same arguments returns the stored result instead of doing the work again. The memory lives in a closure. Here the "expensive" work is a delivery quote, and a counter shows how often it really runs:

memoize.js

```ts
function memoize(fn) {
  const cache = new Map();
  return (key) => {
    if (cache.has(key)) return cache.get(key);
    const result = fn(key);
    cache.set(key, result);
    return result;
  };
}

const ZONES = Object.freeze({ Lagos: 150000, Abuja: 250000, Kano: 300000 });
let computed = 0;

function deliveryQuoteKobo(city) {
  computed += 1;
  return ZONES[city] + city.length * 1000;
}

const quote = memoize(deliveryQuoteKobo);
const orders = ["Lagos", "Abuja", "Lagos", "Lagos", "Kano", "Abuja"];

console.log(orders.map(quote));
console.log("computed:", computed);
```

Output of `node memoize.js` and of the browser terminal

```json
[ 155000, 255000, 155000, 155000, 304000, 255000 ]
computed: 3
```

In a real shop the quote would come from slow work, such as a route calculation; the counter stands in for that cost. Six quotes, three computations: one per distinct city. A `Map` is the right cache, because its keys can be any value and it has no inherited names (see [Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#creating)).

### When memoization goes wrong

Memoization is only safe for **pure** functions, which give the same result for the same arguments and have no side effects ([Functions](https://zudojs.oyinlola.site/learn/js-functions#pure)). The cache also needs a correct **key**. Both conditions break easily:

memo-bugs.js

```ts
function memoize(fn) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) cache.set(key, fn(key));
    return cache.get(key);
  };
}

const stock = { "RICE-5": 10 };
const stockOf = memoize((sku) => stock[sku]);
console.log(stockOf("RICE-5"));
stock["RICE-5"] = 0;
console.log(stockOf("RICE-5"));

const totalOf = memoize((cart) => cart.items.reduce((sum, n) => sum + n, 0));
const cart = { items: [500, 700] };
console.log(totalOf(cart));
cart.items.push(300);
console.log(totalOf(cart));
console.log(totalOf({ items: [500, 700] }));
```

Output of `node memo-bugs.js` and of the browser terminal

```ts
10
10
1200
1200
1200
```

- `stockOf` reads outside data that changes. After the rice sold out, the cache still says 10: the shop would sell stock it does not have. Never memoize a function that reads a database, the clock or any mutable state.
- `totalOf` uses an object as the key, and `Map` compares keys by identity. The same cart after a change hits the stale entry (1200 instead of 1500), and every new cart object, even one with equal contents, misses the cache and adds another entry.

### Several arguments and a size limit

For several primitive arguments, build a string key from them. And every cache in a long-running server needs a limit, or it grows until the process runs out of memory. A `Map` remembers insertion order, so the first key is the oldest entry; deleting it when the cache is full keeps the size bounded:

memo-limit.js

```ts
function memoize(fn, { maxSize = 100 } = {}) {
  const cache = new Map();
  const memoized = (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    if (cache.size > maxSize) cache.delete(cache.keys().next().value);
    return result;
  };
  memoized.size = () => cache.size;
  return memoized;
}

let calls = 0;
const route = memoize((from, to) => {
  calls += 1;
  return `${from} -> ${to}`;
}, { maxSize: 2 });

route("Lagos", "Abuja");
route("Lagos", "Kano");
route("Lagos", "Abuja");
route("Abuja", "Kano");
route("Lagos", "Abuja");
console.log("calls:", calls, "cached:", route.size());
```

Output of `node memo-limit.js` and of the browser terminal

```ts
calls: 4 cached: 2
```

The fourth call pushed the cache over its limit, so the oldest entry, Lagos to Abuja, was dropped, and the fifth call had to compute it again. Deleting the oldest entry is the simplest eviction rule; a better one moves an entry to the end each time it is used, which gives a **least recently used** (LRU) cache, built in [the linked lists lesson](https://zudojs.oyinlola.site/learn/dsa-linked-lists). If the function throws, nothing is stored, so errors are not cached, which is usually what you want.

> NOTE
>
> `JSON.stringify(args)` is a fine key for strings, numbers and booleans. It is a poor key for objects (key order matters, and dates, maps and functions do not survive JSON), so memoize functions whose arguments are simple values, or pass an explicit key.

## What a closure keeps alive

The garbage collector frees an object when nothing can reach it any more ([Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#heap)). A closure is a way to reach things: as long as the function is reachable, the environment it points to is reachable, and so is everything in that environment that the closure uses. Usually that is exactly what you want. It becomes a **memory leak** when the function lives much longer than you expected.

### The listener leak

The most common closure leak in servers: a long-lived object keeps a list of callbacks, code adds a callback for every request, and nobody ever removes them. Each callback keeps its request's data alive:

listeners.js

```ts
function createEventHub() {
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    count: () => listeners.size,
  };
}

function handleRequestLeaky(hub, requestId) {
  const request = { id: requestId, body: "x".repeat(10000) };
  hub.subscribe((event) => `${request.id} saw ${event}`);
  return "done";
}

function handleRequest(hub, requestId) {
  const request = { id: requestId, body: "x".repeat(10000) };
  const unsubscribe = hub.subscribe((event) => `${request.id} saw ${event}`);
  try {
    return "done";
  } finally {
    unsubscribe();
  }
}

const leakyHub = createEventHub();
const cleanHub = createEventHub();
for (let i = 0; i < 1000; i++) {
  handleRequestLeaky(leakyHub, i);
  handleRequest(cleanHub, i);
}
console.log("listeners after leaky handlers:", leakyHub.count());
console.log("listeners after clean handlers:", cleanHub.count());
```

Output of `node listeners.js` and of the browser terminal

```ts
listeners after leaky handlers: 1000
listeners after clean handlers: 0
```

After 1,000 leaky requests, the hub holds 1,000 closures, and each one keeps its `request`, with a 10,000-character body, alive. A busy server handles millions of requests, so memory only grows until the process crashes. The fix is a closure too: `subscribe` returns an **unsubscribe** function that remembers exactly which listener to remove. Call it when the work is finished; a `finally` block ([Handling errors](https://zudojs.oyinlola.site/learn/js-errors)) makes sure it runs even when the work throws. `@zudojs/events` uses the same pattern.

### Keep only what you need

A closure keeps alive what it *uses*. If a long-lived callback only needs one field of a large object, copy that field into a local variable and use it instead of the whole object:

lean.js

```ts
function createReportLabel(report) {
  return () => `${report.title} (${report.rows.length} rows)`;
}

function createReportLabelLean(report) {
  const { title } = report;
  const rowCount = report.rows.length;
  return () => `${title} (${rowCount} rows)`;
}

const report = { title: "September sales", rows: Array.from({ length: 50000 }, (_, i) => ({ id: i })) };
const heavy = createReportLabel(report);
const lean = createReportLabelLean(report);
console.log(heavy());
console.log(lean());
```

Output of `node lean.js` and of the browser terminal

```ts
September sales (50000 rows)
September sales (50000 rows)
```

Both labels print the same text. But as long as `heavy` is reachable, the 50,000-row array is too; `lean` only keeps a short string and a number. One caution: engines keep one shared environment per call, so if *any* closure created in that call uses `report`, it stays alive for all of them. Keep long-lived closures in small functions that only hold what they need. [Memory and garbage collection](https://zudojs.oyinlola.site/learn/js-memory) shows how to find leaks like these with heap snapshots.

## Before you build: the per-customer limit

REASON IT OUT

### Design the transfer limiter

You will now fix the limiter from the start of the lesson. Think these through before reading the code:

- Where should each customer's running total live, so that customers are separate and outside code cannot reset it?
- "Per day" needs the current date. If the code calls `new Date()` itself, how would you test what happens at midnight without waiting for midnight?
- What amounts must be refused before they touch the total? What about an amount exactly equal to what is left?
- If a transfer is refused, should the total change?
- What can the caller be allowed to see?

**Show the reasoning**

- **Where the total lives**: in the environment of a call to a factory, `createTransferLimit()`, one call per customer. Nothing outside can name the variable, so nothing can reset it.
- **Time**: let the caller pass in a `today` function that returns the current day as a string. Production passes one that reads the real clock; tests pass a fake whose value they control. The limiter stores it in its closure and calls it on every check. Passing in a dependency like this is called **dependency injection**; you will see it again with classes in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#composition).
- **Amounts**: only whole numbers of kobo above zero, so strings, `NaN`, negatives, zero and fractions are refused. Exactly the remaining amount is allowed (`<=`, not `<`): a boundary that deserves a test.
- **Refusals**: a refused transfer must not change the total. Check first, then change the state, in that order.
- **Visibility**: the caller may read how much is left today, but only through a function, never by writing a variable.

## Build: a daily transfer limit

limit.js

```ts
export function createTransferLimit({ dailyLimitKobo, today }) {
  if (!Number.isInteger(dailyLimitKobo) || dailyLimitKobo <= 0) {
    throw new RangeError("dailyLimitKobo must be a positive whole number");
  }
  let day = today();
  let sentKobo = 0;

  function rollOver() {
    const current = today();
    if (current !== day) {
      day = current;
      sentKobo = 0;
    }
  }

  return Object.freeze({
    authorize(amountKobo) {
      if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
        return { ok: false, reason: "invalid amount" };
      }
      rollOver();
      if (sentKobo + amountKobo > dailyLimitKobo) {
        return { ok: false, reason: "daily limit reached" };
      }
      sentKobo += amountKobo;
      return { ok: true };
    },
    remainingKobo() {
      rollOver();
      return dailyLimitKobo - sentKobo;
    },
  });
}
```

Everything a limiter needs, `day`, `sentKobo`, the settings and the clock, lives in the environment of one `createTransferLimit` call. The two methods and the helper `rollOver` share it. Now one limiter per customer, and a fake clock, which is just a closure over a variable the test controls:

main.js

```ts
import { createTransferLimit } from "./limit.js";

let fakeDay = "2026-09-24";
const today = () => fakeDay;

const limits = new Map();
function limitFor(customer) {
  if (!limits.has(customer)) {
    limits.set(customer, createTransferLimit({ dailyLimitKobo: 5000000, today }));
  }
  return limits.get(customer);
}

console.log("Ada", limitFor("Ada").authorize(3000000));
console.log("Chidi", limitFor("Chidi").authorize(3000000));
console.log("Ada", limitFor("Ada").authorize(3000000));
console.log("Ada left:", limitFor("Ada").remainingKobo());

fakeDay = "2026-09-25";
console.log("Ada next day", limitFor("Ada").authorize(3000000));
console.log("Ada left:", limitFor("Ada").remainingKobo());
```

Output of `node main.js` and of the browser terminal

```ts
Ada { ok: true }
Chidi { ok: true }
Ada { ok: false, reason: 'daily limit reached' }
Ada left: 2000000
Ada next day { ok: true }
Ada left: 2000000
```

Chidi is no longer refused because of Ada, and the limit resets on the next day without anyone touching the total. Changing `fakeDay` moved the limiter to the next day instantly; in production you would pass `() => new Date().toISOString().slice(0, 10)` (the UTC date) instead.

### Testing through the public functions

Private state cannot be inspected directly, and that is fine: tests should check behaviour through the same functions real callers use. The fake clock makes the day boundary testable in a millisecond:

limit.test.js

```ts
import { createTransferLimit } from "./limit.js";

function check(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

function setup(limit = 1000) {
  const clock = { day: "2026-09-24" };
  const limiter = createTransferLimit({ dailyLimitKobo: limit, today: () => clock.day });
  return { clock, limiter };
}

{
  const { limiter } = setup();
  check("exactly the limit is allowed", limiter.authorize(1000), { ok: true });
  check("one kobo more is refused", limiter.authorize(1), { ok: false, reason: "daily limit reached" });
}
{
  const { limiter } = setup();
  for (const bad of [0, -5, 2.5, "500", NaN]) {
    check(`invalid ${JSON.stringify(bad)}`, limiter.authorize(bad).ok, false);
  }
  check("invalid amounts used nothing", limiter.remainingKobo(), 1000);
}
{
  const { limiter } = setup();
  limiter.authorize(800);
  limiter.authorize(300);
  check("refusal does not count", limiter.remainingKobo(), 200);
}
{
  const { clock, limiter } = setup();
  limiter.authorize(1000);
  clock.day = "2026-09-25";
  check("new day resets", limiter.remainingKobo(), 1000);
}
{
  const a = setup().limiter;
  const b = setup().limiter;
  a.authorize(1000);
  check("customers are independent", b.remainingKobo(), 1000);
}
{
  let error = null;
  try {
    setup(0);
  } catch (e) {
    error = e.name;
  }
  check("zero limit rejected", error, "RangeError");
}
```

Output of `node limit.test.js` and of the browser terminal

```ts
PASS exactly the limit is allowed -> {"ok":true}
PASS one kobo more is refused -> {"ok":false,"reason":"daily limit reached"}
PASS invalid 0 -> false
PASS invalid -5 -> false
PASS invalid 2.5 -> false
PASS invalid "500" -> false
PASS invalid null -> false
PASS invalid amounts used nothing -> 1000
PASS refusal does not count -> 200
PASS new day resets -> 1000
PASS customers are independent -> 1000
PASS zero limit rejected -> "RangeError"
```

Look at the `NaN` line: its label says `null`, because `JSON.stringify(NaN)` is `"null"`. The test still passed, but the label is misleading. A small reminder that JSON is not a debugging format; `String(bad)` would have printed `NaN`. Each test block `{ … }` gets its own block scope, so every test builds fresh limiters and nothing leaks from one test to the next, which is exactly what test runners such as Vitest give you with separate test functions.

### In production

- **In-memory state belongs to one process.** The limiter above forgets everything on restart, and two server processes would each allow ₦50,000. Real limits are stored in a shared store such as Redis or the database; `@zudojs/security`'s `createRateLimiter` and [the cache lesson](https://zudojs.oyinlola.site/learn/zudo-cache) show how. The closure design (state plus a clock passed in) carries over unchanged.
- **Module-level maps grow.** The `limits` map above gains an entry per customer and never shrinks. Remove entries for past days, or give the map a size limit, as with memoization.
- **Every cache needs a limit and a reason to be correct.** Memoize pure functions only, key on simple values, and bound the size.
- **Every subscribe needs an unsubscribe.** Return the cleanup function from wherever you register a listener, and call it in `finally`.

## Practice

TRY IT YOURSELF

### A counter with step and reset

Write `createTicketCounter(prefix, step = 1)`. It returns an object with `next()`, which returns ticket codes like `"Q-1"`, `"Q-2"` (increasing by `step`), and `reset()`, which starts again at the first number. Two counters must not affect each other.

**Show a solution**

tickets.js

```ts
function createTicketCounter(prefix, step = 1) {
  let current = 0;
  return {
    next() {
      current += step;
      return `${prefix}-${current}`;
    },
    reset() {
      current = 0;
    },
  };
}

const queue = createTicketCounter("Q");
const vip = createTicketCounter("VIP", 10);

console.log(queue.next(), queue.next(), vip.next(), vip.next());
queue.reset();
console.log(queue.next(), vip.next());
```

Output of `node tickets.js` and of the browser terminal

```ts
Q-1 Q-2 VIP-10 VIP-20
Q-1 VIP-30
```

Each call to `createTicketCounter` creates its own environment with its own `current`, `prefix` and `step`. `next` and `reset` share it.

TRY IT YOURSELF

### Fix the handlers

This code registers a discount handler for each coupon, but every handler reports the last coupon. Explain why using environments, and fix it in two different ways.

coupons-bug.js

```ts
const coupons = ["SAVE10", "SAVE20", "FREESHIP"];
const handlers = [];
let k = 0;
while (k < coupons.length) {
  handlers.push(() => `applied ${coupons[k - 1]}`);
  k += 1;
}
console.log(handlers.map((h) => h()).join(", "));
```

Output of `node coupons-bug.js` and of the browser terminal

```ts
applied FREESHIP, applied FREESHIP, applied FREESHIP
```

**Show a solution**

There is one `k`, in the module environment. All three arrows read it when they run, after the loop, when `k` is 3, so `coupons[k - 1]` is always the last coupon. Fix it by capturing a value that never changes: a `const` inside the loop body (a new environment each turn), or a `map` callback (a new call per item):

coupons-fix.js

```ts
const coupons = ["SAVE10", "SAVE20", "FREESHIP"];

const handlers = [];
let k = 0;
while (k < coupons.length) {
  const coupon = coupons[k];
  handlers.push(() => `applied ${coupon}`);
  k += 1;
}
console.log(handlers.map((h) => h()).join(", "));

const viaMap = coupons.map((coupon) => () => `applied ${coupon}`);
console.log(viaMap.map((h) => h()).join(", "));
```

Output of `node coupons-fix.js` and of the browser terminal

```ts
applied SAVE10, applied SAVE20, applied FREESHIP
applied SAVE10, applied SAVE20, applied FREESHIP
```

TRY IT YOURSELF

### Count the cache hits

Extend `memoize(fn)` so the memoized function has a `stats()` method that returns `{ hits, misses }`. A hit is a call answered from the cache; a miss is a call that ran `fn`.

**Show a solution**

memo-stats.js

```ts
function memoize(fn) {
  const cache = new Map();
  let hits = 0;
  let misses = 0;
  const memoized = (key) => {
    if (cache.has(key)) {
      hits += 1;
      return cache.get(key);
    }
    misses += 1;
    const result = fn(key);
    cache.set(key, result);
    return result;
  };
  memoized.stats = () => ({ hits, misses });
  return memoized;
}

const vatKobo = memoize((priceKobo) => Math.round(priceKobo * 0.075));
[850000, 320000, 850000, 850000, 20000].forEach((price) => vatKobo(price));
console.log(vatKobo.stats());
```

Output of `node memo-stats.js` and of the browser terminal

```json
{ hits: 2, misses: 3 }
```

Functions are objects, so you can attach `stats` to the memoized function. `stats` is a closure over the same environment as the cache, so it reads the live counters. Hit rate is the number to watch in production: a cache with almost no hits only costs memory.

## Recap

- Variables live in lexical environments. Every call creates a new one; every function remembers the environment it was created in, and looks names up outwards from there.
- Functions created in the same call share its environment. A closure sees variables, not snapshots: pass a value as an argument or copy it into a `const` to lock it.
- Closures give complete privacy without `this`. Classes with `#private` fields share methods through the prototype. Pick by how many objects you create and how they are used.
- In loops, capture a variable that never changes: a `let` in the `for` head, a `const` in the body, or an array method's parameter. A `let` outside the loop is still one variable.
- Factories configure a function once and return it; wrappers like `once` and `memoize` add behaviour to any function.
- Memoize only pure functions, with simple keys and a size limit.
- A reachable closure keeps its environment alive. Return an unsubscribe function for every subscription, and keep long-lived closures small.

Next: [Recursion](https://zudojs.oyinlola.site/learn/js-recursion), where functions call themselves to walk folder trees, comment threads and org charts.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
