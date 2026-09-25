---
title: "Types in depth — ZudoJS Academy"
description: "Map every JavaScript type, see why objects are shared while primitives are copied, and learn how equality and type coercion decide what comparisons return."
source: https://zudojs.oyinlola.site/learn/js-types-deep
---

LEVEL 2 · LESSON 4 OF 19

Values and operators Foundation

# Types in depth

Map every JavaScript type, see why objects are shared while primitives are copied, and learn how equality and type coercion decide what comparisons return.

- **50 min** to read and try
- **You need:** Values, variables and types
- **You build:** A fixed shopping-cart bug, a coercion table printed by JavaScript itself, and a safe comparison for data that arrives as text

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Name all seven primitive types and the main built-in object types, and tell them apart at run time
- Predict when assigning or passing a value copies it and when it shares it, and fix bugs caused by shared objects
- Explain the difference between an immutable value, a const variable and a frozen object
- Choose between ===, ==, Object.is and SameValueZero, and explain how each treats NaN, -0, null and objects
- Predict type coercion with the ToNumber, ToString and ToPrimitive rules, and convert data from outside the program explicitly

## Two customers, one cart

A small online shop keeps a template for an empty cart and gives every new customer a copy of it. At least, that is what the developer meant to do:

shared-cart.js

```ts
const emptyCart = { items: [], totalKobo: 0 };

const adaCart = emptyCart;
const bolaCart = emptyCart;

adaCart.items.push("Rice 5kg");
adaCart.totalKobo = 850000;

console.log(bolaCart.items, bolaCart.totalKobo);
console.log(emptyCart.items.length);
```

Output of `node shared-cart.js` and of the browser terminal

```json
[ 'Rice 5kg' ] 850000
1
```

Ada added rice to her cart, and it appeared in Bola's cart too, and in the "empty" template. On a real site, every customer would now see everyone else's shopping. `items.push(…)` adds an item to the end of a list; you will study lists in [Arrays](https://zudojs.oyinlola.site/learn/js-arrays), and objects like `{ items: [], totalKobo: 0 }` in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data). Here you only need to see the bug.

REASON IT OUT

### Before you read on: what does = copy?

With numbers, assignment clearly copies: after `let a = 5; let b = a; b = 6;`, `a` is still 5. Yet here, changing `adaCart` changed `bolaCart`.

- How many carts exist in memory after the first three lines? One or three?
- What do you think `adaCart === bolaCart` prints?
- And `{ items: [] } === { items: [] }`, two carts that look exactly the same?
- Why might a language be designed so that `=` does not copy objects?

**Show the reasoning**

**One cart.** `{ items: [], totalKobo: 0 }` creates one object. `adaCart = emptyCart` does not copy that object; it makes `adaCart` point at the same one. All three names are labels on a single cart.

**`adaCart === bolaCart` is `true`**: for objects, `===` asks "is this the same object?". **Two carts written separately are not `===`**, even with identical contents, because they are two different objects.

**Why not copy?** Objects can be huge (a list of a million orders) and can contain other objects. Copying on every assignment and every function call would be slow and use a lot of memory, and it would not even be clear how deep to copy. So JavaScript copies only the small thing, the reference, and leaves copying to you, when you ask for it. The rest of this lesson makes that model precise.

## Two families of values

Every value in JavaScript belongs to one of two families:

- **Primitive values**: the seven simple types you met in [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#types): string, number, bigint, boolean, undefined, null and symbol. A primitive is a single, simple value, and it can never be changed.
- **Objects**: everything else. Plain objects, arrays, functions, dates, maps, sets, errors… An object is a container: it holds other values, it can be changed, and it has an identity of its own.

Two of the seven primitives only got a sentence in Values, variables and types. Here is a little more on each.

### BigInt: exact whole numbers of any size

Ordinary numbers are exact only up to `Number.MAX_SAFE_INTEGER` (about nine quadrillion). A **bigint**, written with an `n` at the end, is a whole number that stays exact however large it gets:

bigint.js

```ts
console.log(2 ** 64, 2n ** 64n);
console.log(10n / 3n);             // whole numbers only: the fraction is dropped
console.log(typeof 10n, 10n === 10, 10n == 10);

try {
  console.log(10n + 1);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
console.log(10n + BigInt(1), Number(10n) + 1);
```

Output of `node bigint.js` and of the browser terminal

```ts
18446744073709552000 18446744073709551616n
3n
bigint false true
TypeError: Cannot mix BigInt and other types, use explicit conversions
11n 11
```

The ordinary number lost its last digits; the bigint did not. Division drops the fraction. You cannot mix bigints and numbers in arithmetic: JavaScript refuses to guess which precision you wanted, so you convert one side with `BigInt()` or `Number()`. In practice you meet bigints for database ids and counters that can exceed the safe range; money in kobo stays comfortably inside it (the safe limit is about ₦90 trillion).

### Symbol: a guaranteed-unique value

A **symbol** is a value that is equal only to itself. Every call to `Symbol()` makes a new one; the text in the parentheses is only a description for people. Symbols are used as property keys that can never clash with anybody else's keys:

symbol.js

```ts
const orderId = Symbol("id");
const otherId = Symbol("id");
console.log(orderId === otherId, orderId.description);

const order = { id: "ORD-1" };
order[orderId] = "internal-7731";   // a hidden key: cannot clash with order.id
console.log(order.id, order[orderId]);

console.log(Symbol.for("app.cache") === Symbol.for("app.cache"));
try {
  console.log("key: " + orderId);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node symbol.js` and of the browser terminal

```ts
false id
ORD-1 internal-7731
true
TypeError: Cannot convert a Symbol value to a string
```

`Symbol.for(name)` looks up a shared symbol in a global registry, so the same name gives the same symbol everywhere in the program. A symbol refuses to be quietly turned into text; `String(orderId)` works because it asks explicitly. You will rarely create symbols yourself, but the language uses them for its own hooks, which [Symbols](https://zudojs.oyinlola.site/learn/js-symbols) covers.

## The map of object types

Most of what you will build is made of objects. JavaScript ships with many kinds, each made for one job. This is the map; each one gets a full lesson later.

| Type | Made for | Created with | Lesson |
| --- | --- | --- | --- |
| Object | A record with named properties: a user, an order | `{ name: "Ada" }` | [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data) |
| Array | An ordered list: orders, lines on a receipt | `[1, 2, 3]` | [Arrays](https://zudojs.oyinlola.site/learn/js-arrays) |
| Function | Code you can call; also an object | `function f() {}`, `() => {}` | [Functions](https://zudojs.oyinlola.site/learn/js-functions) |
| Date | A moment in time | `new Date()` | [Dates and time zones](https://zudojs.oyinlola.site/learn/js-dates) |
| Map | A lookup table with keys of *any* type | `new Map()` | [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections) |
| Set | A collection of unique values | `new Set()` | [Sets](https://zudojs.oyinlola.site/learn/logic-sets) |
| WeakMap | Extra data attached to objects, forgotten when the object is | `new WeakMap()` | [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections) |
| WeakSet | Marking objects ("already processed"), forgotten when the object is | `new WeakSet()` | [Collections in depth](https://zudojs.oyinlola.site/learn/js-collections) |
| RegExp | A text pattern to search or validate | `/^\d+$/` | [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp) |
| Error | Something that went wrong, with a message and a stack trace | `new Error("…")` | [Handling errors](https://zudojs.oyinlola.site/learn/js-errors) |

A few of them in action:

object-types.js

```ts
const stock = new Map();
stock.set("rice", 12);
stock.set(42, "a number key works too");
console.log(stock.get("rice"), stock.get(42), stock.size);

const tags = new Set(["vip", "new", "vip"]);
console.log(tags.size, tags.has("vip"));

const onlyDigits = /^\d+$/;
console.log(onlyDigits.test("2026"), onlyDigits.test("20x6"));

const problem = new Error("Out of stock");
console.log(problem.name, problem.message);

function applyVat(kobo) {
  return Math.round(kobo * 1.075);
}
applyVat.rate = 7.5;                    // a function is an object: it can hold properties
console.log(applyVat(10000), applyVat.name, applyVat.rate);
```

Output of `node object-types.js` and of the browser terminal

```ts
12 a number key works too 2
2 true
true false
Error Out of stock
10750 applyVat 7.5
```

### Weak collections

A `WeakMap` only accepts objects as keys, and it does not keep those objects alive: when nothing else in the program refers to an object, the object and its entry can be thrown away by the garbage collector. That makes it the right tool for data *about* an object, such as a cache per request, without leaking memory. The price: you cannot list its contents or ask its size, because entries may disappear at any moment.

weakmap.js

```ts
const lastSeen = new WeakMap();
const user = { name: "Ada" };
lastSeen.set(user, "09:30");
console.log(lastSeen.get(user), lastSeen.has({ name: "Ada" }));

try {
  lastSeen.set("Ada", "09:30");
} catch (error) {
  console.log(error.name);
}
```

Output of `node weakmap.js` and of the browser terminal

```ts
09:30 false
TypeError
```

The second lookup fails because `{ name: "Ada" }` is a *different* object that just looks the same: maps and sets find object keys by identity, which the next sections explain.

### Telling types apart

`typeof` is enough for primitives, but for objects it only ever says `"object"` (or `"function"`). To find out which kind of object you have:

which-object.js

```ts
const values = [{}, [], new Date(0), new Map(), /a/, new Error("x"), null, () => 1];

for (const value of values) {
  const tag = Object.prototype.toString.call(value);
  console.log(typeof value, "|", Array.isArray(value), "|", tag);
}
```

Output of `node which-object.js` and of the browser terminal

```ts
object | false | [object Object]
object | true | [object Array]
object | false | [object Date]
object | false | [object Map]
object | false | [object RegExp]
object | false | [object Error]
object | false | [object Null]
function | false | [object Function]
```

The `for (const value of values)` loop runs its line once for each value in the list; [Loops](https://zudojs.oyinlola.site/learn/js-loops) covers it. Use `Array.isArray(x)` to check for arrays, `x instanceof Date` (read: "was `x` made by `Date`?") for the other built-in types, and `x === null` for null, since `typeof null` is `"object"`. `Object.prototype.toString.call(x)` is the most precise tag, mostly used in libraries. And every object type is a special kind of object, so an array is also an `Object`:

instanceof.js

```ts
console.log(new Date(0) instanceof Date, [] instanceof Array, [] instanceof Object);
```

Output of `node instanceof.js` and of the browser terminal

```ts
true true true
```

## Copied or shared: primitives and references

Here is the model that explains the shared cart. A variable is a box. For a primitive, the box holds the value itself. For an object, the object lives somewhere else in memory, and the box holds a **reference** to it: an arrow pointing at it.

```ts
let a = 5;            a        [ 5 ]
let b = a;            b        [ 5 ]              two boxes, two separate 5s

const cart1 = {…};    cart1    [ ●──────┐ ]
const cart2 = cart1;  cart2    [ ●──────┤ ]
                                        ▼
                               { items: [], totalKobo: 0 }   one object
```

Assignment always copies *what is in the box*. For a primitive that is the value, so the copy is independent. For an object it is the arrow, so both boxes now point at the same object. Changing the object through either name changes the one object that both see.

### Passing values to functions

A function's parameters are new boxes, filled by assignment from the arguments. So the same rule applies. This is sometimes called **pass by sharing**:

pass-by-sharing.js

```ts
function applyDiscount(order, percent) {
  order.totalKobo = order.totalKobo - (order.totalKobo * percent) / 100;
  percent = 0;                        // changes only this function's box
}

function replaceOrder(order) {
  order = { totalKobo: 0 };           // points this box at a new object
}

const order = { totalKobo: 1000000 };
let discount = 10;

applyDiscount(order, discount);
console.log(order.totalKobo, discount);

replaceOrder(order);
console.log(order.totalKobo);
```

Output of `node pass-by-sharing.js` and of the browser terminal

```ts
900000 10
900000
```

- `applyDiscount` followed the arrow and changed the caller's order. That is visible outside.
- Setting `percent = 0` changed the function's own box; the caller's `discount` is still 10.
- `replaceOrder` pointed its own box at a new object. The caller's box still points at the old order, which is unchanged.

Changing an object you were given, as `applyDiscount` does, is called a **side effect**, and it is a common source of bugs in backends: a function quietly edits an object that other code is still using. Many teams prefer functions that return a new object instead, a habit you will build in [Functions](https://zudojs.oyinlola.site/learn/js-functions#pure).

### Fixing the shared cart

The fix is to create a *new* object for every customer. The simplest way is a function that builds one each time it is called:

cart-fixed.js

```ts
function createCart() {
  return { items: [], totalKobo: 0 };
}

const adaCart = createCart();
const bolaCart = createCart();

adaCart.items.push("Rice 5kg");
adaCart.totalKobo = 850000;

console.log(adaCart.items, bolaCart.items, adaCart === bolaCart);
```

Output of `node cart-fixed.js` and of the browser terminal

```json
[ 'Rice 5kg' ] [] false
```

Each call runs `{ items: [], totalKobo: 0 }` again, and each run makes a brand-new object with a brand-new list inside. A function that creates objects like this is called a **factory**. Copying an existing object is the other option; spread (`{ ...cart }`) makes a shallow copy and `structuredClone(cart)` a deep one, as [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data#copying) shows. The factory is simpler when you are starting from a fixed template.

## Mutability: values, variables and frozen objects

"Can this change?" has three different answers in JavaScript, depending on what "this" is:

| What | Can it change? | Example |
| --- | --- | --- |
| A primitive value | Never. Operations make new values. | `"ada".toUpperCase()` returns a new string |
| A `const` variable | The box cannot be pointed elsewhere, but the object it points at can change. | `const cart = …; cart.items.push(x)` works |
| A frozen object | Its own properties cannot change (one level deep). | `Object.freeze(settings)` |

mutability.js

```ts
const name = "ada";
const loud = name.toUpperCase();
console.log(name, loud);

try {
  name[0] = "A";               // strings cannot be changed in place
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}

const cart = { items: [] };
cart.items.push("Garri");     // allowed: the object changes, the variable does not
console.log(cart.items);

try {
  cart = { items: [] };       // not allowed: a const box cannot be pointed elsewhere
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node mutability.js` and of the browser terminal

```ts
ada ADA
TypeError: Cannot assign to read only property '0' of string 'ada'
[ 'Garri' ]
TypeError: Assignment to constant variable.
```

An object whose contents can change is **mutable**; a value that can never change is **immutable**. All primitives are immutable: `name[0] = "A"` is refused (in older, non-strict code it was silently ignored, which was worse). `const` is about the variable, not the value. To protect the object itself, freeze it:

freeze.js

```ts
const settings = Object.freeze({ currency: "NGN", vatPercent: 7.5, limits: { daily: 100000 } });

try {
  settings.vatPercent = 0;
} catch (error) {
  console.log(error.name);
}
settings.limits.daily = 999999999;     // freeze is shallow: the inner object is not frozen
console.log(settings.vatPercent, settings.limits.daily, Object.isFrozen(settings));
```

Output of `node freeze.js` and of the browser terminal

```ts
TypeError
7.5 999999999 true
```

Freezing stops changes to the object's own properties, but only one level deep: `limits` is a separate object and is still mutable. [Objects in depth](https://zudojs.oyinlola.site/learn/js-objects-deep) shows how to freeze deeply. ZudoJS freezes its configuration objects for exactly this reason: settings that nobody can change by accident are settings you can trust.

### Methods that change and methods that copy

Some built-in methods change the object you call them on; others return a new one. Knowing which is which prevents the shared-object bug in its sneakier forms:

mutating-methods.js

```ts
const prices = [1500, 200, 850];

const sortedCopy = prices.toSorted((a, b) => a - b);
console.log(prices, sortedCopy);

prices.sort((a, b) => a - b);        // sorts the list itself
console.log(prices);
```

Output of `node mutating-methods.js` and of the browser terminal

```json
[ 1500, 200, 850 ] [ 200, 850, 1500 ]
[ 200, 850, 1500 ]
```

`sort`, `reverse`, `push`, `pop` and `splice` change the list. `toSorted`, `toReversed`, `slice`, `map` and `filter` return a new one. String methods never change the string, because strings are immutable.

## Identity and equality

"Are these equal?" can mean three different questions:

1. **Same value?** For primitives: are these the same number, the same text?
2. **Same identity?** For objects: are these two references to the very same object?
3. **Same contents?** Do these two objects have the same properties with the same values?

`===` answers question 1 for primitives and question 2 for objects. Nothing built into the language answers question 3 directly:

identity.js

```ts
const a = { sku: "RICE-5", qty: 2 };
const b = { sku: "RICE-5", qty: 2 };
const c = a;

console.log(a === b, a === c);
console.log([] === [], "RICE-5" === "RICE-" + "5");

console.log(a.sku === b.sku && a.qty === b.qty);
console.log(JSON.stringify(a) === JSON.stringify(b));
console.log(JSON.stringify({ sku: "RICE-5", qty: 2 }) === JSON.stringify({ qty: 2, sku: "RICE-5" }));
```

Output of `node identity.js` and of the browser terminal

```ts
false true
false true
true
true
false
```

To compare contents, compare the fields that matter, as the third line does. Comparing `JSON.stringify` text works for simple data but depends on the order the properties were written in, as the last line shows. Test runners have a proper deep comparison: in Vitest, `toBe` checks identity and `toEqual` checks contents ([Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics)).

### Four ways to compare

JavaScript actually has four equality algorithms. You write two of them yourself; the other two are used for you by built-in methods:

- `===`, **strict equality**: same type and same value (or same object). Two exceptions: `NaN === NaN` is false, and `0 === -0` is true.
- `==`, **loose equality**: converts the two sides first, following rules explained in the next section.
- `Object.is(a, b)`, **same value**: like `===`, but without the two exceptions: `NaN` equals `NaN`, and `0` and `-0` are different.
- **SameValueZero**: like `Object.is`, except that `0` and `-0` are equal. You never call it by name; `includes`, `Map` and `Set` use it.

Negative zero, `-0`, is a real value in JavaScript: numbers carry a sign even when they are zero. It appears when a negative number is rounded to zero or multiplied by zero, and it can matter when the sign means something, such as the direction of a price change.

four-equalities.js

```ts
console.log(NaN === NaN, Object.is(NaN, NaN));
console.log(0 === -0, Object.is(0, -0));
console.log(Math.round(-0.4), -5 * 0, String(-0));

console.log([NaN].includes(NaN), [NaN].indexOf(NaN));
console.log(new Set([NaN, NaN, 0, -0]).size);

const ids = new Map([[1, "number one"], ["1", "text one"]]);
console.log(ids.get(1), "|", ids.get("1"));
```

Output of `node four-equalities.js` and of the browser terminal

```ts
false true
true false
-0 -0 0
true -1
2
number one | text one
```

| Comparison | `==` | `===` | `Object.is` | SameValueZero (`includes`, `Map`, `Set`) |
| --- | --- | --- | --- | --- |
| `NaN` and `NaN` | false | false | true | true |
| `0` and `-0` | true | true | false | true |
| `1` and `"1"` | true | false | false | false |
| `null` and `undefined` | true | false | false | false |
| two different `{}` | false | false | false | false |

Notice `indexOf`: it uses `===`, so it can never find `NaN`, while `includes` can. And the Map keeps `1` and `"1"` apart. That is exactly the bug waiting for you when an id arrives from a web address as text and your table uses numbers.

## Type coercion, precisely

In [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#coercion) you saw that JavaScript converts values on its own: `"5" - 1` is 4. This is **implicit coercion**. It is not random. Every operator follows the same few conversion rules, and once you know them you can predict any result.

### To a number

Arithmetic (except `+` with text), comparisons with `<` and `>`, and `Number(x)` all use the same conversion to a number. Let JavaScript print its own table:

to-number.js

```ts
const inputs = [undefined, null, true, false, "", "  12  ", "12px", "0x1A", "1e3", [], [5], [1, 2], {}];
const labels = ["undefined", "null", "true", "false", '""', '"  12  "', '"12px"', '"0x1A"', '"1e3"', "[]", "[5]", "[1, 2]", "{}"];

for (let i = 0; i < inputs.length; i++) {
  console.log(labels[i].padEnd(10), "->", Number(inputs[i]));
}
```

Output of `node to-number.js` and of the browser terminal

```ts
undefined  -> NaN
null       -> 0
true       -> 1
false      -> 0
""         -> 0
"  12  "   -> 12
"12px"     -> NaN
"0x1A"     -> 26
"1e3"      -> 1000
[]         -> 0
[5]        -> 5
[1, 2]     -> NaN
{}         -> NaN
```

The rules behind the table: `undefined` becomes NaN but `null` becomes 0; booleans become 1 and 0; text is read as a number after trimming spaces, with empty text as 0, hexadecimal (`0x`) and exponent (`1e3`) forms allowed, and anything else NaN. Objects are first turned into a primitive (see below): an array becomes its text, so `[]` is `""` (0), `[5]` is `"5"` and `[1, 2]` is `"1,2"` (NaN). `padEnd(10)` only pads the labels with spaces so the arrows line up.

### To a string

to-string.js

```ts
console.log(String(null), String(undefined), String(true), String(-0));
console.log(`[${String([1, 2, 3])}] [${String([])}] [${String([null, undefined])}]`);
console.log(String({}), String(1e21), String(0.000001), String(0.0000001));
```

Output of `node to-string.js` and of the browser terminal

```ts
null undefined true 0
[1,2,3] [] [,]
[object Object] 1e+21 0.000001 1e-7
```

Arrays join their items with commas (and `null` and `undefined` items become empty), plain objects become the unhelpful `"[object Object]"`, `-0` loses its sign, and very large or very small numbers switch to exponent notation. When `"[object Object]"` shows up in a web page or a log, some code turned an object into text by accident.

### Objects to primitives: valueOf and toString

When an operator needs a primitive and gets an object, JavaScript asks the object for one. It calls the object's `valueOf()` method, and if that does not return a primitive, its `toString()` method (when text is preferred, as in a template literal, it tries `toString()` first). You can define both on your own objects, and then the operators use them:

to-primitive.js

```ts
const price = {
  kobo: 150000,
  valueOf() {
    return this.kobo;
  },
  toString() {
    return "₦1,500.00";
  },
};

console.log(price + 500, price * 2, price > 100000);
console.log(`${price}`, String(price));
```

Output of `node to-primitive.js` and of the browser terminal

```ts
150500 300000 true
₦1,500.00 ₦1,500.00
```

Arithmetic used `valueOf` (the number of kobo); the template literal and `String()` used `toString`. `this.kobo` means "the `kobo` of the object this method belongs to"; [this](https://zudojs.oyinlola.site/learn/js-this) explains it. Be careful with this power: an object that behaves like a number in some places and like text in others is clever, and clever code is hard to read. Explicit methods such as `price.format()` are usually clearer.

### The + operator

`+` is the one operator with two jobs, so it has its own rule: convert both sides to primitives; if *either* is a string, join them as text; otherwise, add them as numbers.

plus.js

```ts
console.log(1 + null, 1 + undefined, true + true);
console.log("3" + 4, 3 + 4 + "5", "3" + 4 + 5);
console.log(`[${[] + []}]`, [] + {}, [1, 2] + [3]);
console.log("3" * "4", "10" / "4", "7" - - "2");
```

Output of `node plus.js` and of the browser terminal

```ts
1 NaN 2
34 75 345
[] [object Object] 1,23
12 2.5 9
```

`3 + 4 + "5"` is `"75"` because `+` works left to right: first 3 + 4 is 7, then 7 + "5" joins. `[] + []` is empty text, since both arrays turn into `""`. The other arithmetic operators have only one job, so `*`, `/` and `-` always convert to numbers: `"7" - - "2"` is 7 minus negative 2.

### Comparisons with < and >

If both sides are strings, they are compared as text, character by character. Otherwise both are converted to numbers. And `==` has rules of its own, which produce one of the most famous oddities in the language:

relational.js

```ts
console.log("10" < "9", "10" < 9, "abc" < 5, "abc" > 5);
console.log(null >= 0, null > 0, null == 0);
console.log(undefined >= 0, undefined == 0);
```

Output of `node relational.js` and of the browser terminal

```ts
true false false false
true false false
false false
```

`"abc"` becomes NaN, and every comparison with NaN is false, in both directions. `null >= 0` is true (null becomes 0 for `>=`) while `null == 0` is false, because `==` does not convert null to a number at all. That is the reason for the rule of thumb: never rely on how null and undefined compare; check for them explicitly first.

### The rules of ==

Loose equality follows these steps, in order:

1. Same type on both sides: compare exactly like `===`.
2. `null` and `undefined` are equal to each other, and to nothing else.
3. A number and a string: convert the string to a number.
4. A boolean on either side: convert the boolean to a number (1 or 0) and start again.
5. An object and a primitive: convert the object to a primitive and start again.
6. A bigint and a number (or string) compare by their mathematical value.

Here is the complete `==` table for ten common values, printed by JavaScript. `==` marks a pair that is loosely equal:

loose-table.js

```ts
const values = [0, "", "0", false, null, undefined, NaN, [], "1", 1];
const names = ["0", '""', '"0"', "false", "null", "undef", "NaN", "[]", '"1"', "1"];

let header = "      ";
for (const name of names) header = header + name.padEnd(6);
console.log(header);

for (let row = 0; row < values.length; row++) {
  let line = names[row].padEnd(6);
  for (let col = 0; col < values.length; col++) {
    line = line + (values[row] == values[col] ? "==" : ".").padEnd(6);
  }
  console.log(line);
}
```

Output of `node loose-table.js` and of the browser terminal

```ts
      0     ""    "0"   false null  undef NaN   []    "1"   1
0     ==    ==    ==    ==    .     .     .     ==    .     .
""    ==    ==    .     ==    .     .     .     ==    .     .
"0"   ==    .     ==    ==    .     .     .     .     .     .
false ==    ==    ==    ==    .     .     .     ==    .     .
null  .     .     .     .     ==    ==    .     .     .     .
undef .     .     .     .     ==    ==    .     .     .     .
NaN   .     .     .     .     .     .     .     .     .     .
[]    ==    ==    .     ==    .     .     .     ==    .     .
"1"   .     .     .     .     .     .     .     .     ==    ==
1     .     .     .     .     .     .     .     .     ==    ==
```

You do not need to follow the two loops that print it (they come in [Loops](https://zudojs.oyinlola.site/learn/js-loops)); read the table. It is full of results that break ordinary logic. `0 == ""` and `0 == "0"`, but `"" == "0"` is false, so `==` is not even consistent with itself. `"0" == false`, yet `Boolean("0")` is true, so a value can be "equal to false" and truthy at once. `NaN` equals nothing, not even itself. The `===` version of this table is just the diagonal, minus NaN.

> Use ===
>
> This table is why the course, ZudoJS, and almost every style guide use `===` and `!==` everywhere. Linters can enforce it (ESLint's `eqeqeq` rule). The one widely accepted exception is `value == null`, which is true for exactly `null` and `undefined`, as the table shows, and which [Operators](https://zudojs.oyinlola.site/learn/js-operators#comparison) uses.

## Real application: data from outside the program

Coercion bugs rarely come from values you typed. They come from values that arrived: form fields, web addresses, CSV files, environment variables. All of those are **text**, whatever they look like.

REASON IT OUT

### Before you code: an id from a web address

A request arrives for `/orders/42`. The server reads the id from the address as the string `"42"`. Orders are stored in a Map keyed by numeric ids.

- What does `orders.get("42")` return, and why?
- Would `order.id == id` "fix" it? What else would that let through?
- Which inputs must be rejected: `"42abc"`, `""`, `"4.2"`, `"-1"`, `" 42 "`?
- Where in the program should the conversion happen?

**Show the reasoning**

**`orders.get("42")` is `undefined`.** Maps compare keys with SameValueZero, which never converts types: `"42"` and `42` are different keys. The order looks missing although it exists.

**`==` hides the problem instead of solving it.** `42 == "42"` is true, but so is `0 == ""`, so an empty id would match order 0. And `==` does not help Map lookups at all.

**Rejecting input:** `Number("42abc")` is NaN, but `Number("")` is 0 and `Number(" 42 ")` is 42 (spaces are trimmed), so `Number()` alone is too forgiving. An id is a positive whole number, so the rule is: the text must be only digits, and the number must be a safe integer above 0. `"4.2"` and `"-1"` fail that rule.

**Convert at the edge.** Convert and validate once, where the text enters the program, then pass only real numbers inside it. Code deep inside the program should never have to wonder whether an id is text.

parse-id.js

```ts
const orders = new Map([
  [42, { id: 42, totalKobo: 1350000 }],
  [7, { id: 7, totalKobo: 450000 }],
]);

function parseId(text) {
  if (!/^\d+$/.test(text)) return null;        // only the digits 0-9, at least one
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id === 0) return null;
  return id;
}

console.log(orders.get("42"), orders.get(42).totalKobo);

for (const input of ["42", "42abc", "", "4.2", "-1", " 42 ", "0", "007"]) {
  const id = parseId(input);
  const found = id === null ? "rejected" : orders.get(id) ? "found" : "no such order";
  console.log(JSON.stringify(input).padEnd(8), id, found);
}
```

Output of `node parse-id.js` and of the browser terminal

```ts
undefined 1350000
"42"     42 found
"42abc"  null rejected
""       null rejected
"4.2"    null rejected
"-1"     null rejected
" 42 "   null rejected
"0"      null rejected
"007"    7 found
```

`/^\d+$/` is a regular expression meaning "one or more digits and nothing else"; [Regular expressions](https://zudojs.oyinlola.site/learn/js-regexp) explains the syntax. Notice the decision in the last line: `"007"` is accepted as order 7. That may or may not be what you want, and a test now documents it. Later in the academy, `@zudojs/schema` ([Schemas and validation in depth](https://zudojs.oyinlola.site/learn/zudo-validation)) does this kind of parsing at the edge of every request, so the code behind it only ever sees checked, correctly typed data.

> TIP
>
> The same applies to `process.env` in Node.js: every environment variable is a string, so `process.env.PORT` is `"3000"`, never 3000. `"3000" + 1` is `"30001"`.

## Testing with types in mind

Everything in this lesson turns into test cases. When a function takes outside data, its edge-case table should include:

- the right value as text (`"42"`) and as a number (`42`);
- empty text, text with spaces, `null` and `undefined`;
- `NaN`, `0` and, where the sign matters, `-0`;
- for functions that receive objects, a check that the caller's object is unchanged afterwards (or deliberately changed);
- for functions that return objects, a check of the contents, not the identity, and a check that two calls return two separate objects when they should.

type-tests.js

```ts
function check(label, actual, expected) {
  console.log(Object.is(actual, expected) ? `PASS ${label}` : `FAIL ${label}: got ${actual}, expected ${expected}`);
}

function createCart() {
  return { items: [], totalKobo: 0 };
}

function withItem(cart, item, priceKobo) {
  return { items: [...cart.items, item], totalKobo: cart.totalKobo + priceKobo };
}

const empty = createCart();
const one = withItem(empty, "Rice 5kg", 850000);

check("new cart each call", createCart() === createCart(), false);
check("original untouched", empty.items.length, 0);
check("item added to copy", one.items.length, 1);
check("total", one.totalKobo, 850000);
check("NaN is detected", Number("12px"), NaN);
check("-0 is detected", Math.round(-0.2), -0);
```

Output of `node type-tests.js` and of the browser terminal

```ts
PASS new cart each call
PASS original untouched
PASS item added to copy
PASS total
PASS NaN is detected
PASS -0 is detected
```

This `check` uses `Object.is` instead of `===`, so that a test expecting `NaN` can pass, and a test can tell `0` from `-0`. `withItem` returns a new cart instead of changing the one it was given: `[...cart.items, item]` builds a new list from the old items plus one more (spread, covered in [Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern)).

## Practice

TRY IT YOURSELF

### Predict the coercions

Write down what each line prints before you run it. Then use the rules from this lesson to explain every surprise.

```ts
console.log("5" * "2", "5" + 2, 5 + +"2");
console.log([] == false, [0] == false, [1] == true);
console.log(null + 1, undefined + 1, "" - 1);
console.log(Object.is(-0, 0), [-0].includes(0));
```

**Show a solution**

predict-coercion.js

```ts
console.log("5" * "2", "5" + 2, 5 + +"2");
console.log([] == false, [0] == false, [1] == true);
console.log(null + 1, undefined + 1, "" - 1);
console.log(Object.is(-0, 0), [-0].includes(0));
```

Output of `node predict-coercion.js` and of the browser terminal

```ts
10 52 7
true true true
1 NaN -1
false true
```

`*` always converts to numbers; `+` with a string joins; unary `+"2"` converts to 2 first. For `==` with a boolean, the boolean becomes a number, then the array becomes text: `[]` is `""` which is 0, `[0]` is `"0"` which is 0, `[1]` is `"1"` which is 1. `null` is 0 in arithmetic but `undefined` is NaN. `includes` uses SameValueZero, where `-0` and `0` are equal.

TRY IT YOURSELF

### Stop sharing the default settings

Every new shop account should start with default notification settings. After one shop turns off SMS, every other shop has it turned off too. Explain why, then fix it so each shop gets its own settings.

```ts
const defaultSettings = { sms: true, email: true };

function createShop(name) {
  return { name, settings: defaultSettings };
}

const a = createShop("Mama Titi");
const b = createShop("Chinedu Electronics");
a.settings.sms = false;
console.log(b.settings.sms);
```

**Show a solution**

`createShop` creates a new shop object each time, but its `settings` property holds a reference to the one `defaultSettings` object. All shops share it. Create a new settings object per shop, and freeze the defaults so a future mistake fails loudly instead of changing every shop:

shop-settings.js

```ts
const defaultSettings = Object.freeze({ sms: true, email: true });

function createShop(name) {
  return { name, settings: { ...defaultSettings } };
}

const a = createShop("Mama Titi");
const b = createShop("Chinedu Electronics");
a.settings.sms = false;
console.log(a.settings.sms, b.settings.sms, a.settings === b.settings);
```

Output of `node shop-settings.js` and of the browser terminal

```ts
false true false
```

`{ ...defaultSettings }` copies the properties into a new object. A shallow copy is enough here because the settings contain only primitives. `{ name, … }` is short for `{ name: name, … }`.

TRY IT YOURSELF

### Read a quantity from a form

A form sends the quantity of an item as text. Write `parseQuantity(text)` that returns a whole number from 1 to 99, or `null` for anything else. Reason first: what do `Number("")`, `Number(" 3 ")` and `Number("2.5")` give, and which of them should be accepted?

**Show a solution**

`Number("")` is 0 and `Number(" 3 ")` is 3, so `Number()` alone would accept empty text as 0 and quietly accept spaces. Decide: trim spaces (people type them by accident), refuse empty text, then require a whole number in range.

parse-quantity.js

```ts
function parseQuantity(text) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  return n;
}

for (const input of ["3", " 3 ", "", "0", "2.5", "100", "3 bags", "1e1"]) {
  console.log(JSON.stringify(input), parseQuantity(input));
}
```

Output of `node parse-quantity.js` and of the browser terminal

```ts
"3" 3
" 3 " 3
"" null
"0" null
"2.5" null
"100" null
"3 bags" null
"1e1" 10
```

Look at the last line: `"1e1"` is exponent notation for 10, and `Number()` accepts it. Is that acceptable for a quantity field? If not, add a digits-only check like `parseId` above. Every decision like this belongs in a test.

## Recap

- Seven primitives (string, number, bigint, boolean, undefined, null, symbol) are single, immutable values. Everything else is an object: Object, Array, Function, Date, Map, Set, WeakMap, WeakSet, RegExp, Error and more.
- Use `typeof` for primitives, `Array.isArray` and `instanceof` for objects, and `=== null` for null.
- Assignment and argument passing copy what is in the variable: the value for primitives, a reference for objects. Two names can point at one object; create new objects (a factory, a copy) when you need separate ones.
- `const` fixes the variable, not the object. `Object.freeze` fixes an object's own properties, one level deep.
- `===` compares values or identity; `Object.is` also handles NaN and -0; `includes`, `Map` and `Set` use SameValueZero. Nothing built in compares object contents.
- Coercion follows fixed rules: ToNumber, ToString, and ToPrimitive via `valueOf`/`toString`. `+` joins if either side is text. `==` has its own steps that break ordinary logic, so use `===`.
- Data from outside is text. Convert and validate it once, at the edge of the program.

Next, [Operators](https://zudojs.oyinlola.site/learn/js-operators) puts these values to work: arithmetic, comparison, logic, and safe defaults for missing values.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
