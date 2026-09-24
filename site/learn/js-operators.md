---
title: "Operators"
description: "Calculate, compare and combine values with JavaScript's operators, give missing values safe defaults with ?? and ?., and avoid the classic precedence traps."
source: https://zudojs.oyinlola.site/learn/js-operators
---

LESSON 7 OF 84

JavaScript fundamentals Foundation

# Operators

Calculate, compare and combine values with JavaScript's operators, give missing values safe defaults with ?? and ?., and avoid the classic precedence traps.

- **30 min** to read and try
- **You need:** The previous lesson, Values, variables and types
- **You build:** A settings reader that fills in safe defaults for missing values

  [Test yourself](#test)

## What an operator is

An **operator** is a symbol that does something with one or more values and produces a new value. In `2 + 3`, the operator is `+` and the values it works on, `2` and `3`, are its **operands**. You already used a few in [the previous lesson](https://zudojs.oyinlola.site/learn/js-values): `=`, `+` and `typeof`. This lesson covers the rest you need every day.

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
- `==` (**loose equality**) first converts the values to a common type, using the coercion rules you saw in the previous lesson. `!=` is its opposite.

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

## Operator precedence

When an expression has several operators, **precedence** decides which one runs first, like in school maths: `*` before `+`. Operators with the same precedence usually run left to right.

precedence.js

```ts
console.log(2 + 3 * 4);            // * first
console.log((2 + 3) * 4);          // parentheses first
console.log("Total: " + 1 + 2);    // left to right: text, then more text
console.log("Total: " + (1 + 2));
console.log(1 + 2 + " items");     // left to right: 3, then text
console.log(!"a" === false);       // ! runs before ===
console.log(true || false && false); // && runs before ||
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
```

The classic traps:

- `"Total: " + 1 + 2` gives `"Total: 12"`. The first `+` makes a string, and every `+` after it joins text. Put the sum in parentheses.
- `!a === b` means `(!a) === b`, not `!(a === b)`. Use `!==` instead.
- `&&` binds tighter than `||`, so `a || b && c` means `a || (b && c)`.
- `-2 ** 2` is a syntax error: JavaScript refuses to guess. Write `(-2) ** 2` or `-(2 ** 2)`.
- Mixing `??` with `||` or `&&` without parentheses is also a syntax error.

> TIP
>
> You do not need to learn the full precedence table. When you are not sure, add parentheses. They cost nothing and make the order obvious to the next reader.

## Put it together: reading settings with defaults

A backend often receives settings where some values are missing, some are `0` on purpose, and some parts are absent. This program reads them safely:

settings.js

```ts
const request = {
  query: { page: 0, search: "" },
  user: null,
};

const page = request.query?.page ?? 1;
const pageSize = request.query?.pageSize ?? 20;
const search = request.query?.search ?? "*";
const userName = request.user?.name ?? "guest";
const isFirstPage = page === 0;
const offset = page * pageSize;

console.log(`page=${page} size=${pageSize} offset=${offset}`);
console.log(`search=[${search}] first=${isFirstPage}`);
console.log(`user=${userName}`);
```

Output of `node settings.js` and of the browser terminal

```ts
page=0 size=20 offset=0
search=[] first=true
user=guest
```

`page` stays `0` and `search` stays empty, because they were sent on purpose. Only the truly missing values got defaults. With `||` instead of `??`, page would be `1` and search would be `"*"`: two bugs.

## Practice

TRY IT YOURSELF

### Even or odd

Print whether 7, 10 and 0 are even, using `%` and `===`.

**Show a solution**

even.js

```ts
console.log(7 % 2 === 0);
console.log(10 % 2 === 0);
console.log(0 % 2 === 0);
```

Output of `node even.js` and of the browser terminal

```ts
false
true
true
```

TRY IT YOURSELF

### Fix the default

This code should print `Volume: 0` when the user turned the volume all the way down, and `Volume: 50` only when there is no setting. Fix it.

```ts
const settings = { volume: 0 };
console.log(`Volume: ${settings.volume || 50}`);
```

**Show a solution**

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

### Read a nested value

Given `const order = { customer: { address: null } };`, print the city of the customer's address, or `"unknown"` if there is none, without crashing.

**Show a solution**

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

- Arithmetic: `+ - * / % **`. `%` gives the remainder; `++` and `--` add or take away one.
- `x += 5` is short for `x = x + 5`, and the same works for the other operators.
- Compare with `===` and `!==`, never `==` (except `value == null`).
- `&&` and `||` short-circuit and give back one of their values.
- Use `??` and `??=` for defaults, and `?.` to read values that might be missing.
- When the order of operators is not obvious, add parentheses.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
