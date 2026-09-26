---
title: "Promises in depth — ZudoJS Academy"
description: "See exactly what a promise guarantees, how chains pass values and errors along, how thenables work, and how to turn a callback SDK into promises safely."
source: https://zudojs.oyinlola.site/learn/js-promises
---

LEVEL 4 · LESSON 13 OF 20

Asynchronous JavaScript in depth Core

# Promises in depth

See exactly what a promise guarantees, how chains pass values and errors along, how thenables work, and how to turn a callback SDK into promises safely.

- **55 min** to read and try
- **You need:** Asynchronous JavaScript, Functional JavaScript and this in depth
- **You build:** A promisify helper for a callback-based SMS SDK, and a checkout flow that reserves stock, charges a card and sends a receipt, with tests for every failure

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the guarantees a promise gives that a callback cannot
- Tell resolved from fulfilled, and predict what a promise resolved with another promise does
- Predict the value and state of every promise in a then/catch/finally chain
- Explain how rejections travel down a chain and where they stop
- Recognise thenables and the bugs an accidental then causes
- Promisify a callback API correctly, including this, synchronous throws and double calls

## The receipt that was sent twice

A shop's checkout does three things when a customer pays: it charges the card, reserves the items in the warehouse and sends a receipt. The payment provider's software development kit (SDK: the library a company gives you to use its service) takes a **callback**, the style you met in [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#callbacks). One morning a customer complains that they got two receipts. Here is a small copy of the code, with the SDK simulated:

twice.js

```ts
// The provider's SDK. A bug in its retry logic calls back twice.
function chargeCard(amountKobo, callback) {
  setTimeout(() => callback(null, { id: "ch_81", amountKobo }), 10);
  setTimeout(() => callback(null, { id: "ch_81", amountKobo }), 20);
}

let receipts = 0;

chargeCard(1_500_000, (error, charge) => {
  if (error) return console.log("payment failed:", error.message);
  receipts += 1;
  console.log(`receipt ${receipts}: charge ${charge.id} for ₦${charge.amountKobo / 100}`);
});
```

Output of `node twice.js` and of the browser terminal

```ts
receipt 1: charge ch_81 for ₦15000
receipt 2: charge ch_81 for ₦15000
```

Your code did nothing wrong, yet it ran twice. When you pass a callback, you hand control of *your* code to someone else's code. It decides when your function runs, how often, and with what arguments. This is called **inversion of control**, and it is the real problem with callbacks, deeper than the nesting you saw as "callback hell". A callback can be called:

- twice, or never;
- with both an error and a result;
- sometimes straight away and sometimes later, so the order of your own lines changes from one call to the next.

The last one is sneaky. This price lookup answers from a cache when it can:

sometimes-sync.js

```ts
const cache = new Map();

function getPrice(sku, callback) {
  if (cache.has(sku)) return callback(cache.get(sku));
  setTimeout(() => {
    cache.set(sku, 250_000);
    callback(250_000);
  }, 10);
}

function show(sku) {
  let step = "before";
  getPrice(sku, () => console.log(`${sku}: callback ran ${step} the next line`));
  step = "after";
}

show("rice-5kg");
setTimeout(() => show("rice-5kg"), 50);
```

Output of `node sometimes-sync.js` and of the browser terminal

```ts
rice-5kg: callback ran after the next line
rice-5kg: callback ran before the next line
```

The same call, with the same code around it, ran in a different order the second time. Any code that depended on `step` would work in testing (empty cache) and break in production (warm cache). Promises exist to take control back: instead of handing your function to the SDK, you get an object from it and decide yourself what to do with the result. This lesson shows exactly what that object guarantees, how chains of them behave, and how to wrap a callback SDK so the rest of your code never sees a callback again.

## What a promise guarantees

A **promise** is an object that stands for the result of work that may not have finished yet. You already know its three states from [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#promises): **pending**, **fulfilled** (with a value) and **rejected** (with a reason). A fulfilled or rejected promise is **settled**. On top of that, the language makes four promises about promises, and each one fixes one of the callback problems above:

1. **It settles at most once.** After the first `resolve` or `reject`, every later call is ignored. No double receipts.
2. **It has either a value or a reason, never both.**
3. **Handlers always run later.** A function you pass to `then` never runs during the `then` call itself, even when the promise is already settled. The order of your lines never changes.
4. **Late handlers still run.** A handler attached after the promise settled gets the result as well. Nobody misses the answer by subscribing too late.

Here are the double-calling SDK and the sometimes-synchronous cache again, each wrapped in a promise:

guarantees.js

```ts
function chargeCard(amountKobo, callback) {
  setTimeout(() => callback(null, { id: "ch_81", amountKobo }), 10);
  setTimeout(() => callback(null, { id: "ch_81", amountKobo }), 20);
}

const charge = new Promise((resolve, reject) => {
  chargeCard(1_500_000, (error, result) => (error ? reject(error) : resolve(result)));
});

let receipts = 0;
charge.then((c) => console.log(`receipt ${++receipts} for ${c.id}`));

const cached = Promise.resolve(250_000);   // already fulfilled
let step = "before";
cached.then(() => console.log(`cached price: handler ran ${step} the next line`));
step = "after";

setTimeout(() => {
  charge.then((c) => console.log(`late handler still sees ${c.id}`));
}, 100);
```

Output of `node guarantees.js` and of the browser terminal

```ts
cached price: handler ran after the next line
receipt 1 for ch_81
late handler still sees ch_81
```

The second callback from the SDK called `resolve` again, and nothing happened: the promise was already fulfilled. The cached price was available at once, but its handler still ran after the current code finished, so the order is the same whether the cache is warm or cold. The handler attached 100 ms later still received the charge. You get these guarantees for free, just by putting a promise between the SDK and your code.

`Promise.resolve(value)`, used above, is a short way to get a promise that is already fulfilled with `value`. `Promise.reject(error)` gives one that is already rejected.

## Resolving is not the same as fulfilling

The function you pass to `new Promise` is called the **executor**. It runs immediately and synchronously, during the `new Promise(…)` call, and it receives two functions, `resolve` and `reject`:

executor.js

```ts
console.log("1. before new Promise");

const order = new Promise((resolve) => {
  console.log("2. the executor runs straight away");
  resolve({ id: 7, total: 12_000 });
});

console.log("3. after new Promise");
order.then((o) => console.log("4. order", o.id, "is ready"));
```

Output of `node executor.js` and of the browser terminal

```ts
1. before new Promise
2. the executor runs straight away
3. after new Promise
4. order 7 is ready
```

The names are a little misleading. `resolve` does not always *fulfil* the promise. If you call it with an ordinary value, the promise is fulfilled with that value. But if you call it with *another promise*, your promise follows that other promise: it stays pending until the other one settles, then copies its result. From that moment your promise is **resolved** (its fate is decided, locked to the other one) even though it is still **pending**. Any later call to `resolve` or `reject` is ignored:

resolved-pending.js

```ts
function watch(name, promise) {
  promise.then(
    (value) => console.log(`${name}: fulfilled with ${value}`),
    (error) => console.log(`${name}: rejected with ${error.message}`),
  );
}

let settlePayment;
const payment = new Promise((resolve, reject) => {
  settlePayment = { resolve, reject };
});

const order = new Promise((resolve, reject) => {
  resolve(payment);                        // order now follows payment
  reject(new Error("customer cancelled")); // ignored: order is already resolved
});

watch("order", order);
console.log("order is resolved, but still pending");

setTimeout(() => settlePayment.reject(new Error("card declined")), 20);
```

Output of `node resolved-pending.js` and of the browser terminal

```ts
order is resolved, but still pending
order: rejected with card declined
```

Notice two things. The `reject` in the executor did nothing, because `order` had already been resolved to `payment`. And resolving is not a promise of success: `order` was "resolved", yet it ended up rejected, because `payment` did. So the precise vocabulary is:

| Word | Meaning |
| --- | --- |
| pending | No result yet. |
| fulfilled | Finished with a value. |
| rejected | Finished with a reason. |
| settled | Fulfilled or rejected. |
| resolved | Its fate is decided: either settled, or locked to follow another promise. A resolved promise can still be pending. |

This "follow the other promise" rule is called **adoption**, and it is what makes chains work, as you will see next.

### A throw in the executor rejects

If the executor throws, the promise is rejected with the thrown error, instead of the error escaping from `new Promise`. But only while the executor is running: a throw inside a callback that runs *later* (in a timer, in an SDK callback) is not inside the executor any more, and nothing catches it.

executor-throw.js

```ts
const invalid = new Promise(() => {
  JSON.parse("{ not json");
});

invalid.catch((error) => console.log("rejected:", error.name));

const alreadyDone = new Promise((resolve) => {
  resolve("stock reserved");
  throw new Error("ignored: the promise is already fulfilled");
});

alreadyDone.then((value) => console.log("fulfilled:", value));
```

Output of `node executor-throw.js` and of the browser terminal

```ts
rejected: SyntaxError
fulfilled: stock reserved
```

The second executor threw after calling `resolve`. The promise was already settled, so the throw was swallowed. Put `resolve` last, or make sure nothing after it can fail.

## Chaining: every then makes a new promise

`promise.then(onFulfilled, onRejected)` does not change `promise`. It returns a **new** promise, and what happens inside your handler decides that new promise's fate:

| Your handler… | The promise returned by `then` is… |
| --- | --- |
| returns a plain value `v` | fulfilled with `v` |
| returns nothing | fulfilled with `undefined` |
| throws an error `e` | rejected with `e` |
| returns a promise (or thenable) `p` | resolved to `p`: it follows `p` and ends up like it |
| is missing for this outcome | settled the same way as the original (the result passes through) |

Those five rules explain every chain you will ever read. Here they are one per step, in a small order pipeline:

chain-rules.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

Promise.resolve({ id: 7, items: 3 })
  .then((order) => order.items * 4_000)             // plain value
  .then((subtotal) => {
    console.log("subtotal:", subtotal);              // returns nothing
  })
  .then((nothing) => {
    console.log("after a handler with no return:", nothing);
    return wait(20, "stock reserved");               // a promise: the chain waits for it
  })
  .then((message) => {
    console.log(message);
    throw new Error("payment gateway down");         // throws: the chain is rejected
  })
  .then(() => console.log("skipped: no rejection handler here"))
  .catch((error) => console.log("caught:", error.message));
```

Output of `node chain-rules.js` and of the browser terminal

```ts
subtotal: 12000
after a handler with no return: undefined
stock reserved
caught: payment gateway down
```

The third step returned a promise that takes 20 ms. The next `then` did not receive a promise object: it received `"stock reserved"`, 20 ms later. That is adoption again: the promise from `then` followed the returned promise. It is why you can write a long sequence of asynchronous steps as a flat chain instead of nesting them:

flat-vs-nested.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const reserveStock = (order) => wait(10, { ...order, reserved: true });
const chargeCard = (order) => wait(10, { ...order, chargeId: "ch_81" });
const sendReceipt = (order) => wait(10, `receipt for order ${order.id} (${order.chargeId})`);

// Nested: works, but it is callback hell again.
reserveStock({ id: 7 }).then((reserved) => {
  chargeCard(reserved).then((charged) => {
    sendReceipt(charged).then((receipt) => console.log("nested:", receipt));
  });
});

// Flat: each step returns the next promise.
reserveStock({ id: 8 })
  .then((reserved) => chargeCard(reserved))
  .then((charged) => sendReceipt(charged))
  .then((receipt) => console.log("flat:", receipt));
```

Output of `node flat-vs-nested.js` and of the browser terminal

```ts
nested: receipt for order 7 (ch_81)
flat: receipt for order 8 (ch_81)
```

Both print the same thing, but the nested version has a hidden bug: an error in `chargeCard` would be an unhandled rejection, because no `catch` can reach inside the nested callbacks. In the flat version one `.catch` at the end covers every step.

### The missing return

The most common promise bug is a handler that *starts* asynchronous work but forgets to `return` it. The chain cannot wait for a promise it never receives, so it moves on at once:

missing-return.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const log = [];

function saveOrder(order) {
  return wait(30).then(() => log.push(`saved order ${order.id}`));
}

Promise.resolve({ id: 7 })
  .then((order) => {
    saveOrder(order);                 // BUG: no return
  })
  .then(() => log.push("told the customer: order saved"))
  .then(() => wait(50))
  .then(() => console.log(log));
```

Output of `node missing-return.js` and of the browser terminal

```json
[ 'told the customer: order saved', 'saved order 7' ]
```

The customer was told the order was saved 30 ms before it actually was. If saving had failed, they would never have known, and the error would have been unhandled. A promise that is started but that nobody waits for or handles is called a **floating promise**. Arrow functions without braces return automatically, which is one reason chains are usually written `.then((order) => saveOrder(order))`. Linters (tools that check code for mistakes, covered in [JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling)) have a rule for floating promises; turn it on.

## How errors travel down a chain

A rejection moves down the chain, skipping every step that has no rejection handler, until it reaches one. That handler works like a `catch` block: whatever it does decides what happens next, by the same five rules. If it returns a value, the chain is **fulfilled** again (it has recovered). If it throws, the chain stays rejected, now with the new error.

recover-rethrow.js

```ts
const failWith = (message) => Promise.reject(new Error(message));

// 1. Recover: return a fallback value.
failWith("rates service down")
  .catch(() => ({ currency: "NGN", rate: 1 }))
  .then((rate) => console.log("recovered with", rate));

// 2. Rethrow: add context and keep failing.
failWith("timeout")
  .catch((error) => {
    throw new Error("could not load exchange rates", { cause: error });
  })
  .then(() => console.log("skipped"))
  .catch((error) => console.log(`${error.message} (cause: ${error.cause.message})`));
```

Output of `node recover-rethrow.js` and of the browser terminal

```ts
recovered with { currency: 'NGN', rate: 1 }
could not load exchange rates (cause: timeout)
```

This is a common source of bugs: a `catch` that only logs, and so returns `undefined`, turns a failure into a success with the value `undefined`. The next step then runs with nothing:

swallowed.js

```ts
const chargeCard = () => Promise.reject(new Error("card declined"));

chargeCard()
  .catch((error) => console.log("log:", error.message))   // logs, returns undefined
  .then((charge) => console.log("send receipt for charge", charge));
```

Output of `node swallowed.js` and of the browser terminal

```ts
log: card declined
send receipt for charge undefined
```

If a `catch` cannot actually fix the problem, it must rethrow (`throw error;`) after logging. [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design) covers which layer should handle which error.

### then(ok, fail) is not then(ok).catch(fail)

The second argument of `then` only handles a rejection of the promise *before* it. It does not see errors thrown by the first argument, which sits next to it in the same step. `.catch` on the next line does see them:

then-two-args.js

```ts
const order = Promise.resolve({ id: 7, items: [] });

const checkItems = (o) => {
  if (o.items.length === 0) throw new Error("order has no items");
  return o;
};

order
  .then(checkItems, (error) => console.log("two-argument then caught:", error.message))
  .catch((error) => console.log("unhandled by the step, caught later:", error.message));

order
  .then(checkItems)
  .catch((error) => console.log("then + catch caught:", error.message));
```

Output of `node then-two-args.js` and of the browser terminal

```ts
unhandled by the step, caught later: order has no items
then + catch caught: order has no items
```

### finally passes the result through

`.finally(fn)` runs `fn` whether the promise was fulfilled or rejected, and `fn` receives no argument. It is for cleanup: closing a connection, hiding a spinner, releasing a lock. Its return value is ignored, so the original result passes through unchanged. The one exception: if `fn` throws (or returns a rejected promise), that error replaces the result.

finally.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ok = await Promise.resolve("order 7 paid").finally(() => "this value is ignored");
console.log(ok);

try {
  await Promise.reject(new Error("card declined")).finally(() => console.log("spinner hidden"));
} catch (error) {
  console.log("still rejected:", error.message);
}

const slow = Date.now();
await Promise.resolve("done").finally(() => wait(50));
console.log("finally waited for its promise:", Date.now() - slow >= 45);

try {
  await Promise.resolve("order 8 paid").finally(() => {
    throw new Error("could not release the lock");
  });
} catch (error) {
  console.log("the cleanup error wins:", error.message);
}
```

Output of `node finally.js` and of the browser terminal

```ts
order 7 paid
spinner hidden
still rejected: card declined
finally waited for its promise: true
the cleanup error wins: could not release the lock
```

## async and await are promise chains

You write most asynchronous code with `async` and `await` (from [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async#async-await)), and it helps to see them as the same rules in a different syntax:

- An `async` function always returns a new promise. Returning a value fulfils it; throwing rejects it; returning a promise makes it follow that promise (adoption again).
- `await p` pauses the function until `p` settles. A fulfilled value becomes the value of the expression; a rejection is thrown at that line, so `try`/`catch` works.

async-is-then.js

```ts
const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const reserveStock = (order) => wait(10, { ...order, reserved: true });
const chargeCard = (order) =>
  order.total > 50_000 ? Promise.reject(new Error("limit exceeded")) : wait(10, { ...order, chargeId: "ch_81" });

function checkoutWithThen(order) {
  return reserveStock(order)
    .then((reserved) => chargeCard(reserved))
    .then((charged) => `paid with ${charged.chargeId}`)
    .catch((error) => `failed: ${error.message}`);
}

async function checkoutWithAwait(order) {
  try {
    const reserved = await reserveStock(order);
    const charged = await chargeCard(reserved);
    return `paid with ${charged.chargeId}`;
  } catch (error) {
    return `failed: ${error.message}`;
  }
}

console.log(await checkoutWithThen({ id: 7, total: 12_000 }));
console.log(await checkoutWithAwait({ id: 7, total: 12_000 }));
console.log(await checkoutWithThen({ id: 8, total: 90_000 }));
console.log(await checkoutWithAwait({ id: 8, total: 90_000 }));
```

Output of `node async-is-then.js` and of the browser terminal

```ts
paid with ch_81
paid with ch_81
failed: limit exceeded
failed: limit exceeded
```

The two functions behave the same. One detail from the [retry exercise](https://zudojs.oyinlola.site/learn/js-async#practice) is worth repeating with this model in mind: inside `try`, write `return await promise`, not `return promise`. Without `await`, the function returns the promise before it settles, the `try` block is already finished when it rejects, and the `catch` never runs.

## Thenables

Promises from different libraries (and from before promises were built into JavaScript) need to work together. So the rule is not "a promise is adopted", it is "anything with a `then` method is adopted". An object with a `then` method is called a **thenable**. `await`, `Promise.resolve`, `resolve(…)` and returning from a `then` handler all check for a `then` method and, if there is one, call it with a `resolve` and a `reject` function.

Query builders use this. A query builder lets you add conditions step by step and only runs the query when you `await` it:

thenable.js

```ts
const products = [
  { sku: "rice-5kg", price: 9_500, stock: 12 },
  { sku: "oil-1l", price: 3_200, stock: 0 },
  { sku: "beans-2kg", price: 4_800, stock: 7 },
];

function query() {
  const filters = [];
  return {
    where(test) {
      filters.push(test);
      return this;
    },
    then(resolve, reject) {
      console.log(`running query with ${filters.length} filters`);
      setTimeout(() => resolve(products.filter((p) => filters.every((f) => f(p)))), 10);
    },
  };
}

const inStock = await query().where((p) => p.stock > 0).where((p) => p.price < 9_000);
console.log(inStock.map((p) => p.sku));
```

Output of `node thenable.js` and of the browser terminal

```ts
running query with 2 filters
[ 'beans-2kg' ]
```

The builder is not a promise, and nothing ran while the conditions were added. `await` saw a `then` method and called it, and the query ran then.

### The accidental thenable

The same rule can bite. Any value with a function called `then` is treated as a thenable, including your own data. If that function never calls `resolve`, the `await` waits forever:

accidental-thenable.js

```ts
const reminder = {
  task: "Call the supplier",
  then(callback) {                // meant as "what to do after this task"
    this.next = callback;
  },
};

async function loadReminder() {
  return reminder;
}

let loaded = false;
loadReminder().then(() => (loaded = true));

setTimeout(() => console.log("loaded after 50 ms:", loaded), 50);
```

Output of `node accidental-thenable.js` and of the browser terminal

```ts
loaded after 50 ms: false
```

`loadReminder` returned the object, so the `async` function's promise tried to adopt it, called its `then`, and waited for a `resolve` that never came. No error, no timeout: the request simply hangs. Never name a method `then` unless you mean to make a thenable. A plain property called `then` that is not a function (say, `{ then: "tomorrow" }`) is fine; only functions count.

## Promisifying a callback API

Your shop sends a text message when an order ships. The SMS provider's SDK is old and callback-based: `sms.send(to, text, callback)`, where the callback is error-first (`(error, receipt)`). The rest of your code uses `await`. The fix is to **promisify** the SDK: write a function with the same inputs that returns a promise instead of taking a callback. Do it once, at the edge of your program, and no callback leaks into the rest of the code.

REASON IT OUT

### What can go wrong when you wrap a callback?

Before writing `promisify(fn)`, a helper that turns any error-first callback function into a promise-returning one, think about the SDK you are wrapping. You cannot change it, and you should not trust it:

- The SDK method uses `this` internally (`this.apiKey`). What does your wrapper have to do so that `this` is still right?
- What if the SDK calls the callback twice, or with both an error and a receipt?
- What if the SDK throws synchronously, before it ever calls back (for example, because the phone number is malformed)?
- What if the SDK never calls back at all?
- The SDK's callback may receive more than one result value. What should the promise be fulfilled with?

**Show the reasoning**

- **this**: a method call sets `this` from the object before the dot ([this in depth](https://zudojs.oyinlola.site/learn/js-this)). Your wrapper calls the original function itself, so it must pass on its own `this` with `fn.call(this, …)`, and then be called as a method (`sms.sendAsync = promisify(sms.send)`) or be bound to the SDK object.
- **Double calls**: a promise settles once, so the second call is ignored automatically. If the callback gets an error, reject and ignore the result: an error-first callback means "the error wins".
- **Synchronous throw**: call the SDK inside the executor. A throw there rejects the promise instead of escaping, so callers see every failure the same way, as a rejection.
- **Never calls back**: the promise stays pending forever and so does your request. A promise cannot fix this alone; you need a time limit, which the next lesson builds with `Promise.race`.
- **Several values**: a promise holds one value. The usual choice is the first result; if an API returns several, the wrapper can return an object or an array. Document which.

Here is the SDK (simulated, with each of those bad habits) and the wrapper:

promisify.js

```ts
// An SMS SDK you cannot change.
export const sms = {
  apiKey: "test-key",
  sent: 0,
  send(to, text, callback) {
    if (!/^\+234\d{10}$/.test(to)) throw new TypeError(`invalid phone number: ${to}`);
    if (!this.apiKey) return callback(new Error("missing API key"));
    setTimeout(() => {
      this.sent += 1;
      callback(null, { id: `msg_${this.sent}`, to });
      callback(null, { id: "duplicate" });       // a bug: calls back twice
    }, 10);
  },
};

export function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  };
}

sms.sendAsync = promisify(sms.send);

const receipt = await sms.sendAsync("+2348031234567", "Order 7 has shipped");
console.log("sent:", receipt);

try {
  await sms.sendAsync("0803", "Order 8 has shipped");
} catch (error) {
  console.log("rejected, not thrown:", error.message);
}

const detached = promisify(sms.send);   // not called as a method: no this
try {
  await detached("+2348031234567", "Order 9 has shipped");
} catch (error) {
  console.log("without this:", error.message);
}
```

Output of `node promisify.js` and of the browser terminal

```ts
sent: { id: 'msg_1', to: '+2348031234567' }
rejected, not thrown: invalid phone number: 0803
without this: Cannot read properties of undefined (reading 'apiKey')
```

The duplicate callback was ignored. The synchronous `TypeError` for the bad number became a rejection. The last call shows why `this` matters: `detached` was called on its own, so `this` was `undefined` inside `send`. Either call the promisified function as a method, as with `sms.sendAsync`, or bind it: `promisify(sms.send.bind(sms))`.

### util.promisify in Node.js

Node.js ships this helper as `util.promisify`, and most of its own callback APIs also come in a promise version already (`node:fs/promises`, `node:timers/promises`). Prefer those; write your own wrapper only for third-party SDKs.

util-promisify.jsNode.js only

```ts
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const sms = {
  apiKey: "test-key",
  send(to, text, callback) {
    setTimeout(() => callback(null, { id: "msg_1", to, key: this.apiKey }), 10);
  },
};

const send = promisify(sms.send).bind(sms);
console.log(await send("+2348031234567", "Order 7 has shipped"));

const start = Date.now();
const value = await sleep(30, "slept");
console.log(value, Date.now() - start >= 25);
```

Output of `node util-promisify.js`

```json
{ id: 'msg_1', to: '+2348031234567', key: 'test-key' }
slept true
```

### Do not wrap a promise in a new promise

Wrapping is for callbacks. When a function already returns a promise, wrapping it in `new Promise` adds nothing and usually loses errors. This pattern is common enough to have a name, the **explicit construction anti-pattern**:

construction-antipattern.jsNode.js only

```ts
const chargeCard = () => Promise.reject(new Error("card declined"));

function payWrapped() {
  return new Promise((resolve) => {
    chargeCard().then((charge) => resolve(charge));   // the rejection goes nowhere
  });
}

function pay() {
  return chargeCard();                                // just return the promise
}

process.on("unhandledRejection", (reason) => console.log("unhandled:", reason.message));

let settled = "no";
payWrapped().then(() => (settled = "yes"), () => (settled = "yes"));
pay().catch((error) => console.log("pay rejected:", error.message));

setTimeout(() => console.log("payWrapped ever settled:", settled), 50);
```

Output of `node construction-antipattern.js`

```ts
pay rejected: card declined
unhandled: card declined
payWrapped ever settled: no
```

This example uses Node's `unhandledRejection` event (explained in the next section) to show the lost error instead of crashing. `payWrapped` never calls `reject`, so when the card is declined its promise stays pending forever, and the inner rejection is unhandled. `pay` is shorter and correct. If you need to transform the value, return `chargeCard().then(…)`.

## Unhandled rejections

A rejected promise with no rejection handler is an **unhandled rejection**. JavaScript cannot know whether you will attach a handler later, so it waits until the current burst of work (the current task and its microtasks, explained in [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop)) is over and then reports it. Node.js by default treats that as a crash: it prints the error and exits with code 1, because an error nobody saw can leave a request half-done. You can watch this happen with a `process` event:

unhandled.jsNode.js only

```ts
process.on("unhandledRejection", (reason) => {
  console.log("unhandled:", reason.message);
});

const payment = Promise.reject(new Error("card declined"));

setTimeout(() => {
  payment.catch((error) => console.log("handled too late:", error.message));
}, 10);
```

Output of `node unhandled.js`

```ts
unhandled: card declined
handled too late: card declined
```

The handler was attached 10 ms later, which is too late: the rejection had already been reported. Without the `unhandledRejection` listener, Node.js would have crashed before the timer ran. The rule that follows: attach the handler (or `await`) in the same synchronous block that creates the promise. If you start a promise now and want to `await` it later, attach a handler immediately. The next lesson shows how `Promise.all` and friends do this for you.

> WATCH OUT
>
> A global `unhandledRejection` listener is a last line of defence for logging, not a way to handle errors. Log the error, then exit: the process may be in a state nobody planned for. Handle expected errors where they happen.

## Build: a checkout with three services

Now put it together. The checkout for an order must:

1. reserve the items in the inventory service;
2. charge the card with the payment SDK (callback-based);
3. send an SMS receipt with the SMS SDK (callback-based).

The business rules decide how each failure is treated. If the stock cannot be reserved, stop: nothing was charged. If the payment fails, the reserved stock must be **released** again, or it will look sold forever; this undo step is called **compensation**. If the SMS fails, the order is still paid and must succeed; record the failure so someone can resend the receipt.

checkout.js

```ts
function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (error, result) => (error ? reject(error) : resolve(result)));
    });
  };
}

export function createServices({ stock, declineCards = [], smsDown = false }) {
  const log = [];
  const inventory = {
    async reserve(items) {
      for (const { sku, qty } of items) {
        if ((stock[sku] ?? 0) < qty) throw new Error(`out of stock: ${sku}`);
      }
      for (const { sku, qty } of items) stock[sku] -= qty;
      log.push("reserved");
    },
    async release(items) {
      for (const { sku, qty } of items) stock[sku] += qty;
      log.push("released");
    },
  };
  const payments = {
    charge(card, amountKobo, callback) {
      setTimeout(() => {
        if (declineCards.includes(card)) return callback(new Error("card declined"));
        log.push("charged");
        callback(null, { id: "ch_81", amountKobo });
      }, 10);
    },
  };
  const sms = {
    send(to, text, callback) {
      setTimeout(() => (smsDown ? callback(new Error("SMS provider unavailable")) : callback(null, { id: "msg_1" })), 5);
    },
  };
  payments.chargeAsync = promisify(payments.charge);
  sms.sendAsync = promisify(sms.send);
  return { inventory, payments, sms, stock, log };
}

export async function checkout({ inventory, payments, sms }, order) {
  await inventory.reserve(order.items);

  let charge;
  try {
    charge = await payments.chargeAsync(order.card, order.totalKobo);
  } catch (error) {
    await inventory.release(order.items);
    throw new Error(`order ${order.id} not paid`, { cause: error });
  }

  const result = { orderId: order.id, chargeId: charge.id, receipt: "sent" };
  try {
    await sms.sendAsync(order.phone, `Order ${order.id} paid: ₦${order.totalKobo / 100}`);
  } catch (error) {
    result.receipt = `not sent (${error.message})`;
  }
  return result;
}
```

Each step is awaited, so a failure stops the steps after it. Payment is the only step with compensation, and it rethrows with a `cause` so the caller learns both what failed and why. The SMS `catch` does not rethrow: that is a deliberate recovery, written down in the result, not a swallowed error.

### Testing every path

Asynchronous code needs tests that `await` the result; a test that does not wait passes before anything has happened. Each test below builds fresh fake services, so no test can affect another:

checkout-test.js

```ts
import { createServices, checkout } from "./checkout.js";

const order = {
  id: 7,
  items: [{ sku: "rice-5kg", qty: 2 }],
  card: "4111",
  phone: "+2348031234567",
  totalKobo: 1_900_000,
};

async function test(name, run) {
  try {
    console.log(`PASS ${name}: ${await run()}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

await test("happy path", async () => {
  const s = createServices({ stock: { "rice-5kg": 5 } });
  const result = await checkout(s, order);
  return `${result.chargeId}, receipt ${result.receipt}, stock left ${s.stock["rice-5kg"]}`;
});

await test("out of stock charges nothing", async () => {
  const s = createServices({ stock: { "rice-5kg": 1 } });
  const error = await checkout(s, order).then(() => null, (e) => e);
  if (!error) throw new Error("expected a rejection");
  return `${error.message}, log [${s.log}]`;
});

await test("declined card releases the stock", async () => {
  const s = createServices({ stock: { "rice-5kg": 5 }, declineCards: ["4111"] });
  const error = await checkout(s, order).then(() => null, (e) => e);
  return `${error.message} because ${error.cause.message}, stock back to ${s.stock["rice-5kg"]}, log [${s.log}]`;
});

await test("SMS failure still completes the order", async () => {
  const s = createServices({ stock: { "rice-5kg": 5 }, smsDown: true });
  const result = await checkout(s, order);
  return `${result.chargeId}, receipt ${result.receipt}`;
});
```

Output of `node checkout-test.js` and of the browser terminal

```ts
PASS happy path: ch_81, receipt sent, stock left 3
PASS out of stock charges nothing: out of stock: rice-5kg, log []
PASS declined card releases the stock: order 7 not paid because card declined, stock back to 5, log [reserved,released]
PASS SMS failure still completes the order: ch_81, receipt not sent (SMS provider unavailable)
```

The helper `.then(() => null, (e) => e)` turns "rejected with `e`" into "fulfilled with `e`", so a test can inspect the error, and turns an unexpected success into `null`, which the test checks. Test runners have this built in: `await assert.rejects(promise, /…/)` in `node:test`, `await expect(promise).rejects.toThrow("…")` in Vitest, both covered in [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics).

## Promises in production

- **Every promise is awaited, returned or handled.** A floating promise loses its errors and its timing. Turn on the linter rule that finds them.
- **Promisify once, at the edge.** Wrap each callback SDK in one module; the rest of the code only sees promises. Prefer built-in promise APIs (`node:fs/promises`) where they exist.
- **A catch either fixes the problem or rethrows.** Logging alone turns a failure into a success with `undefined`. When you rethrow, add context with `{ cause }`.
- **Know which steps need compensation.** When step 2 fails after step 1 changed something, undo step 1, and test that path, not only the happy one.
- **A promise has no time limit.** A service that never answers leaves your promise pending forever. Every call that leaves your process needs a timeout: the [next lesson](https://zudojs.oyinlola.site/learn/js-promise-combinators) builds one.
- **Let unhandled rejections crash, and log them.** Node's default is right. A process that keeps running after an error nobody handled is harder to trust than one that restarts.

## Practice

TRY IT YOURSELF

### Predict the chain

Without running it, write down what this prints. Then run it and explain every line with the five rules from [Chaining](#chaining).

predict.js

```ts
Promise.resolve(2)
  .then((n) => n * 10)
  .then((n) => { if (n > 10) throw new Error(`too big: ${n}`); return n; })
  .then((n) => console.log("A", n))
  .catch((error) => { console.log("B", error.message); return 5; })
  .then((n) => console.log("C", n))
  .finally(() => console.log("D"))
  .then((n) => console.log("E", n));
```

Output of `node predict.js` and of the browser terminal

```ts
B too big: 20
C 5
D
E undefined
```

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

Walk down the chain one link at a time, tracking whether the promise at that point is fulfilled or rejected. A `.then(onFulfilled)` with no second argument is skipped entirely when the promise is rejected — it does not run and does not "clear" the rejection.

HINT 2

`20 > 10`, so the second step throws, and the chain becomes rejected before the `A` handler. `.catch` logs `B` and returns `5`, which re-fulfils the chain, so `C` runs; its handler returns nothing, and `.finally` passes that `undefined` straight through to the last `.then`.

SOLUTION

`2` becomes `20`. The next step throws because `20 > 10`, so the chain is rejected. `A` has no rejection handler and is skipped. The `catch` prints `B too big: 20` and returns `5`, which fulfils the chain again, so `C 5` runs. `C`'s handler returns nothing, so the chain is now fulfilled with `undefined`. `finally` prints `D` and passes that `undefined` through, so the last line is `E undefined`.

TRY IT YOURSELF

### Promisify with several results

A warehouse SDK calls back with *three* values: `callback(error, sku, quantity, location)`. Write `promisifyMany(fn)` that fulfils with an array of all result values, keeps `this`, and turns a synchronous throw into a rejection. Test it on a success, an error and a synchronous throw.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

The callback now takes a rest parameter for everything after the error: `(error, ...results) => ...`. Resolve with the `results` array itself, not a single value.

HINT 2

`function promisifyMany(fn) { return function (...args) { return new Promise((resolve, reject) => { fn.call(this, ...args, (error, ...results) => (error ? reject(error) : resolve(results))); }); }; }`

SOLUTION

promisify-many.js

```ts
function promisifyMany(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (error, ...results) => (error ? reject(error) : resolve(results)));
    });
  };
}

const warehouse = {
  site: "Ikeja",
  locate(sku, callback) {
    if (typeof sku !== "string") throw new TypeError("sku must be a string");
    setTimeout(() => {
      if (sku === "oil-1l") return callback(new Error(`${sku} not stocked in ${this.site}`));
      callback(null, sku, 12, `${this.site} aisle 4`);
    }, 10);
  },
};
warehouse.locateAsync = promisifyMany(warehouse.locate);

console.log(await warehouse.locateAsync("rice-5kg"));
for (const sku of ["oil-1l", 42]) {
  try {
    await warehouse.locateAsync(sku);
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `node promisify-many.js` and of the browser terminal

```json
[ 'rice-5kg', 12, 'Ikeja aisle 4' ]
Error: oil-1l not stocked in Ikeja
TypeError: sku must be a string
```

The rest parameter `...results` collects every value after the error. Because the SDK is called inside the executor, the `TypeError` thrown for `42` became a rejection like the others, and `fn.call(this, …)` kept `this.site` working.

TRY IT YOURSELF

### Find the lost error

This function is supposed to fail when the order cannot be saved, but the caller always sees success. Find the two bugs, fix them, and show that the caller now sees the error.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

A `.then` handler with a block body and no `return` throws its result away. A promise whose rejection nothing is attached to yet is not "handled" until something returns it up the chain.

HINT 2

Bug 1: `.then((o) => saveOrder(o))` — return it. Bug 2: inside `.catch`, after logging, add `throw error;` so the rejection continues past the `catch` instead of turning into a fulfilled chain.

SOLUTION

lost-error.jsNode.js only

```ts
const saveOrder = (order) => Promise.reject(new Error(`database is read-only, order ${order.id} not saved`));

function placeOrder(order) {
  return Promise.resolve(order)
    .then((o) => { saveOrder(o); })
    .catch((error) => console.log("could not save:", error.message))
    .then(() => "order placed");
}

process.on("unhandledRejection", (reason) => console.log("unhandled:", reason.message));
placeOrder({ id: 7 }).then((message) => console.log("caller sees:", message));
```

Output of `node lost-error.js`

```ts
caller sees: order placed
unhandled: database is read-only, order 7 not saved
```

Bug 1: the first handler has braces and no `return`, so `saveOrder`'s promise floats and its rejection never reaches the chain. Bug 2: the `catch` only logs, which turns the failure into a success. Return the promise, and rethrow after logging:

lost-error-fixed.js

```ts
const saveOrder = (order) => Promise.reject(new Error(`database is read-only, order ${order.id} not saved`));

function placeOrder(order) {
  return Promise.resolve(order)
    .then((o) => saveOrder(o))
    .catch((error) => {
      console.log("could not save:", error.message);
      throw error;
    })
    .then(() => "order placed");
}

placeOrder({ id: 7 }).then(
  (message) => console.log("caller sees:", message),
  (error) => console.log("caller sees the failure:", error.message),
);
```

Output of `node lost-error-fixed.js` and of the browser terminal

```ts
could not save: database is read-only, order 7 not saved
caller sees the failure: database is read-only, order 7 not saved
```

## Recap

- Callbacks hand control of your code to someone else's (inversion of control): they can call you twice, never, or at unpredictable times. A promise gives control back.
- A promise settles once, never has both a value and a reason, always runs handlers later, and still runs handlers attached after it settled.
- `resolve(otherPromise)` makes a promise follow the other one (adoption): it is resolved but may still be pending, and it can still end up rejected. A throw in the executor rejects.
- `then` returns a new promise. Returning a value fulfils it, throwing rejects it, returning a promise makes it follow that promise. Forgetting to return leaves a floating promise.
- Rejections skip down to the next rejection handler. A handler that returns recovers; one that throws keeps failing. `finally` passes the result through unless it throws.
- Anything with a `then` method is a thenable and is adopted, including by accident.
- Promisify callback APIs once, at the edge: call the SDK inside the executor, keep `this`, reject on error. Handle every rejection in the same block that creates the promise.

Next: [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators), where you run many promises at once, put time limits on slow services, and choose between parallel, sequential and batched work.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
