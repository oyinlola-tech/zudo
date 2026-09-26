---
title: "Inheritance and composition — ZudoJS Academy"
description: "See why subclasses break when their parent changes, then build behaviour from wrappers, delegation, mixins and functions, and use private fields well."
source: https://zudojs.oyinlola.site/learn/js-composition
---

LEVEL 4 · LESSON 3 OF 20

The object model Core

# Inheritance and composition

See why subclasses break when their parent changes, then build behaviour from wrappers, delegation, mixins and functions, and use private fields well.

- **55 min** to read and try
- **You need:** this in depth, Prototypes in depth, and this, prototypes and classes
- **You build:** A checkout assembled from a private cart, pricing rules, a swappable payment gateway and a logging wrapper, tested with a fake gateway

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain the fragile base class problem and spot a subclass that depends on its parent's internals
- Test whether a subclass really can stand in for its parent
- Replace a subclass with a wrapper that delegates to the object it holds
- Write mixins, name their risks, and detect method clashes
- Compose behaviour from functions and small objects without losing getters or privacy
- Use private fields, brand checks, static members and accessors as design tools

## The loyalty points that doubled

A shop rewards customers with one loyalty point per item they put in the cart. The team already has a working `Cart` class, so the quickest way to add points looks like inheritance: a `PointsCart` that *is a* cart, with a points counter on top. It overrides both ways of adding items, adds the points, and then lets the parent do the real work through `super` (as in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#inheritance)):

points-cart.js

```ts
class Cart {
  #items = [];

  addItem(item) {
    this.#items.push(item);
  }

  addItems(items) {
    for (const item of items) this.addItem(item);
  }

  get count() {
    return this.#items.reduce((sum, item) => sum + item.qty, 0);
  }
}

class PointsCart extends Cart {
  points = 0;

  addItem(item) {
    this.points += item.qty;
    super.addItem(item);
  }

  addItems(items) {
    for (const item of items) this.points += item.qty;
    super.addItems(items);
  }
}

const cart = new PointsCart();
cart.addItem({ sku: "RICE-5KG", qty: 1 });
cart.addItems([
  { sku: "OIL-1L", qty: 2 },
  { sku: "SUGAR", qty: 1 },
]);

console.log("items:", cart.count);
console.log("points:", cart.points);
```

Output of `node points-cart.js` and of the browser terminal

```ts
items: 4
points: 7
```

Four items, seven points. Each line of `PointsCart` looks correct, and the parent class has no bug. The problem is in *how the two classes interact*:

1. `PointsCart.addItems` adds 3 points for the two bulk items, then calls `super.addItems`.
2. The parent's `addItems` calls `this.addItem(item)` for each item. `this` is still the points cart ([this in depth](https://zudojs.oyinlola.site/learn/js-this#rule)), so the lookup finds the *override*, `PointsCart.addItem`, first.
3. The override adds the same 3 points again.

The subclass only works if it knows that `Cart.addItems` calls `addItem` internally. Say the team learns this and deletes the `addItems` override, since the parent routes everything through `addItem` anyway. Points are correct. Six months later, someone makes bulk adds faster in `Cart`:

cart-v2.js

```ts
class Cart {
  #items = [];

  addItem(item) {
    this.#items.push(item);
  }

  addItems(items) {
    this.#items.push(...items); // faster: no per-item call
  }

  get count() {
    return this.#items.reduce((sum, item) => sum + item.qty, 0);
  }
}

class PointsCart extends Cart {
  points = 0;

  addItem(item) {
    this.points += item.qty;
    super.addItem(item);
  }
}

const cart = new PointsCart();
cart.addItem({ sku: "RICE-5KG", qty: 1 });
cart.addItems([
  { sku: "OIL-1L", qty: 2 },
  { sku: "SUGAR", qty: 1 },
]);

console.log("items:", cart.count);
console.log("points:", cart.points);
```

Output of `node cart-v2.js` and of the browser terminal

```ts
items: 4
points: 1
```

The change to `Cart` was a correct, harmless-looking refactor. No test of `Cart` fails. Yet customers now lose points on every bulk add, and nobody touched `PointsCart`. This is the **fragile base class problem**: a subclass can break when its parent (its **base class**) changes in a way that keeps the parent's own behaviour the same.

This lesson is about that trade-off. [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#composition) gave you the rule of thumb "prefer composition". Here you learn *why*, and the tools that make it practical: wrappers that forward calls, delegation to swappable helper objects, mixins and their risks, building objects from functions, and using private fields, static members and accessors to draw clean boundaries. At the end you assemble a tested checkout from these parts.

## What a subclass really depends on

When you write `class B extends A`, `B` gets three things from `A`, not one:

- A's **public interface**: the methods and properties callers use. This is the part you meant to inherit.
- A's **implementation**: the code inside those methods runs with `this` set to a `B`.
- A's **self-calls**: every `this.something()` inside A is looked up on the `B` object, so B's overrides are called from inside A's code. The points bug came from exactly this.

Two pieces of code are **coupled** when a change to one can force a change to the other. A subclass is coupled to its parent's implementation details, which the parent's author is normally free to change. Private fields reduce the coupling (a subclass cannot read `#items`), but they do nothing about self-calls.

### Can the subclass stand in for its parent?

There is a second way inheritance goes wrong. Code that accepts a `Cart` expects cart behaviour. A subclass should work everywhere its parent works; this is the **Liskov substitution principle**, named after the computer scientist Barbara Liskov. A saved cart that must not change after checkout looks like a special kind of cart, so someone writes:

substitution.js

```ts
class Cart {
  #items = [];
  addItem(item) {
    this.#items.push(item);
  }
  get count() {
    return this.#items.length;
  }
}

class LockedCart extends Cart {
  addItem() {
    throw new Error("this cart is locked");
  }
}

function restoreFromWishlist(cart, wishlist) {
  for (const item of wishlist) cart.addItem(item);
  return cart.count;
}

const wishlist = [{ sku: "KETTLE" }, { sku: "IRON" }];
console.log(restoreFromWishlist(new Cart(), wishlist));

try {
  restoreFromWishlist(new LockedCart(), wishlist);
} catch (error) {
  console.log(`${error.message}, yet instanceof Cart is`, new LockedCart() instanceof Cart);
}
```

Output of `node substitution.js` and of the browser terminal

```ts
2
this cart is locked, yet instanceof Cart is true
```

In everyday words a locked cart "is a" cart. In behaviour it is not: it breaks a promise that `Cart` makes to its callers ("you can add items"). The test for inheritance is not whether the sentence "B is an A" sounds right, but whether *every caller of A* keeps working when handed a B. A locked cart is better modelled as a separate read-only object, or as a cart with a `locked` state that callers can check.

## Composition: hold an object instead of becoming one

**Composition** means building an object out of other objects that it *holds* in its fields, instead of inheriting from them. The points feature becomes an object that *has* a cart. It gives callers the same methods, does its own work, and then **forwards** the call: it calls the same method on the cart it holds. An object built this way is a **forwarding wrapper**:

points-wrapper.js

```ts
class Cart {
  #items = [];
  addItem(item) {
    this.#items.push(item);
  }
  addItems(items) {
    this.#items.push(...items);
  }
  get count() {
    return this.#items.reduce((sum, item) => sum + item.qty, 0);
  }
}

class PointsCart {
  #cart;
  #points = 0;

  constructor(cart) {
    this.#cart = cart;
  }

  addItem(item) {
    this.#points += item.qty;
    this.#cart.addItem(item);
  }

  addItems(items) {
    for (const item of items) this.#points += item.qty;
    this.#cart.addItems(items);
  }

  get count() {
    return this.#cart.count;
  }

  get points() {
    return this.#points;
  }
}

const cart = new PointsCart(new Cart());
cart.addItem({ sku: "RICE-5KG", qty: 1 });
cart.addItems([
  { sku: "OIL-1L", qty: 2 },
  { sku: "SUGAR", qty: 1 },
]);
console.log("items:", cart.count, "points:", cart.points);
```

Output of `node points-wrapper.js` and of the browser terminal

```ts
items: 4 points: 4
```

This version is correct with *either* version of `Cart`. Whether `Cart.addItems` calls `addItem` or pushes directly, the call goes to `this` inside the cart, which is the cart itself, never the wrapper. The wrapper depends only on the cart's public methods, and those are what `Cart`'s author promises to keep stable.

The price is visible too: the wrapper has to forward every method it wants to offer, including `count`. Methods you do not forward simply do not exist on the wrapper, which is often what you want: the wrapper decides its own public interface instead of inheriting everything.

### Decorators: wrappers with the same shape

When a wrapper offers exactly the same methods as the object it wraps, callers cannot tell the difference, and you can stack wrappers. This design has a name, the **decorator** pattern (not to be confused with TypeScript's `@decorator` syntax). A payment gateway is a good fit, because the shop needs extra behaviour around payments (logging, retries, limits) in different combinations. A **payment gateway** here is any object with a `charge(amountKobo, reference)` method that takes the money:

decorators.js

```ts
function createFakeGateway() {
  let calls = 0;
  return {
    async charge(amountKobo, reference) {
      calls += 1;
      if (calls === 1) throw new Error("network timeout");
      return { reference, amountKobo, status: "paid" };
    },
  };
}

function withLogging(gateway, log) {
  return {
    async charge(amountKobo, reference) {
      log(`charge ${reference}: ₦${amountKobo / 100}`);
      try {
        const receipt = await gateway.charge(amountKobo, reference);
        log(`paid ${reference}`);
        return receipt;
      } catch (error) {
        log(`failed ${reference}: ${error.message}`);
        throw error;
      }
    },
  };
}

function withRetry(gateway, attempts) {
  return {
    async charge(amountKobo, reference) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await gateway.charge(amountKobo, reference);
        } catch (error) {
          if (attempt >= attempts) throw error;
        }
      }
    },
  };
}

const gateway = withRetry(withLogging(createFakeGateway(), console.log), 3);
const receipt = await gateway.charge(1250000, "ORD-1001");
console.log(receipt);
```

Output of `node decorators.js` and of the browser terminal

```ts
charge ORD-1001: ₦12500
failed ORD-1001: network timeout
charge ORD-1001: ₦12500
paid ORD-1001
{ reference: 'ORD-1001', amountKobo: 1250000, status: 'paid' }
```

The order of wrapping is a decision you can see: retry sits *outside* logging, so every attempt is logged. Swap them, `withLogging(withRetry(…))`, and you log once per payment instead. With inheritance you would need a class for each combination and each order. With wrappers it is one line.

> TIP
>
> Retrying a payment is only safe when the payment provider recognises the second attempt as the same payment, usually by the reference. Otherwise a timeout that actually succeeded gets charged twice. The API lessons come back to this as idempotency.

## Delegation: hand the job to a helper

**Delegation** means an object passes part of its work to another object it holds, and uses the answer. The wrapper above delegates *all* of its work. More often an object delegates one decision that varies. A shop's delivery fee depends on the delivery option the customer picks, and the business keeps inventing new ones. Instead of a `switch` inside the checkout, or a subclass per option, the checkout holds a **strategy**: an object with one method, `feeKobo(order)`, that it asks for the fee:

strategy.js

```ts
const flatRate = {
  name: "flat rate",
  feeKobo: () => 250000,
};

const freeOverThreshold = {
  name: "free over ₦50,000",
  feeKobo: (order) => (order.subtotalKobo >= 5000000 ? 0 : 250000),
};

const byWeight = {
  name: "by weight",
  feeKobo: (order) => 100000 + Math.ceil(order.weightKg) * 20000,
};

class Checkout {
  #delivery;

  constructor({ delivery }) {
    this.#delivery = delivery;
  }

  set delivery(strategy) {
    if (typeof strategy?.feeKobo !== "function") throw new TypeError("delivery needs feeKobo()");
    this.#delivery = strategy;
  }

  totalKobo(order) {
    return order.subtotalKobo + this.#delivery.feeKobo(order);
  }
}

const order = { subtotalKobo: 5200000, weightKg: 7.5 };
const checkout = new Checkout({ delivery: flatRate });

for (const strategy of [flatRate, freeOverThreshold, byWeight]) {
  checkout.delivery = strategy;
  console.log(`${strategy.name}: ₦${checkout.totalKobo(order) / 100}`);
}

try {
  checkout.delivery = { name: "broken" };
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node strategy.js` and of the browser terminal

```ts
flat rate: ₦54500
free over ₦50,000: ₦52000
by weight: ₦54600
TypeError: delivery needs feeKobo()
```

The checkout does not know how any fee is computed. It knows only the **interface** it relies on: "an object with a `feeKobo(order)` method". JavaScript does not check interfaces for you, so the setter checks the one thing that matters at the boundary. (TypeScript can describe the interface as a type, which you will do in [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces).) Relying on what an object can do, rather than on which class made it, is called **duck typing**: if it has `feeKobo`, it is a delivery strategy.

JavaScript also has delegation built into the language. When a property is missing, the prototype chain hands the lookup to another object ([Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#chain)). That is automatic and covers every property. Explicit delegation, as in the checkout, is chosen per method, can be swapped at runtime, and is visible in the code.

## Mixins: sharing methods without a parent

Sometimes several unrelated classes need the same small set of methods. Products, orders and customers can all be tagged ("sale", "fragile", "vip"). They have no sensible common parent, and a class can only `extend` one parent anyway. A **mixin** is a bundle of methods copied into a class from outside. The simplest form is an object copied onto a prototype with `Object.assign`:

mixin-assign.js

```ts
const Taggable = {
  tag(label) {
    this.tags ??= new Set();
    this.tags.add(label);
    return this;
  },
  hasTag(label) {
    return this.tags?.has(label) ?? false;
  },
};

const Describable = {
  describe() {
    return `${this.constructor.name} ${this.id}`;
  },
};

class Product {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
  describe() {
    return `${this.name} (${this.id})`;
  }
}

class Order {
  constructor(id) {
    this.id = id;
  }
}

Object.assign(Product.prototype, Taggable, Describable);
Object.assign(Order.prototype, Taggable);

const kettle = new Product("SKU-17", "Electric kettle").tag("sale");
const order = new Order("ORD-5").tag("gift");

console.log(kettle.hasTag("sale"), order.hasTag("sale"), order.hasTag("gift"));
console.log(kettle.describe());
```

Output of `node mixin-assign.js` and of the browser terminal

```ts
true false true
Product SKU-17
```

Tagging works on both classes. But look at the last line: `Product` had its own `describe`, and the mixin **silently replaced it**, because `Object.assign` overwrites existing keys. Nothing warned anyone. Mixins have three standard risks:

- **Name clashes.** Two mixins, or a mixin and the class, define the same name; the last one copied wins.
- **Hidden dependencies.** `Describable` quietly needs `this.id`. Nothing states that requirement, so using it on an object without an `id` prints `undefined`.
- **No identity.** `kettle instanceof Taggable` throws a `TypeError`, because `Taggable` is a plain object, not a function. You cannot ask "is this taggable?" except by looking for the method (or by giving `Taggable` a `Symbol.hasInstance` hook, which [Symbols](https://zudojs.oyinlola.site/learn/js-symbols#has-instance) shows and advises against).

If you use object mixins, copy them with a helper that refuses clashes, so the mistake surfaces when the program starts rather than in a customer's receipt:

safe-mixin.js

```ts
function mixInto(target, ...sources) {
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      if (key in target) throw new Error(`mixin clash: ${String(key)} already exists`);
      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
    }
  }
  return target;
}

class Product {
  describe() {
    return "product";
  }
}

const Describable = { describe() { return "mixin"; } };
const Taggable = { hasTag() { return false; } };

mixInto(Product.prototype, Taggable);
console.log(typeof Product.prototype.hasTag);

try {
  mixInto(Product.prototype, Describable);
} catch (error) {
  console.log(error.message);
}
```

Output of `node safe-mixin.js` and of the browser terminal

```ts
function
mixin clash: describe already exists
```

It copies descriptors instead of values ([Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep#descriptors)), so getters in a mixin stay getters. `key in target` also looks along the prototype chain, which catches clashes with inherited methods such as `toString`.

### Class-expression mixins

The second common form is a function that takes a class and returns a new class that extends it. It relies on the fact that `extends` accepts any expression, including a function call:

mixin-class.js

```ts
const Timestamped = (Base) =>
  class extends Base {
    touch(at) {
      this.updatedAt = at;
      return this;
    }
  };

const SoftDeletable = (Base) =>
  class extends Base {
    delete(at) {
      this.deletedAt = at;
      return this;
    }
    get isDeleted() {
      return this.deletedAt !== undefined;
    }
  };

class Record {
  constructor(id) {
    this.id = id;
  }
}

class Customer extends SoftDeletable(Timestamped(Record)) {}

const ada = new Customer("CUS-1").touch("2026-09-01").delete("2026-09-20");
console.log(ada, ada.isDeleted);

const chain = [];
for (let p = Object.getPrototypeOf(ada); p !== Object.prototype; p = Object.getPrototypeOf(p)) {
  chain.push(p.constructor.name || "(anonymous class)");
}
console.log(chain.join(" -> "));
```

Output of `node mixin-class.js` and of the browser terminal

```ts
Customer {
  id: 'CUS-1',
  updatedAt: '2026-09-01',
  deletedAt: '2026-09-20'
} true
Customer -> (anonymous class) -> (anonymous class) -> Record
```

This form behaves better than `Object.assign`: methods can call `super`, getters survive, and a clash is an ordinary override rather than a silent copy. But look at the chain it builds. Each mixin is a real class in the hierarchy, so a class-expression mixin *is* inheritance, with every coupling problem from the first section, plus anonymous classes in your stack traces. Order matters as well: in `SoftDeletable(Timestamped(Record))`, a method defined in both would come from `SoftDeletable`.

Use mixins for small, stateless groups of methods with no hidden requirements. When a mixin needs its own state or configuration, it wants to be a separate object that you hold, which brings you back to composition.

## Composing behaviour from functions and objects

Classes are not the only way to build objects. A **factory function** returns a new object, and the variables it closes over act as private state ([Closures in depth](https://zudojs.oyinlola.site/learn/js-closures)). Small factories can each add one capability, and a larger factory combines them. Here a product is assembled from a stock capability and a pricing capability that share one private `state` object:

capabilities.js

```ts
function withStock(state) {
  return {
    reserve(qty) {
      if (qty > state.stock) throw new Error(`only ${state.stock} ${state.name} left`);
      state.stock -= qty;
    },
    stockLeft() {
      return state.stock;
    },
  };
}

function withPricing(state) {
  return {
    priceKobo(qty = 1) {
      const unit = qty >= state.bulkFrom ? state.bulkPriceKobo : state.priceKobo;
      return unit * qty;
    },
  };
}

function createProduct(data) {
  const state = { ...data };
  return Object.freeze({
    sku: state.sku,
    ...withStock(state),
    ...withPricing(state),
  });
}

const rice = createProduct({
  sku: "RICE-5KG", name: "bags of rice", stock: 12,
  priceKobo: 850000, bulkPriceKobo: 800000, bulkFrom: 10,
});

rice.reserve(10);
console.log(rice.stockLeft(), rice.priceKobo(2), rice.priceKobo(10));

try {
  rice.reserve(5);
} catch (error) {
  console.log(error.message);
}
console.log(Object.keys(rice), rice.state);
```

Output of `node capabilities.js` and of the browser terminal

```ts
2 1700000 8000000
only 2 bags of rice left
[ 'sku', 'reserve', 'stockLeft', 'priceKobo' ] undefined
```

Nothing outside can reach `state`: it is not a property, it is a variable the methods close over. `Object.freeze` stops callers from replacing methods. Each capability is testable on its own with a plain object as its state. The cost is memory: every product gets its own copies of the method functions, which [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#problem) measured. For a few thousand objects that is fine; for millions, use a class.

> Spread copies values, not getters
>
> If a capability used a getter, `get stockLeft() { … }`, the spread in `createProduct` would call it *once* and store the number. The product would report the same stock forever. Spread and `Object.assign` read values; to keep accessors, copy descriptors as `mixInto` does, or use methods as here.

getter-trap.js

```ts
const state = { stock: 12 };
const capability = {
  get stockLeft() {
    return state.stock;
  },
};

const spread = { ...capability };
const kept = Object.defineProperties({}, Object.getOwnPropertyDescriptors(capability));

state.stock = 2;
console.log(spread.stockLeft, kept.stockLeft);
```

Output of `node getter-trap.js` and of the browser terminal

```ts
12 2
```

### Rules as a list of functions

Behaviour itself can be composed. A price goes through several rules: a bulk discount, a coupon, VAT. Each rule is a function that takes the running amount (in kobo, as in [Mathematical reasoning](https://zudojs.oyinlola.site/learn/logic-math#kobo)) and returns a new one. The checkout keeps them in an array and applies them in order with `reduce`:

rules.js

```ts
const bulkDiscount = (amount, order) => (order.items >= 10 ? Math.round(amount * 0.95) : amount);
const coupon = (code, offKobo) => (amount, order) =>
  order.coupon === code ? Math.max(0, amount - offKobo) : amount;
const vat = (amount) => Math.round(amount * 1.075);

const rules = [bulkDiscount, coupon("WELCOME", 200000), vat];
const price = (amount, order) => rules.reduce((current, rule) => rule(current, order), amount);

console.log(price(4000000, { items: 3 }));
console.log(price(4000000, { items: 12, coupon: "WELCOME" }));
```

Output of `node rules.js` and of the browser terminal

```ts
4300000
3870000
```

Adding "free gift wrap in December" means writing one small function and adding it to the list. The order of the list is part of the business rule: here the coupon comes off before VAT is added. `coupon("WELCOME", 200000)` is a function that *returns* a rule, so one definition covers every coupon. [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional) builds on this with general `compose` and `pipe` helpers.

## Private fields, statics and accessors as design tools

[this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes#members) showed the syntax of `#private` fields, `static` members, getters and setters. Here is what they do for a design, and where each one bites.

### Private fields are private from subclasses too

A `#field` belongs to the class body that declares it. Not even a subclass can read it; the file does not even load if it tries:

private-subclass.js

```ts
try {
  eval(`
    class Cart { #items = []; }
    class PointsCart extends Cart {
      count() { return this.#items.length; }
    }
  `);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node private-subclass.js` and of the browser terminal

```ts
SyntaxError: Private field '#items' must be declared in an enclosing class
```

(The `eval` is only there so the example can catch the error; normally the whole file refuses to load.) That is a feature. A subclass that cannot touch the parent's fields can only use the parent's public methods, which removes one of the three kinds of coupling. Older code marks "for subclasses only" fields with an underscore, `_items`, but that is only a naming convention: anyone can read and change them.

### Brand checks: is this really one of mine?

`instanceof` only checks the prototype chain ([Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#instanceof)), and anyone can build an object on `Cart.prototype` with `Object.create`. The expression `#field in value` checks whether an object was really constructed by the class, because only the constructor can add the private field. This is called a **brand check**:

brand-check.js

```ts
class Cart {
  #items = [];

  static isCart(value) {
    return typeof value === "object" && value !== null && #items in value;
  }

  get count() {
    return this.#items.length;
  }
}

const real = new Cart();
const forged = Object.create(Cart.prototype);

console.log(real instanceof Cart, forged instanceof Cart);
console.log(Cart.isCart(real), Cart.isCart(forged), Cart.isCart(null));

try {
  console.log(forged.count);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node brand-check.js` and of the browser terminal

```ts
true true
true false false
TypeError: Cannot read private member #items from an object whose class did not declare it
```

### Private fields and Proxy wrappers do not mix

A `Proxy` is a built-in way to wrap an object and intercept every property access. It looks like a shortcut for writing forwarding wrappers. With private fields it fails: the getter runs with `this` set to the proxy, and the proxy does not have `#items`:

proxy-private.js

```ts
class Cart {
  #items = ["RICE-5KG"];
  get count() {
    return this.#items.length;
  }
}

const logged = new Proxy(new Cart(), {
  get(target, key, receiver) {
    console.log(`read ${String(key)}`);
    return Reflect.get(target, key, receiver);
  },
});

try {
  console.log(logged.count);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node proxy-private.js` and of the browser terminal

```ts
read count
TypeError: Cannot read private member #items from an object whose class did not declare it
```

This is one more reason to write explicit forwarding wrappers: they call methods *on the real object*, so its private fields are always there.

### Static members: construction and shared configuration

Static members live on the class function itself. Two uses are worth making habits. The first is **named constructors**: static methods that create instances from different inputs and give each way a clear name. The second is class-wide configuration. A `static { }` block runs once, when the class is defined, and can set up static fields that need more than one expression:

statics.js

```ts
class Money {
  static #formatter;
  static {
    Money.#formatter = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });
  }

  #kobo;

  constructor(kobo) {
    if (!Number.isSafeInteger(kobo)) throw new RangeError(`kobo must be a whole number, got ${kobo}`);
    this.#kobo = kobo;
  }

  static fromNaira(naira) {
    return new this(Math.round(naira * 100));
  }

  static zero() {
    return new this(0);
  }

  get kobo() {
    return this.#kobo;
  }

  plus(other) {
    return new Money(this.#kobo + other.kobo);
  }

  toString() {
    return Money.#formatter.format(this.#kobo / 100);
  }

  toJSON() {
    return { kobo: this.#kobo };
  }
}

const total = Money.fromNaira(8500).plus(Money.fromNaira(1250.5));
console.log(String(total), JSON.stringify({ total }));

try {
  new Money(10.5);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node statics.js` and of the browser terminal

```ts
₦9,750.50 {"total":{"kobo":975050}}
RangeError: kobo must be a whole number, got 10.5
```

`new this(…)` inside a static method creates an instance of whichever class the method was called on, so a subclass inherits working named constructors ([Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#build) showed why `this` there is the class). The formatter is created once for the whole class rather than once per amount; [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers) explains `Intl.NumberFormat`.

### Accessors: cheap, honest and serialisable

A getter makes a computation look like a field, and a setter makes an assignment run code. Three design rules follow from that:

- **Keep getters cheap and free of side effects.** Nobody expects `cart.total` to query a database or change anything. Something that does I/O should be a method, preferably `async`.
- **A getter without a setter is read-only, and in strict code (classes and modules) assigning to it throws.** That is good: the caller learns immediately.
- **Getters live on the prototype, so `JSON.stringify` and spread do not see them**, and private fields are invisible too. Give classes that travel as JSON a `toJSON` method, as `Money` does.

accessors.js

```ts
class Cart {
  #lines = [];

  add(sku, priceKobo, qty) {
    this.#lines.push({ sku, priceKobo, qty });
  }

  get totalKobo() {
    return this.#lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0);
  }
}

const cart = new Cart();
cart.add("OIL-1L", 320000, 2);

try {
  cart.totalKobo = 0;
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(cart.totalKobo, JSON.stringify(cart), { ...cart });
```

Output of `node accessors.js` and of the browser terminal

```ts
TypeError: Cannot set property totalKobo of #<Cart> which has only a getter
640000 {} {}
```

## Choosing: a short decision guide

| You want to… | Use | Why |
| --- | --- | --- |
| Model a real "is a" that callers rely on, such as your own error types | `extends`, one level deep | `instanceof` and `catch` handling work; the parent is designed for it |
| Add behaviour around an object (logging, retries, points, limits) | A forwarding wrapper (decorator) | Depends only on public methods; wrappers stack in any order |
| Vary one decision (delivery fee, payment provider, storage) | Delegation to a strategy object passed in | Swap at runtime and in tests without touching the caller |
| Share a few stateless helper methods across unrelated classes | A mixin, copied with a clash check | No fake common parent |
| Build a small number of objects with truly private state | A factory function with closures | No `this` to lose, nothing reachable from outside |
| Apply a sequence of business rules | An array of functions | Adding a rule is adding a function |

Inheritance is the right tool when the parent class was *designed* to be extended and documents what subclasses may override. Built-ins are designed that way: `class PaymentError extends Error` in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors#custom-errors), or `HTMLElement` for custom elements in the browser. Framework base classes often are too. Your own `Cart`, written to be used, usually is not.

## Before you build: a checkout from parts

REASON IT OUT

### What should the checkout hold, and what can go wrong?

You will build a `Checkout` that takes a cart, applies pricing rules, reserves stock and charges a payment gateway. Before reading the code, think through:

- Which parts change independently of each other, and which will you want to replace in a test?
- Who may change the cart's lines? What should `Checkout` be able to read from the cart, and what not?
- Stock is reserved before the payment. What must happen if the charge fails? What if the stock reservation fails for the second product after the first one was reserved?
- What happens if someone creates a checkout without a gateway, or with a gateway that has no `charge` method? Should that fail at construction or at payment time?
- Can the same cart be checked out twice?

**Show the reasoning**

- The pricing rules, the stock store and the gateway change independently (marketing changes rules, the shop changes providers), so the checkout *receives* each of them instead of creating them. That also lets a test pass a fake gateway that fails on demand. Passing collaborators in through the constructor is dependency injection, which ZudoJS automates in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container).
- Only the cart may change its lines, so they stay in a `#private` field. The checkout needs to read them, so the cart offers a read-only copy (`lines()` returns new objects) and a `lock()` method. Returning the internal array would let anyone push into it.
- If the charge fails, every reservation must be released, or the shop shows items as sold that nobody paid for. If the second reservation fails, the first must be released too. Keep a list of what you reserved and undo exactly that list: a small **rollback**.
- Fail at construction. A checkout without a working gateway is a bug in the wiring, and it should stop the program at start-up, not surprise the first customer.
- No. After a successful payment the cart is locked, and a second checkout fails before any money moves. Checking the cart's state first means the check costs nothing.

## Build: a checkout from small parts

The cart has private lines, a brand check and a lock. Nothing else in the system can change its contents:

cart.js

```ts
export class Cart {
  #lines = [];
  #locked = false;

  static isCart(value) {
    return typeof value === "object" && value !== null && #lines in value;
  }

  add(sku, priceKobo, qty = 1) {
    if (this.#locked) throw new Error("cart is locked");
    if (!Number.isInteger(qty) || qty < 1) throw new RangeError(`bad quantity for ${sku}: ${qty}`);
    this.#lines.push({ sku, priceKobo, qty });
    return this;
  }

  lines() {
    return this.#lines.map((line) => ({ ...line }));
  }

  get subtotalKobo() {
    return this.#lines.reduce((sum, line) => sum + line.priceKobo * line.qty, 0);
  }

  get locked() {
    return this.#locked;
  }

  lock() {
    this.#locked = true;
  }

  toJSON() {
    return { lines: this.lines(), subtotalKobo: this.subtotalKobo, locked: this.#locked };
  }
}
```

The stock store and the checkout. The checkout holds four collaborators and checks their shapes once, in the constructor:

checkout.js

```ts
import { Cart } from "./cart.js";

export function createStock(initial) {
  const levels = new Map(Object.entries(initial));
  return {
    reserve(sku, qty) {
      const left = levels.get(sku) ?? 0;
      if (qty > left) throw new Error(`not enough ${sku}: ${left} left`);
      levels.set(sku, left - qty);
    },
    release(sku, qty) {
      levels.set(sku, (levels.get(sku) ?? 0) + qty);
    },
    level(sku) {
      return levels.get(sku) ?? 0;
    },
  };
}

export class Checkout {
  #rules;
  #stock;
  #gateway;
  #nextOrder = 1001;

  constructor({ rules = [], stock, gateway }) {
    if (typeof stock?.reserve !== "function" || typeof stock?.release !== "function") {
      throw new TypeError("stock needs reserve() and release()");
    }
    if (typeof gateway?.charge !== "function") throw new TypeError("gateway needs charge()");
    this.#rules = [...rules];
    this.#stock = stock;
    this.#gateway = gateway;
  }

  totalKobo(cart) {
    const order = { lines: cart.lines(), items: cart.lines().reduce((n, l) => n + l.qty, 0) };
    return this.#rules.reduce((amount, rule) => rule(amount, order), cart.subtotalKobo);
  }

  async place(cart) {
    if (!Cart.isCart(cart)) throw new TypeError("not a cart");
    if (cart.locked) throw new Error("cart already checked out");
    const reference = `ORD-${this.#nextOrder++}`;
    const amountKobo = this.totalKobo(cart);
    const reserved = [];
    try {
      for (const line of cart.lines()) {
        this.#stock.reserve(line.sku, line.qty);
        reserved.push(line);
      }
      const receipt = await this.#gateway.charge(amountKobo, reference);
      cart.lock();
      return receipt;
    } catch (error) {
      for (const line of reserved) this.#stock.release(line.sku, line.qty);
      throw new Error(`order ${reference} failed: ${error.message}`, { cause: error });
    }
  }
}
```

A few details are worth noticing. `[...rules]` copies the array, so a caller who later pushes into their own array cannot change the rules of a running checkout. `reserved` records exactly what was reserved, so the rollback undoes that and nothing more. The error keeps the original as its `cause` (you will design error chains in [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design)). Now wire it together with the rules, a logging wrapper and a fake gateway that declines large payments:

main.js

```ts
import { Cart } from "./cart.js";
import { Checkout, createStock } from "./checkout.js";

const vat = (amount) => Math.round(amount * 1.075);
const bulk = (amount, order) => (order.items >= 10 ? Math.round(amount * 0.95) : amount);

const fakeGateway = {
  async charge(amountKobo, reference) {
    if (amountKobo > 10000000) throw new Error("card limit exceeded");
    return { reference, amountKobo, status: "paid" };
  },
};

function withLogging(gateway) {
  return {
    async charge(amountKobo, reference) {
      console.log(`  -> charging ${reference} ₦${(amountKobo / 100).toFixed(2)}`);
      return gateway.charge(amountKobo, reference);
    },
  };
}

const stock = createStock({ "RICE-5KG": 20, "OIL-1L": 5 });
const checkout = new Checkout({ rules: [bulk, vat], stock, gateway: withLogging(fakeGateway) });

const small = new Cart().add("RICE-5KG", 850000, 2).add("OIL-1L", 320000);
console.log(await checkout.place(small));
console.log("stock:", stock.level("RICE-5KG"), stock.level("OIL-1L"), "locked:", small.locked);

const big = new Cart().add("RICE-5KG", 850000, 12);
try {
  await checkout.place(big);
} catch (error) {
  console.log(error.message, "| cause:", error.cause.message);
}
console.log("stock after failure:", stock.level("RICE-5KG"));

try {
  await checkout.place(small);
} catch (error) {
  console.log(error.message);
}
console.log(JSON.stringify(small));
```

Output of `node main.js` and of the browser terminal

```ts
  -> charging ORD-1001 ₦21715.00
{ reference: 'ORD-1001', amountKobo: 2171500, status: 'paid' }
stock: 18 4 locked: true
  -> charging ORD-1002 ₦104167.50
order ORD-1002 failed: card limit exceeded | cause: card limit exceeded
stock after failure: 18
cart already checked out
{"lines":[{"sku":"RICE-5KG","priceKobo":850000,"qty":2},{"sku":"OIL-1L","priceKobo":320000,"qty":1}],"subtotalKobo":2020000,"locked":true}
```

Follow the three orders through. The small cart costs ₦20,200; VAT makes it ₦21,715, the gateway accepts, the stock drops and the cart locks. The big cart gets the bulk discount, but ₦104,167.50 is over the fake card limit, so the charge throws and the twelve reserved bags go back: the stock is 18 again, not 6. The third call is refused before anything is reserved, because the small cart is locked. The last line shows `toJSON` at work: the cart's private data travels as JSON only in the shape the class chose.

## Testing composed objects

Composition pays off most in tests. Every collaborator is passed in, so a test can hand the checkout a **fake**: a small object with the same methods that behaves in a controlled way and records how it was called. There is no need to subclass `Checkout` or patch a real payment provider:

checkout.test.js

```ts
import { Cart } from "./cart.js";
import { Checkout, createStock } from "./checkout.js";

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} -> ${JSON.stringify(actual)}`);
}

function recordingGateway({ failWith } = {}) {
  const calls = [];
  return {
    calls,
    async charge(amountKobo, reference) {
      calls.push({ amountKobo, reference });
      if (failWith) throw new Error(failWith);
      return { reference, amountKobo, status: "paid" };
    },
  };
}

async function errorOf(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.message;
  }
}

{
  const gateway = recordingGateway();
  const checkout = new Checkout({ stock: createStock({ A: 5 }), gateway, rules: [(a) => a + 100] });
  await checkout.place(new Cart().add("A", 1000, 2));
  check("rules applied to the charged amount", gateway.calls[0].amountKobo, 2100);
}

{
  const stock = createStock({ A: 5, B: 1 });
  const gateway = recordingGateway();
  const checkout = new Checkout({ stock, gateway });
  const message = await errorOf(checkout.place(new Cart().add("A", 1000, 2).add("B", 500, 3)));
  check("second reservation fails", message, "order ORD-1001 failed: not enough B: 1 left");
  check("first reservation released", stock.level("A"), 5);
  check("gateway never called", gateway.calls.length, 0);
}

{
  const stock = createStock({ A: 5 });
  const checkout = new Checkout({ stock, gateway: recordingGateway({ failWith: "declined" }) });
  const cart = new Cart().add("A", 1000, 1);
  check("declined payment", await errorOf(checkout.place(cart)), "order ORD-1001 failed: declined");
  check("stock restored", stock.level("A"), 5);
  check("cart still open", cart.locked, false);
}

{
  const gateway = recordingGateway();
  const checkout = new Checkout({ stock: createStock({ A: 5 }), gateway });
  const cart = new Cart().add("A", 1000, 1);
  await checkout.place(cart);
  check("second checkout refused", await errorOf(checkout.place(cart)), "cart already checked out");
  check("charged once", gateway.calls.length, 1);
  check("forged cart refused", await errorOf(checkout.place(Object.create(Cart.prototype))), "not a cart");
}

{
  let wiring = null;
  try {
    new Checkout({ stock: createStock({}), gateway: {} });
  } catch (error) {
    wiring = error.message;
  }
  check("bad wiring fails at construction", wiring, "gateway needs charge()");
}
```

Output of `node checkout.test.js` and of the browser terminal

```ts
PASS rules applied to the charged amount -> 2100
PASS second reservation fails -> "order ORD-1001 failed: not enough B: 1 left"
PASS first reservation released -> 5
PASS gateway never called -> 0
PASS declined payment -> "order ORD-1001 failed: declined"
PASS stock restored -> 5
PASS cart still open -> false
PASS second checkout refused -> "cart already checked out"
PASS charged once -> 1
PASS forged cart refused -> "not a cart"
PASS bad wiring fails at construction -> "gateway needs charge()"
```

Each block builds a fresh checkout, so no test depends on another. The failure tests check three things each: the error message, the stock afterwards and what the gateway saw. A rollback bug usually shows up in the second or third of those, not in the message.

## In production

- **Keep hierarchies shallow.** One level of `extends` from a class designed for it (an `Error`, a framework base class) is normal. Two or more levels of your own classes is a warning sign.
- **If a class is meant to be extended, document its self-calls.** Say which methods subclasses may override and which methods call which. If you cannot promise that, do not invite subclassing.
- **Inject collaborators; do not construct them inside.** A class that writes `new PaystackGateway()` in its constructor can never be tested without the network. A class that receives `gateway` can. At scale, a dependency injection container does the wiring for you; ZudoJS's is covered in [the container lesson](https://zudojs.oyinlola.site/learn/zudo-container).
- **Validate collaborators at the boundary.** Check the methods you rely on once, at construction, so wiring mistakes fail at start-up.
- **Prefer explicit forwarding to `Proxy` for wrappers**, especially around classes with private fields.
- **Do not add methods to built-in prototypes as mixins.** [Prototypes in depth](https://zudojs.oyinlola.site/learn/js-prototypes#build) explains why this breaks other people's code.

## Practice

TRY IT YOURSELF

### A cart with a limit, as a wrapper

The shop limits some promotions to 5 items per customer. Write `LimitedCart`, a forwarding wrapper around any object with `add(sku, priceKobo, qty)` and a `lines()` method, that throws when the total quantity would go above the limit. Do not use `extends`. It should offer `add`, `lines` and a `quantity` getter.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`this.#cart.lines()` gives you every line with its `qty`. Sum them with `reduce` for the `quantity` getter.

HINT 2

In `add`: `if (this.quantity + qty > this.#limit) throw new Error(...)`, else `this.#cart.add(sku, priceKobo, qty); return this;`. Check the limit before forwarding, so a refused item never reaches the real cart.

SOLUTION

limited-cart.js

```ts
class Cart {
  #lines = [];
  add(sku, priceKobo, qty = 1) {
    this.#lines.push({ sku, priceKobo, qty });
    return this;
  }
  lines() {
    return this.#lines.map((line) => ({ ...line }));
  }
}

class LimitedCart {
  #cart;
  #limit;

  constructor(cart, limit) {
    this.#cart = cart;
    this.#limit = limit;
  }

  get quantity() {
    return this.#cart.lines().reduce((sum, line) => sum + line.qty, 0);
  }

  add(sku, priceKobo, qty = 1) {
    if (this.quantity + qty > this.#limit) {
      throw new Error(`limit is ${this.#limit} items, cart has ${this.quantity}`);
    }
    this.#cart.add(sku, priceKobo, qty);
    return this;
  }

  lines() {
    return this.#cart.lines();
  }
}

const cart = new LimitedCart(new Cart(), 5);
cart.add("SOAP", 50000, 3).add("TOOTHPASTE", 90000, 2);
console.log(cart.quantity);

try {
  cart.add("SOAP", 50000, 1);
} catch (error) {
  console.log(error.message);
}
console.log(cart.lines().length);
```

Output of `node limited-cart.js` and of the browser terminal

```ts
5
limit is 5 items, cart has 5
2
```

The check happens *before* forwarding, so a refused item never reaches the real cart. `add` returns the wrapper, not the inner cart, so chained calls keep going through the limit.

TRY IT YOURSELF

### Spot the fragile subclass

An `AuditedStock` subclass logs every change to the stock. Run it: the log has one line too many. Explain why using what you learned about self-calls, then rewrite it as a wrapper that logs each call exactly once.

audited-stock.js

```ts
class Stock {
  #levels = new Map();
  set(sku, qty) {
    this.#levels.set(sku, qty);
  }
  restock(sku, qty) {
    this.set(sku, this.level(sku) + qty);
  }
  level(sku) {
    return this.#levels.get(sku) ?? 0;
  }
}

class AuditedStock extends Stock {
  log = [];
  set(sku, qty) {
    this.log.push(`set ${sku}=${qty}`);
    super.set(sku, qty);
  }
  restock(sku, qty) {
    this.log.push(`restock ${sku}+${qty}`);
    super.restock(sku, qty);
  }
}

const stock = new AuditedStock();
stock.set("RICE", 10);
stock.restock("RICE", 5);
console.log(stock.log);
```

Output of `node audited-stock.js` and of the browser terminal

```json
[ 'set RICE=10', 'restock RICE+5', 'set RICE=15' ]
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Each wrapper method should log, then call the *same-named* method on `this.#stock` — never on `this`. That is what stops an inner call like `restock` calling `set` from reaching the wrapper again.

HINT 2

`set(sku, qty) { this.#log.push(\`set ${sku}=${qty}\`); this.#stock.set(sku, qty); }` and the same shape for `restock`.

SOLUTION

`Stock.restock` calls `this.set`. Because `this` is the audited stock, the call reaches `AuditedStock.set`, which logs a second entry for the same restock. The wrapper calls methods on the stock it holds, so the inner self-call stays inside that object:

audited-wrapper.js

```ts
class Stock {
  #levels = new Map();
  set(sku, qty) {
    this.#levels.set(sku, qty);
  }
  restock(sku, qty) {
    this.set(sku, this.level(sku) + qty);
  }
  level(sku) {
    return this.#levels.get(sku) ?? 0;
  }
}

class AuditedStock {
  #stock;
  #log = [];

  constructor(stock) {
    this.#stock = stock;
  }
  set(sku, qty) {
    this.#log.push(`set ${sku}=${qty}`);
    this.#stock.set(sku, qty);
  }
  restock(sku, qty) {
    this.#log.push(`restock ${sku}+${qty}`);
    this.#stock.restock(sku, qty);
  }
  level(sku) {
    return this.#stock.level(sku);
  }
  get log() {
    return [...this.#log];
  }
}

const stock = new AuditedStock(new Stock());
stock.set("RICE", 10);
stock.restock("RICE", 5);
console.log(stock.log, stock.level("RICE"));
```

Output of `node audited-wrapper.js` and of the browser terminal

```json
[ 'set RICE=10', 'restock RICE+5' ] 15
```

The log is also private now and handed out as a copy, so callers cannot rewrite the audit trail.

TRY IT YOURSELF

### A new delivery strategy and a rule

Using the `Checkout` idea from the delegation section, add a "pickup" strategy (always free) and a pricing rule `freeDeliveryWeekend` that removes a ₦2,500 fee when `order.day` is `"Sat"` or `"Sun"`. Write both without changing any existing function, and print the totals for a ₦30,000 order on a Tuesday and on a Saturday, with flat-rate delivery and with pickup.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`pickup` needs the same shape as `flatRate`: a `feeKobo` function, just one that always returns `0`.

HINT 2

`freeDeliveryWeekend` receives the fee as its third argument: `(order.day === "Sat" || order.day === "Sun") ? amount - feeKobo : amount`.

SOLUTION

weekend.js

```ts
const flatRate = { name: "flat rate", feeKobo: () => 250000 };
const pickup = { name: "pickup", feeKobo: () => 0 };

const freeDeliveryWeekend = (amount, order, feeKobo) =>
  order.day === "Sat" || order.day === "Sun" ? amount - feeKobo : amount;

function total(order, delivery, rules) {
  const fee = delivery.feeKobo(order);
  return rules.reduce((amount, rule) => rule(amount, order, fee), order.subtotalKobo + fee);
}

for (const day of ["Tue", "Sat"]) {
  for (const delivery of [flatRate, pickup]) {
    const order = { subtotalKobo: 3000000, day };
    console.log(`${day} ${delivery.name}: ₦${total(order, delivery, [freeDeliveryWeekend]) / 100}`);
  }
}
```

Output of `node weekend.js` and of the browser terminal

```ts
Tue flat rate: ₦32500
Tue pickup: ₦30000
Sat flat rate: ₦30000
Sat pickup: ₦30000
```

The rule receives the fee as a third argument, so it removes whatever the chosen strategy charged; with pickup that is 0, so nothing changes. Neither the strategies nor `total` had to know the weekend rule exists.

## Recap

- A subclass inherits its parent's interface, implementation and self-calls. Self-calls make it fragile: a harmless refactor of the parent can break it (the fragile base class problem).
- Inherit only when every caller of the parent keeps working with the child (Liskov substitution), and preferably from classes designed to be extended.
- Composition holds objects instead of becoming them. A forwarding wrapper depends only on public methods; wrappers with the same shape (decorators) stack in any order.
- Delegation hands one varying decision to a strategy object that is passed in and can be swapped, including in tests.
- Mixins share stateless methods across unrelated classes; guard against silent clashes and hidden requirements. Class-expression mixins are still inheritance.
- Factories with closures give true privacy; spread copies getter *values*, so copy descriptors when you need accessors. Business rules compose well as arrays of functions.
- `#private` fields hide state from subclasses and support brand checks (`#field in obj`), but break under `Proxy`. Statics give named constructors and class-wide setup. Getters should be cheap; add `toJSON` for classes that travel as JSON.

Next: [Strings in depth](https://zudojs.oyinlola.site/learn/js-strings), where product names with accents and emoji show that "length" means three different things.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
