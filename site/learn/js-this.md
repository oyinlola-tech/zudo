---
title: "this in depth — ZudoJS Academy"
description: "Predict this in every kind of call, fix a lost this with call, apply, bind and arrow functions, and write your own bind and bindAll helpers."
source: https://zudojs.oyinlola.site/learn/js-this
---

LEVEL 4 · LESSON 1 OF 20

The object model Core

# this in depth

Predict this in every kind of call, fix a lost this with call, apply, bind and arrow functions, and write your own bind and bindAll helpers.

- **50 min** to read and try
- **You need:** this, prototypes and classes, Closures in depth, and the JavaScript fundamentals course
- **You build:** A bind function written from scratch and a bindAll helper that makes a payment service safe to pass around as callbacks

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- State the rule that decides this for any call and apply it to method calls, plain calls, constructors and callbacks
- Explain how strict mode changes this and why modules and classes behave differently from old scripts
- Use call, apply and bind, including partial application, and predict what cannot be rebound
- Choose between arrow functions, bound methods, arrow class fields and wrapper callbacks
- Predict this inside DOM and EventEmitter handlers
- Implement bind and bindAll yourself

## The worker that lost its gateway

A shop processes payments in a background job runner. The runner is generic: it takes a list of jobs and a handler function, and calls the handler for each job. The payment logic lives in a class, as you learned in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes):

problem.js

```ts
class PaymentService {
  constructor(gateway) {
    this.gateway = gateway;
    this.processed = 0;
  }

  charge(job) {
    this.processed += 1;
    return this.gateway.charge(job.orderId, job.amountKobo);
  }
}

function runJobs(jobs, handler) {
  const results = [];
  for (const job of jobs) {
    try {
      results.push(handler(job));
    } catch (error) {
      results.push(`failed: ${error.message}`);
    }
  }
  return results;
}

const gateway = { charge: (orderId, kobo) => `charged ₦${kobo / 100} for ${orderId}` };
const payments = new PaymentService(gateway);
const jobs = [{ orderId: "ORD-7", amountKobo: 1170000 }, { orderId: "ORD-8", amountKobo: 500000 }];

console.log(payments.charge(jobs[0]));
console.log(runJobs(jobs, payments.charge));
```

Output of `node problem.js` and of the browser terminal

```ts
charged ₦11700 for ORD-7
[
  "failed: Cannot read properties of undefined (reading 'processed')",
  "failed: Cannot read properties of undefined (reading 'processed')"
]
```

The same method works when called as `payments.charge(job)` and fails when the runner calls it. Nothing about the method changed; only the *way it was called* changed. [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#losing-this) showed you this problem and two quick fixes. This lesson gives you the complete rule, so you can predict `this` in any situation you meet: plain calls in old and new code, `call`, `apply` and `bind`, arrow functions, class fields, DOM events and Node.js event emitters. At the end you write `bind` yourself and a `bindAll` helper that makes the payment service safe to hand to any runner.

## One rule: this is decided by the call

Inside a normal function (anything written with `function` or as a method, but not an arrow function), `this` is an extra, hidden parameter. Like any parameter, it gets its value **when the function is called**, from the way it is called. Where the function was written, and which object it was first attached to, do not matter. The place in the code where a call happens is called the **call site**, and this table covers every kind of call site:

| How the function is called | Value of `this` |
| --- | --- |
| `obj.method()`, `obj["method"]()`, `obj.method?.()` | `obj`, the object before the last dot or bracket |
| `fn()`, a plain call | `undefined` in strict mode; `globalThis` in old non-strict code |
| `new Fn()` | The brand new object being created |
| `fn.call(x, a, b)`, `fn.apply(x, [a, b])` | `x` |
| `bound()`, where `bound = fn.bind(x)` | `x`, always |
| A callback: `other(fn)` | Whatever `other` does when it calls `fn`, usually a plain call |
| An arrow function, called any way at all | The `this` of the code around the arrow |

Here is one function called six times, through three rows of that table (method call, plain call and `call`):

call-sites.js

```ts
function whoAmI() {
  return this === undefined ? "undefined" : this.name;
}

const shop = { name: "shop", whoAmI, branch: { name: "branch", whoAmI } };
const courier = { name: "courier" };

console.log(shop.whoAmI());
console.log(shop.branch.whoAmI());
console.log(shop["whoAmI"]());
console.log(whoAmI());
console.log(whoAmI.call(courier));

const detached = shop.whoAmI;
console.log(detached());
```

Output of `node call-sites.js` and of the browser terminal

```ts
shop
branch
shop
undefined
courier
undefined
```

The same function object gave four different answers. `shop.branch.whoAmI()` gives `branch`: only the object directly before the method name counts, not the whole chain. And `detached` is the very same function as `shop.whoAmI`, but called without a dot, so it gets nothing. Keep the table in mind: the rest of this lesson is each row in detail.

## Plain calls and strict mode

What a plain call gives depends on whether the function runs in **strict mode**, the stricter set of JavaScript rules that turns silent mistakes into errors. Code is strict when it is inside an ES module (every file in this course), inside a `class`, or in a file or function that starts with the line `"use strict"`. Old browser scripts and CommonJS files without that line are **sloppy mode**, the informal name for non-strict code.

- In strict mode, a plain call gets `this = undefined`. Reading `this.name` then throws a `TypeError` right away.
- In sloppy mode, a plain call gets `this = globalThis`, the global object (`window` in a browser, `global` in Node.js). Reading `this.name` quietly reads a global, and *writing* `this.x = …` quietly creates a global variable.

Every example here runs in strict mode, so to see sloppy mode this example uses the `Function` constructor, which builds a function from a string of code and always makes a sloppy one:

strict.js

```ts
function strictWho() {
  return this;
}
const sloppyWho = new Function("return this;");

console.log(strictWho());
console.log(sloppyWho() === globalThis);

const sloppyCounter = new Function("this.visits = (this.visits || 0) + 1; return this.visits;");
sloppyCounter();
sloppyCounter();
console.log("globalThis.visits:", globalThis.visits);
delete globalThis.visits;

function strictType() {
  return typeof this;
}
const sloppyType = new Function("return typeof this;");
console.log(strictType.call("NGN"), sloppyType.call("NGN"));
console.log(strictType.call(null), sloppyType.call(null));
```

Output of `node strict.js` and of the browser terminal

```ts
undefined
true
globalThis.visits: 2
string object
object object
```

Three differences to take away:

1. A plain call in sloppy mode reaches the global object. `sloppyCounter` meant to count something on an object, and instead created a global variable called `visits` that every other piece of code can see and break. In strict mode the same code throws on the first line, which is what you want.
2. In sloppy mode, a primitive `this` such as the string `"NGN"` is wrapped into an object (a `String` object). Strict mode passes it as it is.
3. In sloppy mode, `null` or `undefined` as `this` is replaced with the global object (`typeof` says `"object"` for both lines here, but for different reasons: strict mode really got `null`).

You will write strict code, but you will read and call sloppy code: older libraries, CommonJS files, snippets pasted into a browser console. When a `this` bug behaves differently in two places, check which mode each one runs in.

> NOTE
>
> At the top level of a file, outside any function, `this` is `undefined` in an ES module, and `module.exports` (an empty object at first) in a CommonJS file. [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems) covers the difference.

## Method calls

A call written as `something.method()` sets `this` to `something`. That is called **implicit binding**: nothing says "this" out loud, the dot does it. Because the value comes from the call, one function can serve many objects. That is how methods are shared through prototypes, and it also lets you **borrow** a method by putting it on another object:

implicit.js

```ts
const naira = {
  code: "NGN",
  symbol: "₦",
  format(kobo) {
    return `${this.symbol}${(kobo / 100).toFixed(2)} ${this.code}`;
  },
};

const cedi = { code: "GHS", symbol: "GH₵", format: naira.format };

console.log(naira.format(150000));
console.log(cedi.format(150000));
console.log(naira.format === cedi.format);

const formats = { primary: naira };
console.log(formats.primary.format(99));
console.log(formats.primary?.format?.(99));
```

Output of `node implicit.js` and of the browser terminal

```ts
₦1500.00 NGN
GH₵1500.00 GHS
true
₦0.99 NGN
₦0.99 NGN
```

`cedi.format` is the same function as `naira.format`, yet it used the cedi's symbol and code, because it was called on `cedi`. Optional chaining (`?.`) keeps the object too: `formats.primary?.format?.(99)` is still a method call on `formats.primary`.

### Getters and setters

Getters and setters ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#accessors)) follow the same rule: `this` is the object the property was read on. That includes reading through the prototype chain: if the getter lives on a prototype, `this` is still the object you started from, which is why one getter on a class prototype can serve every instance.

## How this gets lost

Implicit binding only lasts for the call written with the dot. The moment the function is taken away from its object and called some other way, the binding is gone. That happens in more places than it looks:

losing.js

```ts
class Basket {
  constructor() {
    this.items = [];
  }
  add(sku) {
    this.items.push(sku);
    return this.items.length;
  }
}

function attempt(label, run) {
  try {
    console.log(`${label}: ${run()}`);
  } catch (error) {
    console.log(`${label}: ${error.message}`);
  }
}

const basket = new Basket();

attempt("method call", () => basket.add("RICE-5"));
attempt("stored in a variable", () => {
  const add = basket.add;
  return add("OIL-1");
});
attempt("destructured", () => {
  const { add } = basket;
  return add("OIL-1");
});
attempt("passed as a callback", () => ["SALT", "SUGAR"].map(basket.add));
attempt("thisArg of map", () => ["SALT", "SUGAR"].map(basket.add, basket));
attempt("wrapper arrow", () => ["BEANS"].map((sku) => basket.add(sku)));
console.log(basket.items);
```

Output of `node losing.js` and of the browser terminal

```ts
method call: 1
stored in a variable: Cannot read properties of undefined (reading 'items')
destructured: Cannot read properties of undefined (reading 'items')
passed as a callback: Cannot read properties of undefined (reading 'items')
thisArg of map: 2,3
wrapper arrow: 4
[ 'RICE-5', 'SALT', 'SUGAR', 'BEANS' ]
```

- **Stored in a variable** and **destructured**: `const { add } = basket` is only a shorter way to write `const add = basket.add`. The function is copied out; the object is not.
- **Passed as a callback**: `map` receives the function only. It calls it as a plain function.
- **thisArg**: `map`, `filter`, `forEach`, `find`, `some` and `every` accept a second argument that they use as `this` for the callback. It works, but few people know it, so wrapper arrows are clearer.
- **Wrapper arrow**: `(sku) => basket.add(sku)` puts the dot back. This is the fix you will write most often.

Timers, event emitters, routers and job runners all receive functions, not objects. Each decides how to call your function, so a method passed to any of them has lost its `this` unless you do something about it. (Timers are a special case: in Node.js, `setTimeout` calls your function with its own timer object as `this`, and browsers pass `window`. Neither is your object.)

## call, apply and bind

Every function has three methods that set `this` on purpose, called **explicit binding**:

- `fn.call(thisValue, arg1, arg2)` calls `fn` now, with the given `this` and arguments.
- `fn.apply(thisValue, [arg1, arg2])` does the same, but takes the arguments as one array.
- `fn.bind(thisValue, arg1)` does *not* call anything. It returns a new **bound function** that, whenever it is called, calls `fn` with that `this` and those first arguments, followed by any new ones.

explicit.js

```ts
function describeTransfer(amountKobo, note) {
  return `${this.owner} sends ₦${amountKobo / 100} (${note})`;
}

const ada = { owner: "Ada" };
const chidi = { owner: "Chidi" };

console.log(describeTransfer.call(ada, 500000, "rent"));
console.log(describeTransfer.apply(chidi, [20000, "lunch"]));

const adaSends = describeTransfer.bind(ada);
console.log(adaSends(150000, "school fees"));

const adaSendsRent = describeTransfer.bind(ada, 500000);
console.log(adaSendsRent("October rent"));

console.log(adaSends.name, adaSends.length, adaSendsRent.length);
```

Output of `node explicit.js` and of the browser terminal

```ts
Ada sends ₦5000 (rent)
Chidi sends ₦200 (lunch)
Ada sends ₦1500 (school fees)
Ada sends ₦5000 (October rent)
bound describeTransfer 2 1
```

`adaSendsRent` fixes both `this` and the first argument: that is **partial application** again, the same idea as the factories in [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#factories), done by `bind`. The bound function's `name` starts with `"bound "`, which helps when you read stack traces, and its `length` (the number of parameters it expects) shrinks by the arguments already fixed.

### Where apply still appears

`apply` used to be the only way to call a function with an array of arguments. Spread replaced most of those uses, but you will read both:

apply.js

```ts
const pricesKobo = [850000, 320000, 20000];

console.log(Math.max.apply(null, pricesKobo));
console.log(Math.max(...pricesKobo));

function logWithPrefix(prefix) {
  const rest = Array.prototype.slice.call(arguments, 1);
  return `${prefix} ${rest.join(" ")}`;
}
console.log(logWithPrefix("[orders]", "ORD-7", "shipped"));
```

Output of `node apply.js` and of the browser terminal

```ts
850000
850000
[orders] ORD-7 shipped
```

`Math.max` does not use `this`, so old code passes `null`. The second pattern is **method borrowing**: `arguments` (the old hidden list of all arguments) is not a real array, so old code borrowed `slice` from `Array.prototype` and ran it with `arguments` as `this`. Today you would write a rest parameter, `(prefix, ...rest)`.

### A bound function cannot be rebound

Binding is permanent. Once a function is bound, `call`, `apply`, a method call and even another `bind` cannot change its `this`:

bind-permanent.js

```ts
function owner() {
  return this.owner;
}

const ada = { owner: "Ada" };
const chidi = { owner: "Chidi" };

const adaOwner = owner.bind(ada);
chidi.adaOwner = adaOwner;

console.log(adaOwner());
console.log(adaOwner.call(chidi));
console.log(chidi.adaOwner());
console.log(adaOwner.bind(chidi)());
```

Output of `node bind-permanent.js` and of the browser terminal

```ts
Ada
Ada
Ada
Ada
```

The bound function ignores whatever `this` it is called with and always calls the original with `ada`. That is its whole purpose, and also a trap: if a library calls your bound callback with a `this` it expects you to use, you will not see it. The only call that overrides a binding is `new`, which always creates a new object; constructing a bound function is rare, and [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes) explains what `new` does.

## Arrow functions: this from outside

An arrow function has no `this` of its own. Inside an arrow, `this` is looked up like any other variable, in the surrounding code, the same way closures find variables ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#environments)). That is called **lexical this**. It has two consequences, one helpful and one harmful:

arrows.js

```ts
const report = {
  branch: "Lagos",
  orders: [{ id: "ORD-7", kobo: 1170000 }, { id: "ORD-8", kobo: 500000 }],

  linesWithArrow() {
    return this.orders.map((order) => `${this.branch}: ${order.id}`);
  },

  linesWithFunction() {
    return this.orders.map(function (order) {
      return `${this?.branch}: ${order.id}`;
    });
  },

  linesOldStyle() {
    const self = this;
    return this.orders.map(function (order) {
      return `${self.branch}: ${order.id}`;
    });
  },

  arrowMethod: () => typeof this,
};

console.log(report.linesWithArrow());
console.log(report.linesWithFunction());
console.log(report.linesOldStyle());
console.log(report.arrowMethod());

const arrow = () => typeof this;
console.log(arrow.call(report), arrow.bind(report)());
```

Output of `node arrows.js` and of the browser terminal

```json
[ 'Lagos: ORD-7', 'Lagos: ORD-8' ]
[ 'undefined: ORD-7', 'undefined: ORD-8' ]
[ 'Lagos: ORD-7', 'Lagos: ORD-8' ]
undefined
undefined undefined
```

- **Helpful**: inside `linesWithArrow`, the arrow callback uses the method's `this`, which is `report`. A callback inside a method is exactly where arrows belong.
- A `function` callback in the same place gets its own `this`, from `map`'s plain call: `undefined`. Before arrows existed, code saved the outer value in a variable, usually called `self` or `that`. You will see `linesOldStyle` in older code; it is a closure over `self`.
- **Harmful**: `arrowMethod` is an arrow written directly in the object literal. The code around it is the module, where `this` is `undefined`. An object literal does not create a `this`; only functions do. Never write methods as arrows in object literals.
- Explicit binding has no effect on an arrow: `call` and `bind` cannot give it a `this`, because it never looks for one of its own.

Arrow functions also have no `arguments` of their own and cannot be called with `new`. The practical rule: **methods with method syntax, callbacks with arrows.**

## this in classes

Class bodies are always strict, and class methods live on the prototype, so a detached class method always gets `this = undefined`. There are three standard ways to make a class method safe to hand out as a callback:

class-handlers.js

```ts
class Checkout {
  constructor(label) {
    this.label = label;
    this.boundPay = this.pay.bind(this);
  }
  pay(orderId) {
    return `${this.label} paid ${orderId}`;
  }
  refund = (orderId) => `${this.label} refunded ${orderId}`;
}

const lagos = new Checkout("Lagos till");
const abuja = new Checkout("Abuja till");
const orders = ["ORD-7"];

console.log(orders.map((id) => lagos.pay(id)));
console.log(orders.map(lagos.boundPay));
console.log(orders.map(lagos.refund));

console.log(Object.keys(lagos));
console.log(lagos.pay === abuja.pay, lagos.refund === abuja.refund);
console.log(typeof Checkout.prototype.pay, typeof Checkout.prototype.refund);
```

Output of `node class-handlers.js` and of the browser terminal

```json
[ 'Lagos till paid ORD-7' ]
[ 'Lagos till paid ORD-7' ]
[ 'Lagos till refunded ORD-7' ]
[ 'refund', 'label', 'boundPay' ]
true false
function undefined
```

1. **Wrap at the call site**: `(id) => lagos.pay(id)`. Nothing changes in the class. Clear, and you see the object at the point where it matters.
2. **Bind in the constructor**: `this.boundPay = this.pay.bind(this)`. Each instance gets its own bound copy, stored as an own property.
3. **Arrow function class field**: `refund = (orderId) => …`. A **class field** is a property that every new instance gets, set up just before the constructor body runs (look at the order in `Object.keys`: `refund` comes before `label`). An arrow in a field takes `this` from that setup, which is the new instance, so it is bound for life.

The last two lines show the price of options 2 and 3: they create a new function *per instance* (`lagos.refund !== abuja.refund`), and the arrow field is not on the prototype at all. That has consequences beyond memory:

field-override.js

```ts
class Checkout {
  pay(orderId) {
    return `paid ${orderId}`;
  }
  refund = (orderId) => `refunded ${orderId}`;
}

class AuditedCheckout extends Checkout {
  pay(orderId) {
    return `${super.pay(orderId)} (audited)`;
  }
  refund = (orderId) => `${super.refund?.(orderId) ?? "no parent refund"} (audited)`;
}

const till = new AuditedCheckout();
console.log(till.pay("ORD-7"));
console.log(till.refund("ORD-7"));
```

Output of `node field-override.js` and of the browser terminal

```ts
paid ORD-7 (audited)
no parent refund (audited)
```

`super.pay` looks on the parent's prototype and finds `pay`. `super.refund` finds nothing, because the parent's arrow `refund` is an own property of each instance, and the child's field replaced it on the same instance. Arrow fields cannot be extended with `super`, and tools that replace methods on the prototype (such as test spies) do not see them.

| Approach | Per-instance cost | Works with `super` and prototype spies | Use when |
| --- | --- | --- | --- |
| Wrapper arrow at the call site | None (one small arrow where you pass it) | Yes | Default choice |
| `bind` in the constructor | One function per bound method | Yes (the original stays on the prototype) | A method is passed around in many places |
| Arrow class field | One function per field | No | Small classes that are never extended, such as UI handlers |

## this in event handlers

An event system is a function that calls your listener, so it decides `this`. The two you will meet most follow the same convention: a listener written with `function` gets the object the listener was registered on.

### In the browser

For `element.addEventListener("click", listener)`, the browser calls a `function` listener with `this` set to `element`, the same value as `event.currentTarget`. An arrow listener keeps the `this` of the surrounding code instead:

index.html

```ts
<!doctype html>
<html>
<body>
  <ul id="cart">
    <li><button id="remove-rice">Remove rice</button></li>
    <li><button id="remove-oil">Remove oil</button></li>
  </ul>
</body>
</html>
```

handlers.js

```ts
const rice = document.getElementById("remove-rice");
const cart = document.getElementById("cart");

rice.addEventListener("click", function (event) {
  console.log("function:", this.id, this === event.currentTarget);
});
rice.addEventListener("click", (event) => {
  console.log("arrow:", this, event.currentTarget.id);
});

cart.addEventListener("click", function (event) {
  console.log("delegated: this is", this.id, "but the click was on", event.target.id);
});

rice.click();
document.getElementById("remove-oil").click();
```

What the browser terminal prints

```ts
function: remove-rice true
arrow: undefined remove-rice
delegated: this is cart but the click was on remove-rice
delegated: this is cart but the click was on remove-oil
```

The last two lines show the trap with **event delegation** (one listener on a parent for all its children): `this` is the element that has the listener, the list, not the button that was clicked. Code that reads `event.target` and `event.currentTarget` says exactly what it means, and works the same in `function` and arrow listeners. Prefer them over `this` in handlers.

### In Node.js

Node's `EventEmitter`, which many Node.js APIs are built on, calls a `function` listener with `this` set to the emitter:

emitter.jsNode.js only

```ts
import { EventEmitter } from "node:events";

const orders = new EventEmitter();
orders.name = "order events";

orders.on("paid", function (orderId) {
  console.log(`function: ${this.name} got ${orderId}`);
});
orders.on("paid", (orderId) => {
  console.log(`arrow: this is ${this}, got ${orderId}`);
});

orders.emit("paid", "ORD-7");
```

Output of `node emitter.js`

```ts
function: order events got ORD-7
arrow: this is undefined, got ORD-7
```

If your listener is a method of your own class, neither of these is your object. Register it with a wrapper, `orders.on("paid", (id) => mailer.sendReceipt(id))`, so the call inside has its dot back.

## When several rules apply

A call can match more than one row of the table: a bound function stored on an object and called as a method, say. The rules have a fixed order of strength:

1. An **arrow function** ignores all of them and uses the outer `this`.
2. `new` wins over everything else: the new object.
3. A **bound** function uses its bound value, whatever the call looks like.
4. `call` and `apply` use their first argument.
5. A **method call** uses the object before the dot.
6. A **plain call** gets `undefined` (strict) or `globalThis` (sloppy).

precedence.js

```ts
function label() {
  return this?.name ?? "nobody";
}

const shop = { name: "shop" };
const bank = { name: "bank" };

shop.label = label;
shop.boundToBank = label.bind(bank);

console.log(shop.label());
console.log(shop.label.call(bank));
console.log(shop.boundToBank());
console.log(shop.boundToBank.call(shop));

function Account(owner) {
  this.owner = owner;
}
const BoundAccount = Account.bind(bank);
const made = new BoundAccount("Ada");
console.log(made.owner, bank.owner);
```

Output of `node precedence.js` and of the browser terminal

```ts
shop
bank
bank
bank
Ada undefined
```

The last line shows `new` beating `bind`: the constructor ran with a fresh object, and `bank` was not touched. You will rarely combine rules like this on purpose, but when a `this` bug confuses you, find the call site and walk down this list.

## Before you build: a helper that binds everything

REASON IT OUT

### Design bind and bindAll

You will write `myBind(fn, thisValue, ...fixedArgs)` and then `bindAll(instance)`, which replaces every method of an instance with a bound copy so that `runJobs(jobs, payments.charge)` works. Before writing them, decide:

- How can `myBind` call `fn` with a chosen `this` without using `bind`? And how does the returned function remember `fn`, `thisValue` and the fixed arguments?
- Where do a class instance's methods actually live? Does `Object.keys(instance)` list them?
- What about methods inherited from a parent class?
- Which names on a prototype must *not* be bound?
- A getter such as `get total()` is also on the prototype. What happens if the helper reads it while looking for methods?

**Show the reasoning**

- **myBind**: `fn.apply(thisValue, args)` (or `call`) calls with a chosen `this`. A closure remembers `fn`, `thisValue` and `fixedArgs`; the returned arrow combines the fixed arguments with the new ones. An arrow is right for the returned function, because it must ignore its own call-site `this`.
- **Where methods live**: on the prototype, `Object.getPrototypeOf(instance)`, as non-enumerable properties. `Object.keys(instance)` lists only own enumerable data such as `gateway`. Use `Object.getOwnPropertyNames(prototype)`.
- **Inheritance**: walk up the prototype chain with `Object.getPrototypeOf` until you reach `Object.prototype`, and stop there, because binding `toString` and friends onto every instance is pointless. A child's method must win over the parent's method of the same name, so skip names you have already bound.
- **Not bound**: `constructor`, and anything that is not a function.
- **Getters**: reading `prototype[name]` runs a getter with the prototype as `this`, which can throw or give nonsense. Read the *descriptor* with `Object.getOwnPropertyDescriptor` and only bind when it has a function `value`.

## Build: bind and bindAll

binding.js

```ts
export function myBind(fn, thisValue, ...fixedArgs) {
  if (typeof fn !== "function") throw new TypeError("myBind needs a function");
  const bound = (...laterArgs) => fn.apply(thisValue, [...fixedArgs, ...laterArgs]);
  Object.defineProperty(bound, "name", { value: `bound ${fn.name}` });
  return bound;
}

export function bindAll(instance) {
  const seen = new Set();
  let proto = Object.getPrototypeOf(instance);
  while (proto !== null && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor" || seen.has(name)) continue;
      seen.add(name);
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor.value === "function") {
        instance[name] = descriptor.value.bind(instance);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return instance;
}
```

`myBind` is a closure (it remembers `fn`, `thisValue` and `fixedArgs`) around `apply`. Because `bound` is an arrow, calling it as a method or with `call` cannot change what it passes on, which is exactly the "cannot be rebound" behaviour of the real `bind`. (The real one also supports `new`; this version does not, because arrows cannot be constructed.) `bindAll` walks the prototype chain as the reasoning block planned. The `seen` set makes sure a child's method is bound instead of the parent's version it overrides.

main.js

```ts
import { bindAll, myBind } from "./binding.js";

class PaymentService {
  constructor(gateway) {
    this.gateway = gateway;
    this.processed = 0;
  }
  charge(job) {
    this.processed += 1;
    return this.gateway.charge(job.orderId, job.amountKobo);
  }
  get summary() {
    return `${this.processed} processed`;
  }
}

class RetryingPaymentService extends PaymentService {
  charge(job) {
    return `${super.charge(job)} (with retry)`;
  }
  refund(job) {
    return `refunded ${job.orderId}`;
  }
}

function runJobs(jobs, handler) {
  return jobs.map((job) => handler(job));
}

const gateway = { charge: (orderId, kobo) => `charged ₦${kobo / 100} for ${orderId}` };
const jobs = [{ orderId: "ORD-7", amountKobo: 1170000 }, { orderId: "ORD-8", amountKobo: 500000 }];

const payments = bindAll(new RetryingPaymentService(gateway));
console.log(runJobs(jobs, payments.charge));
console.log(runJobs(jobs, payments.refund));
console.log(payments.summary, Object.keys(payments));

function fee(percent, amountKobo) {
  return `${this.bank}: ₦${(amountKobo * percent) / 10000}`;
}
const gtFee = myBind(fee, { bank: "GTBank" }, 0.5);
console.log(gtFee(1000000), gtFee.name);
console.log(gtFee.call({ bank: "Other" }, 1000000));
```

Output of `node main.js` and of the browser terminal

```json
[
  'charged ₦11700 for ORD-7 (with retry)',
  'charged ₦5000 for ORD-8 (with retry)'
]
[ 'refunded ORD-7', 'refunded ORD-8' ]
2 processed [ 'gateway', 'processed', 'charge', 'refund' ]
GTBank: ₦50 bound fee
GTBank: ₦50
```

The runner gets plain functions and calls them without a dot, and everything works: `charge` is the child's version (with retry), it still reaches the parent's through `super`, and the `summary` getter was left alone and still counts correctly.

### Testing the behaviour

binding.test.js

```ts
import { bindAll, myBind } from "./binding.js";

function check(label, actual, expected) {
  console.log(`${Object.is(actual, expected) ? "PASS" : "FAIL"} ${label} -> ${actual}`);
}

function whoAmI(greeting = "hi") {
  return `${greeting} ${this?.name}`;
}
const ada = { name: "Ada" };
const bound = myBind(whoAmI, ada);

check("uses the bound this", bound(), "hi Ada");
check("ignores call", bound.call({ name: "Chidi" }), "hi Ada");
check("ignores method call", { name: "Chidi", bound }.bound(), "hi Ada");
check("passes arguments", bound("hello"), "hello Ada");
check("fixes leading arguments", myBind(whoAmI, ada, "welcome")(), "welcome Ada");
check("names the function", bound.name, "bound whoAmI");

class Counter {
  count = 0;
  increment() {
    this.count += 1;
    return this.count;
  }
  get double() {
    return this.count * 2;
  }
}
const counter = bindAll(new Counter());
const { increment } = counter;
increment();
increment();
check("detached method works", counter.count, 2);
check("getter still a getter", counter.double, 4);
check("instance holds its own bound copy", Counter.prototype.increment === increment, false);
check("other instances unaffected", Object.hasOwn(new Counter(), "increment"), false);
```

Output of `node binding.test.js` and of the browser terminal

```ts
PASS uses the bound this -> hi Ada
PASS ignores call -> hi Ada
PASS ignores method call -> hi Ada
PASS passes arguments -> hello Ada
PASS fixes leading arguments -> welcome Ada
PASS names the function -> bound whoAmI
PASS detached method works -> 2
PASS getter still a getter -> 4
PASS instance holds its own bound copy -> false
PASS other instances unaffected -> false
```

### In production

- **Prefer the simplest fix.** A wrapper arrow where you pass the callback is explicit and costs nothing. Reach for `bind` or `bindAll` when the same object's methods are handed out in many places, for example registering a whole controller's methods as routes.
- **Or avoid `this` entirely.** A service built by a factory function with closures ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#private-state)) has nothing to lose. Many backend codebases use classes for structure and dependency injection, and wrappers or factories at the edges.
- **Know what binding costs.** `bindAll` adds one function per method per instance. For a few long-lived services that is nothing; for a million short-lived objects it is real memory.
- **Strict mode everywhere.** A lost `this` in sloppy code reads and writes globals silently. ES modules, which ZudoJS projects use, are strict automatically; a CommonJS file needs `"use strict"` at the top.

## Practice

TRY IT YOURSELF

### Predict and fix a timer

This notifier should print the customer's name after a short delay, but it prints something else. Predict the output, explain it with the call-site rule, and fix it without changing the class.

timer-bug.js

```ts
class Notifier {
  constructor(customer) {
    this.customer = customer;
  }
  remind() {
    console.log(`Reminder for ${this?.customer}`);
  }
}

const notifier = new Notifier("Ada");
setTimeout(notifier.remind, 0);
```

Output of `node timer-bug.js` and of the browser terminal

```ts
Reminder for undefined
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`this` depends on how a function is *called*, not where it is defined. `setTimeout(notifier.remind, 0)` passes the bare function, detached from `notifier`, so the call site has no dot.

HINT 2

Wrap it so the dot survives: `setTimeout(() => notifier.remind(), 0)`. Or fix `this` permanently with `setTimeout(notifier.remind.bind(notifier), 0)`.

SOLUTION

`setTimeout` receives only the function and calls it itself, so `this` is not `notifier`. (In Node.js it is the timer object, which has no `customer`; in a browser it is `window`.) Give the call its dot back with a wrapper, or bind:

timer-fix.js

```ts
class Notifier {
  constructor(customer) {
    this.customer = customer;
  }
  remind() {
    console.log(`Reminder for ${this.customer}`);
  }
}

const notifier = new Notifier("Ada");
setTimeout(() => notifier.remind(), 0);
setTimeout(notifier.remind.bind(notifier), 0);
```

Output of `node timer-fix.js` and of the browser terminal

```ts
Reminder for Ada
Reminder for Ada
```

TRY IT YOURSELF

### Borrow a method

A `receipt` object has a `total()` method that adds up `this.lines`. A plain object `{ lines: [500, 1500] }` from an old API has no methods. Without copying the method onto it, use `call` to compute its total, then use `bind` to make a reusable `oldApiTotal` function.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`someFn.call(thisValue)` runs `someFn` once with `this` set to `thisValue`, without moving or copying the function anywhere.

HINT 2

`receipt.total.call(fromOldApi)` for the one-off call. `const oldApiTotal = receipt.total.bind(fromOldApi);` for the reusable one — it keeps using `fromOldApi`, even the line pushed onto it afterwards.

SOLUTION

borrow.js

```ts
const receipt = {
  lines: [850000, 320000],
  total() {
    return this.lines.reduce((sum, kobo) => sum + kobo, 0);
  },
};

const fromOldApi = { lines: [500, 1500] };
console.log(receipt.total.call(fromOldApi));

const oldApiTotal = receipt.total.bind(fromOldApi);
fromOldApi.lines.push(250);
console.log(oldApiTotal(), receipt.total());
```

Output of `node borrow.js` and of the browser terminal

```ts
2000
2250 1170000
```

`bind` fixes *which object* is used, not a copy of it, so the bound function sees the line added later. `receipt.total()` still uses `receipt`: borrowing never changes the original method.

TRY IT YOURSELF

### Callbacks inside a method

Finish `priceList()` so it returns lines like `"Rice 5kg: ₦8500.00"` using `this.format` for each product. Write it once with an arrow callback and once with a `function` callback plus `map`'s `thisArg`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

An arrow callback does not have its own `this`, so inside `this.products.map((p) => ...)`, `this` is still `shop`.

HINT 2

`this.products.map((p) => \`${p.name}: ${this.format(p.kobo)}\`)`. For the `function` version, `map(function (p) { return ...this.format(p.kobo)... }, this)` — the second argument to `map` becomes the callback's `this`.

SOLUTION

price-list.js

```ts
const shop = {
  symbol: "₦",
  products: [{ name: "Rice 5kg", kobo: 850000 }, { name: "Oil 1L", kobo: 320000 }],
  format(kobo) {
    return `${this.symbol}${(kobo / 100).toFixed(2)}`;
  },
  priceList() {
    return this.products.map((p) => `${p.name}: ${this.format(p.kobo)}`);
  },
  priceListThisArg() {
    return this.products.map(function (p) {
      return `${p.name}: ${this.format(p.kobo)}`;
    }, this);
  },
};

console.log(shop.priceList());
console.log(shop.priceListThisArg());
```

Output of `node price-list.js` and of the browser terminal

```json
[ 'Rice 5kg: ₦8500.00', 'Oil 1L: ₦3200.00' ]
[ 'Rice 5kg: ₦8500.00', 'Oil 1L: ₦3200.00' ]
```

Both work. The arrow version is the one most teams prefer, because a reader sees at once that `this` is the method's `this`; the `thisArg` version depends on a second argument that is easy to miss.

## Recap

- `this` is a hidden parameter set by the call, not by where the function is written. Find the call site.
- Method call: the object before the last dot. Plain call: `undefined` in strict code, `globalThis` in sloppy code. `new`: the new object.
- Storing, destructuring or passing a method as a callback detaches it. Fix it with a wrapper arrow, `bind`, or a `thisArg`.
- `call` and `apply` call now with a chosen `this`; `bind` returns a permanently bound function and can fix leading arguments too. Only `new` overrides a binding.
- Arrow functions use the surrounding `this` and cannot be rebound: perfect callbacks inside methods, wrong as methods in object literals.
- In classes, choose between wrappers at the call site, `bind` in the constructor, and arrow fields; arrow fields are per instance and invisible to `super`.
- DOM and `EventEmitter` call `function` listeners with the object they are registered on; prefer `event.currentTarget` and `event.target`.

Next: [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes), where you follow the prototype chain step by step and see exactly what `new` and `class` do.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
