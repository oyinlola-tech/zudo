---
title: "Prototypes in depth — ZudoJS Academy"
description: "Follow the prototype chain step by step, rewrite new, instanceof and extends yourself, see what a class becomes, and block prototype pollution."
source: https://zudojs.oyinlola.site/learn/js-prototypes
---

LEVEL 4 · LESSON 2 OF 20

The object model Core

# Prototypes in depth

Follow the prototype chain step by step, rewrite new, instanceof and extends yourself, see what a class becomes, and block prototype pollution.

- **55 min** to read and try
- **You need:** this in depth, this, prototypes and classes, and Objects in depth
- **You build:** Working versions of new, instanceof and extends written from scratch and tested against the real ones, plus a merge function that blocks prototype pollution

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain how a property read walks the prototype chain and how a write behaves differently
- Build objects on chosen prototypes with Object.create and constructor functions
- Describe what new does in four steps and write it yourself
- Explain and reimplement instanceof, and know when it gives the wrong answer
- Describe what a class and extends become in terms of functions and prototypes
- Recognise prototype pollution and write a merge that prevents it

## One hundred thousand copies of the same method

An online shop loads the day's orders into memory to build a report. A factory function ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#creating)) creates each order with its data and two helper methods:

problem.js

```ts
function createOrder(id, lines) {
  return {
    id,
    lines,
    totalKobo() {
      return this.lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0);
    },
    describe() {
      return `${this.id}: ₦${this.totalKobo() / 100}`;
    },
  };
}

const orders = [];
for (let i = 1; i <= 100000; i++) {
  orders.push(createOrder(`ORD-${i}`, [{ priceKobo: 850000, qty: 1 }]));
}

const functions = new Set();
for (const order of orders) {
  functions.add(order.totalKobo);
  functions.add(order.describe);
}

console.log(orders[0].describe());
console.log("distinct function objects:", functions.size);
console.log(orders[0].describe === orders[1].describe);
```

Output of `node problem.js` and of the browser terminal

```ts
ORD-1: ₦8500
distinct function objects: 200000
false
```

Every order carries its own copy of `totalKobo` and `describe`: 200,000 function objects that all do the same thing. That wastes memory, and it has a second cost: if the report later needs a new method, or a fix to `describe`, the 100,000 existing orders do not get it, because each one holds the old function.

What you want is for all orders to *share* one `describe`, found when it is needed. JavaScript's answer is the **prototype**: every object can point at another object, and when a property is missing, JavaScript looks there. [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#prototypes) introduced prototypes and showed that classes use them. This lesson takes them apart: the exact lookup rules for reading and writing, building objects on prototypes by hand, what `new` and `instanceof` really do, what a `class` turns into, and a security bug that only exists because of prototypes.

## The prototype link and the lookup rule

Every object has a hidden internal slot that the specification calls `[[Prototype]]`. It holds either another object, the object's **prototype**, or `null`. You read it with `Object.getPrototypeOf(obj)`. The easiest way to choose it is `Object.create(proto)`, which makes a new, empty object whose prototype is `proto`.

When you **read** `obj.name`, JavaScript follows these steps:

1. If `obj` has an **own** property called `name`, use it.
2. Otherwise, move to `obj`'s prototype and look there.
3. Repeat until a property is found, or the prototype is `null`; then the result is `undefined`.

The objects visited form the **prototype chain**. Here is a chain built by hand, with no classes and no `new`, for a bank's accounts:

chain.js

```ts
const accountMethods = {
  describe() {
    return `${this.owner}: ₦${this.balanceKobo / 100} (${this.kind})`;
  },
  kind: "account",
};

const savingsMethods = Object.create(accountMethods);
savingsMethods.kind = "savings";
savingsMethods.addInterest = function (percent) {
  this.balanceKobo += Math.round((this.balanceKobo * percent) / 100);
};

const ada = Object.create(savingsMethods);
ada.owner = "Ada";
ada.balanceKobo = 1000000;

ada.addInterest(2);
console.log(ada.describe());
console.log(Object.keys(ada));
console.log(Object.getPrototypeOf(ada) === savingsMethods);
console.log(Object.getPrototypeOf(savingsMethods) === accountMethods);
console.log(Object.getPrototypeOf(accountMethods) === Object.prototype);
console.log(Object.getPrototypeOf(Object.prototype));
```

Output of `node chain.js` and of the browser terminal

```ts
Ada: ₦10200 (savings)
[ 'owner', 'balanceKobo' ]
true
true
true
null
```

Trace `ada.describe()` with the lookup rule. `ada` has no own `describe`, neither does `savingsMethods`; `accountMethods` does. Inside it, `this` is still `ada`, because `this` comes from the call, not from where the method was found ([this in depth](https://zudojs.oyinlola.site/learn/js-this#implicit)). Then `this.kind` is looked up the same way and found one step up, on `savingsMethods`, which **shadows** (hides) the `kind` further up the chain.

```ts
 ada                        { owner: "Ada", balanceKobo: 1020000 }
  | [[Prototype]]
 savingsMethods             { kind: "savings", addInterest }
  | [[Prototype]]
 accountMethods             { describe, kind: "account" }
  | [[Prototype]]
 Object.prototype           { toString, hasOwnProperty, valueOf, ... }
  | [[Prototype]]
 null                       (end of the chain)
```

That is the whole mechanism. Classes, `new` and `extends`, which come later in this lesson, are only convenient ways to build chains like this one.

### Reading and changing the link

| Tool | What it does | Use it? |
| --- | --- | --- |
| `Object.create(proto, descriptors?)` | Makes a new object with the given prototype (and optional property descriptors) | Yes |
| `Object.getPrototypeOf(obj)` | Reads the link | Yes |
| `proto.isPrototypeOf(obj)` | Is `proto` anywhere on `obj`'s chain? | Yes |
| `Object.setPrototypeOf(obj, proto)` | Changes the link of an existing object | Rarely: engines optimise objects by their shape, and changing the prototype afterwards makes code using that object slower |
| `obj.__proto__` | An old getter/setter on `Object.prototype` for the same link | No: legacy, and missing on objects that do not inherit from `Object.prototype` |

## Writing is different from reading

Reading walks the chain. **Writing does not**: assigning `obj.name = value` creates or changes an own property on `obj`, even when `name` exists further up. The inherited property is not changed; it is shadowed. Two exceptions make this rule interesting:

- If the chain has a **setter** for that name, the assignment calls the setter (with `this` as the object you assigned on) instead of creating an own property.
- If the chain has a **read-only** data property with that name, the assignment fails: a `TypeError` in strict mode.

writing.js

```ts
const defaults = {
  currency: "NGN",
  set pin(value) {
    if (!/^\d{4}$/.test(value)) throw new RangeError("PIN must be 4 digits");
    this.pinHash = `hashed(${value})`;
  },
};
Object.defineProperty(defaults, "bank", { value: "Zudo Bank", writable: false });

const ada = Object.create(defaults);

ada.currency = "USD";
console.log(ada.currency, defaults.currency, Object.hasOwn(ada, "currency"));

ada.pin = "1234";
console.log(Object.keys(ada));

try {
  ada.bank = "Other Bank";
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

delete ada.currency;
console.log(ada.currency);
```

Output of `node writing.js` and of the browser terminal

```ts
USD NGN true
[ 'currency', 'pinHash' ]
TypeError: Cannot assign to read only property 'bank' of object '#<Object>'
NGN
```

- `ada.currency = "USD"` added an own property. `defaults.currency` is still `"NGN"`, and every other object that inherits from `defaults` still sees `"NGN"`.
- `ada.pin = "1234"` ran the inherited setter. No own `pin` was created; the setter stored `pinHash` on `ada`.
- The inherited read-only `bank` blocked the assignment, even though `ada` itself has no `bank`. (`Object.defineProperty(ada, "bank", …)` could still add an own one: the rule only stops plain assignment.)
- `delete` only removes own properties. After deleting the shadow, the inherited value shows through again.

### Shared mutable state on a prototype

Because reads walk the chain but writes do not, putting an *object or array* on a prototype causes a classic bug. Calling `push` on it is a read (of the array) followed by a change to that one shared array. Nothing is ever written to the instance:

shared-array.js

```ts
const cartMethods = {
  items: [],
  add(sku) {
    this.items.push(sku);
  },
};

const adaCart = Object.create(cartMethods);
const chidiCart = Object.create(cartMethods);

adaCart.add("RICE-5");
chidiCart.add("OIL-1");
console.log(adaCart.items, chidiCart.items, adaCart.items === chidiCart.items);

const fixedMethods = {
  add(sku) {
    this.items.push(sku);
  },
};
function createCart() {
  const cart = Object.create(fixedMethods);
  cart.items = [];
  return cart;
}
const a = createCart();
const b = createCart();
a.add("RICE-5");
console.log(a.items, b.items);
```

Output of `node shared-array.js` and of the browser terminal

```json
[ 'RICE-5', 'OIL-1' ] [ 'RICE-5', 'OIL-1' ] true
[ 'RICE-5' ] []
```

Ada and Chidi share one basket. The rule: **prototypes hold behaviour (methods) and constants; each instance holds its own data.** Classes enforce this naturally, because fields and `this.x = …` in the constructor create own properties.

## Object.prototype and the end of the chain

Almost every chain ends with `Object.prototype`, and then `null`. That object gives every ordinary object its shared methods: `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, and the `constructor` property. Arrays, functions, dates and maps have longer chains that pass through their own prototypes first:

builtins.js

```ts
function chainOf(value) {
  const names = [];
  let current = Object.getPrototypeOf(value);
  while (current !== null) {
    names.push(Object.hasOwn(current, "constructor") ? current.constructor.name : "(no constructor)");
    current = Object.getPrototypeOf(current);
  }
  return names.join(" -> ");
}

console.log("object  :", chainOf({ id: 1 }));
console.log("array   :", chainOf(["RICE-5"]));
console.log("function:", chainOf(function charge() {}));
console.log("date    :", chainOf(new Date(0)));
console.log("map     :", chainOf(new Map()));
console.log("string  :", chainOf("NGN"));

const dictionary = Object.create(null);
console.log("null proto:", chainOf(dictionary) || "(empty chain)", typeof dictionary.toString);
```

Output of `node builtins.js` and of the browser terminal

```ts
object  : Object
array   : Array -> Object
function: Function -> Object
date    : Date -> Object
map     : Map -> Object
string  : String -> Object
null proto: (empty chain) undefined
```

`chainOf("NGN")` works on a primitive because `Object.getPrototypeOf`, like any property access on a primitive, temporarily wraps the string in a `String` object; that is how `"NGN".toLowerCase()` finds its method on `String.prototype`. An object made with `Object.create(null)` has an empty chain: no `toString`, which is exactly why it is a safe dictionary.

> TIP
>
> Because `hasOwnProperty` is inherited, it is missing on null-prototype objects and can be shadowed by data (a product with a field named `hasOwnProperty`). `Object.hasOwn(obj, key)` is a static function, so it always works. Prefer it.

## Constructor functions and new, step by step

Before classes, JavaScript created many similar objects with **constructor functions**: ordinary functions, named with a capital letter by convention, called with `new`. Every normal function automatically gets a property called `prototype`: a plain object with one property, `constructor`, pointing back at the function. `new` uses it as the prototype for the objects it creates.

`new Fn(args)` does four things:

1. **Create** a new empty object whose prototype is `Fn.prototype`.
2. **Call** `Fn` with `this` set to that new object and the given arguments.
3. If `Fn` **returned an object**, that object is the result.
4. Otherwise the **new object** from step 1 is the result.

Every step can be written with tools you already know, so you can write `new` yourself:

construct.js

```ts
function Order(id, totalKobo) {
  this.id = id;
  this.totalKobo = totalKobo;
}
Order.prototype.describe = function () {
  return `${this.id}: ₦${this.totalKobo / 100}`;
};

function construct(Fn, ...args) {
  const obj = Object.create(Fn.prototype);
  const result = Fn.apply(obj, args);
  return result !== null && (typeof result === "object" || typeof result === "function") ? result : obj;
}

const real = new Order("ORD-7", 1170000);
const mine = construct(Order, "ORD-8", 500000);

console.log(real.describe(), mine.describe());
console.log(Object.getPrototypeOf(mine) === Order.prototype, mine instanceof Order);
console.log(Order.prototype.constructor === Order, mine.constructor === Order);
console.log(Object.keys(Order.prototype));
```

Output of `node construct.js` and of the browser terminal

```ts
ORD-7: ₦11700 ORD-8: ₦5000
true true
true true
[ 'describe' ]
```

The two objects behave the same. The last line shows one difference from classes: `describe` was added by assignment, so it is *enumerable*, and it shows up in `Object.keys(Order.prototype)` (and in `for...in` over every order, as you will see below).

### The two "prototypes" of a function

The word "prototype" now means two different things, and mixing them up is the most common confusion in this topic:

- `Order.prototype` is an ordinary *property* of the function. It is the object that will become the prototype *of instances* created with `new Order`.
- `Object.getPrototypeOf(Order)` is the prototype *of the function itself*: `Function.prototype`, where `call`, `apply` and `bind` live.

two-prototypes.js

```ts
function Order(id) {
  this.id = id;
}
const order = new Order("ORD-7");

console.log(Object.getPrototypeOf(order) === Order.prototype);
console.log(Object.getPrototypeOf(Order) === Function.prototype);
console.log(Object.getPrototypeOf(Order) === Order.prototype);
console.log(typeof Order.call, typeof order.call);

const arrow = () => {};
console.log("prototype" in arrow, typeof Order.prototype);
```

Output of `node two-prototypes.js` and of the browser terminal

```ts
true
true
false
function undefined
false object
```

Arrow functions and methods have no `prototype` property, because they cannot be used with `new`.

### When a constructor returns an object, or is called without new

constructor-traps.js

```ts
function Session(user) {
  this.user = user;
  if (user === "banned") return { error: "not allowed" };
  return "ignored";
}

console.log(new Session("ada"));
console.log(new Session("banned"));

function Account(owner) {
  this.owner = owner;
}
try {
  Account("Ada");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

function SafeAccount(owner) {
  if (!new.target) return new SafeAccount(owner);
  this.owner = owner;
}
console.log(SafeAccount("Ada") instanceof SafeAccount);
```

Output of `node constructor-traps.js` and of the browser terminal

```ts
Session { user: 'ada' }
{ error: 'not allowed' }
TypeError: Cannot set properties of undefined (setting 'owner')
true
```

- Returning a primitive from a constructor is ignored (step 4). Returning an object replaces the new object (step 3). The `"banned"` session is not even a `Session`. This is legal but surprising; avoid it.
- Calling a constructor function *without* `new` is a plain call. In strict code `this` is `undefined` and the first `this.owner = …` throws. In old sloppy code it silently created a global variable called `owner`.
- `new.target` is the function that `new` was used with, or `undefined` in a plain call. Old libraries used it (or `instanceof`) to make `new` optional. Classes simply throw instead.

## Inheritance with plain functions

To make one constructor inherit from another, two chains need linking: the instances' chain (`Child.prototype` must inherit from `Parent.prototype`) and the constructor call (the child must run the parent's setup on the new object). This is how every library did it before 2015, and it is still what `extends` does underneath:

old-inheritance.js

```ts
function Account(owner, balanceKobo) {
  this.owner = owner;
  this.balanceKobo = balanceKobo;
}
Account.prototype.describe = function () {
  return `${this.owner}: ₦${this.balanceKobo / 100}`;
};

function SavingsAccount(owner, balanceKobo, ratePercent) {
  Account.call(this, owner, balanceKobo);
  this.ratePercent = ratePercent;
}
SavingsAccount.prototype = Object.create(Account.prototype);
SavingsAccount.prototype.constructor = SavingsAccount;
SavingsAccount.prototype.describe = function () {
  return `${Account.prototype.describe.call(this)} at ${this.ratePercent}%`;
};

const ada = new SavingsAccount("Ada", 1000000, 2);
console.log(ada.describe());
console.log(ada instanceof SavingsAccount, ada instanceof Account);
console.log(ada.constructor.name);
console.log(Object.keys(ada));
```

Output of `node old-inheritance.js` and of the browser terminal

```ts
Ada: ₦10000 at 2%
true true
SavingsAccount
[ 'owner', 'balanceKobo', 'ratePercent' ]
```

- `Account.call(this, …)` is what `super(…)` does: run the parent's constructor on the new object, so it gets `owner` and `balanceKobo` as own properties.
- `Object.create(Account.prototype)` makes a new prototype object whose own prototype is `Account.prototype`, so savings accounts find `Account`'s methods one step further up.
- Replacing `SavingsAccount.prototype` threw away its `constructor` property, so the code restores it. Forgetting that line is a common bug in old code: `ada.constructor` would then say `Account`.
- `Account.prototype.describe.call(this)` is what `super.describe()` does: call the parent's version with the current `this`.

## How instanceof really works

`obj instanceof Fn` does not check how `obj` was made. It asks one question: **is `Fn.prototype` somewhere on `obj`'s prototype chain?** That is short enough to write yourself, and knowing it explains every surprising answer:

instanceof.js

```ts
function isInstance(obj, Fn) {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return false;
  let current = Object.getPrototypeOf(obj);
  while (current !== null) {
    if (current === Fn.prototype) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function Order(id) {
  this.id = id;
}
const order = new Order("ORD-7");

console.log(order instanceof Order, isInstance(order, Order));
console.log(order instanceof Object, isInstance(order, Object));

const fake = Object.create(Order.prototype);
console.log(fake instanceof Order, fake.id);

Order.prototype = { describe() {} };
console.log(order instanceof Order, new Order("ORD-8") instanceof Order);

console.log(Object.create(null) instanceof Object, "NGN" instanceof String);
console.log(Array.isArray([]), [] instanceof Array);
```

Output of `node instanceof.js` and of the browser terminal

```ts
true true
true true
true undefined
false true
false false
true true
```

- `fake` was never passed through the constructor, so it has no `id`, but `instanceof` says yes: the prototype is on its chain. `instanceof` checks the chain, not the shape of the data.
- Replacing `Order.prototype` afterwards made the old order stop being an `Order`, because its chain still points at the *old* prototype object.
- A null-prototype object is not an `instanceof Object`, and a primitive string is not an `instanceof String`.
- Each browser frame, and each Node.js `vm` context, has its own `Array.prototype`. An array from another frame fails `instanceof Array` in this one. `Array.isArray` works everywhere, so use it for arrays; similar checks exist for other types, such as `Error.isError` in the newest engines.

Two more tools answer related questions. A class can replace the chain walk entirely with a static `[Symbol.hasInstance]` method ([Symbols](https://zudojs.oyinlola.site/learn/js-symbols#has-instance)), and a check that cannot be fooled by `Object.create` uses a private field, `#field in obj`, called a **brand check** ([Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#members)).

For data that comes from outside, `instanceof` is the wrong question anyway: `JSON.parse` only ever creates plain objects and arrays. Check the shape of the data (validation, covered in [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation)), and use `instanceof` for objects your own code created, such as error classes.

## What a class becomes

A `class` declaration produces the same structure as the constructor function version: a function whose `prototype` object holds the methods. Inspecting a class with the tools from this lesson shows exactly where everything went:

class-anatomy.js

```ts
class Account {
  static count = 0;
  #pin = null;
  currency = "NGN";

  constructor(owner) {
    this.owner = owner;
    Account.count += 1;
  }
  describe() {
    return `${this.owner} (${this.currency})`;
  }
  get masked() {
    return `${this.owner[0]}***`;
  }
  static fromJSON(text) {
    return new Account(JSON.parse(text).owner);
  }
}

class SavingsAccount extends Account {
  addInterest() {}
}

const ada = new SavingsAccount("Ada");

console.log(typeof Account);
console.log(Object.getOwnPropertyNames(Account.prototype));
console.log(Object.getOwnPropertyNames(Account).filter((n) => !["length", "name", "prototype"].includes(n)));
console.log(Object.keys(ada));
console.log(Object.getOwnPropertyDescriptor(Account.prototype, "describe").enumerable);
console.log(Object.getPrototypeOf(SavingsAccount.prototype) === Account.prototype);
console.log(Object.getPrototypeOf(SavingsAccount) === Account, SavingsAccount.fromJSON === Account.fromJSON);
```

Output of `node class-anatomy.js` and of the browser terminal

```ts
function
[ 'constructor', 'describe', 'masked' ]
[ 'fromJSON', 'count' ]
[ 'currency', 'owner' ]
false
true
true true
```

Mapped onto what you built by hand:

| In the class | Where it ends up |
| --- | --- |
| `constructor(owner) { … }` | The body of the function `Account` itself |
| Methods and getters (`describe`, `masked`) | On `Account.prototype`, as **non-enumerable** properties |
| Instance fields (`currency = "NGN"`) | Own properties of each instance, created at construction |
| `#private` fields | Stored on each instance, invisible to every reflection tool (not a property at all) |
| `static` members | Own properties of the function `Account` |
| `extends Account` | Two links: `SavingsAccount.prototype` → `Account.prototype` (instances inherit methods) and `SavingsAccount` → `Account` (the class inherits static methods) |
| `super(…)`, `super.method()` | Calling the parent constructor on the new object, and calling the parent prototype's method with the current `this` |

### What class adds on top

A class is not *only* shorter syntax. It adds rules that the old pattern did not have, and each one prevents a real bug:

class-rules.js

```ts
function OldAccount(owner) {
  this.owner = owner;
}
OldAccount.prototype.describe = function () {
  return this.owner;
};

class NewAccount {
  constructor(owner) {
    this.owner = owner;
  }
  describe() {
    return this.owner;
  }
}

const keysIn = (obj) => {
  const keys = [];
  for (const key in obj) keys.push(key);
  return keys;
};
console.log(keysIn(new OldAccount("Ada")), keysIn(new NewAccount("Ada")));

try {
  NewAccount("Ada");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

try {
  new AuditedAccount("Ada");
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
class AuditedAccount extends NewAccount {}
```

Output of `node class-rules.js` and of the browser terminal

```json
[ 'owner', 'describe' ] [ 'owner' ]
TypeError: Class constructor NewAccount cannot be invoked without 'new'
ReferenceError: Cannot access 'AuditedAccount' before initialization
```

- Methods are non-enumerable, so a `for...in` loop over an instance lists only data. With the old pattern, it also lists every inherited method, which broke many loops that copied objects.
- A class throws when called without `new`, instead of writing to `undefined` or a global.
- A class declaration is in the temporal dead zone until its line runs ([Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#hoisting)), unlike a hoisted `function`.
- Class bodies are strict mode, and derived classes must call `super()` before using `this`.

So "a class is just a function with a prototype" is right about the *structure*, and the extra rules are why you should write classes rather than the old pattern in new code. You will still read the old pattern in libraries and older codebases, and now you know what each line does.

## Prototype pollution

Because every ordinary object reads missing properties from `Object.prototype`, anything written *onto* `Object.prototype` appears on every object in the program. An attacker who can make your code do that can change behaviour everywhere, for example by giving every user object an `isAdmin` property. This attack is called **prototype pollution**, and it usually enters through a "deep merge" of JSON from a request:

pollution.js

```ts
function naiveMerge(target, source) {
  for (const key in source) {
    const value = source[key];
    if (typeof value === "object" && value !== null) {
      if (typeof target[key] !== "object" || target[key] === null) target[key] = {};
      naiveMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const body = JSON.parse('{"theme":"dark","__proto__":{"isAdmin":true}}');
console.log(Object.keys(body));

try {
  const settings = naiveMerge({}, body);
  const someUser = { name: "Chidi" };
  console.log(settings.theme, someUser.isAdmin, {}.isAdmin);
} finally {
  delete Object.prototype.isAdmin;
}
console.log({}.isAdmin);
```

Output of `node pollution.js` and of the browser terminal

```json
[ 'theme', '__proto__' ]
dark true true
undefined
```

Step by step: `JSON.parse` treats `"__proto__"` as an ordinary key, so `body` has an own property with that name. The merge reads `target["__proto__"]`, which is not an own property of `target`: it is the old `__proto__` getter on `Object.prototype`, and it returns `Object.prototype` itself. The recursive call then writes `isAdmin = true` straight onto `Object.prototype`. From that moment, `someUser.isAdmin`, and `isAdmin` on every object in the process, is `true`. The `finally` block removes the property so the rest of this page keeps working; a real server would stay polluted until it restarted.

The defences all come from this lesson:

- Skip the dangerous keys `__proto__`, `constructor` and `prototype` when copying from outside data.
- Only walk into **own** properties of the target (`Object.hasOwn`), never into inherited ones.
- Build maps from user keys with `Object.create(null)` or `Map`, which have no `Object.prototype` to reach.
- Better still, do not merge unknown data at all: validate it against a schema and copy the fields you expect, as with the allow-list in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#build).

`@zudojs/security` includes a check for the first point: `findUnsafeKey(value)` walks a parsed body (with a loop, not recursion, so depth cannot crash it) and returns the first dangerous key it finds:

unsafe-key.jsNode.js only

```ts
import { findUnsafeKey } from "@zudojs/security";

const attack = JSON.parse('{"theme":"dark","prefs":{"__proto__":{"isAdmin":true}}}');
const normal = JSON.parse('{"theme":"dark","prefs":{"fontSize":14}}');

console.log(findUnsafeKey(attack));
console.log(findUnsafeKey(normal));
console.log(findUnsafeKey(JSON.parse('{"constructor":{"prototype":{"isAdmin":true}}}')));
```

Output of `node unsafe-key.js`

```ts
__proto__
undefined
constructor
```

## Before you build: rewriting new, instanceof and extends

REASON IT OUT

### What must each helper get exactly right?

You will write `construct(Fn, ...args)` (like `new`), `isInstance(obj, Fn)` (like `instanceof`), `inherit(Child, Parent)` (the prototype part of `extends`) and `safeMerge(target, source)`, then test them against the real behaviour. Before writing them, answer:

- For `construct`: what counts as "the constructor returned an object"? Is a function an object here? What about `null`?
- For `isInstance`: what should happen for primitives, for `null`, and for an object with a null prototype? Can the loop run forever?
- For `inherit`: which two links does `extends` create, and what does replacing `Child.prototype` destroy that you must put back?
- For `safeMerge`: which keys are dangerous, and why is skipping `__proto__` alone not enough?

**Show the reasoning**

- **construct**: the result replaces the new object when it is a non-null object *or a function* (functions are objects). `null` is `typeof "object"` but does not count, so check for it explicitly. Primitives are ignored.
- **isInstance**: primitives and `null` have no chain, so return `false` at once. A null-prototype object's chain is empty, so the loop ends immediately with `false`. The loop always ends, because JavaScript refuses to create a cycle of prototypes (`setPrototypeOf` throws on one).
- **inherit**: instances link `Child.prototype` → `Parent.prototype`; static members link `Child` → `Parent`. Replacing `Child.prototype` with `Object.create(Parent.prototype)` loses `Child.prototype.constructor`, so define it again, non-enumerable, as classes have it. Keep any methods the child already had by creating the link with `Object.setPrototypeOf(Child.prototype, Parent.prototype)` instead of replacing the object.
- **safeMerge**: `__proto__` reaches `Object.prototype` through the getter; `constructor` followed by `prototype` reaches it too in any merge that also walks into functions (`target.constructor` is the inherited `Object` function, and `Object.prototype` is its property). Skip all three names, and only recurse into values that are the target's own plain objects.

## Build: the object model from scratch

object-model.js

```ts
export function construct(Fn, ...args) {
  if (typeof Fn !== "function" || typeof Fn.prototype !== "object") {
    throw new TypeError(`${String(Fn?.name ?? Fn)} is not a constructor`);
  }
  const obj = Object.create(Fn.prototype);
  const result = Fn.apply(obj, args);
  const isObject = result !== null && (typeof result === "object" || typeof result === "function");
  return isObject ? result : obj;
}

export function isInstance(obj, Fn) {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return false;
  for (let p = Object.getPrototypeOf(obj); p !== null; p = Object.getPrototypeOf(p)) {
    if (p === Fn.prototype) return true;
  }
  return false;
}

export function inherit(Child, Parent) {
  Object.setPrototypeOf(Child.prototype, Parent.prototype);
  Object.setPrototypeOf(Child, Parent);
  Object.defineProperty(Child.prototype, "constructor", {
    value: Child, writable: true, enumerable: false, configurable: true,
  });
  return Child;
}

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

export function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (UNSAFE.has(key)) continue;
    const value = source[key];
    const isPlain = typeof value === "object" && value !== null && !Array.isArray(value);
    if (isPlain) {
      if (!Object.hasOwn(target, key) || typeof target[key] !== "object" || target[key] === null) {
        target[key] = {};
      }
      safeMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
```

Each function is a direct translation of a rule from this lesson. `inherit` uses `setPrototypeOf` on purpose: it runs once, when the classes are set up, not on hot objects, so the performance warning does not apply. `safeMerge` uses `Object.keys` (own, enumerable keys) instead of `for...in`, which would also list inherited enumerable properties. It recurses, which is fine for settings objects; for untrusted input of unknown depth, add a depth limit as in [Recursion](https://zudojs.oyinlola.site/learn/js-recursion#overflow).

main.js

```ts
import { construct, inherit, isInstance, safeMerge } from "./object-model.js";

function Account(owner, balanceKobo) {
  this.owner = owner;
  this.balanceKobo = balanceKobo;
}
Account.prototype.describe = function () {
  return `${this.owner}: ₦${this.balanceKobo / 100}`;
};
Account.open = function (owner) {
  return construct(this, owner, 0);
};

function SavingsAccount(owner, balanceKobo, ratePercent) {
  Account.call(this, owner, balanceKobo);
  this.ratePercent = ratePercent;
}
SavingsAccount.prototype.describe = function () {
  return `${Account.prototype.describe.call(this)} at ${this.ratePercent}%`;
};
inherit(SavingsAccount, Account);

const ada = construct(SavingsAccount, "Ada", 1000000, 2);
console.log(ada.describe());
console.log(isInstance(ada, SavingsAccount), isInstance(ada, Account), isInstance(ada, Array));
console.log(ada.constructor.name, Object.keys(SavingsAccount.prototype));
console.log(SavingsAccount.open("Chidi").describe());

const settings = safeMerge({ theme: "light", alerts: { email: true } },
  JSON.parse('{"alerts":{"sms":true},"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}'));
console.log(settings, {}.isAdmin);
```

Output of `node main.js` and of the browser terminal

```ts
Ada: ₦10000 at 2%
true true false
SavingsAccount [ 'describe' ]
Chidi: ₦0 at undefined%
{ theme: 'light', alerts: { email: true, sms: true } } undefined
```

`SavingsAccount.open("Chidi")` is a detail worth a second look. `open` is defined on `Account`, but `inherit` linked `SavingsAccount` to `Account`, so the static method is found on the chain, and inside it `this` is `SavingsAccount`. The result is a savings account, although its rate is `undefined` because `open` only passes two arguments. Static inheritance works exactly like instance inheritance, one level up.

### Testing against the real thing

The best test for a reimplementation is to run it side by side with the original on the same inputs, including the strange ones:

object-model.test.js

```ts
import { construct, inherit, isInstance, safeMerge } from "./object-model.js";

function show(value) {
  if (typeof value === "function") return `function ${value.name}`;
  if (typeof value === "object" && value !== null) return "(an object)";
  return String(value);
}

function check(label, actual, expected) {
  console.log(`${Object.is(actual, expected) ? "PASS" : "FAIL"} ${label} -> ${show(actual)}`);
}

function Plain(x) { this.x = x; }
function ReturnsObject() { this.x = 1; return { replaced: true }; }
function ReturnsNull() { this.x = 2; return null; }
function ReturnsFunction() { return function inner() {}; }

check("same data as new", construct(Plain, 5).x, new Plain(5).x);
check("same prototype as new", Object.getPrototypeOf(construct(Plain, 5)), Object.getPrototypeOf(new Plain(5)));
check("returned object wins", construct(ReturnsObject).replaced, new ReturnsObject().replaced);
check("returned null ignored", construct(ReturnsNull).x, new ReturnsNull().x);
check("returned function wins", typeof construct(ReturnsFunction), typeof new ReturnsFunction());

let arrowError = null;
try { construct(() => {}); } catch (e) { arrowError = e.name; }
check("arrow is not a constructor", arrowError, "TypeError");

const samples = [new Plain(1), Object.create(Plain.prototype), Object.create(null), [], "text", 42, null, undefined];
for (const [i, value] of samples.entries()) {
  check(`isInstance matches instanceof #${i}`, isInstance(value, Plain), value instanceof Plain);
  check(`isInstance(Object) matches #${i}`, isInstance(value, Object), value instanceof Object);
}

class Base { static kind() { return "base"; } hello() { return "hi"; } }
function Derived() {}
Derived.prototype.own = function () { return "own"; };
inherit(Derived, Base);
const d = new Derived();
check("inherits methods", d.hello(), "hi");
check("keeps own methods", d.own(), "own");
check("inherits statics", Derived.kind(), "base");
check("constructor restored", d.constructor, Derived);
check("constructor hidden", Object.keys(Derived.prototype).includes("constructor"), false);

const merged = safeMerge({}, JSON.parse('{"a":{"b":1},"__proto__":{"polluted":true}}'));
check("nested values merged", merged.a.b, 1);
check("no pollution", {}.polluted, undefined);
check("prototype of target untouched", Object.getPrototypeOf(merged), Object.prototype);
```

Output of `node object-model.test.js` and of the browser terminal

```ts
PASS same data as new -> 5
PASS same prototype as new -> (an object)
PASS returned object wins -> true
PASS returned null ignored -> 2
PASS returned function wins -> function
PASS arrow is not a constructor -> TypeError
PASS isInstance matches instanceof #0 -> true
PASS isInstance(Object) matches #0 -> true
PASS isInstance matches instanceof #1 -> true
PASS isInstance(Object) matches #1 -> true
PASS isInstance matches instanceof #2 -> false
PASS isInstance(Object) matches #2 -> false
PASS isInstance matches instanceof #3 -> false
PASS isInstance(Object) matches #3 -> true
PASS isInstance matches instanceof #4 -> false
PASS isInstance(Object) matches #4 -> false
PASS isInstance matches instanceof #5 -> false
PASS isInstance(Object) matches #5 -> false
PASS isInstance matches instanceof #6 -> false
PASS isInstance(Object) matches #6 -> false
PASS isInstance matches instanceof #7 -> false
PASS isInstance(Object) matches #7 -> false
PASS inherits methods -> hi
PASS keeps own methods -> own
PASS inherits statics -> base
PASS constructor restored -> function Derived
PASS constructor hidden -> false
PASS nested values merged -> 1
PASS no pollution -> undefined
PASS prototype of target untouched -> (an object)
```

### In production

- **Write classes.** Knowing the machinery is for reading, debugging and reviewing code. For new code, `class` gives you the same structure with safer rules.
- **Keep prototypes stable.** Engines optimise objects by their shape and prototype. Build chains once, at start-up; do not call `setPrototypeOf` or add methods to prototypes while requests are running.
- **Never modify built-in prototypes** such as `Array.prototype` or `Object.prototype`. Your addition shows up in every library in the process, and future JavaScript versions may add a method with the same name (this has happened, and it is why some new array methods have unusual names).
- **Treat merges of outside data as a security boundary.** Reject or skip `__proto__`, `constructor` and `prototype` keys, and prefer validating against a schema to merging. Node.js can also be started with `--disable-proto=delete`, which removes the `__proto__` accessor entirely.

## Practice

TRY IT YOURSELF

### Draw the chain

Write `describeChain(value)` that returns the chain of any value as text, using each prototype's own `constructor.name`, for example `"SavingsAccount.prototype -> Account.prototype -> Object.prototype -> null"`. Use it on a class instance, an array and a null-prototype object.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Start from `Object.getPrototypeOf(value)` and keep calling `Object.getPrototypeOf` on the result until you reach `null`, collecting one name per step.

HINT 2

Each link's name is `Object.hasOwn(p, "constructor") ? p.constructor.name + ".prototype" : "(anonymous)"`. Push `"null"` at the end and `.join(" -> ")`.

SOLUTION

describe-chain.js

```ts
function describeChain(value) {
  const parts = [];
  for (let p = Object.getPrototypeOf(value); p !== null; p = Object.getPrototypeOf(p)) {
    parts.push(Object.hasOwn(p, "constructor") ? `${p.constructor.name}.prototype` : "(anonymous)");
  }
  return [...parts, "null"].join(" -> ");
}

class Account {}
class SavingsAccount extends Account {}

console.log(describeChain(new SavingsAccount()));
console.log(describeChain(["RICE-5"]));
console.log(describeChain(Object.create(null)));
console.log(describeChain(Object.create({ plan: "gold" })));
```

Output of `node describe-chain.js` and of the browser terminal

```ts
SavingsAccount.prototype -> Account.prototype -> Object.prototype -> null
Array.prototype -> Object.prototype -> null
null
(anonymous) -> Object.prototype -> null
```

The last object's prototype is a plain object literal: it has no own `constructor`, so it is shown as anonymous, and then the chain continues to `Object.prototype`.

TRY IT YOURSELF

### Fix the shared basket

This constructor-function cart shares one `items` array between all carts. Explain why, and fix it so each cart has its own array while `add` stays shared on the prototype.

basket-bug.js

```ts
function Cart(owner) {
  this.owner = owner;
}
Cart.prototype.items = [];
Cart.prototype.add = function (sku) {
  this.items.push(sku);
};

const ada = new Cart("Ada");
const chidi = new Cart("Chidi");
ada.add("RICE-5");
console.log(chidi.items);
```

Output of `node basket-bug.js` and of the browser terminal

```json
[ 'RICE-5' ]
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`this.items.push(...)` only *reads* `items` through the prototype chain. Since no cart ever creates its own `items`, every cart reads and mutates the one array on `Cart.prototype`.

HINT 2

Set `this.items = [];` inside the `Cart` constructor, and remove the `Cart.prototype.items = [];` line entirely. Leave `add` on the prototype — it should stay shared.

SOLUTION

`this.items.push` *reads* `items`, finds the one array on `Cart.prototype`, and changes it. No cart ever gets an own `items`. Data belongs on the instance, created in the constructor; only the method stays on the prototype:

basket-fix.js

```ts
function Cart(owner) {
  this.owner = owner;
  this.items = [];
}
Cart.prototype.add = function (sku) {
  this.items.push(sku);
};

const ada = new Cart("Ada");
const chidi = new Cart("Chidi");
ada.add("RICE-5");
console.log(ada.items, chidi.items, ada.add === chidi.add);
```

Output of `node basket-fix.js` and of the browser terminal

```json
[ 'RICE-5' ] [] true
```

TRY IT YOURSELF

### A class without the class keyword

Rewrite this class as a constructor function plus prototype, so that it behaves the same for a caller: same output, methods not listed by `for...in`, and a `TypeError` when called without `new`. (Hint: `new.target` and `Object.defineProperty`.)

class-original.js

```ts
class Invoice {
  constructor(id, totalKobo) {
    this.id = id;
    this.totalKobo = totalKobo;
  }
  describe() {
    return `${this.id}: ₦${this.totalKobo / 100}`;
  }
}

const invoice = new Invoice("INV-9", 250000);
const keys = [];
for (const key in invoice) keys.push(key);
console.log(invoice.describe(), keys);
```

Output of `node class-original.js` and of the browser terminal

```ts
INV-9: ₦2500 [ 'id', 'totalKobo' ]
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Inside a function called with `new`, `new.target` is that function; called plainly, it is `undefined`. Throw at the top of `Invoice` when `new.target` is falsy.

HINT 2

`Object.defineProperty(Invoice.prototype, "describe", { value: function () { ... }, writable: true, enumerable: false, configurable: true })` — `enumerable: false` is what keeps it out of `for...in`.

SOLUTION

class-by-hand.js

```ts
function Invoice(id, totalKobo) {
  if (!new.target) throw new TypeError("Class constructor Invoice cannot be invoked without 'new'");
  this.id = id;
  this.totalKobo = totalKobo;
}
Object.defineProperty(Invoice.prototype, "describe", {
  value: function () {
    return `${this.id}: ₦${this.totalKobo / 100}`;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

const invoice = new Invoice("INV-9", 250000);
const keys = [];
for (const key in invoice) keys.push(key);
console.log(invoice.describe(), keys);

try {
  Invoice("INV-10", 100);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node class-by-hand.js` and of the browser terminal

```ts
INV-9: ₦2500 [ 'id', 'totalKobo' ]
TypeError: Class constructor Invoice cannot be invoked without 'new'
```

Still missing compared with the real class: strict mode for the body (it is strict here only because the file is a module), the temporal dead zone, and `super` support. That is why `class` is more than a shortcut.

## Recap

- Every object has a `[[Prototype]]` link. Reading a missing property walks the chain until it finds the property or reaches `null`; `this` stays the object you started from.
- Writing creates or changes an own property (shadowing), unless the chain has a setter (it runs) or a read-only property (the write fails). `delete` only removes own properties.
- Put methods and constants on prototypes, and data on instances; a shared array on a prototype is shared by everyone.
- `Object.create(proto)` sets the link directly; `Object.create(null)` makes an object with no chain at all.
- `new Fn()`: create an object linked to `Fn.prototype`, call `Fn` with it as `this`, and return it unless `Fn` returned an object.
- `Fn.prototype` is the prototype of instances; `Object.getPrototypeOf(Fn)` is `Function.prototype`.
- `instanceof` only checks whether `Fn.prototype` is on the chain. Use `Array.isArray` for arrays and validation for outside data.
- A class becomes a function with non-enumerable methods on its prototype, statics on the function, and two links for `extends`; it adds `new`-only calls, strict mode and the TDZ.
- Writing to `Object.prototype` affects every object: never merge untrusted keys such as `__proto__`, `constructor` and `prototype`.

Next: [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition), where you decide when to build on a prototype chain and when to combine small objects instead.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
