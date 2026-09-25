---
title: "Symbols — ZudoJS Academy"
description: "Use symbols as keys that never clash, plug your objects into the language with well-known symbols, and build a Money type that refuses to add naira to dollars."
source: https://zudojs.oyinlola.site/learn/js-symbols
---

LEVEL 4 · LESSON 11 OF 20

Iteration and symbols Core

# Symbols

Use symbols as keys that never clash, plug your objects into the language with well-known symbols, and build a Money type that refuses to add naira to dollars.

- **45 min** to read and try
- **You need:** Types in depth, Objects in depth, Prototypes in depth and Iterables and iterators
- **You build:** A Money type that formats itself in text, refuses silent arithmetic and mixed currencies, labels itself in logs, and a redaction protocol that keeps card numbers out of logs

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why symbols exist and how symbol keys behave with Object.keys, JSON, spread and Reflect.ownKeys
- Choose between Symbol() and Symbol.for(), and explain what breaks when a package is loaded twice
- Control conversion with Symbol.toPrimitive and predict the hint for any operation
- Use Symbol.toStringTag, Symbol.iterator, Symbol.asyncIterator, Symbol.hasInstance and Symbol.dispose where they fit
- Design and test a custom protocol keyed by a symbol

## An invoice that added dollars to naira

A shop sells to customers in Nigeria and abroad. Amounts are stored as whole minor units (kobo, cents) with a currency code, a good habit from [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math). Someone gave the `Money` class a `valueOf` method, so that comparisons like `price > 0` would "just work", as you saw in [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#coercion):

problem.js

```ts
class Money {
  constructor(minor, currency) {
    this.minor = minor;
    this.currency = currency;
  }
  valueOf() {
    return this.minor;
  }
}

const subtotal = new Money(1500000, "NGN");
const shipping = new Money(2500, "USD");

const total = subtotal + shipping;
console.log("total:", total);
console.log("Receipt: " + subtotal);
console.log(`Receipt: ${subtotal}`);
console.log(subtotal > shipping);
```

Output of `node problem.js` and of the browser terminal

```ts
total: 1502500
Receipt: 1500000
Receipt: [object Object]
true
```

Every line is wrong, and none of them threw an error:

1. ₦15,000 plus $25 became the plain number 1502500. The currencies were thrown away and the sum is meaningless, yet it would happily be charged.
2. `"Receipt: " + subtotal` printed raw kobo.
3. The template literal printed `[object Object]`, because it asked for text and `valueOf` is not consulted first for text.
4. `subtotal > shipping` compared kobo with cents.

What you want is precise control: formatted text in receipts, an error on accidental arithmetic, and a readable label in logs. JavaScript lets objects control exactly these things through **hooks**: methods the language itself calls at particular moments. Those hooks are not stored under names like `"toPrimitive"`, but under **symbols**. This lesson explains why, shows the hooks you will actually use, and ends with a `Money` type that cannot be misused this way.

## Why symbols: keys that cannot clash

[Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#two-families) introduced the **symbol**: a primitive value that is equal only to itself. `Symbol("id") === Symbol("id")` is `false`; the text is only a **description** for people reading logs. Symbols can be property keys, just like strings.

Now imagine JavaScript had added the conversion hook as a normal method called `toPrimitive`. Millions of existing objects on the web might already have a property with that name, doing something else. The day browsers shipped the feature, those objects would suddenly behave differently. The language needed keys that no existing code could possibly be using. A new symbol is such a key: nobody can type it, so nobody can have used it by accident.

The same need appears in your own code. A small auditing helper wants to attach "when did we last see this object" to orders, without any chance of overwriting a field the order already has:

no-clash.js

```ts
const seenAt = Symbol("seenAt");

function markSeen(record, when) {
  record[seenAt] = when;
  return record;
}

const order = { id: "ORD-7", seenAt: "customer field, not ours", totalKobo: 450000 };
markSeen(order, "2026-09-24");

console.log(order.seenAt);
console.log(order[seenAt]);
console.log(seenAt.description, String(seenAt));
```

Output of `node no-clash.js` and of the browser terminal

```ts
customer field, not ours
2026-09-24
seenAt Symbol(seenAt)
```

The order's own `seenAt` string property and the helper's `seenAt` symbol property live side by side. Only code that holds the symbol value can read or write the helper's property.

### Who sees symbol keys

Symbol-keyed properties are skipped by the tools that list "ordinary" data, and kept by the tools that copy objects. Knowing which is which prevents surprises:

who-sees.js

```ts
const internalId = Symbol("internalId");
const order = { id: "ORD-7", totalKobo: 450000, [internalId]: 99812 };

console.log(Object.keys(order));
console.log(JSON.stringify(order));
for (const key in order) console.log("for...in:", key);

console.log(Object.getOwnPropertySymbols(order));
console.log(Reflect.ownKeys(order));

const copy = { ...order };
console.log(copy[internalId], Object.assign({}, order)[internalId]);
console.log(structuredClone(order)[internalId]);
```

Output of `node who-sees.js` and of the browser terminal

```json
[ 'id', 'totalKobo' ]
{"id":"ORD-7","totalKobo":450000}
for...in: id
for...in: totalKobo
[ Symbol(internalId) ]
[ 'id', 'totalKobo', Symbol(internalId) ]
99812 99812
undefined
```

| Skips symbol keys | Includes symbol keys |
| --- | --- |
| `Object.keys`, `Object.values`, `Object.entries`, `for...in`, `JSON.stringify`, `structuredClone` | `Object.getOwnPropertySymbols`, `Reflect.ownKeys`, spread `{ ...obj }`, `Object.assign` |

Two consequences. Symbol keys do not travel: they disappear when an object is sent as JSON or cloned, which is right for internal metadata. And symbol keys are **not private**: anyone can list them with `Object.getOwnPropertySymbols`. They prevent *accidental* clashes, not deliberate access. For real privacy, use a class's `#private` fields or a closure ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures#private-state)).

## Symbol() and Symbol.for(): local and shared symbols

`Symbol("x")` creates a brand-new symbol every call. To share it, you must pass the value around, usually by exporting it from a module. `Symbol.for("x")` works differently: it looks the name up in a **global symbol registry** that the whole JavaScript runtime shares, creating the symbol the first time and returning the same one every time after. `Symbol.keyFor(sym)` tells you a registered symbol's name:

registry.js

```ts
const local1 = Symbol("shop.plugin");
const local2 = Symbol("shop.plugin");
const shared1 = Symbol.for("shop.plugin");
const shared2 = Symbol.for("shop.plugin");

console.log(local1 === local2, shared1 === shared2, local1 === shared1);
console.log(Symbol.keyFor(shared1), Symbol.keyFor(local1));
```

Output of `node registry.js` and of the browser terminal

```ts
false true false
shop.plugin undefined
```

### When the difference bites: the same package, loaded twice

A package can end up in `node_modules` twice, in two versions: your app depends on `payments@2`, and a plugin you installed depends on `payments@1`. Each copy is a separate module with its own top-level variables. If the package marks its objects with a local `Symbol()`, an object made by one copy is not recognised by the other. Here the two copies are simulated by calling a factory twice:

two-copies.js

```ts
function loadPaymentsPackage() {
  const localBrand = Symbol("payments.Charge");
  const sharedBrand = Symbol.for("payments.Charge");
  return {
    createCharge: (kobo) => ({ kobo, [localBrand]: true, [sharedBrand]: true }),
    isChargeLocal: (value) => value?.[localBrand] === true,
    isChargeShared: (value) => value?.[sharedBrand] === true,
  };
}

const paymentsV2 = loadPaymentsPackage();
const paymentsV1 = loadPaymentsPackage();

const charge = paymentsV1.createCharge(450000);
console.log("local brand check:", paymentsV2.isChargeLocal(charge));
console.log("shared brand check:", paymentsV2.isChargeShared(charge));
```

Output of `node two-copies.js` and of the browser terminal

```ts
local brand check: false
shared brand check: true
```

The check built on a local symbol failed across copies; the one built on `Symbol.for` passed. That is the rule of thumb:

- Use `Symbol()` for keys that belong to one module and should never be reachable from elsewhere.
- Use `Symbol.for("package.name")` for a *protocol* that separately loaded code must agree on. Namespace the name (`"payments.Charge"`, not `"charge"`), because the registry is shared by everything in the process. Node itself uses `Symbol.for("nodejs.util.inspect.custom")` this way.

## Well-known symbols: the language's hooks

A **well-known symbol** is a symbol the language defines and stores as a property of `Symbol`, such as `Symbol.iterator`. When JavaScript needs to do something to an object, it checks whether the object has a method under the matching well-known symbol, and calls it if so. Here are the ones worth knowing:

| Symbol | Called when | Typical use |
| --- | --- | --- |
| `Symbol.iterator` | `for...of`, spread, destructuring | Make a collection iterable ([Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators)) |
| `Symbol.asyncIterator` | `for await...of` | Stream pages, events or file chunks ([Generators](https://zudojs.oyinlola.site/learn/js-generators#async)) |
| `Symbol.toPrimitive` | The object must become a primitive: `+`, `*`, `>`, template literals, `String()`, `Number()` | Money, durations, versions |
| `Symbol.toStringTag` | `Object.prototype.toString` | A clear type label in logs and debugging |
| `Symbol.hasInstance` | `x instanceof C` | Rare: customise `instanceof` |
| `Symbol.dispose`, `Symbol.asyncDispose` | Leaving a block that declared the object with `using` / `await using` | Close files, connections, locks |
| `Symbol.species`, `Symbol.isConcatSpreadable`, `Symbol.match`/`replace`/`search`/`split`, `Symbol.unscopables` | Subclassing built-ins, `concat`, string methods, `with` | Library internals; you will rarely touch them |

You have already implemented `Symbol.iterator` and `Symbol.asyncIterator` in [Iterables and iterators](https://zudojs.oyinlola.site/learn/js-iterators) and [Generators](https://zudojs.oyinlola.site/learn/js-generators). The rest of this lesson covers the others you will meet in real code, starting with the one that fixes the invoice.

## Symbol.toPrimitive: controlling conversion

When an operation needs a primitive and has an object, JavaScript first looks for a `[Symbol.toPrimitive]` method. If there is one, it is called with a **hint**, a string that says what kind of value the operation would like, and `valueOf` and `toString` are not consulted at all. The method must return a primitive (or throw). There are three hints:

- `"number"`: the operation wants a number: unary `+`, `-`, `*`, `/`, `<`, `>`, `Number()`, `Math.max()`.
- `"string"`: the operation wants text: template literals, `String()`, using the object as a property key, `join`.
- `"default"`: the operation could go either way: binary `+` (add or join?) and `==`.

A probe object that records every hint it receives shows which operation asks for what:

hints.js

```ts
const hints = [];
const probe = {
  [Symbol.toPrimitive](hint) {
    hints.push(hint);
    return 1;
  },
};

+probe;
probe * 2;
probe > 0;
`${probe}`;
String(probe);
probe + 1;
probe == 1;
({ [probe]: true });

console.log(hints.join(" "));
```

Output of `node hints.js` and of the browser terminal

```ts
number number number string string default default string
```

Now the problem is solvable, because each case can be handled on purpose. A good money type:

- formats itself for the `"string"` hint, so receipts and logs read `₦15,000.00`;
- **throws** for `"default"` and `"number"`, so `subtotal + shipping` and `price * 2` fail loudly instead of producing a plausible wrong number;
- offers explicit methods, `plus`, `times`, `compare`, that check currencies.

money-primitive.js

```ts
class Money {
  constructor(minor, currency) {
    this.minor = minor;
    this.currency = currency;
  }

  [Symbol.toPrimitive](hint) {
    if (hint === "string") {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: this.currency }).format(this.minor / 100);
    }
    throw new TypeError(`Money cannot be used as a ${hint} value; use plus(), times() or compare()`);
  }
}

const subtotal = new Money(1500000, "NGN");
const shipping = new Money(2500, "USD");

console.log(`Receipt: ${subtotal} + ${shipping}`);
console.log(String(subtotal));

for (const attempt of [() => subtotal + shipping, () => subtotal * 2, () => subtotal > shipping, () => "Total: " + subtotal]) {
  try {
    attempt();
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `node money-primitive.js` and of the browser terminal

```ts
Receipt: ₦15,000.00 + US$25.00
₦15,000.00
TypeError: Money cannot be used as a default value; use plus(), times() or compare()
TypeError: Money cannot be used as a number value; use plus(), times() or compare()
TypeError: Money cannot be used as a number value; use plus(), times() or compare()
TypeError: Money cannot be used as a default value; use plus(), times() or compare()
```

Every silent bug from the first section is now an error with a message that says what to do instead. Note the last one: `"Total: " + subtotal` uses binary `+`, so the hint is `"default"`, not `"string"`, even though one side is text; JavaScript converts both operands *before* it decides between adding and joining. Write `\`Total: ${subtotal}\`` for text.

### Why not just valueOf and toString?

`valueOf` cannot tell *why* it was called: `a + b`, `a * 2` and `a > b` all look the same to it. So it can only allow all arithmetic or break comparisons too. `Symbol.toPrimitive` receives the hint, so it can allow text and refuse arithmetic. It also takes priority: when it exists, `valueOf` and `toString` are ignored for conversions.

### A built-in example: Date

`Date` is the built-in object type you will meet with its own `Symbol.toPrimitive` (the only other one is on `Symbol.prototype`). It treats `"default"` like `"string"`, which is why adding to a date joins text while subtracting dates gives milliseconds:

date-hint.js

```ts
const paidAt = new Date(Date.UTC(2026, 8, 24, 9, 30));
const dueAt = new Date(Date.UTC(2026, 8, 24, 10, 0));

console.log(typeof (paidAt + 1), typeof (paidAt - 1));
console.log((dueAt - paidAt) / 60000, "minutes early");
console.log(typeof paidAt[Symbol.toPrimitive]);
```

Output of `node date-hint.js` and of the browser terminal

```ts
string number
30 minutes early
function
```

## Symbol.toStringTag: a label for your type

`Object.prototype.toString` produces the `[object Object]` text you keep meeting. It builds that label from the object's `[Symbol.toStringTag]` property if there is one. Built-ins already define it, which is why it is a reliable way to ask "what kind of built-in is this?". Your own classes can define it too, usually as a getter on the class:

tag.js

```ts
const tagOf = (value) => Object.prototype.toString.call(value);

console.log(tagOf([]), tagOf(new Map()), tagOf(null), tagOf(Promise.resolve()));

class Invoice {
  constructor(id) {
    this.id = id;
  }
  get [Symbol.toStringTag]() {
    return "Invoice";
  }
}

const invoice = new Invoice("INV-2026-00098");
console.log(tagOf(invoice));
console.log(tagOf({ id: "INV-1" }));
```

Output of `node tag.js` and of the browser terminal

```json
[object Array] [object Map] [object Null] [object Promise]
[object Invoice]
[object Object]
```

It is a label, not a guarantee: any object can claim any tag, including `"Array"`. Use it for readable logs and debugging, not for security or validation decisions. To check that a value really is an array, use `Array.isArray`; for your own classes, see the brand checks below.

## Symbol.hasInstance and brand checks

`x instanceof C` normally walks `x`'s prototype chain looking for `C.prototype` ([Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#instanceof)). If `C` has a static `[Symbol.hasInstance]` method, `instanceof` calls that instead. That lets you describe an *interface*, "anything with a `charge` method", as something you can test with `instanceof`:

has-instance.js

```ts
class Payable {
  static [Symbol.hasInstance](value) {
    return typeof value?.charge === "function" && typeof value?.refund === "function";
  }
}

const card = { charge() {}, refund() {} };
const voucher = { charge() {} };

console.log(card instanceof Payable, voucher instanceof Payable, null instanceof Payable);
```

Output of `node has-instance.js` and of the browser terminal

```ts
true false false
```

It works, but it makes `instanceof` mean something different from what every reader expects, so most codebases avoid it. A plain function `isPayable(value)` says the same thing without surprising anyone.

### Symbols are not a safe brand

A **brand check** answers "was this object really created by my class?". [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#members) built one with a private field, `#field in value`, because `instanceof` can be fooled by `Object.create`. A symbol key looks like a simpler brand, but spread copies symbol keys, so a plain object can inherit the brand by accident, or on purpose. A `#private` field cannot be copied or forged:

brand.js

```ts
const moneyBrand = Symbol("Money");

class Money {
  #minor;
  constructor(minor) {
    this.#minor = minor;
    this[moneyBrand] = true;
  }
  static isMoney(value) {
    return typeof value === "object" && value !== null && #minor in value;
  }
}

const real = new Money(500);
const fake = { ...real, minor: 99999999 };

console.log("symbol brand:", real[moneyBrand], fake[moneyBrand]);
console.log("private brand:", Money.isMoney(real), Money.isMoney(fake));
```

Output of `node brand.js` and of the browser terminal

```ts
symbol brand: true true
private brand: true false
```

Use symbols to avoid *clashes*; use private fields to guarantee *identity*.

## Symbol.dispose and using

In [Generators](https://zudojs.oyinlola.site/learn/js-generators#cleanup), closing a cursor needed a `try`/`finally`. A newer language feature, **explicit resource management**, turns that pattern into a declaration. An object with a `[Symbol.dispose]()` method can be declared with `using` instead of `const`; when the block ends, however it ends, JavaScript calls the method. Several `using` declarations are disposed in reverse order, the way you would close nested resources by hand:

using.jsNode.js only

```ts
function openLock(seat) {
  console.log(`  lock ${seat}`);
  return {
    seat,
    [Symbol.dispose]() {
      console.log(`  unlock ${seat}`);
    },
  };
}

function bookSeats(first, second, fail) {
  using a = openLock(first);
  using b = openLock(second);
  if (fail) throw new Error(`payment failed for ${a.seat}+${b.seat}`);
  console.log("  booked");
}

console.log("success:");
bookSeats("12A", "12B", false);

console.log("failure:");
try {
  bookSeats("14A", "14B", true);
} catch (error) {
  console.log(" ", error.message);
}
```

Output of `node using.js`

```ts
success:
  lock 12A
  lock 12B
  booked
  unlock 12B
  unlock 12A
failure:
  lock 14A
  lock 14B
  unlock 14B
  unlock 14A
  payment failed for 14A+14B
```

`using` and `Symbol.dispose` work in Node.js 24 and current Chrome, but not yet in every browser (nor in this site's browser terminal, which is why the example above is marked Node.js only), and TypeScript needs a recent `lib` setting to know them. The idea to take away is the design: resource types advertise "this is how I am closed" through a well-known symbol, and the language calls it at the right moment. `Symbol.asyncDispose` with `await using` is the asynchronous twin, for closing database connections.

## Custom protocols

The well-known symbols are protocols: agreements of the form "if your object has a method under this key, I will call it". You can define your own, for the same reason the language does: a symbol key cannot collide with the data your users put in their objects.

A real need: logs must never contain card numbers or passwords. A logger cannot know every type in the application, so it defines a protocol. Any object that implements `[redact]()` is asked for a safe version of itself before it is logged:

redact.js

```ts
export const redact = Symbol.for("shop.log.redact");

export function safeForLog(value, depth = 0) {
  if (depth > 5) return "[too deep]";
  if (value === null || typeof value !== "object") return value;
  if (typeof value[redact] === "function") return safeForLog(value[redact](), depth + 1);
  if (Array.isArray(value)) return value.map((item) => safeForLog(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeForLog(item, depth + 1)]));
}
```

use-redact.js

```ts
import { redact, safeForLog } from "./redact.js";

class Card {
  constructor(number, holder) {
    this.number = number;
    this.holder = holder;
  }
  [redact]() {
    return { holder: this.holder, last4: this.number.slice(-4) };
  }
}

const payment = {
  orderId: "ORD-7",
  card: new Card("4111111111111111", "Ada Obi"),
  redact: "a field that happens to be called redact",
  attempts: [{ at: 1, card: new Card("5500000000000004", "Ada Obi") }],
};

console.log(JSON.stringify(safeForLog(payment), null, 2));
```

Output of `node use-redact.js` and of the browser terminal

```json
{
  "orderId": "ORD-7",
  "card": {
    "holder": "Ada Obi",
    "last4": "1111"
  },
  "redact": "a field that happens to be called redact",
  "attempts": [
    {
      "at": 1,
      "card": {
        "holder": "Ada Obi",
        "last4": "0004"
      }
    }
  ]
}
```

The protocol has the properties a good protocol needs:

- **No clashes.** The payment's own string field named `redact` was logged as ordinary data, because it is not the symbol.
- **Opt-in.** The logger does not need a list of types; each type decides how it is shown.
- **Works across copies.** It uses `Symbol.for` with a namespaced name, so a `Card` class from another package, or another copy of this one, can implement it without importing the logger.
- **Bounded.** The `depth` limit stops a `[redact]()` that returns itself, or a circular structure, from recursing forever ([Recursion](https://zudojs.oyinlola.site/learn/js-recursion#overflow)).

Node's `console.log` has a protocol of exactly this shape: an object with a method under `Symbol.for("nodejs.util.inspect.custom")` decides how it is printed. It only affects Node's printing, so this example is Node-only:

inspect.jsNode.js only

```ts
const inspect = Symbol.for("nodejs.util.inspect.custom");

class Card {
  constructor(number) {
    this.number = number;
  }
  [inspect]() {
    return `Card(**** ${this.number.slice(-4)})`;
  }
}

console.log(new Card("4111111111111111"));
console.log({ paidWith: new Card("5500000000000004") });
```

Output of `node inspect.js`

```ts
Card(**** 1111)
{ paidWith: Card(**** 0004) }
```

> WATCH OUT
>
> A display hook only changes what one tool prints. `JSON.stringify`, error trackers and database logs still see the raw fields. Never rely on a hook for secrecy; keep secrets out of objects that get logged at all, or pass everything through one function like `safeForLog`.

## When symbols trip you up

traps.js

```ts
const tag = Symbol("tag");

try {
  console.log("key: " + tag);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(`key: ${tag.description}`, `key: ${String(tag)}`);

try {
  new Symbol("tag");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

const product = { sku: "RICE-5", [tag]: "promo" };
const fromApi = JSON.parse(JSON.stringify(product));
console.log(fromApi[tag], Object.keys(fromApi));

const noDescription = Symbol();
console.log(noDescription.description, noDescription.toString());
```

Output of `node traps.js` and of the browser terminal

```ts
TypeError: Cannot convert a Symbol value to a string
key: tag key: Symbol(tag)
TypeError: Symbol is not a constructor
undefined [ 'sku' ]
undefined Symbol()
```

| Trap | Why | Do instead |
| --- | --- | --- |
| `"text" + sym` throws | Symbols refuse implicit conversion to text | `sym.description` or `String(sym)` |
| `new Symbol()` throws | Symbols are primitives, not objects | Call `Symbol()` without `new` |
| Symbol data vanished after an API round trip | JSON and `structuredClone` drop symbol keys | Keep only local metadata in symbol keys |
| A brand check passes on a copy | Spread and `Object.assign` copy symbol keys | `#private` field and `#field in value` |
| A check fails between two copies of a package | Each copy called `Symbol()` separately | `Symbol.for("package.name")` for shared protocols |
| `"Total: " + money` gives the wrong hint | Binary `+` passes `"default"`, not `"string"` | Template literals for text |

## Before you build: the rules of Money

REASON IT OUT

### Decide what Money allows

You will now build the `Money` type properly. Decide before reading the code:

- Which conversions should work, which should throw, and what should each throw say?
- What should `ngn.plus(usd)` do? What about `ngn.times(1.075)` for VAT, which produces a fraction of a kobo?
- What amounts should the constructor refuse?
- Should a `Money` be changeable after it is created? What goes wrong if it is?
- How should it look in `JSON.stringify`, which does not use `Symbol.toPrimitive`?

**Show the reasoning**

- **Conversions**: `"string"` formats with `Intl.NumberFormat`. `"number"` and `"default"` throw a `TypeError` that names the methods to use. Money should never silently become a bare number.
- **Arithmetic**: `plus` and `minus` require the same currency and throw otherwise (converting needs an exchange rate, which is a separate, explicit step). `times` rounds to a whole minor unit, and the rounding rule is written in one place.
- **Constructor**: only safe integers of minor units, and a three-letter currency code. `1.5` kobo, `NaN` and `"500"` are refused where they enter.
- **Immutable**: yes. Operations return new `Money` objects, and the instance is frozen. If a shared price object could be changed, a discount applied to one cart would change every cart holding that price ([shared references](https://zudojs.oyinlola.site/learn/js-types-deep#copy-or-share)).
- **JSON**: `JSON.stringify` calls a `toJSON()` method if there is one. Return `{ minor, currency }`, the exact stored data, never the formatted text, which cannot be parsed back reliably.

## Build: a Money type that cannot be misused

The logging protocol symbol gets its own tiny module, so that both `Money` and the logger can import it:

redact-symbol.js

```ts
export const redact = Symbol.for("shop.log.redact");
```

Then the type itself:

money.js

```ts
import { redact } from "./redact-symbol.js";

export class Money {
  #minor;
  #currency;

  constructor(minor, currency) {
    if (!Number.isSafeInteger(minor)) throw new RangeError(`minor units must be a safe integer, got ${String(minor)}`);
    if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`currency must be a 3-letter code, got ${String(currency)}`);
    this.#minor = minor;
    this.#currency = currency;
    Object.freeze(this);
  }

  get minor() { return this.#minor; }
  get currency() { return this.#currency; }

  static isMoney(value) {
    return typeof value === "object" && value !== null && #minor in value;
  }

  #sameCurrency(other, action) {
    if (!Money.isMoney(other)) throw new TypeError(`cannot ${action} Money and ${typeof other}`);
    if (other.#currency !== this.#currency) {
      throw new TypeError(`cannot ${action} ${this.#currency} and ${other.#currency}; convert first`);
    }
  }

  plus(other) {
    this.#sameCurrency(other, "add");
    return new Money(this.#minor + other.#minor, this.#currency);
  }
  minus(other) {
    this.#sameCurrency(other, "subtract");
    return new Money(this.#minor - other.#minor, this.#currency);
  }
  times(factor) {
    return new Money(Math.round(this.#minor * factor), this.#currency);
  }
  compare(other) {
    this.#sameCurrency(other, "compare");
    return Math.sign(this.#minor - other.#minor);
  }

  [Symbol.toPrimitive](hint) {
    if (hint === "string") {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: this.#currency }).format(this.#minor / 100);
    }
    throw new TypeError(`Money cannot be used as a ${hint} value; use plus(), minus(), times() or compare()`);
  }
  get [Symbol.toStringTag]() { return "Money"; }
  toJSON() { return { minor: this.#minor, currency: this.#currency }; }
  [redact]() { return `${this}`; }
}
```

Every rule from the reasoning step is in there: validation in the constructor, private fields so the numbers cannot be changed or forged, `Object.freeze` so no new fields can be added, currency checks in one private helper, and each hook doing one job. `Money` also joins the logging protocol from the previous section, so a logger that knows nothing about money prints it formatted. Now use it:

main.js

```ts
import { Money } from "./money.js";

const rice = new Money(850000, "NGN");
const oil = new Money(320000, "NGN");
const subtotal = rice.times(2).plus(oil);
const vat = subtotal.times(0.075);
const total = subtotal.plus(vat);

console.log(`Subtotal ${subtotal}, VAT ${vat}, total ${total}`);
console.log(Object.prototype.toString.call(total), JSON.stringify({ total }));
console.log(total.compare(new Money(2000000, "NGN")));

const shipping = new Money(2500, "USD");
for (const mistake of [() => total.plus(shipping), () => total + shipping, () => total.plus(500), () => new Money(10.5, "NGN")]) {
  try {
    mistake();
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  }
}
```

Output of `node main.js` and of the browser terminal

```ts
Subtotal ₦20,200.00, VAT ₦1,515.00, total ₦21,715.00
[object Money] {"total":{"minor":2171500,"currency":"NGN"}}
1
TypeError: cannot add NGN and USD; convert first
TypeError: Money cannot be used as a default value; use plus(), minus(), times() or compare()
TypeError: cannot add Money and number
RangeError: minor units must be a safe integer, got 10.5
```

### Testing Money

The tests check the rules, including the ones that must throw, and the boundaries where rounding happens:

money.test.js

```ts
import { Money } from "./money.js";
import { redact } from "./redact-symbol.js";

function check(label, run, expected) {
  let actual;
  try {
    actual = run();
  } catch (error) {
    actual = `${error.name}`;
  }
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label} -> ${actual}`);
}

const ngn = (minor) => new Money(minor, "NGN");

check("formats in text", () => `${ngn(150050)}`, "₦1,500.50");
check("adds same currency", () => `${ngn(100).plus(ngn(250))}`, "₦3.50");
check("rounds half a kobo up", () => ngn(1).times(0.5).minor, 1);
check("rounds a VAT fraction", () => ngn(333).times(0.075).minor, 25);
check("refuses mixed currencies", () => ngn(1).plus(new Money(1, "USD")), "TypeError");
check("refuses +", () => ngn(1) + ngn(1), "TypeError");
check("refuses >", () => ngn(2) > ngn(1), "TypeError");
check("refuses fractional kobo", () => ngn(0.5), "RangeError");
check("refuses a lowercase code", () => new Money(1, "ngn"), "RangeError");
check("refuses a string amount", () => new Money("500", "NGN"), "RangeError");
check("cannot be changed", () => { "use strict"; const m = ngn(1); m.discount = 1; }, "TypeError");
check("spread copy is not Money", () => Money.isMoney({ ...ngn(1) }), false);
check("JSON keeps exact data", () => JSON.stringify(ngn(150050)), '{"minor":150050,"currency":"NGN"}');
check("log protocol", () => ngn(150050)[redact](), "₦1,500.50");
```

Output of `node money.test.js` and of the browser terminal

```ts
PASS formats in text -> ₦1,500.50
PASS adds same currency -> ₦3.50
PASS rounds half a kobo up -> 1
PASS rounds a VAT fraction -> 25
PASS refuses mixed currencies -> TypeError
PASS refuses + -> TypeError
PASS refuses > -> TypeError
PASS refuses fractional kobo -> RangeError
PASS refuses a lowercase code -> RangeError
PASS refuses a string amount -> RangeError
PASS cannot be changed -> TypeError
PASS spread copy is not Money -> false
PASS JSON keeps exact data -> {"minor":150050,"currency":"NGN"}
PASS log protocol -> ₦1,500.50
```

### In production

- **Rounding is a business rule.** `Math.round` rounds halves up. Tax authorities and payment providers sometimes require other rules (banker's rounding, always down for discounts). Keep the rule in one method, and test the halves; [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) goes further.
- **Locale belongs to the viewer.** The `"string"` hint above always uses `en-NG`. A shop with customers in several countries formats at the edge, with an explicit `money.format(locale)` method, and keeps `${money}` for logs.
- **Symbols do not cross the network.** Hooks and symbol keys exist only in memory. Data sent to an API or stored in a database goes through `toJSON` and must be turned back into `Money` by explicit parsing and validation on the other side.
- **Namespace every registry symbol.** `Symbol.for("redact")` could be claimed by any library in the process; `Symbol.for("shop.log.redact")` will not be.

## Practice

TRY IT YOURSELF

### A Duration that prints and subtracts

Write a `Duration` class holding whole seconds. In text it should read like `1h 05m 09s`. Unlike money, durations may be used as numbers (seconds) for comparisons and arithmetic, but a binary `+` with a string must still produce readable text. Use `Symbol.toPrimitive` to make `"number"` return seconds and both `"string"` and `"default"` return the text.

**Show a solution**

duration.js

```ts
class Duration {
  constructor(seconds) {
    if (!Number.isInteger(seconds) || seconds < 0) throw new RangeError("seconds must be a whole number >= 0");
    this.seconds = seconds;
  }
  [Symbol.toPrimitive](hint) {
    if (hint === "number") return this.seconds;
    const h = Math.floor(this.seconds / 3600);
    const m = Math.floor((this.seconds % 3600) / 60);
    const s = this.seconds % 60;
    return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  }
}

const delivery = new Duration(3909);
const pickup = new Duration(1200);

console.log(`Delivery takes ${delivery}`);
console.log("Pickup: " + pickup);
console.log(delivery > pickup, delivery - pickup, Math.max(delivery, pickup));
```

Output of `node duration.js` and of the browser terminal

```ts
Delivery takes 1h 05m 09s
Pickup: 0h 20m 00s
true 2709 3909
```

This is the same technique with a different policy. For durations, "a number of seconds" is a meaningful number, so the `"number"` hint is allowed. For money, a bare number loses the currency, so it is not. `Symbol.toPrimitive` lets each type choose.

TRY IT YOURSELF

### A plugin marker across packages

A shop platform loads plugins from separate packages. A plugin is any object marked with the registry symbol `Symbol.for("shop.plugin")` whose value is `{ name, version }`. Write `loadPlugins(candidates)` that returns the names and versions of the marked objects and ignores the rest, including an object with a *string* key `"shop.plugin"`.

**Show a solution**

plugins.js

```ts
const PLUGIN = Symbol.for("shop.plugin");

function loadPlugins(candidates) {
  return candidates
    .filter((value) => typeof value === "object" && value !== null && typeof value[PLUGIN] === "object")
    .map((plugin) => `${plugin[PLUGIN].name}@${plugin[PLUGIN].version}`);
}

const paystackPlugin = { [Symbol.for("shop.plugin")]: { name: "paystack", version: "2.1.0" }, pay() {} };
const smsPlugin = { [Symbol.for("shop.plugin")]: { name: "sms", version: "1.0.3" } };
const lookalike = { "shop.plugin": { name: "fake", version: "0.0.0" } };

console.log(loadPlugins([paystackPlugin, lookalike, null, smsPlugin, "text"]));
```

Output of `node plugins.js` and of the browser terminal

```json
[ 'paystack@2.1.0', 'sms@1.0.3' ]
```

Each plugin wrote `Symbol.for("shop.plugin")` itself, without importing anything from the platform, and still produced the same key, because the registry is shared. The string key `"shop.plugin"` is a different key entirely, so the lookalike is ignored.

TRY IT YOURSELF

### An iterable, async-iterable order log

Write an `OrderLog` class with `add(event)`. Make it iterable with `Symbol.iterator` (events in order) and async-iterable with `Symbol.asyncIterator` (the same events, one per tick, as if streamed from a server). Give it the tag `OrderLog`.

**Show a solution**

order-log.js

```ts
class OrderLog {
  #events = [];
  add(event) {
    this.#events.push(event);
    return this;
  }
  *[Symbol.iterator]() {
    yield* this.#events;
  }
  async *[Symbol.asyncIterator]() {
    for (const event of this.#events) {
      await null;
      yield event;
    }
  }
  get [Symbol.toStringTag]() {
    return "OrderLog";
  }
}

const log = new OrderLog().add("created").add("paid").add("shipped");
console.log([...log].join(" -> "));
console.log(Object.prototype.toString.call(log));

for await (const event of log) console.log("stream:", event);
```

Output of `node order-log.js` and of the browser terminal

```ts
created -> paid -> shipped
[object OrderLog]
stream: created
stream: paid
stream: shipped
```

Three well-known symbols, three protocols, one small class: `for...of`, spread, `for await...of` and `Object.prototype.toString` all work because the class put methods under the keys each of them looks for.

## Recap

- A symbol is a unique primitive. As a property key it cannot clash with any string key or any other symbol, which is why the language uses symbols for its hooks.
- Symbol keys are skipped by `Object.keys`, `for...in`, JSON and `structuredClone`, and copied by spread and `Object.assign`. They are hidden from accidents, not private.
- `Symbol()` is local to the code that created it; `Symbol.for(name)` is shared through the global registry. Use the registry, with a namespaced name, for protocols that separately loaded code must agree on.
- `Symbol.toPrimitive(hint)` controls conversion with the hints `"number"`, `"string"` and `"default"` (binary `+` and `==`). Use it to allow text and refuse silent arithmetic.
- `Symbol.toStringTag` labels objects, `Symbol.hasInstance` customises `instanceof`, `Symbol.dispose` works with `using`, and `Symbol.iterator`/`Symbol.asyncIterator` drive iteration.
- For your own protocols, key the method by a symbol; for identity checks, use `#private` fields.

Next: [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional), where functions themselves become the building blocks of a checkout pipeline.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
