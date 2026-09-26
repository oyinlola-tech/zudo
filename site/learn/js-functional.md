---
title: "Functional JavaScript — ZudoJS Academy"
description: "Turn a tangled checkout function into a pipeline of small pure steps, with immutable updates, composition, currying and partial application, and test each step."
source: https://zudojs.oyinlola.site/learn/js-functional
---

LEVEL 4 · LESSON 12 OF 20

Functional JavaScript Core

# Functional JavaScript

Turn a tangled checkout function into a pipeline of small pure steps, with immutable updates, composition, currying and partial application, and test each step.

- **55 min** to read and try
- **You need:** Functions, Arrays, Closures in depth and Iterables and iterators
- **You build:** A checkout pipeline of pure, composable steps (pricing, promotions, VAT, delivery) behind a thin imperative shell, with tests that prove it is pure

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell pure from impure code by finding hidden inputs and hidden outputs, and move side effects to the edges
- Update nested data immutably and explain what structural sharing keeps
- Build pipelines with compose and pipe, and reason about the order of steps
- Curry and partially apply functions, and choose argument order so they compose
- Recognise when point-free style helps and when it causes bugs such as map(parseInt)
- Build and test a checkout pipeline with a functional core and an imperative shell

## A checkout that changes its mind

A shop's checkout function started small and grew. It now prices the cart, applies a promotion, adds VAT, adds delivery, and logs the result. A condensed version:

problem.js

```ts
let promoActive = true;
const VAT_RATE = 0.075;

function checkout(cart) {
  if (promoActive) {
    for (const line of cart.lines) line.priceKobo = Math.round(line.priceKobo * 0.9);
  }
  let total = 0;
  for (const line of cart.lines) total += line.priceKobo * line.qty;
  total = Math.round(total * (1 + VAT_RATE));
  if (new Date().getUTCHours() >= 18) total += 150000;
  else total += 100000;
  cart.total = total;
  console.log("checked out", cart.id);
  return total;
}

const cart = { id: "CART-1", lines: [{ sku: "RICE-5", qty: 2, priceKobo: 850000 }] };
const first = checkout(cart);
const second = checkout(cart);
console.log(first === second, cart.lines[0].priceKobo);
```

Output of `node problem.js` and of the browser terminal

```ts
checked out CART-1
checked out CART-1
false 688500
```

Calling `checkout` twice on the same cart gave two different totals, and the rice now costs ₦6,885 instead of ₦8,500. The function has several problems, and they have one root: it depends on things that are not its arguments, and it changes things that are not its result.

- It **mutates** the cart: each call discounts the prices again.
- It reads a global flag, `promoActive`, that any code can change.
- It reads the clock, so the delivery fee depends on when the test runs. (That is also why this page does not show you the total itself: it changes with the time of day.)
- It logs, so it cannot be called "just to see the total" without writing to the log.
- Pricing, promotion, VAT and delivery are welded together. The invoice page needs the VAT calculation alone and cannot reuse it.

**Functional programming** is a style that attacks exactly these problems: build programs from functions that depend only on their arguments and only produce a return value, keep data unchanged, and combine small functions into bigger ones. JavaScript is not a purely functional language, and you will not write it as one. But its functions are values, and the techniques in this lesson make business logic easier to test, reuse and trust. At the end, you rebuild this checkout as a pipeline.

## Pure functions, precisely

[Functions](https://zudojs.oyinlola.site/learn/js-functions#pure) defined a **pure function**: same arguments, same result, and no side effects. A useful way to check any function is to list its **inputs** and **outputs**, including the hidden ones:

| Hidden inputs (make results vary) | Hidden outputs (side effects) |
| --- | --- |
| Global or module variables that can change | Changing an argument (mutation) |
| The clock: `Date.now()`, `new Date()` | Changing a global or module variable |
| Randomness: `Math.random()`, `crypto.randomUUID()` | Logging, printing |
| Environment and configuration read inside the function | Network requests, database writes, files |
| Data fetched from a database or API | Throwing is *not* a side effect in this sense, but it is an output: document it |

A pure function has none of the left column and none of the right. Its only input is its parameters and its only output is its return value. That gives it a property called **referential transparency**: any call can be replaced by its result without changing the program. `add(2, 3)` can be replaced by `5` everywhere. `checkout(cart)` cannot be replaced by anything, because it does different things every time.

### Turning hidden inputs into parameters

The fix for a hidden input is almost always the same: make it a parameter. The delivery fee depends on the time, so the time becomes an argument, and the caller decides where it comes from:

delivery.js

```ts
function deliveryFeeKobo(orderedAt) {
  return orderedAt.getUTCHours() >= 18 ? 150000 : 100000;
}

console.log(deliveryFeeKobo(new Date("2026-09-24T09:00:00Z")));
console.log(deliveryFeeKobo(new Date("2026-09-24T19:30:00Z")));
console.log(deliveryFeeKobo(new Date("2026-09-24T17:59:59Z")));
```

Output of `node delivery.js` and of the browser terminal

```ts
100000
150000
100000
```

The function is now pure, and testing the 18:00 boundary takes three lines instead of waiting for the evening. You saw the same move in [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#reason), where the transfer limit received a `today` function. Production code passes `new Date()`; tests pass fixed dates.

### A functional core and an imperative shell

A real program must have side effects; a checkout that never saves the order is useless. The goal is not to remove them but to *push them to the edges*. A common architecture is called **functional core, imperative shell**:

```ts
  request ──► ┌──────────────────── imperative shell ────────────────────┐
              │ read clock, load catalog, read promo settings            │
              │           │                                              │
              │           ▼                                              │
              │   ┌──────────── functional core (pure) ─────────────┐    │
              │   │ price lines → apply promo → VAT → delivery      │    │
              │   │ same input, same output; no I/O; easy to test   │    │
              │   └─────────────────────────────────────────────────┘    │
              │           │                                              │
              │           ▼                                              │
              │ save order, log, send receipt                            │
              └──────────────────────────────────────────────────────────┘ ──► response
```

The shell gathers every input and performs every effect; the core only computes.

The core holds the business rules, where bugs are expensive, and it is pure, so it is cheap to test thoroughly. The shell is thin and boring, and a few integration tests cover it. The [build](#build) follows this shape.

## Immutability without pain

The first checkout discounted the prices *in* the cart. The functional alternative is to never change the data you were given, and to return new data instead. This is **immutability**. [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#mutability) explained why shared objects make mutation dangerous; here is how to work without it day to day.

### Immutable updates to nested data

Changing one line's quantity in a cart means building a new line, a new `lines` array and a new cart, while reusing everything that did not change. Spread ([Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern#spread-rest)) and `map` do the work:

update.js

```ts
const cart = Object.freeze({
  id: "CART-1",
  customer: Object.freeze({ name: "Ada", city: "Lagos" }),
  lines: Object.freeze([
    Object.freeze({ sku: "RICE-5", qty: 2 }),
    Object.freeze({ sku: "OIL-1", qty: 1 }),
  ]),
});

function setQty(cart, sku, qty) {
  return {
    ...cart,
    lines: cart.lines.map((line) => (line.sku === sku ? { ...line, qty } : line)),
  };
}

const updated = setQty(cart, "OIL-1", 3);

console.log(cart.lines[1].qty, updated.lines[1].qty);
console.log("cart replaced:", updated !== cart);
console.log("lines replaced:", updated.lines !== cart.lines);
console.log("rice line shared:", updated.lines[0] === cart.lines[0]);
console.log("customer shared:", updated.customer === cart.customer);
```

Output of `node update.js` and of the browser terminal

```ts
1 3
cart replaced: true
lines replaced: true
rice line shared: true
customer shared: true
```

Only the objects on the path to the change were copied: the cart, its `lines` array, and the oil line. The rice line and the customer are the *same objects* in both versions. Reusing unchanged parts like this is called **structural sharing**, and it is why immutable updates are cheaper than they look: the cost is proportional to the depth of the change, not the size of the data. Freezing the original ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#locking)) proves the function never tried to change it: in a module, any write to a frozen object would have thrown.

### The non-mutating array methods

Some old array methods change the array in place: `sort`, `reverse`, `splice`, and assignment to an index. Since ES2023 each has a copying twin: `toSorted`, `toReversed`, `toSpliced` and `with(index, value)`:

copying-methods.js

```ts
const queue = Object.freeze(["ORD-3", "ORD-1", "ORD-2"]);

console.log(queue.toSorted());
console.log(queue.toReversed());
console.log(queue.toSpliced(1, 1));
console.log(queue.with(0, "ORD-9"));
console.log(queue);

try {
  queue.sort();
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node copying-methods.js` and of the browser terminal

```json
[ 'ORD-1', 'ORD-2', 'ORD-3' ]
[ 'ORD-2', 'ORD-1', 'ORD-3' ]
[ 'ORD-3', 'ORD-2' ]
[ 'ORD-9', 'ORD-1', 'ORD-2' ]
[ 'ORD-3', 'ORD-1', 'ORD-2' ]
TypeError: Cannot assign to read only property '0' of object '[object Array]'
```

### The cost of copying in a loop

Immutability has one real trap. Building a result by copying it on every step of a loop copies everything built so far, each time. Grouping 1,000 orders by city this way performs about half a million property copies:

copy-cost.js

```ts
const orders = Array.from({ length: 1000 }, (_, i) => ({ id: `ORD-${i}`, city: ["Lagos", "Abuja", "Kano"][i % 3] }));

let copiedItems = 0;
const slow = orders.reduce((groups, order) => {
  copiedItems += Object.values(groups).reduce((n, list) => n + list.length, 0);
  return { ...groups, [order.city]: [...(groups[order.city] ?? []), order] };
}, {});
console.log("copying every step:", copiedItems, "items copied");

const fast = Object.groupBy(orders, (order) => order.city);
console.log(Object.keys(fast), fast.Lagos.length === slow.Lagos.length);
```

Output of `node copy-cost.js` and of the browser terminal

```ts
copying every step: 499500 items copied
[ 'Lagos', 'Abuja', 'Kano' ] true
```

That is O(n²) work ([Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity)) for an O(n) job. The rule that keeps both safety and speed: **a function may mutate data it created itself**, as long as nothing outside can see it before it returns. `Object.groupBy` (ES2024) does exactly that inside, and a plain loop that pushes into a local `Map` would too. Purity is about what callers can observe, not about never using `push`.

## Functions as data

A **first-class** value is one you can store in a variable, put in an array, pass as an argument and return from a function. In JavaScript, functions are first-class ([Functions](https://zudojs.oyinlola.site/learn/js-functions#callbacks)), and a function that takes or returns functions is **higher-order**. You know `map` and `filter`. The more powerful idea is to treat *business rules* as data: a list of functions that you can add to, remove from, and test one at a time.

A shop has several promotions. Instead of an `if` chain inside the checkout, each promotion is a function from an order to a discount, and the rules live in an array:

rules.js

```ts
const promotions = [
  { name: "RICE10", discount: (order) => order.lines.filter((l) => l.sku === "RICE-5").reduce((sum, l) => sum + Math.round(l.priceKobo * l.qty * 0.1), 0) },
  { name: "BIG-BASKET", discount: (order) => (order.subtotalKobo >= 5000000 ? 250000 : 0) },
  { name: "FIRST-ORDER", discount: (order) => (order.customer.orders === 0 ? 100000 : 0) },
];

function bestPromotion(order, rules) {
  return rules
    .map((rule) => ({ name: rule.name, kobo: rule.discount(order) }))
    .filter((result) => result.kobo > 0)
    .reduce((best, result) => (result.kobo > best.kobo ? result : best), { name: "none", kobo: 0 });
}

const order = {
  customer: { orders: 0 },
  subtotalKobo: 5700000,
  lines: [{ sku: "RICE-5", qty: 2, priceKobo: 850000 }, { sku: "TV-32", qty: 1, priceKobo: 4000000 }],
};

const smallOrder = { ...order, subtotalKobo: 1700000, lines: order.lines.slice(0, 1) };

console.log(bestPromotion(order, promotions));
console.log(bestPromotion(smallOrder, promotions));
console.log(bestPromotion(smallOrder, promotions.filter((rule) => rule.name !== "RICE10")));
```

Output of `node rules.js` and of the browser terminal

```json
{ name: 'BIG-BASKET', kobo: 250000 }
{ name: 'RICE10', kobo: 170000 }
{ name: 'FIRST-ORDER', kobo: 100000 }
```

Adding a promotion is adding an object to an array; no existing code changes. Each rule is a pure function you can test alone. And because the rules are data, a test (or a feature flag) can pass a different list, as the third call does: with the rice promotion switched off, the first-order discount wins. This is the **strategy** idea from [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#delegation), done with plain functions; that lesson also applied pricing rules from an array with `reduce`, which the next section turns into a general tool.

## Composition and pipelines

**Composition** means building a function out of other functions, where each one's output is the next one's input. With two functions `f` and `g`, "g after f" is `(x) => g(f(x))`. With many, nesting becomes unreadable: `round(addDelivery(addVat(applyPromo(price(cart)))))` must be read from the inside out.

Two small helpers fix the reading order. `pipe` runs functions left to right, in the order they happen; `compose` runs them right to left, like the nested form, as in mathematics. Both are one `reduce`:

pipe.js

```ts
export const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);
export const compose = (...fns) => (input) => fns.reduceRight((value, fn) => fn(value), input);
```

use-pipe.js

```ts
import { compose, pipe } from "./pipe.js";

const addVat = (kobo) => Math.round(kobo * 1.075);
const minusVoucher = (kobo) => Math.max(kobo - 200000, 0);
const toNaira = (kobo) => `₦${(kobo / 100).toFixed(2)}`;

const priceLabel = pipe(minusVoucher, addVat, toNaira);
const sameThing = compose(toNaira, addVat, minusVoucher);

console.log(priceLabel(1700000), sameThing(1700000));
console.log(toNaira(addVat(minusVoucher(1700000))));
```

Output of `node use-pipe.js` and of the browser terminal

```ts
₦16125.00 ₦16125.00
₦16125.00
```

This course uses `pipe`, because a pipeline reads like the checkout steps in order. A **pipeline** is exactly this: data flowing through a fixed sequence of transformations, like the generator pipelines in [Generators](https://zudojs.oyinlola.site/learn/js-generators#lazy), except that each step here handles the whole value at once.

### Order is a business decision

Composition makes the order of steps explicit, which exposes decisions that were hidden in the old function. Is the voucher taken off before or after VAT? The answer changes the price, and it is a question for the finance team, not a detail:

order-matters.js

```ts
import { pipe } from "./pipe.js";

const addVat = (kobo) => Math.round(kobo * 1.075);
const minusVoucher = (kobo) => Math.max(kobo - 200000, 0);

const voucherFirst = pipe(minusVoucher, addVat);
const vatFirst = pipe(addVat, minusVoucher);

console.log(voucherFirst(1700000), vatFirst(1700000));
```

Output of `node order-matters.js` and of the browser terminal

```ts
1612500 1627500
```

Taking the voucher off first means the customer pays VAT on less: ₦150 less in total. In Nigeria, as in most countries, VAT is charged on the amount actually paid, so a voucher the shop funds normally comes off first. With a pipeline, that rule is one visible line, and a test can pin it.

### Every step must fit the next

Composition only works when each function takes one argument and returns what the next function expects. Real steps need more: the VAT *rate*, the voucher *amount*. The next section is about turning many-argument functions into one-argument steps.

## Currying and partial application

A tax calculator needs a rate and an amount. You want `addVat` for Nigeria (7.5%), for Ghana (15%), and so on, each a one-argument function that fits in a pipeline. There are two related techniques:

- **Partial application**: take a function of several arguments, fix some of them now, and get back a function of the rest. You met it in [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#factories).
- **Currying**: write (or convert) a function of several arguments as a chain of one-argument functions: `f(a, b, c)` becomes `f(a)(b)(c)`. Each call returns the next function until all arguments are in.

curry-by-hand.js

```ts
const addTax = (rate) => (kobo) => Math.round(kobo * (1 + rate));
const percentOff = (percent) => (kobo) => Math.round(kobo * (1 - percent / 100));

const addVatNigeria = addTax(0.075);
const addVatGhana = addTax(0.15);
const blackFriday = percentOff(20);

console.log(addVatNigeria(1000000), addVatGhana(1000000));
console.log([850000, 320000, 20000].map(blackFriday));
console.log(addTax(0.075)(1000000));
```

Output of `node curry-by-hand.js` and of the browser terminal

```ts
1075000 1150000
[ 680000, 256000, 16000 ]
1075000
```

`addTax` is curried by hand: an arrow returning an arrow. Calling it with a rate gives a configured function; calling that with an amount gives the result. Each configured function is a closure over its `rate`, and each is a perfect pipeline step.

### Argument order: configuration first, data last

Currying only helps if the argument you know *early* comes first. The rate is known when the program starts; the amount only arrives with each order. So the rule for functions you intend to curry or compose is **configuration first, data last**. A function written as `addTax(kobo, rate)` cannot be partially applied into a pipeline step without a wrapper.

### A general curry, and its limits

You can write a helper that curries any function. It collects arguments until it has as many as the function declares, using `fn.length`, the number of declared parameters:

curry.js

```ts
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn(...args);
    return (...more) => curried(...args, ...more);
  };
}

const lineTotal = curry((vatRate, discountPercent, priceKobo, qty) =>
  Math.round(priceKobo * qty * (1 - discountPercent / 100) * (1 + vatRate)),
);

const nigeriaNoDiscount = lineTotal(0.075, 0);
const nigeriaStaff = lineTotal(0.075)(15);

console.log(nigeriaNoDiscount(850000, 2), nigeriaStaff(850000, 2), lineTotal(0.075, 15, 850000)(2));

const withDefault = curry((kobo, rate = 0.075) => Math.round(kobo * (1 + rate)));
console.log(withDefault.length, typeof withDefault(1000));
console.log(((a, b = 1) => a).length, ((...all) => all).length);
```

Output of `node curry.js` and of the browser terminal

```ts
1827500 1553375 1553375
0 number
1 0
```

The curried `lineTotal` accepts its arguments one at a time or several at once. But look at the last lines: `fn.length` stops counting at the first parameter with a default value, and a rest parameter counts as 0. So `curry` saw a function of one argument and called it as soon as it had `1000`, using the default rate. Generic `curry` is fragile around defaults and rest parameters; hand-written curried functions like `addTax` say exactly what they mean, and are what most JavaScript codebases use.

### Partial application with bind and a helper

When a function is not curried and you only want to fix its first arguments, `bind` does it (it also fixes `this`, from [this in depth](https://zudojs.oyinlola.site/learn/js-this#explicit); pass `null` when there is none). A small `partial` helper does the same without the `this` argument:

partial.js

```ts
function shippingKobo(zoneRates, city, weightKg) {
  const rate = zoneRates[city] ?? zoneRates.default;
  return rate.baseKobo + Math.ceil(weightKg) * rate.perKgKobo;
}

const partial = (fn, ...preset) => (...rest) => fn(...preset, ...rest);

const ZONES = {
  Lagos: { baseKobo: 100000, perKgKobo: 20000 },
  default: { baseKobo: 250000, perKgKobo: 50000 },
};

const shipWithOurRates = partial(shippingKobo, ZONES);
const shipToLagos = shippingKobo.bind(null, ZONES, "Lagos");

console.log(shipWithOurRates("Kano", 2.2), shipToLagos(2.2), shipToLagos(0.5));
```

Output of `node partial.js` and of the browser terminal

```ts
400000 160000 120000
```

Both fixed the rate table once; `shipToLagos` also fixed the city. Partial application is the everyday tool; currying is the same idea taken to one argument at a time.

## Point-free style, used sensibly

**Point-free** style means passing a function directly instead of wrapping it in an arrow that only forwards its argument: `prices.map(toNaira)` instead of `prices.map((kobo) => toNaira(kobo))`. The name comes from mathematics, where the "points" are the arguments. It can read beautifully. It also causes two classic bugs, because the callback receives *every* argument `map` passes, and loses its `this`:

point-free-traps.js

```ts
const quantities = ["10", "10", "10"];
console.log(quantities.map(parseInt));
console.log(quantities.map((text) => parseInt(text, 10)));
console.log(quantities.map(Number));

const cart = {
  items: [],
  add(sku) {
    this.items.push(sku);
  },
};
try {
  ["RICE-5", "OIL-1"].forEach(cart.add);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
["RICE-5", "OIL-1"].forEach((sku) => cart.add(sku));
console.log(cart.items);
```

Output of `node point-free-traps.js` and of the browser terminal

```json
[ 10, NaN, 2 ]
[ 10, 10, 10 ]
[ 10, 10, 10 ]
TypeError: Cannot read properties of undefined (reading 'items')
[ 'RICE-5', 'OIL-1' ]
```

- `map` calls its callback with `(item, index, array)`, and `parseInt` takes `(text, radix)`. So the calls were `parseInt("10", 0)` (radix 0 means "guess": 10), `parseInt("10", 1)` (radix 1 is invalid: `NaN`) and `parseInt("10", 2)` (binary: 2).
- `cart.add` passed as a value is just the function; called by `forEach` without an object, its `this` is `undefined`.

Guidelines that keep the benefits without the bugs:

- Pass a function directly when you wrote it to take exactly one argument and it does not use `this`: `map(toNaira)`, `filter(isPaid)`, `pipe(addVat, toNaira)`.
- Wrap it in an arrow when it has optional extra parameters that `map`'s index could fill (`parseInt`'s radix is the famous one), or when it is a method that needs its `this`.
- If a point-free chain needs a comment to explain it, write the arrow. Readability wins over cleverness.

## Before you build: the checkout pipeline

REASON IT OUT

### Design a pure checkout

You will rebuild the checkout from the start of the lesson. Before reading the code, decide:

- List every input the checkout needs. Which of them did the old function read from hidden places?
- What are the steps, in which order, and what does each one receive and return?
- Where does money get rounded? What happens if each step rounds, versus rounding once?
- What should happen when the cart contains a SKU that is not in the catalog, or a quantity of 0 or -1?
- How will a test prove the core is pure?

**Show the reasoning**

- **Inputs**: the cart (SKUs and quantities), the catalog (prices), the promotion rules, the VAT rate, the delivery rules and the order time. The old version read the promotion flag, the VAT rate and the time from hidden places, and took prices from the cart, where a client could have changed them. The core receives all of these as data.
- **Steps**: validate lines → price lines from the catalog → choose the best promotion → add VAT on the discounted amount → add delivery → summarise. Each step takes a *quote* object and returns a new quote with more fields, so every step has the same shape and `pipe` can join them.
- **Rounding**: every amount is kept in whole kobo, and each step that multiplies rounds its own result once. Rounding in one agreed place per calculation keeps the numbers identical to what the invoice shows; rounding at random points makes totals drift by a kobo or two.
- **Bad lines**: an unknown SKU or a quantity that is not a whole number above 0 makes the checkout fail with a clear error before any money is calculated. Silently dropping a line would charge the customer for a different cart than the one they saw.
- **Proving purity**: freeze the input (any mutation throws), run the pipeline twice and compare the results, and check that nothing was logged. Then test the time-dependent step with fixed dates.

## Build: a checkout pipeline

The project gets the same one-line `pipe` as before:

pipe.js

```ts
export const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);
```

The core is a set of small, curried steps. Each takes its configuration first and returns a function from quote to quote:

checkout-core.js

```ts
import { pipe } from "./pipe.js";

export const validateLines = (catalog) => (quote) => {
  for (const line of quote.lines) {
    if (!Object.hasOwn(catalog, line.sku)) throw new RangeError(`unknown product ${line.sku}`);
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new RangeError(`bad quantity ${line.qty} for ${line.sku}`);
  }
  return quote;
};

export const priceLines = (catalog) => (quote) => {
  const lines = quote.lines.map((line) => ({ ...line, priceKobo: catalog[line.sku], totalKobo: catalog[line.sku] * line.qty }));
  return { ...quote, lines, subtotalKobo: lines.reduce((sum, line) => sum + line.totalKobo, 0) };
};

export const applyBestPromotion = (rules) => (quote) => {
  const best = rules
    .map((rule) => ({ name: rule.name, kobo: Math.min(rule.discount(quote), quote.subtotalKobo) }))
    .reduce((top, next) => (next.kobo > top.kobo ? next : top), { name: null, kobo: 0 });
  return { ...quote, promotion: best.name, discountKobo: best.kobo };
};

export const addVat = (rate) => (quote) => ({
  ...quote,
  vatKobo: Math.round((quote.subtotalKobo - quote.discountKobo) * rate),
});

export const addDelivery = (feeFor) => (quote) => ({ ...quote, deliveryKobo: feeFor(quote) });

export const summarise = (quote) => ({
  ...quote,
  totalKobo: quote.subtotalKobo - quote.discountKobo + quote.vatKobo + quote.deliveryKobo,
});

export const createCheckout = ({ catalog, promotions, vatRate, deliveryFee }) =>
  pipe(validateLines(catalog), priceLines(catalog), applyBestPromotion(promotions), addVat(vatRate), addDelivery(deliveryFee), summarise);
```

Every step is pure, and `createCheckout` is partial application at the scale of a whole feature: it takes the shop's configuration once and returns a single function from quote to quote. The discount is capped at the subtotal, so a promotion can never make a total negative. Delivery depends on the order time, so the time is part of the quote, not read from a clock. Now the shell, which gathers inputs and performs effects:

checkout-shell.js

```ts
import { createCheckout } from "./checkout-core.js";

export function createCheckoutService({ loadCatalog, loadPromotions, clock, saveOrder, log }) {
  return function checkout(cart) {
    const checkoutQuote = createCheckout({
      catalog: loadCatalog(),
      promotions: loadPromotions(),
      vatRate: 0.075,
      deliveryFee: (quote) => (quote.orderedAt.getUTCHours() >= 18 ? 150000 : 100000),
    });
    const quote = checkoutQuote({ cartId: cart.id, lines: cart.lines, orderedAt: clock() });
    saveOrder(quote);
    log(`checked out ${cart.id}: ${quote.totalKobo} kobo`);
    return quote;
  };
}
```

main.js

```ts
import { createCheckoutService } from "./checkout-shell.js";

const CATALOG = { "RICE-5": 850000, "OIL-1": 320000, "TV-32": 4000000 };
const PROMOTIONS = [
  { name: "RICE10", discount: (q) => q.lines.filter((l) => l.sku === "RICE-5").reduce((s, l) => s + Math.round(l.totalKobo * 0.1), 0) },
  { name: "BIG-BASKET", discount: (q) => (q.subtotalKobo >= 5000000 ? 250000 : 0) },
];

const saved = [];
const checkout = createCheckoutService({
  loadCatalog: () => CATALOG,
  loadPromotions: () => PROMOTIONS,
  clock: () => new Date("2026-09-24T19:05:00Z"),
  saveOrder: (quote) => saved.push(quote),
  log: console.log,
});

const cart = Object.freeze({ id: "CART-1", lines: Object.freeze([Object.freeze({ sku: "RICE-5", qty: 2 }), Object.freeze({ sku: "OIL-1", qty: 1 })]) });
const first = checkout(cart);
const second = checkout(cart);

const { subtotalKobo, promotion, discountKobo, vatKobo, deliveryKobo, totalKobo } = first;
console.log({ subtotalKobo, promotion, discountKobo, vatKobo, deliveryKobo, totalKobo });
console.log("same total twice:", first.totalKobo === second.totalKobo, "saved:", saved.length);
```

Output of `node main.js` and of the browser terminal

```ts
checked out CART-1: 2138750 kobo
checked out CART-1: 2138750 kobo
{
  subtotalKobo: 2020000,
  promotion: 'RICE10',
  discountKobo: 170000,
  vatKobo: 138750,
  deliveryKobo: 150000,
  totalKobo: 2138750
}
same total twice: true saved: 2
```

The same frozen cart, checked out twice, gave the same total both times, and the cart was never changed (a write would have thrown). The only effects, saving and logging, happen in the shell, through functions that were passed in. In a ZudoJS service, those would be a repository and a logger resolved from the container; the core would not change at all.

### Testing the core

Because every step is a pure function, tests are plain calls with plain data. No fake database, no fake clock, no setup:

checkout.test.js

```ts
import { addDelivery, addVat, applyBestPromotion, createCheckout, priceLines, validateLines } from "./checkout-core.js";

function check(label, run, expected) {
  let actual;
  try {
    actual = run();
  } catch (error) {
    actual = `${error.name}: ${error.message}`;
  }
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${same ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

const catalog = { "RICE-5": 850000, "SALT": 20000 };
const base = { lines: [{ sku: "RICE-5", qty: 2 }], orderedAt: new Date("2026-09-24T09:00:00Z") };
const flatFee = () => 100000;

check("prices from the catalog", () => priceLines(catalog)(base).subtotalKobo, 1700000);
check("ignores a price sent by the client", () => priceLines(catalog)({ lines: [{ sku: "SALT", qty: 1, priceKobo: 1 }] }).lines[0].priceKobo, 20000);
check("unknown product", () => validateLines(catalog)({ lines: [{ sku: "TV-99", qty: 1 }] }), "RangeError: unknown product TV-99");
check("zero quantity", () => validateLines(catalog)({ lines: [{ sku: "SALT", qty: 0 }] }), "RangeError: bad quantity 0 for SALT");
check("inherited key is not a product", () => validateLines(catalog)({ lines: [{ sku: "toString", qty: 1 }] }), "RangeError: unknown product toString");
check("VAT after discount", () => addVat(0.075)({ subtotalKobo: 1000000, discountKobo: 200000 }).vatKobo, 60000);
check("discount never exceeds subtotal", () => applyBestPromotion([{ name: "HUGE", discount: () => 99999999 }])({ subtotalKobo: 5000 }).discountKobo, 5000);
check("no promotion", () => applyBestPromotion([])({ subtotalKobo: 5000 }).promotion, null);
check("evening delivery", () => addDelivery((q) => (q.orderedAt.getUTCHours() >= 18 ? 150000 : 100000))({ orderedAt: new Date("2026-09-24T18:00:00Z") }).deliveryKobo, 150000);

const run = createCheckout({ catalog, promotions: [], vatRate: 0.075, deliveryFee: flatFee });
const frozen = Object.freeze({ ...base, lines: Object.freeze(base.lines.map(Object.freeze)) });
check("pure: same input, same output", () => JSON.stringify(run(frozen)) === JSON.stringify(run(frozen)), true);
check("pure: input untouched", () => (run(frozen), frozen.lines[0]), { sku: "RICE-5", qty: 2 });
check("total", () => run(frozen).totalKobo, 1700000 + 127500 + 100000);
```

Output of `node checkout.test.js` and of the browser terminal

```ts
PASS prices from the catalog -> 1700000
PASS ignores a price sent by the client -> 20000
PASS unknown product -> "RangeError: unknown product TV-99"
PASS zero quantity -> "RangeError: bad quantity 0 for SALT"
PASS inherited key is not a product -> "RangeError: unknown product toString"
PASS VAT after discount -> 60000
PASS discount never exceeds subtotal -> 5000
PASS no promotion -> null
PASS evening delivery -> 150000
PASS pure: same input, same output -> true
PASS pure: input untouched -> {"sku":"RICE-5","qty":2}
PASS total -> 1927500
```

Two tests guard security, not just arithmetic. The client-sent `priceKobo: 1` was ignored because `priceLines` always prices from the catalog. And `"toString"` is refused as a SKU: `catalog.toString` exists through the prototype chain ([Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#object-prototype)), so a check like `catalog[sku] !== undefined` would have accepted it; `Object.hasOwn` does not.

### In production

- **Debug a pipeline with a tap.** A step like `tap((q) => log(q))` that runs a side effect and returns its input unchanged lets you look inside a pipeline without breaking it. Remove it, or route it to a debug logger, afterwards (exercise 1).
- **Stack traces lose names.** An error thrown inside a `pipe` shows `reduce` and the step functions in the trace, and the arrow that a curried step like `addVat(rate)` returns has no name of its own, so the file and line number are what identify it. Keep steps in named, well-organised modules, and give each error a message that says which step failed.
- **Errors in pipelines.** Here a bad cart throws and the whole pipeline stops, which is right for a checkout. When a pipeline should collect several problems instead of stopping at the first, steps can return result objects; [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design) weighs the options.
- **Do not chase purity into the shell.** Saving, logging and sending receipts are the program's purpose. Keep them explicit, in one place, and keep the rules that decide money pure.

## Practice

TRY IT YOURSELF

### A tap for debugging pipelines

Write `tap(fn)`: it returns a step that calls `fn(value)` for its side effect and then returns `value` unchanged. Use it to log the quote between two steps of a pipeline without changing the result.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`tap` must return a function that both calls `fn` and returns its argument — the side effect (logging) and the value passed on are two separate things.

HINT 2

`function tap(fn) { return (value) => { fn(value); return value; }; }`

SOLUTION

tap.js

```ts
const pipe = (...fns) => (input) => fns.reduce((value, fn) => fn(value), input);
const tap = (fn) => (value) => {
  fn(value);
  return value;
};

const addVat = (rate) => (kobo) => Math.round(kobo * (1 + rate));
const minusVoucher = (voucherKobo) => (kobo) => Math.max(kobo - voucherKobo, 0);

const price = pipe(
  minusVoucher(200000),
  tap((kobo) => console.log("after voucher:", kobo)),
  addVat(0.075),
  tap((kobo) => console.log("after VAT:", kobo)),
);

console.log("final:", price(1700000));
```

Output of `node tap.js` and of the browser terminal

```ts
after voucher: 1500000
after VAT: 1612500
final: 1612500
```

`tap` is impure on purpose, but it cannot change the data flowing through, so removing it can never change a result. Libraries such as RxJS use the same name for the same idea.

TRY IT YOURSELF

### Per-country price calculators

Write a curried `priceFor(taxRate)(discountPercent)(kobo)` that applies the discount first, then the tax, rounding once at the end. Build calculators for a Nigerian customer with no discount (7.5%), a Ghanaian customer with no discount (15%) and a Nigerian staff member with 20% off, and price ₦10,000 for each.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Three arrows in a row, each taking one argument: `(taxRate) => (discountPercent) => (kobo) => ...`. Apply the discount to `kobo` first, then the tax to that result, then round once.

HINT 2

`Math.round(kobo * (1 - discountPercent / 100) * (1 + taxRate))`

SOLUTION

price-for.js

```ts
const priceFor = (taxRate) => (discountPercent) => (kobo) => Math.round(kobo * (1 - discountPercent / 100) * (1 + taxRate));

const nigeria = priceFor(0.075);
const ghana = priceFor(0.15);

const calculators = {
  "NG customer": nigeria(0),
  "GH customer": ghana(0),
  "NG staff": nigeria(20),
};

for (const [who, price] of Object.entries(calculators)) {
  console.log(who.padEnd(12), price(1000000));
}
```

Output of `node price-for.js` and of the browser terminal

```ts
NG customer  1075000
GH customer  1150000
NG staff     860000
```

The tax rate is known per country, the discount per customer group, and the amount per order, so the arguments are in the order they become known. `nigeria` is itself reusable: it is partially applied once and then specialised twice.

TRY IT YOURSELF

### Remove a line immutably

Write `removeLine(cart, sku)` that returns a new cart without that line and with a new `updatedAt` passed in by the caller. The original cart must be unchanged, and lines that were not removed must be the same objects (structural sharing). If the SKU is not in the cart, return the original cart unchanged, so callers can detect "nothing happened" with `===`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`cart.lines.findIndex((line) => line.sku === sku)` gives you the position to remove, or `-1` when it is not there — handle that case by returning `cart` itself, unchanged.

HINT 2

`const index = cart.lines.findIndex((line) => line.sku === sku); if (index === -1) return cart; return { ...cart, lines: cart.lines.toSpliced(index, 1), updatedAt };`

SOLUTION

remove-line.js

```ts
function removeLine(cart, sku, updatedAt) {
  const index = cart.lines.findIndex((line) => line.sku === sku);
  if (index === -1) return cart;
  return { ...cart, lines: cart.lines.toSpliced(index, 1), updatedAt };
}

const cart = Object.freeze({
  id: "CART-1",
  updatedAt: "2026-09-24T09:00:00Z",
  lines: Object.freeze([{ sku: "RICE-5", qty: 2 }, { sku: "OIL-1", qty: 1 }, { sku: "SALT", qty: 4 }]),
});

const next = removeLine(cart, "OIL-1", "2026-09-24T09:05:00Z");
console.log(next.lines.map((l) => l.sku), next.updatedAt);
console.log(cart.lines.length, next.lines[1] === cart.lines[2]);
console.log(removeLine(cart, "TV-32", "2026-09-24T09:06:00Z") === cart);
```

Output of `node remove-line.js` and of the browser terminal

```json
[ 'RICE-5', 'SALT' ] 2026-09-24T09:05:00Z
3 true
true
```

`toSpliced` returns a copy without the removed item, so the frozen original is never touched. Returning the same object when nothing changed is a useful convention: UI frameworks and caches use `===` to decide whether anything needs to be redrawn or recomputed. The time is a parameter, so the function stays pure.

## Recap

- A pure function's only input is its parameters and its only output is its return value. Find hidden inputs (globals, clock, randomness, config) and hidden outputs (mutation, logging, I/O), and turn inputs into parameters.
- Structure programs as a functional core of pure business rules inside a thin imperative shell that gathers inputs and performs effects.
- Update data immutably with spread, `map` and the copying array methods (`toSorted`, `toReversed`, `toSpliced`, `with`); structural sharing reuses unchanged parts. Avoid copying on every step of a loop; mutating data you just created is fine.
- Functions are data: business rules can live in arrays of functions. `pipe` and `compose` build functions from functions, and make the order of steps, a business decision, visible.
- Currying (`f(a)(b)(c)`) and partial application fix arguments early. Put configuration first and data last. Generic `curry` breaks on defaults and rest parameters.
- Point-free style is fine for one-argument functions without `this`; wrap `parseInt` and methods in arrows.

Next: [Promises in depth](https://zudojs.oyinlola.site/learn/js-promises), where the values flowing through your code arrive later.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
