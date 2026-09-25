---
title: "Objects in depth — ZudoJS Academy"
description: "Lock an object's shape, validate writes with setters, hide fields, and copy and compare objects safely, by building a bank account that cannot be broken."
source: https://zudojs.oyinlola.site/learn/js-objects-deep
---

LEVEL 2 · LESSON 11 OF 19

Arrays and objects Foundation

# Objects in depth

Lock an object's shape, validate writes with setters, hide fields, and copy and compare objects safely, by building a bank account that cannot be broken.

- **50 min** to read and try
- **You need:** Objects and JSON, Arrays and Functions
- **You build:** A bank account object that rejects typos, bad amounts and outside edits, with a test list that proves it

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Create objects in the right form for the job, including dictionaries with no prototype
- Predict what spread, rest and Object.assign copy and what they leave behind
- Read and set property descriptors to make properties read-only or hidden
- Validate writes with getters and setters
- Choose between preventExtensions, seal and freeze, and deep-freeze a config
- Make shallow and deep copies on purpose and compare objects by identity or by content

## An account anyone can break

In [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data) you learned to build objects, read and change their properties, and copy them with spread. That is enough to write a first bank account for a small savings app. Amounts are kept in **kobo** (1 naira = 100 kobo), as whole numbers, so there are no floating point surprises:

problem.js

```ts
const account = {
  id: "ACC-001",
  owner: { name: "Ada Obi", phone: "0803 000 0000" },
  balanceKobo: 500000,
};

// 1. A typo creates a new property instead of failing.
account.balnceKobo = 0;

// 2. Someone stores text instead of a number.
account.balanceKobo = "500000";
account.balanceKobo = account.balanceKobo + 150000;

// 3. A "copy" for a printed statement changes the real account.
const statement = { ...account };
statement.owner.phone = "hidden";

console.log(account);
```

Output of `node problem.js` and of the browser terminal

```json
{
  id: 'ACC-001',
  owner: { name: 'Ada Obi', phone: 'hidden' },
  balanceKobo: '500000150000',
  balnceKobo: 0
}
```

Three ordinary lines of code and the account is broken in three different ways, and JavaScript did not complain once:

1. Assigning to a misspelled name silently *added* a property called `balnceKobo`.
2. The balance became a string, so `+` glued text together: Ada now has "500000150000".
3. Spread copied only the top level. `statement.owner` and `account.owner` are the same object, so hiding the phone number on the statement hid it on the account.

An object literal says nothing about which properties are allowed, which values are valid, or who may change them. This lesson gives you the tools to say all of that: how objects are created, what exactly copying copies, **property descriptors** that make a property read-only or hidden, **getters and setters** that check every write, three levels of locking, deep copies, and how to compare objects. At the end you rebuild this account so that each of the three lines above fails loudly instead.

## Five ways to create an object

Almost every object you have written so far was an **object literal**: properties between braces. It is the right choice most of the time. The other forms exist for specific jobs:

| Form | Example | Use it for |
| --- | --- | --- |
| Object literal | `{ id: 1, name: "Ada" }` | One object whose shape you know while writing the code |
| Factory function | `createAccount("Ada", 5000)` | Many objects of the same shape, with checks or private state |
| `Object.fromEntries` | `Object.fromEntries([["a", 1]])` | Building an object from data, such as rows or a transformed object |
| `Object.create(proto)` | `Object.create(null)` | Choosing the object's prototype, or having none |
| `new` with a class | `new Account("Ada")` | Many objects sharing methods (see [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes)) |

A **factory function** is an ordinary function that builds and returns a new object. It is a good place to validate input, because every object has to pass through it:

factory.js

```ts
function createProduct(name, priceKobo) {
  if (!Number.isInteger(priceKobo) || priceKobo < 0) {
    throw new Error(`Invalid price for ${name}: ${priceKobo}`);
  }
  return { name, priceKobo, createdBy: "catalogue" };
}

const rice = createProduct("Rice 5kg", 850000);
console.log(rice);

try {
  createProduct("Beans", "free");
} catch (error) {
  console.log(error.message);
}

const rows = [["sku", "RICE-5"], ["stock", 42]];
console.log(Object.fromEntries(rows));
```

Output of `node factory.js` and of the browser terminal

```json
{ name: 'Rice 5kg', priceKobo: 850000, createdBy: 'catalogue' }
Invalid price for Beans: free
{ sku: 'RICE-5', stock: 42 }
```

### Object.create(null): a dictionary with nothing inherited

Every object literal is linked to `Object.prototype`, a shared object that gives it methods such as `toString` and `hasOwnProperty`. You will study that link, the **prototype**, in [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes). For now, one consequence matters: an ordinary object already "has" some names you never wrote. That breaks code that uses an object as a **dictionary**, a lookup table whose keys come from data:

dictionary.js

```ts
const words = ["price", "constructor", "price", "toString"];

const counts = {};
for (const word of words) {
  counts[word] = (counts[word] || 0) + 1;
}
console.log(counts.price, typeof counts.constructor, typeof counts.toString);

const safeCounts = Object.create(null);
for (const word of words) {
  safeCounts[word] = (safeCounts[word] ?? 0) + 1;
}
console.log(safeCounts);
console.log("constructor" in {}, "constructor" in Object.create(null));
```

Output of `node dictionary.js` and of the browser terminal

```ts
2 string string
[Object: null prototype] { price: 2, constructor: 1, toString: 1 }
true false
```

In the first loop, `counts["constructor"]` did not start as `undefined`. It started as the inherited `Object` function, and `function + 1` gave a string. The same happened to `toString`. The dictionary built with `Object.create(null)` has no prototype at all, so the only keys it has are the ones you put in; Node prints it with the label `[Object: null prototype]` to remind you of that.

With keys that come from users (tags, product names, words from a search box), use `Object.create(null)` or, better, a `Map`, which you meet in [the lesson on collections](https://zudojs.oyinlola.site/learn/js-collections).

## Property keys: strings, symbols and order

A property key is always a **string** or a **symbol** (a unique value made with `Symbol()`, covered in [the lesson on symbols](https://zudojs.oyinlola.site/learn/js-symbols)). Anything else you use as a key is turned into a string first. That includes numbers, and it includes objects, which become the string `"[object Object]"`:

keys.js

```ts
const stock = {};
stock[1] = "Rice";
stock["1"] = "Beans";
console.log(stock, Object.keys(stock));

const ada = { id: 1 };
const grace = { id: 2 };
const carts = {};
carts[ada] = ["rice"];
carts[grace] = ["beans"];
console.log(carts);
```

Output of `node keys.js` and of the browser terminal

```json
{ '1': 'Beans' } [ '1' ]
{ '[object Object]': [ 'beans' ] }
```

`stock[1]` and `stock["1"]` are the same property. And both users' carts landed on one key, `"[object Object]"`, so Grace's cart replaced Ada's. When the key is an object, you need a `Map`, which keeps keys by identity.

### Computed keys

You met computed properties in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#shorthand): `{ [key]: value }`. Any expression works between the brackets, including a template literal. This is handy when a key is built from data:

computed.js

```ts
function priceField(currency, amount) {
  return { [`price${currency}`]: amount, [`${currency.toLowerCase()}Set`]: true };
}

console.log(priceField("NGN", 850000));
console.log(priceField("USD", 550));

const field = "status";
const update = { [field]: "shipped", [field + "At"]: "2026-09-24" };
console.log(update);
```

Output of `node computed.js` and of the browser terminal

```json
{ priceNGN: 850000, ngnSet: true }
{ priceUSD: 550, usdSet: true }
{ status: 'shipped', statusAt: '2026-09-24' }
```

### The order of keys

`Object.keys`, `for...in`, spread and `JSON.stringify` all list keys in the same order, and it is not always the order you wrote them. Keys that look like whole numbers (`"2"`, `"10"`) come first, sorted as numbers. Then come the other string keys, in the order they were added:

order.js

```ts
const seats = { B: "Grace", 10: "Chidi", A: "Ada", 2: "Tunde" };
console.log(Object.keys(seats));

const invoices = { "INV-10": 5000, "INV-2": 1200 };
console.log(Object.keys(invoices));
```

Output of `node order.js` and of the browser terminal

```json
[ '2', '10', 'B', 'A' ]
[ 'INV-10', 'INV-2' ]
```

Seat numbers jumped to the front and were sorted; the letter keys kept their insertion order. The invoice keys are not whole numbers, so they stay in insertion order and are *not* sorted. Never rely on key order for meaning. If order matters, keep an array, or sort the keys yourself when you print.

## What spread, rest and Object.assign really copy

Spread `{ ...source }` looks like "copy the object". It is more precise than that, and the details decide whether your copy works. Spread copies each **own, enumerable** property of the source:

- **Own** means stored on the object itself, not inherited from its prototype. Methods that live on a class's prototype are not copied.
- **Enumerable** means "shows up when you list the keys". Most properties are; the descriptors section shows how to make one that is not.
- A **getter** (a property that runs a function when read, explained below) is *called*, and its current result is copied as a plain value.

spread-copies.js

```ts
class Account {
  constructor(owner, balanceKobo) {
    this.owner = owner;
    this.balanceKobo = balanceKobo;
  }
  deposit(amountKobo) {
    this.balanceKobo += amountKobo;
  }
}

const real = new Account("Ada", 500000);
const copy = { ...real };

console.log(copy);
console.log(typeof real.deposit, typeof copy.deposit);
console.log(real instanceof Account, copy instanceof Account);

const cart = {
  items: [{ sku: "RICE-5", priceKobo: 850000 }, { sku: "OIL-1", priceKobo: 320000 }],
  get totalKobo() {
    return this.items.reduce((sum, item) => sum + item.priceKobo, 0);
  },
};
const snapshot = { ...cart };
cart.items.push({ sku: "SALT", priceKobo: 20000 });
console.log(cart.totalKobo, snapshot.totalKobo);
```

Output of `node spread-copies.js` and of the browser terminal

```json
{ owner: 'Ada', balanceKobo: 500000 }
function undefined
true false
1190000 1170000
```

The copy of the account kept the data but lost the `deposit` method and is no longer an `Account`. The cart's `totalKobo` getter was frozen into the number it had at copy time; `snapshot.totalKobo` is now a plain number that will never change. Sometimes that is exactly what you want (a snapshot for an order confirmation), sometimes it is a bug.

### Merging: later wins

When two sources have the same key, the one written later wins. So the position of the spread decides between "defaults" and "overrides". Spreading `null` or `undefined` is allowed and adds nothing, which gives a neat way to add a property only when a condition holds:

merge.js

```ts
const defaults = { currency: "NGN", deliveryKobo: 150000, giftWrap: false };
const request = { deliveryKobo: 0, giftWrap: true };

console.log({ ...defaults, ...request });
console.log({ ...request, ...defaults });

const isVip = true;
const note = null;
const order = {
  id: "ORD-7",
  ...(isVip && { priority: "high" }),
  ...(note && { note }),
};
console.log(order);
```

Output of `node merge.js` and of the browser terminal

```json
{ currency: 'NGN', deliveryKobo: 0, giftWrap: true }
{ deliveryKobo: 150000, giftWrap: false, currency: 'NGN' }
{ id: 'ORD-7', priority: 'high' }
```

The second line is a real bug pattern: the defaults were spread last and overwrote what the customer asked for. `...(isVip && { priority: "high" })` spreads the object when `isVip` is true, and spreads `false` (which adds nothing) when it is not. The same trick with `note` left out the `note` property entirely instead of storing `null`.

### Object.assign writes into its target

`Object.assign(target, ...sources)` copies the same own, enumerable properties, but it *assigns* them into an existing target and returns that target. Two consequences: it changes the target, and assigning goes through any setter the target has. Spread always builds a brand new object and never calls setters. Use spread to build new objects; use `Object.assign` only when you really mean to change an existing one.

### Rest: everything except

Rest in a destructuring pattern, `const { a, ...others } = obj`, is the mirror image: it collects every own, enumerable property you did not name into a new object. It is the standard way to remove fields before sending an object somewhere else:

rest.js

```ts
const customer = {
  id: 7,
  name: "Ada Obi",
  email: "ada@example.com",
  passwordHash: "<hash>",
  bvn: "22212345678",
};

const { passwordHash, bvn, ...publicCustomer } = customer;
console.log(publicCustomer);

function omit(obj, ...keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
}
console.log(omit(customer, "passwordHash", "bvn", "email"));
```

Output of `node rest.js` and of the browser terminal

```json
{ id: 7, name: 'Ada Obi', email: 'ada@example.com' }
{ id: 7, name: 'Ada Obi' }
```

Destructuring can also rename properties and give them defaults; [Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern#destructuring) covers all the forms. Keep in mind that removing fields with rest is a *block-list*: when someone adds a new secret field to `customer` next year, it leaks. For data that leaves your server, an allow-list, as in the profile system of [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#build), is safer.

## Property descriptors

So far a property has been a name and a value. Underneath, every property also has three yes-or-no settings, called **attributes**. Together with the value they form the property's **descriptor**:

- `writable`: can the value be changed by assignment?
- `enumerable`: does the property show up in `Object.keys`, `for...in`, spread and `JSON.stringify`?
- `configurable`: can the property be deleted, or its attributes changed later?

`Object.getOwnPropertyDescriptor(obj, key)` shows them. `Object.defineProperty(obj, key, descriptor)` creates or changes a property with exactly the attributes you choose:

descriptor.js

```ts
const account = { owner: "Ada" };
console.log(Object.getOwnPropertyDescriptor(account, "owner"));

Object.defineProperty(account, "id", { value: "ACC-001" });
console.log(Object.getOwnPropertyDescriptor(account, "id"));
console.log(account.id, Object.keys(account));

try {
  account.id = "ACC-999";
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(account.id);
```

Output of `node descriptor.js` and of the browser terminal

```json
{ value: 'Ada', writable: true, enumerable: true, configurable: true }
{
  value: 'ACC-001',
  writable: false,
  enumerable: false,
  configurable: false
}
ACC-001 [ 'owner' ]
TypeError: Cannot assign to read only property 'id' of object '#<Object>'
ACC-001
```

Two things to learn from this:

- A property made by normal assignment or a literal has all three attributes `true`. A property made by `defineProperty` has every attribute you leave out set to `false`. So `id` is read-only, hidden from `Object.keys`, and cannot be deleted, all from one line.
- Writing to a read-only property throws a `TypeError` in **strict mode**. Strict mode is a stricter set of rules that turns silent mistakes into errors. It is always on inside ES modules and classes, which is how every example in this course runs. In old non-module scripts, the same assignment is silently ignored, which is far harder to debug.

### Hidden, but still there

A non-enumerable property is not secret. It is only left out of listings. You can still read it, and `Object.getOwnPropertyNames` lists it:

hidden.js

```ts
const order = { id: "ORD-7", totalKobo: 1170000 };
Object.defineProperty(order, "internalNote", {
  value: "customer called twice",
  enumerable: false,
  writable: true,
});

console.log(order);
console.log(JSON.stringify(order));
console.log({ ...order });
console.log(order.internalNote);
console.log(Object.getOwnPropertyNames(order));
```

Output of `node hidden.js` and of the browser terminal

```json
{ id: 'ORD-7', totalKobo: 1170000 }
{"id":"ORD-7","totalKobo":1170000}
{ id: 'ORD-7', totalKobo: 1170000 }
customer called twice
[ 'id', 'totalKobo', 'internalNote' ]
```

This is how JavaScript's own objects keep their methods out of your loops: `Array.prototype.map` is non-enumerable, so `for...in` over an array does not list it. It is also useful for bookkeeping data that should not go into JSON. It is *not* a way to protect passwords or tokens: any code that has the object can read them.

> NOTE
>
> You can define several properties at once with `Object.defineProperties(obj, { a: {…}, b: {…} })`, and read all descriptors with `Object.getOwnPropertyDescriptors(obj)`. Together they make a copy that keeps getters, setters and attributes: `Object.defineProperties({}, Object.getOwnPropertyDescriptors(source))`. Spread cannot do that.

## Getters and setters

A property does not have to store a value. An **accessor property** runs a function instead: a **getter** runs when the property is read, a **setter** runs when it is assigned. From the outside it looks like a normal property. In a plain object you write them with `get` and `set` in the literal; classes use the same syntax, as you will see in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#members).

A getter suits a value that is *derived* from other data, so it can never be out of date. A setter suits a value that must be *checked* before it is stored:

accessors.js

```ts
function createWallet(owner) {
  let balanceKobo = 0;
  return {
    owner,
    get balanceKobo() {
      return balanceKobo;
    },
    set balanceKobo(value) {
      if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`balance must be a whole, non-negative number of kobo, got ${JSON.stringify(value)}`);
      }
      balanceKobo = value;
    },
    get balance() {
      return `₦${(balanceKobo / 100).toFixed(2)}`;
    },
  };
}

const wallet = createWallet("Ada");
wallet.balanceKobo = 250050;
console.log(wallet.balance, wallet.balanceKobo);

for (const bad of ["500000", -1, 10.5]) {
  try {
    wallet.balanceKobo = bad;
  } catch (error) {
    console.log(error.message);
  }
}

try {
  wallet.balance = "₦1,000,000.00";
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

console.log(wallet);
console.log(JSON.stringify(wallet));
```

Output of `node accessors.js` and of the browser terminal

```ts
₦2500.50 250050
balance must be a whole, non-negative number of kobo, got "500000"
balance must be a whole, non-negative number of kobo, got -1
balance must be a whole, non-negative number of kobo, got 10.5
TypeError: Cannot set property balance of #<Object> which has only a getter
{ owner: 'Ada', balanceKobo: [Getter/Setter], balance: [Getter] }
{"owner":"Ada","balanceKobo":250050,"balance":"₦2500.50"}
```

Read it closely:

- The real number lives in the variable `balanceKobo` inside `createWallet`, kept alive by a closure ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures) explains how). The only way to change it is through the setter, and the setter refuses strings, negatives and fractions of a kobo.
- `balance` has a getter and no setter, so it is read-only: assigning to it throws in strict mode.
- `console.log` does not run getters; it shows `[Getter]` or `[Getter/Setter]`. `JSON.stringify` does run them, so the JSON contains the current values.

> A setter that assigns to itself never ends
>
> Inside `set balanceKobo(value)`, writing `this.balanceKobo = value` calls the same setter again, which calls it again, until the stack overflows with `RangeError: Maximum call stack size exceeded`. Store the real value somewhere else: a closure variable as above, a `#private` field in a class, or a differently named property.

### Accessors with defineProperty

You can add an accessor to an existing object with `defineProperty`. Its descriptor has `get` and `set` instead of `value` and `writable`; you cannot mix the two kinds:

define-accessor.js

```ts
const order = { items: [{ priceKobo: 850000, qty: 2 }, { priceKobo: 20000, qty: 3 }] };

Object.defineProperty(order, "totalKobo", {
  get() {
    return this.items.reduce((sum, item) => sum + item.priceKobo * item.qty, 0);
  },
  enumerable: true,
});

console.log(order.totalKobo);
order.items.push({ priceKobo: 5000, qty: 1 });
console.log(order.totalKobo);
console.log(Object.getOwnPropertyDescriptor(order, "totalKobo"));

try {
  Object.defineProperty(order, "vat", { value: 7.5, get() { return 7.5; } });
} catch (error) {
  console.log(error.name);
}
```

Output of `node define-accessor.js` and of the browser terminal

```ts
1760000
1765000
{
  get: [Function: get],
  set: undefined,
  enumerable: true,
  configurable: false
}
TypeError
```

The total follows the items automatically, because it is computed on every read. A getter should be cheap and should not change anything: code that reads `order.totalKobo` expects a read, not a side effect. If the work is expensive, a plain method such as `order.computeTotal()` makes the cost visible to the caller.

## Locking objects: preventExtensions, seal and freeze

Descriptors lock one property at a time. Three built-in functions lock a whole object at once, each a little tighter than the last:

|  | Add a property | Delete a property | Change a value | Check with |
| --- | --- | --- | --- | --- |
| Normal object | yes | yes | yes |  |
| `Object.preventExtensions` | no | yes | yes | `Object.isExtensible` |
| `Object.seal` | no | no | yes | `Object.isSealed` |
| `Object.freeze` | no | no | no | `Object.isFrozen` |

`seal` makes every property non-configurable; `freeze` also makes every data property non-writable. All three return the same object they were given (not a copy), and none can be undone. In strict mode, every forbidden change throws a `TypeError`:

locking.js

```ts
function attempt(label, change) {
  try {
    change();
    console.log(`${label}: ok`);
  } catch (error) {
    console.log(`${label}: ${error.message}`);
  }
}

const sealed = Object.seal({ owner: "Ada", balanceKobo: 500000 });
attempt("sealed, typo", () => { sealed.balnceKobo = 0; });
attempt("sealed, delete", () => { delete sealed.owner; });
attempt("sealed, change", () => { sealed.balanceKobo = 400000; });

const frozen = Object.freeze({ currency: "NGN", vatPercent: 7.5 });
attempt("frozen, change", () => { frozen.vatPercent = 0; });

const limited = Object.preventExtensions({ owner: "Ada", note: "VIP" });
attempt("limited, add", () => { limited.extra = 1; });
attempt("limited, delete", () => { delete limited.note; });

console.log(Object.isSealed(sealed), Object.isFrozen(frozen), Object.isExtensible(limited));
console.log(sealed, frozen, limited);
```

Output of `node locking.js` and of the browser terminal

```ts
sealed, typo: Cannot add property balnceKobo, object is not extensible
sealed, delete: Cannot delete property 'owner' of #<Object>
sealed, change: ok
frozen, change: Cannot assign to read only property 'vatPercent' of object '#<Object>'
limited, add: Cannot add property extra, object is not extensible
limited, delete: ok
true true false
{ owner: 'Ada', balanceKobo: 400000 } { currency: 'NGN', vatPercent: 7.5 } { owner: 'Ada' }
```

Seal is the tool against the typo bug from the start of the lesson: the shape is fixed, the values can still change. Freeze is the tool for values that must never change after start-up, such as configuration and lookup tables.

### Freeze is shallow

Like spread, `Object.freeze` only works on one level. A frozen object's nested objects are still perfectly changeable:

shallow-freeze.js

```ts
const config = Object.freeze({
  currency: "NGN",
  deliveryKobo: { lagos: 150000, abuja: 250000 },
});

config.deliveryKobo.lagos = 0;
console.log(config.deliveryKobo.lagos, Object.isFrozen(config.deliveryKobo));

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

const safeConfig = deepFreeze({
  currency: "NGN",
  deliveryKobo: { lagos: 150000, abuja: 250000 },
  zones: ["lagos", "abuja"],
});

try {
  safeConfig.deliveryKobo.lagos = 0;
} catch (error) {
  console.log(error.message);
}
try {
  safeConfig.zones.push("kano");
} catch (error) {
  console.log(error.message);
}
```

Output of `node shallow-freeze.js` and of the browser terminal

```ts
0 false
Cannot assign to read only property 'lagos' of object '#<Object>'
Cannot add property 2, object is not extensible
```

`deepFreeze` freezes every nested object and array before freezing the object itself. It calls itself for each nested value, which is **recursion** (the whole topic of [Recursion](https://zudojs.oyinlola.site/learn/js-recursion)). `Reflect.ownKeys` lists every own key, including non-enumerable and symbol keys, so nothing is skipped. The check for `Object.isFrozen` stops it from walking the same object twice.

Arrays are objects too: freezing one makes `push`, `pop`, `sort` and index assignment throw. `map`, `filter` and `toSorted` still work, because they return new arrays.

## Shallow and deep copies

You now have four ways to "copy" an object, and they give four different results. A **shallow copy** is a new top-level object whose nested objects are still shared with the original. A **deep copy** copies every level, so nothing is shared.

| Code | What you get |
| --- | --- |
| `const b = a` | No copy at all: a second name for the same object |
| `{ ...a }`, `Object.assign({}, a)` | Shallow copy of own enumerable properties; getters become values; prototype lost |
| `structuredClone(a)` | Deep copy; keeps `Date`, `Map`, `Set` and shared or circular references; refuses functions; prototype lost |
| `JSON.parse(JSON.stringify(a))` | Deep copy of JSON-safe data only: dates become strings, `Map` becomes `{}`, `undefined` and functions vanish |

copies.js

```ts
const order = {
  id: "ORD-7",
  placedAt: new Date("2026-09-24T10:00:00Z"),
  items: [{ sku: "RICE-5", qty: 2 }],
  tags: new Set(["gift"]),
  couponCode: undefined,
};

const shallow = { ...order };
const cloned = structuredClone(order);
const viaJson = JSON.parse(JSON.stringify(order));

order.items[0].qty = 99;
console.log(shallow.items[0].qty, cloned.items[0].qty, viaJson.items[0].qty);

console.log(cloned.placedAt instanceof Date, typeof viaJson.placedAt);
console.log(cloned.tags, viaJson.tags);
console.log("couponCode" in cloned, "couponCode" in viaJson);
```

Output of `node copies.js` and of the browser terminal

```ts
99 2 2
true string
Set(1) { 'gift' } {}
true false
```

`structuredClone` is the right default for deep copies of data. The JSON round trip is older and still common in existing code; you can see why it causes bugs: the date is now a string, the set is an empty object, and a property disappeared.

### What structuredClone cannot copy

`structuredClone` copies *data*, not behaviour. It throws on functions, and it turns class instances into plain objects:

clone-limits.js

```ts
class Account {
  constructor(owner) {
    this.owner = owner;
    this.balanceKobo = 0;
  }
  deposit(amountKobo) {
    this.balanceKobo += amountKobo;
  }
}

const account = new Account("Ada");
const copy = structuredClone(account);
console.log(copy, copy instanceof Account, typeof copy.deposit);

try {
  structuredClone({ owner: "Ada", notify: () => console.log("sms sent") });
} catch (error) {
  console.log(error.name);
}

const shared = { city: "Lagos" };
const pair = { home: shared, delivery: shared };
const pairCopy = structuredClone(pair);
console.log(pairCopy.home === pairCopy.delivery, pairCopy.home === shared);
```

Output of `node clone-limits.js` and of the browser terminal

```json
{ owner: 'Ada', balanceKobo: 0 } false undefined
DataCloneError
true false
```

The last line shows something the JSON round trip cannot do: two properties that pointed at one object still point at one (new) object in the copy. `structuredClone` also handles an object that refers back to itself, a **circular reference**, where `JSON.stringify` throws. To deep-copy a class instance, give the class its own method, such as `clone()`, that creates a new instance with `new`.

> TIP
>
> Do you need a copy at all? A copy is only needed when someone will change one of the two objects. If nobody changes data after it is created, you can share it safely, and freezing it makes that promise enforceable. Copying large objects on every request costs time and memory.

## Identity and equality

A variable holds a reference to an object, as you saw in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#references). So `===` on objects answers "are these the *same object*?", which is called **identity**. It never looks inside. `Object.is` is a variant of `===` with two differences for numbers (`NaN` equals itself, and `0` and `-0` differ); for objects it also compares identity.

When you need "do these two objects hold the same data?", you have to write the comparison. For flat objects, a **shallow equality** check compares the keys and then each value with `Object.is`:

equality.js

```ts
const a = { sku: "RICE-5", qty: 2 };
const b = { sku: "RICE-5", qty: 2 };
const c = a;

console.log(a === b, a === c, Object.is(a, c));
console.log(NaN === NaN, Object.is(NaN, NaN), Object.is(0, -0));

function shallowEqual(x, y) {
  const xKeys = Object.keys(x);
  const yKeys = Object.keys(y);
  if (xKeys.length !== yKeys.length) return false;
  return xKeys.every((key) => Object.hasOwn(y, key) && Object.is(x[key], y[key]));
}

console.log(shallowEqual(a, b));
console.log(shallowEqual(a, { qty: 2, sku: "RICE-5" }));
console.log(shallowEqual({ items: [1] }, { items: [1] }));

const cart = new Set([a, b]);
console.log(cart.size);
```

Output of `node equality.js` and of the browser terminal

```ts
false true true
false true false
true
true
false
2
```

Key order does not matter to `shallowEqual`, but nested objects do: `{ items: [1] }` and `{ items: [1] }` are not shallow-equal, because their two arrays are different objects. Comparing all levels, **deep equality**, needs a function that calls itself on nested values; test runners provide one (`toEqual` in Vitest), and you will write your own in [Recursion](https://zudojs.oyinlola.site/learn/js-recursion).

The last line matters in real code: a `Set` (and a `Map` key) uses identity too. Two cart lines that look the same are still two entries. To remove duplicates by content, pick a key that identifies the data, such as the SKU, and deduplicate by that.

## Before you build: what must the account guarantee?

REASON IT OUT

### Design the rules first

You are about to rebuild the account from the start of the lesson. Before writing code, answer these:

- Which properties may outside code *read*? Which may it *change* directly, and which only through a method?
- What counts as a valid amount for a deposit or a withdrawal? Think about strings, negative numbers, zero, fractions and `NaN`.
- What must happen when someone assigns to a misspelled property?
- The account keeps a history of transactions and hands out a statement. What could a caller do to the history if you returned the real array?
- What should `JSON.stringify(account)` contain when the API sends it to the mobile app?

**Show the reasoning**

- **Reading**: `id`, `owner` and the balance can be read by anyone. **Changing**: `id` never changes, so it is a read-only data property. `owner` is data about a person and should be a frozen copy, so nobody can edit it through the account. The balance must *only* change through `deposit` and `withdraw`, which record history; so it is a getter with no setter, backed by a private variable.
- **Valid amounts**: whole numbers of kobo greater than zero. `Number.isInteger` rejects strings, `NaN`, `Infinity` and fractions in one check; `> 0` rejects zero and negatives. A withdrawal must also not exceed the balance.
- **Typos**: seal the object, so any new property throws in strict mode.
- **History**: returning the real array would let a caller `push` a fake deposit or `pop` a withdrawal. Return a deep copy of each entry (the entries are plain data, so `structuredClone` fits), or freeze each entry and return a copied array.
- **JSON**: `JSON.stringify` includes own, enumerable properties and runs getters. So `id` must be enumerable, the balance getter must be enumerable, and the methods are skipped automatically because JSON drops functions.

## Build: an account that cannot be broken

Here is the account, built with a factory function and every tool from this lesson. Each rule from the reasoning above is one or two lines:

account.js

```ts
function requireKobo(amountKobo) {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new TypeError(`amount must be a whole number of kobo above 0, got ${JSON.stringify(amountKobo)}`);
  }
}

export function formatNaira(kobo) {
  return `₦${(kobo / 100).toFixed(2)}`;
}

export function createAccount({ id, owner, openingKobo = 0 }) {
  let balanceKobo = 0;
  const history = [];

  const account = {
    owner: Object.freeze({ ...owner }),
    get balanceKobo() {
      return balanceKobo;
    },
    deposit(amountKobo) {
      requireKobo(amountKobo);
      balanceKobo += amountKobo;
      history.push({ type: "deposit", amountKobo, balanceKobo });
    },
    withdraw(amountKobo) {
      requireKobo(amountKobo);
      if (amountKobo > balanceKobo) {
        throw new RangeError(`insufficient funds: balance ${formatNaira(balanceKobo)}, asked ${formatNaira(amountKobo)}`);
      }
      balanceKobo -= amountKobo;
      history.push({ type: "withdrawal", amountKobo, balanceKobo });
    },
    statement() {
      return structuredClone(history);
    },
  };

  Object.defineProperty(account, "id", { value: id, enumerable: true });
  if (openingKobo > 0) account.deposit(openingKobo);
  return Object.seal(account);
}
```

Notice the details:

- `balanceKobo` and `history` are local variables. Only the functions inside the object can reach them.
- `owner` is a frozen shallow copy of what the caller passed, so the caller's object and the account's are separate, and the account's cannot be edited.
- `id` is defined with `enumerable: true` and nothing else, so it is read-only and not deletable, but still appears in JSON.
- The opening balance goes through `deposit`, so it is validated and recorded like any other deposit.
- `Object.seal` comes last, after all properties exist.

Now use it, and replay the three broken lines from the start of the lesson:

main.js

```ts
import { createAccount, formatNaira } from "./account.js";

const owner = { name: "Ada Obi", phone: "0803 000 0000" };
const account = createAccount({ id: "ACC-001", owner, openingKobo: 500000 });

account.deposit(150000);
account.withdraw(20000);
console.log(account.id, formatNaira(account.balanceKobo));
console.log(JSON.stringify(account));

const attempts = {
  typo: () => { account.balnceKobo = 0; },
  "text balance": () => { account.balanceKobo = "500000"; },
  "edit owner": () => { account.owner.phone = "hidden"; },
  "change id": () => { account.id = "ACC-666"; },
  "text deposit": () => account.deposit("150000"),
  overdraw: () => account.withdraw(10000000),
};
for (const [label, run] of Object.entries(attempts)) {
  try {
    run();
    console.log(`${label}: allowed!`);
  } catch (error) {
    console.log(`${label}: ${error.name}: ${error.message}`);
  }
}

const statement = account.statement();
statement.push({ type: "deposit", amountKobo: 99999999 });
console.log(account.statement().length, formatNaira(account.balanceKobo));
```

Output of `node main.js` and of the browser terminal

```ts
ACC-001 ₦6300.00
{"owner":{"name":"Ada Obi","phone":"0803 000 0000"},"balanceKobo":630000,"id":"ACC-001"}
typo: TypeError: Cannot add property balnceKobo, object is not extensible
text balance: TypeError: Cannot set property balanceKobo of #<Object> which has only a getter
edit owner: TypeError: Cannot assign to read only property 'phone' of object '#<Object>'
change id: TypeError: Cannot assign to read only property 'id' of object '#<Object>'
text deposit: TypeError: amount must be a whole number of kobo above 0, got "150000"
overdraw: RangeError: insufficient funds: balance ₦6300.00, asked ₦100000.00
3 ₦6300.00
```

Every one of the original bugs now fails at the exact line that caused it, with a message that says what went wrong. The fake deposit pushed onto the statement changed only the copy.

### Testing the guarantees

Each rule is a promise, and each promise deserves a test. Here they are as a list of checks, using the same small `check` helper as the calculator in [Functions](https://zudojs.oyinlola.site/learn/js-functions#build). A check passes when the code returns the expected value or throws the expected kind of error:

account.test.js

```ts
import { createAccount } from "./account.js";

function check(label, run, expected) {
  let actual;
  try {
    actual = run();
  } catch (error) {
    actual = error.name;
  }
  console.log(`${Object.is(actual, expected) ? "PASS" : "FAIL"} ${label} -> ${actual}`);
}

const fresh = () => createAccount({ id: "ACC-T", owner: { name: "Test" }, openingKobo: 1000 });

check("opening balance", () => fresh().balanceKobo, 1000);
check("deposit adds", () => { const a = fresh(); a.deposit(500); return a.balanceKobo; }, 1500);
check("zero deposit rejected", () => fresh().deposit(0), "TypeError");
check("NaN deposit rejected", () => fresh().deposit(NaN), "TypeError");
check("fraction rejected", () => fresh().deposit(0.5), "TypeError");
check("overdraw rejected", () => fresh().withdraw(1001), "RangeError");
check("exact withdrawal allowed", () => { const a = fresh(); a.withdraw(1000); return a.balanceKobo; }, 0);
check("no new properties", () => { fresh().extra = 1; }, "TypeError");
check("balance read-only", () => { fresh().balanceKobo = 5; }, "TypeError");
check("id not deletable", () => { delete fresh().id; }, "TypeError");
check("sealed", () => Object.isSealed(fresh()), true);
check("history recorded", () => fresh().statement().length, 1);
check("caller's owner untouched", () => {
  const owner = { name: "Ada" };
  const a = createAccount({ id: "X", owner });
  owner.name = "Changed";
  return a.owner.name;
}, "Ada");
```

Output of `node account.test.js` and of the browser terminal

```ts
PASS opening balance -> 1000
PASS deposit adds -> 1500
PASS zero deposit rejected -> TypeError
PASS NaN deposit rejected -> TypeError
PASS fraction rejected -> TypeError
PASS overdraw rejected -> RangeError
PASS exact withdrawal allowed -> 0
PASS no new properties -> TypeError
PASS balance read-only -> TypeError
PASS id not deletable -> TypeError
PASS sealed -> true
PASS history recorded -> 1
PASS caller's owner untouched -> Ada
```

Notice what the tests check: not only the happy path, but every boundary from the reasoning block (zero, `NaN`, a fraction, withdrawing exactly the balance, one kobo more). These are the cases where bugs live. In [Testing](https://zudojs.oyinlola.site/learn/testing-basics) you will write the same checks with Vitest.

### In production

- **Locking is a safety net, not security.** Seal and freeze stop mistakes in your own code. They do not protect data from code that is written to attack it, and they do nothing to data that comes in from outside: always validate input at the edge of your program.
- **Real accounts live in a database.** An in-memory balance disappears when the process restarts, and two servers would each have their own. The rules stay the same, but they move into a database transaction, which you will meet in [the transactions lesson](https://zudojs.oyinlola.site/learn/zudo-transactions).
- **Freeze configuration at start-up.** A deep-frozen config object makes "some request changed a setting for everyone" impossible. Freezing costs a little time once; do not deep-freeze large data on every request.
- **Libraries can mutate.** Passing a frozen object to a library that tries to change it will throw in the library. That is usually a bug worth finding, but it can surprise you; pass a copy when a library needs to modify its input.

## Practice

TRY IT YOURSELF

### A pick helper

Write `pick(obj, ...keys)`, the allow-list opposite of `omit`: it returns a new object with only the listed keys that the object really has (own properties). Keys the object does not have must not appear in the result, not even as `undefined`.

**Show a solution**

pick.js

```ts
function pick(obj, ...keys) {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(obj, key)).map((key) => [key, obj[key]]));
}

const customer = { id: 7, name: "Ada Obi", email: "ada@example.com", passwordHash: "<hash>" };
console.log(pick(customer, "id", "name"));
console.log(pick(customer, "id", "phone"));
console.log(pick({}, "toString"));
```

Output of `node pick.js` and of the browser terminal

```json
{ id: 7, name: 'Ada Obi' }
{ id: 7 }
{}
```

`Object.hasOwn` ignores inherited names, so `pick({}, "toString")` does not copy the inherited method. With `key in obj` instead, it would.

TRY IT YOURSELF

### A product with a validated price

Given a plain product object `{ name: "Rice 5kg" }`, use `Object.defineProperty` to add a `priceKobo` accessor. The setter accepts only whole numbers from 1 upwards and stores the value in a closure variable; the getter returns it. The property must show up in `JSON.stringify`. Then show that `"850000"` is rejected.

**Show a solution**

price.js

```ts
function addPrice(product, initialKobo) {
  let priceKobo;
  Object.defineProperty(product, "priceKobo", {
    get() {
      return priceKobo;
    },
    set(value) {
      if (!Number.isInteger(value) || value < 1) throw new TypeError(`bad price: ${JSON.stringify(value)}`);
      priceKobo = value;
    },
    enumerable: true,
  });
  product.priceKobo = initialKobo;
  return product;
}

const rice = addPrice({ name: "Rice 5kg" }, 850000);
console.log(JSON.stringify(rice));

try {
  rice.priceKobo = "850000";
} catch (error) {
  console.log(error.message);
}
console.log(rice.priceKobo);
```

Output of `node price.js` and of the browser terminal

```json
{"name":"Rice 5kg","priceKobo":850000}
bad price: "850000"
850000
```

Without `enumerable: true`, the price would be missing from the JSON, because `defineProperty` defaults every attribute you leave out to `false`.

TRY IT YOURSELF

### Find the leak in the snapshot

This function is meant to return an order snapshot that the caller can change freely. After the caller edits the snapshot, the original order has changed too. Explain why, and fix it so the date stays a `Date`.

snapshot-bug.js

```ts
function snapshot(order) {
  return Object.assign({}, order);
}

const order = { id: "ORD-7", placedAt: new Date("2026-09-24T10:00:00Z"), items: [{ sku: "RICE-5", qty: 2 }] };
const copy = snapshot(order);
copy.items[0].qty = 0;
console.log(order.items[0].qty);
```

Output of `node snapshot-bug.js` and of the browser terminal

```ts
0
```

**Show a solution**

`Object.assign({}, order)` is a shallow copy: `copy.items` is the same array as `order.items`. `structuredClone` copies every level and keeps the `Date` as a `Date`, which a JSON round trip would not:

snapshot-fix.js

```ts
function snapshot(order) {
  return structuredClone(order);
}

const order = { id: "ORD-7", placedAt: new Date("2026-09-24T10:00:00Z"), items: [{ sku: "RICE-5", qty: 2 }] };
const copy = snapshot(order);
copy.items[0].qty = 0;
console.log(order.items[0].qty, copy.items[0].qty);
console.log(copy.placedAt instanceof Date);
```

Output of `node snapshot-fix.js` and of the browser terminal

```ts
2 0
true
```

## Recap

- Use literals for one object, factory functions for many objects with checks, `Object.fromEntries` to build from data, and `Object.create(null)` (or a `Map`) for dictionaries with outside keys.
- Keys are strings or symbols; numbers and objects are turned into strings. Integer-like keys are listed first, in number order.
- Spread and `Object.assign` copy own, enumerable properties, one level deep. Getters become plain values; methods on the prototype and the prototype link are lost. Later sources win.
- Every property has a descriptor: `writable`, `enumerable`, `configurable`. `defineProperty` defaults the ones you leave out to `false`.
- Getters compute a value on read; setters check a value on write. Store the real value somewhere else, never in the property the setter guards.
- `preventExtensions` stops additions, `seal` also stops deletions, `freeze` also stops changes. All are shallow; deep-freeze configuration.
- `structuredClone` makes deep copies of data, keeping dates, maps, sets and shared references, but not functions or prototypes.
- `===` and `Object.is` compare identity. Comparing contents needs your own function, shallow or deep.

Next: [Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern), where you use destructuring, spread, optional chaining and nullish coalescing to rewrite old-style code.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
