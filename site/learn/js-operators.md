---
title: "Operators — ZudoJS Academy"
description: "Calculate, compare and combine values with every JavaScript operator, give missing values safe defaults with ?? and ?., and avoid the precedence traps."
source: https://zudojs.oyinlola.site/learn/js-operators
---

LEVEL 2 · LESSON 5 OF 19

Values and operators Foundation

# Operators

Calculate, compare and combine values with every JavaScript operator, give missing values safe defaults with ?? and ?., and avoid the precedence traps.

- **30 min** to read and try
- **You need:** Values, variables and types, and Types in depth
- **You build:** A settings reader that fills in safe defaults for missing values

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Calculate with the arithmetic, unary and assignment operators, including % and **
- Compare values with === and explain why == is avoided
- Use && and
- for short-circuiting and ?? and ?. for missing values
- Ask questions about values with typeof, instanceof and in, and use delete, new and void correctly
- Store and test yes/no flags with the bitwise operators
- Predict evaluation order from the precedence table, and add parentheses when it is unclear

## What an operator is

An **operator** is a symbol (or a keyword) that does something with one or more values and produces a new value. In `2 + 3`, the operator is `+` and the values it works on, `2` and `3`, are its **operands**. Operators are named by how many operands they take: a **unary** operator takes one (`-price`, `!done`), a **binary** operator takes two (`a + b`), and the one **ternary** operator takes three (`a ? b : c`).

You already used a few in [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values) and [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep): `=`, `+`, `typeof` and `===`. This lesson covers all of them: the ones you need every day first, then the rarer ones you must still be able to read, and finally the precedence table that decides which operator runs first.

## Arithmetic

arithmetic.js

```ts
console.log(7 + 2);    // addition
console.log(7 - 2);    // subtraction
console.log(7 * 2);    // multiplication
console.log(7 / 2);    // division
console.log(7 % 2);    // remainder: what is left after dividing
console.log(2 ** 3);   // power: 2 * 2 * 2
console.log(-7 % 3);   // the remainder keeps the sign of the left side
```

Output of `node arithmetic.js` and of the browser terminal

```ts
9
5
14
3.5
1
8
-1
```

The **remainder** operator `%` is more useful than it looks. `n % 2 === 0` means "n is even". `minutes % 60` gives the minutes left over after whole hours. `index % 3` cycles through 0, 1, 2, 0, 1, 2.

### Unary plus and minus

Written in front of a single value, `-` negates it and `+` converts it to a number, using exactly the same rules as `Number()`. You will see `+value` in real code as a short way to convert text:

unary.js

```ts
const fromForm = "2500";
console.log(fromForm + 500);        // binary + with a string: joins text
console.log(+fromForm + 500);       // unary + converts first, then adds
console.log(-fromForm);             // unary - converts, then negates
console.log(+"", +"12px", +true);   // the same rules, and traps, as Number()
console.log(-(-5), - -5);
```

Output of `node unary.js` and of the browser terminal

```ts
2500500
3000
-2500
0 NaN 1
5 5
```

`+""` is `0`, just like `Number("")`, so unary plus is no safer than `Number()` for form input. Most teams write `Number(value)` because it is easier to see; recognise `+value` when you read it.

### Adding and subtracting one

`++` adds 1 to a variable and `--` takes 1 away. You will see them mostly in loops.

increment.js

```ts
let count = 5;
count++;
console.log(count);
count--;
count--;
console.log(count);

let a = 1;
console.log(a++);   // gives the old value, then adds 1
console.log(a);
console.log(++a);   // adds 1, then gives the new value
```

Output of `node increment.js` and of the browser terminal

```ts
6
4
1
2
3
```

`a++` and `++a` both add 1, but they give back a different value. That difference confuses people, so write `count++` on a line of its own and never use its value inside a bigger expression.

## Assignment operators

`=` stores a value. The **compound assignment** operators do a calculation and store the result in one step: `x += 5` is short for `x = x + 5`.

assignment.js

```ts
let total = 10;
total += 5;     // total = total + 5
console.log(total);
total -= 3;     // total = total - 3
console.log(total);
total *= 2;     // total = total * 2
console.log(total);
total /= 4;     // total = total / 4
console.log(total);
total %= 4;     // total = total % 4
console.log(total);

let log = "start";
log += " > step 1";   // += also joins strings
log += " > step 2";
console.log(log);
```

Output of `node assignment.js` and of the browser terminal

```ts
15
12
24
6
2
start > step 1 > step 2
```

## Comparison

Comparison operators compare two values and always give back a boolean, `true` or `false`.

compare.js

```ts
console.log(5 > 3, 5 < 3);
console.log(5 >= 5, 4 <= 3);
console.log(5 === 5, 5 !== 5);
console.log("apple" < "banana");   // strings compare letter by letter
console.log("10" < "9");           // as text, "1" comes before "9"
console.log(10 < 9);
```

Output of `node compare.js` and of the browser terminal

```ts
true false
true false
true false
true
true
false
```

`"10" < "9"` is `true` because strings are compared character by character, like words in a dictionary. Convert text to numbers before you compare them as numbers.

### == versus ===

JavaScript has two kinds of equality:

- `===` (**strict equality**) is true only when both values have the same type and the same value. `!==` is its opposite.
- `==` (**loose equality**) first converts the values to a common type, using the coercion rules from [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#coercion). `!=` is its opposite.

equality.js

```ts
console.log("1" == 1, "1" === 1);
console.log(0 == false, 0 === false);
console.log("" == 0, "" === 0);
console.log(null == undefined, null === undefined);
console.log("1" != 1, "1" !== 1);
console.log(NaN === NaN);
```

Output of `node equality.js` and of the browser terminal

```ts
true false
true false
true false
true false
false true
false
```

> Always use ===
>
> Loose equality says `"" == 0` and `0 == false`. Rules like that cause bugs that are hard to see. Always compare with `===` and `!==`. The only common exception is `value == null`, which checks for `null` or `undefined` in one go.

You do not need to memorise how `==` converts; you need to not use it. If you want the full story, [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#coercion) lists the steps `==` follows and prints its whole table, and its [Identity and equality](https://zudojs.oyinlola.site/learn/js-types-deep#equality) section explains `Object.is` and why `NaN === NaN` is false.

## Logical operators

Logical operators combine conditions:

- `a && b` (**and**) is true when both sides are true.
- `a || b` (**or**) is true when at least one side is true.
- `!a` (**not**) flips true to false and false to true.

logical.js

```ts
const priority = 3;
const done = false;

console.log(priority > 2 && !done);    // urgent and still open?
console.log(priority > 5 || done);     // very urgent, or already done?
console.log(!done);
console.log(!!"hello");                // two nots: turn any value into a boolean
```

Output of `node logical.js` and of the browser terminal

```ts
true
false
true
true
```

### Short-circuiting

JavaScript reads `&&` and `||` from left to right and stops as soon as it knows the answer. This is called **short-circuiting**. With `&&`, if the left side is falsy, the right side never runs. With `||`, if the left side is truthy, the right side never runs.

They also do not give back `true` or `false`. They give back one of the two *values*: the one where they stopped.

short-circuit.js

```ts
console.log("Ada" || "anonymous");    // left is truthy: stop, give the left
console.log("" || "anonymous");       // left is falsy: give the right
console.log("Ada" && "logged in");    // left is truthy: give the right
console.log(0 && "never checked");    // left is falsy: stop, give the left

const isAdmin = false;
isAdmin && console.log("Deleting everything");   // the right side never runs
console.log("done");
```

Output of `node short-circuit.js` and of the browser terminal

```ts
Ada
anonymous
logged in
0
done
```

For years people used `||` to give a missing value a default: `name || "anonymous"`. That has a bug. `||` replaces *every* falsy value, including `0` and `""`, which are often perfectly valid:

or-bug.js

```ts
const chosenPriority = 0;      // 0 is a real choice: "lowest"
const priority = chosenPriority || 2;
console.log(priority);         // oops: 0 was thrown away
```

Output of `node or-bug.js` and of the browser terminal

```ts
2
```

## Defaults with ?? and ??=

The **nullish coalescing** operator `??` fixes that bug. `a ?? b` gives `b` only when `a` is `null` or `undefined` (these two are called **nullish**). Every other value, including `0`, `""` and `false`, is kept.

nullish.js

```ts
console.log(0 ?? 20);
console.log(`[${"" ?? "anonymous"}]`);  // brackets show the empty text
console.log(false ?? true);
console.log(null ?? 20);
console.log(undefined ?? 20);

let pageSize;          // never set, so undefined
pageSize ??= 25;       // assign only if it is null or undefined
console.log(pageSize);
pageSize ??= 50;       // already set: nothing happens
console.log(pageSize);
```

Output of `node nullish.js` and of the browser terminal

```ts
0
[]
false
20
20
25
25
```

The empty string was kept: the brackets in the second line have nothing between them.

> TIP
>
> Use `??` for defaults. Use `||` only when you really mean "any falsy value should be replaced".

There are also `||=` and `&&=`, which work the same way as `??=` with `||` and `&&`. You will need them less often.

## Optional chaining

Data often has values inside values. Here a user has a profile, and the profile has a name. These are **objects**, which you will study in [their own lesson](https://zudojs.oyinlola.site/learn/js-data); for now, `user.profile.name` means "the name inside the profile inside the user".

If a part in the middle is missing, reading past it crashes the program. The **optional chaining** operator `?.` stops early and gives `undefined` instead:

optional-chaining.js

```ts
const ada = { profile: { name: "Ada" } };
const guest = { profile: null };

console.log(ada.profile.name);

try {
  console.log(guest.profile.name);
} catch (error) {
  console.log("Crash:", error.message);
}

console.log(guest.profile?.name);
console.log(guest?.profile?.name ?? "Guest");
```

Output of `node optional-chaining.js` and of the browser terminal

```ts
Ada
Crash: Cannot read properties of null (reading 'name')
undefined
Guest
```

`?.` and `??` work well together: the first one avoids the crash, the second one supplies a default. You will write `thing?.part ?? fallback` very often when you read data sent to your backend.

## typeof, instanceof, in, delete, new and void

Six operators are words instead of symbols. Four of them ask a question about a value or an object; two do something unusual. Here they are on an order from a shop:

keyword-operators.js

```ts
const order = { id: "ORD-7", totalKobo: 1170000, coupon: undefined };
const placedAt = new Date("2026-09-24T10:00:00Z");   // new: build an object

console.log(typeof order.totalKobo, typeof placedAt, typeof notDeclaredAnywhere);
console.log(placedAt instanceof Date, order instanceof Date, [] instanceof Array);

console.log("coupon" in order, "discount" in order, "toString" in order);
console.log(Object.hasOwn(order, "coupon"), Object.hasOwn(order, "toString"));

console.log(delete order.coupon, "coupon" in order);
console.log(order);

console.log(void 0, void "anything");
```

Output of `node keyword-operators.js` and of the browser terminal

```ts
number object undefined
true false true
true false true
true false
true false
{ id: 'ORD-7', totalKobo: 1170000 }
undefined undefined
```

- **`typeof x`** gives the type as a string, as in [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#types). It is the one operator that does not throw for a name that was never declared; it says `"undefined"`.
- **`x instanceof C`** asks "was `x` made by `C`?" It works for the built-in object types (`Date`, `Array`, `Error`) and for your own classes. [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes) explains what it checks underneath.
- **`"key" in obj`** asks "does this object have a property with this name?" It is `true` for `coupon` even though its value is `undefined`, which `order.coupon === undefined` cannot tell apart from a missing property. It also finds *inherited* names such as `toString`; when you only want the object's own properties, use `Object.hasOwn(obj, "key")`.
- **`delete obj.key`** removes a property from an object and returns `true`. It does not delete variables, and on an array it leaves an empty hole instead of shifting the items (use `splice` from [Arrays](https://zudojs.oyinlola.site/learn/js-arrays#add-remove) for that).
- **`new C(…)`** creates a new object from a constructor or class: `new Date()`, `new Map()`, `new Error("…")`. You will write your own classes in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes).
- **`void x`** evaluates `x` and then gives `undefined`, whatever `x` was. You rarely need it. You may read `void 0` in old or minified code (a short way to write `undefined`), and `void someAsyncCall()` in modern code, to say "I start this on purpose without waiting for it".

## Bitwise operators

Every whole number is stored in binary, as a row of **bits** (0s and 1s): 5 is `101`, 6 is `110`. The **bitwise operators** work on those bits one position at a time. You will not use them for everyday arithmetic, but you will meet them in two places: compact yes/no flags, such as permissions, and code that works with binary data (hashes, network packets, colours).

| Operator | Name | Each result bit is 1 when… | Example |
| --- | --- | --- | --- |
| `a & b` | AND | both bits are 1 | `6 & 3` is `110 & 011` = `010` = 2 |
| `a \| b` | OR | at least one bit is 1 | `6 \| 3` = `111` = 7 |
| `a ^ b` | XOR | the bits are different | `6 ^ 3` = `101` = 5 |
| `~a` | NOT | the bit was 0 (every bit flips) | `~5` is -6 |
| `a << n`, `a >> n`, `a >>> n` | shifts | bits move `n` places left or right | `1 << 3` is 8 |

The classic real use is a set of permission **flags**: give every permission its own bit, and one number holds all of a user's permissions:

flags.js

```ts
const VIEW_ORDERS = 1;    // binary 001
const EDIT_ORDERS = 2;    // binary 010
const ISSUE_REFUND = 4;   // binary 100

let cashier = VIEW_ORDERS | EDIT_ORDERS;              // | switches bits on
console.log(cashier, cashier.toString(2));
console.log((cashier & ISSUE_REFUND) !== 0);           // & tests one bit

cashier = cashier | ISSUE_REFUND;
console.log((cashier & ISSUE_REFUND) !== 0, cashier.toString(2));

cashier = cashier & ~EDIT_ORDERS;                      // & ~ switches a bit off
console.log(cashier.toString(2), (cashier & EDIT_ORDERS) !== 0);
```

Output of `node flags.js` and of the browser terminal

```ts
3 11
false
true 111
101 false
```

`toString(2)` shows a number in binary. `|` adds a permission, `&` tests one, and `& ~` removes one. Databases and operating systems store permissions this way because one small number is cheap to store and compare. In application code a `Set` of permission names is usually clearer ([Sets](https://zudojs.oyinlola.site/learn/logic-sets)); choose flags when size or speed really matters, or when a format you must read uses them.

### The 32-bit trap

Before working, every bitwise operator converts its operands to a **32-bit whole number**. Decimals are cut off, and anything outside about ±2.1 billion wraps around:

bitwise-32.js

```ts
console.log(7.9 | 0, -7.9 | 0);       // the decimals are cut off
console.log(2147483647 | 0);          // the largest 32-bit number
console.log(3000000000 | 0);          // too big: it wraps round to a negative number
console.log(3000000000 >>> 0);        // >>> reads the bits as unsigned

const isAdmin = true;
const isActive = false;
console.log(isAdmin & isActive, isAdmin && isActive);
```

Output of `node bitwise-32.js` and of the browser terminal

```ts
7 -7
2147483647
-1294967296
3000000000
0 false
```

Old code sometimes writes `x | 0` to drop decimals; that silently breaks for amounts above about ₦21 million in kobo. Use `Math.trunc(x)`. The last line shows a common typo: `&` instead of `&&`. With booleans it gives a number (`0` or `1`) instead of a boolean, and it never short-circuits, so the right side always runs.

## Operator precedence

When an expression has several operators, **precedence** decides which one runs first, like in school maths: `*` before `+`. Operators on the same level run left to right, except the few marked "right to left", whose **associativity** goes the other way.

| From first to last | Operators | Order on the same level |
| --- | --- | --- |
| 1 | Grouping `( … )` |  |
| 2 | Member access and calls: `a.b`, `a?.b`, `a[b]`, `f()`, `new C()` | left to right |
| 3 | Postfix `a++`, `a--` |  |
| 4 | Unary: `!`, `~`, `+a`, `-a`, `++a`, `--a`, `typeof`, `void`, `delete`, `await` |  |
| 5 | `**` | right to left |
| 6 | `*`, `/`, `%` | left to right |
| 7 | `+`, `-` | left to right |
| 8 | `<<`, `>>`, `>>>` | left to right |
| 9 | `<`, `<=`, `>`, `>=`, `in`, `instanceof` | left to right |
| 10 | `===`, `!==`, `==`, `!=` | left to right |
| 11 | `&`, then `^`, then `\|` (three separate levels) | left to right |
| 12 | `&&` | left to right |
| 13 | `\|\|` and `??` (never mixed with `&&` or `\|\|` without parentheses) | left to right |
| 14 | `? :`, and all assignments: `=`, `+=`, `??=`, … | right to left |
| 15 | The comma `,` (evaluate both, give the right one) | left to right |

precedence.js

```ts
console.log(2 + 3 * 4);            // * first
console.log((2 + 3) * 4);          // parentheses first
console.log("Total: " + 1 + 2);    // left to right: text, then more text
console.log("Total: " + (1 + 2));
console.log(1 + 2 + " items");     // left to right: 3, then text
console.log(!"a" === false);       // ! runs before ===
console.log(true || false && false); // && runs before ||
console.log(typeof 1 + 2);         // typeof runs before +
console.log(2 ** 3 ** 2);          // ** runs right to left: 2 ** 9
let a;
let b;
a = b = 5;                         // = runs right to left: b = 5 first
console.log(a, b);
```

Output of `node precedence.js` and of the browser terminal

```ts
14
20
Total: 12
Total: 3
3 items
true
true
number2
512
5 5
```

The classic traps:

- `"Total: " + 1 + 2` gives `"Total: 12"`. The first `+` makes a string, and every `+` after it joins text. Put the sum in parentheses.
- `!a === b` means `(!a) === b`, not `!(a === b)`. Use `!==` instead.
- `&&` binds tighter than `||`, so `a || b && c` means `a || (b && c)`.
- `typeof x + y` means `(typeof x) + y`, a string. Write `typeof (x + y)` if you meant the type of the sum.
- `-2 ** 2` is a syntax error: JavaScript refuses to guess. Write `(-2) ** 2` or `-(2 ** 2)`.
- Mixing `??` with `||` or `&&` without parentheses is also a syntax error.

> TIP
>
> Use the table to *read* other people's code. When you *write* code and are not sure, add parentheses. They cost nothing and make the order obvious to the next reader.

## Put it together: reading settings with defaults

A backend often receives settings where some values are missing, some are `0`, `""` or `false` on purpose, and some whole parts are absent. Here a shop's stock report receives a query from the page and the logged-in user, if there is one.

REASON IT OUT

### Before you code: which values get a default?

The request is `{ query: { minStock: 0, search: "", inStockOnly: false }, user: null }`. The defaults are: `minStock` 5, `pageSize` 20, `search` `"*"` (everything), `inStockOnly` `true`, and the user name `"guest"`.

- Which of the five values did the client really send, and which are missing?
- Which of the sent values are falsy? What would `||` do to each of them?
- What happens if you write `request.user.name`? And if the whole `query` is missing?

**Show the reasoning**

**Sent:** `minStock`, `search` and `inStockOnly`. **Missing:** `pageSize`, and the user's name, because there is no user.

**All three sent values are falsy**: `0` ("show every product, even those with no stock left"), `""` ("no search text") and `false` ("include sold-out products"). They are real choices. `||` would replace every one of them with the default, silently ignoring what the user asked for. `??` only replaces `null` and `undefined`, so it keeps them.

**Missing objects:** `request.user` is `null`, so `request.user.name` throws a `TypeError`, and so would `request.query.minStock` if a client sent no query at all. `?.` stops at the missing part and gives `undefined`, which `??` then turns into the default.

settings.js

```ts
const request = {
  query: { minStock: 0, search: "", inStockOnly: false },
  user: null,
};

const minStock = request.query?.minStock ?? 5;
const pageSize = request.query?.pageSize ?? 20;
const search = request.query?.search ?? "*";
const inStockOnly = request.query?.inStockOnly ?? true;
const userName = request.user?.name ?? "guest";

console.log(`minStock=${minStock} pageSize=${pageSize}`);
console.log(`search=[${search}] inStockOnly=${inStockOnly}`);
console.log(`user=${userName}`);

const withOr = request.query.minStock || 5;
console.log(`with || instead: minStock=${withOr}`);
```

Output of `node settings.js` and of the browser terminal

```ts
minStock=0 pageSize=20
search=[] inStockOnly=false
user=guest
with || instead: minStock=5
```

`minStock` stayed `0`, `search` stayed empty and `inStockOnly` stayed `false`, because they were sent on purpose. Only the truly missing values got defaults. With `||` the report would hide sold-out products, search for `"*"` and ignore the `0`: three bugs, and no error message to tell you.

## Practice

TRY IT YOURSELF

### Minutes to hours

A delivery takes `135` minutes. Using `Math.floor`, `/` and `%`, print it as `2h 15min`. Then do the same for `59` and `120` minutes.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Math.floor(total / 60)` gives the whole hours; `%` gives what is left over.

HINT 2

`const hours = Math.floor(total / 60); const minutes = total % 60;` then `console.log(\`${hours}h ${minutes}min\`);`

SOLUTION

minutes.js

```ts
for (const total of [135, 59, 120]) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  console.log(`${hours}h ${minutes}min`);
}
```

Output of `node minutes.js` and of the browser terminal

```ts
2h 15min
0h 59min
2h 0min
```

`total / 60` gives a decimal (2.25), and `Math.floor` keeps the whole hours. `%` gives what is left over after taking out the whole hours.

TRY IT YOURSELF

### Fix the default

This code should print `Volume: 0` when the user turned the volume all the way down, and `Volume: 50` only when there is no setting. Fix it.

```ts
const settings = { volume: 0 };
console.log(`Volume: ${settings.volume || 50}`);
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`||` replaces every falsy value, including a real `0`. Use `??` instead: it only replaces `null` and `undefined`.

HINT 2

`console.log(\`Volume: ${settings.volume ?? 50}\`);` and the same line for `empty.volume`.

SOLUTION

volume.js

```ts
const settings = { volume: 0 };
const empty = {};

console.log(`Volume: ${settings.volume ?? 50}`);
console.log(`Volume: ${empty.volume ?? 50}`);
```

Output of `node volume.js` and of the browser terminal

```ts
Volume: 0
Volume: 50
```

`||` threw away the valid `0`. `??` replaces only `null` and `undefined`.

TRY IT YOURSELF

### Check a permission flag

Using the flags `VIEW_ORDERS = 1`, `EDIT_ORDERS = 2` and `ISSUE_REFUND = 4` from the bitwise section, write `can(permissions, flag)` that returns `true` or `false`. A manager has `7`. Check whether the manager can issue refunds, then remove that permission and check again.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`permissions & flag` keeps only the bit you ask about: it equals `flag` when that bit is on, and `0` when it is off.

HINT 2

`return (permissions & flag) !== 0;`

SOLUTION

can.js

```ts
const VIEW_ORDERS = 1;
const EDIT_ORDERS = 2;
const ISSUE_REFUND = 4;

function can(permissions, flag) {
  return (permissions & flag) !== 0;
}

let manager = VIEW_ORDERS | EDIT_ORDERS | ISSUE_REFUND;
console.log(manager, can(manager, ISSUE_REFUND));
manager = manager & ~ISSUE_REFUND;
console.log(manager, can(manager, ISSUE_REFUND), can(manager, VIEW_ORDERS));
```

Output of `node can.js` and of the browser terminal

```ts
7 true
3 false true
```

`permissions & flag` keeps only the bit you ask about: it is `flag` itself when the bit is on and `0` when it is off. Comparing with `!== 0` turns that into a real boolean.

TRY IT YOURSELF

### Read a nested value

Given `const order = { customer: { address: null } };`, print the city of the customer's address, or `"unknown"` if there is none, without crashing.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`?.` stops and gives `undefined` as soon as it meets `null` or `undefined`, instead of crashing.

HINT 2

`order.customer?.address?.city ?? "unknown"`

SOLUTION

city.js

```ts
const order = { customer: { address: null } };
const city = order.customer?.address?.city ?? "unknown";
console.log(city);
```

Output of `node city.js` and of the browser terminal

```ts
unknown
```

## Recap

- Arithmetic: `+ - * / % **`. `%` gives the remainder; `++` and `--` add or take away one. Unary `+x` converts to a number, like `Number(x)`.
- `x += 5` is short for `x = x + 5`, and the same works for the other operators.
- Compare with `===` and `!==`, never `==` (except `value == null`).
- `&&` and `||` short-circuit and give back one of their values.
- Use `??` and `??=` for defaults, and `?.` to read values that might be missing.
- `typeof`, `instanceof` and `in` ask questions about values; `delete` removes a property, `new` builds an object, `void` gives `undefined`.
- Bitwise operators work on the bits of 32-bit whole numbers. They suit flags; do not use them for rounding.
- Precedence decides which operator runs first. When the order is not obvious, add parentheses.

Next, [Making decisions](https://zudojs.oyinlola.site/learn/js-conditions): use these comparisons to let a program choose what to do.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
