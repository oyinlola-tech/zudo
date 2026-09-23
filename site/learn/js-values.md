---
title: "Values, variables and functions"
description: "Store values in variables, make decisions with if, repeat work with loops, and package logic into functions."
source: https://zudojs.oyinlola.site/learn/js-values
---

LESSON 2 OF 10

JavaScript for the backend

# Values, variables and functions

Store values in variables, make decisions with if, repeat work with loops, and package logic into functions.

- **25 min** to read and try
- **You need:** Node.js 24 installed (lesson 1)
- **You build:** A function that describes a task

## Values

A program works with **values**. JavaScript has a few kinds you will use constantly:

values.js

```ts
console.log("Buy milk");        // a string: text, in quotes
console.log(42);                // a number
console.log(3.5);               // numbers can have decimals
console.log(true, false);       // booleans: yes or no
console.log(null);              // "no value", on purpose
console.log(undefined);         // "no value yet"
```

Output of `node values.js` and of the browser terminal

```ts
Buy milk
42
3.5
true false
null
undefined
```

Anything after `//` is a **comment**. JavaScript ignores it. Comments are notes for people reading the code.

You can ask any value what kind it is with `typeof`:

typeof.js

```ts
console.log(typeof "Buy milk");
console.log(typeof 42);
console.log(typeof true);
console.log(typeof undefined);
```

Output of `node typeof.js` and of the browser terminal

```ts
string
number
boolean
undefined
```

## Variables

A **variable** is a name for a value, so you can use it later. Create one with `const`:

variables.js

```ts
const title = "Buy milk";
const priority = 2;

console.log(title);
console.log(priority + 1);
```

Output of `node variables.js` and of the browser terminal

```ts
Buy milk
3
```

`const` means the name always points at the same value. If the value needs to change, use `let`:

let.js

```ts
let doneCount = 0;
doneCount = doneCount + 1;
doneCount += 1;   // a shorter way to write the line above

console.log(doneCount);
```

Output of `node let.js` and of the browser terminal

```ts
2
```

> TIP
>
> Use `const` by default and `let` only when you really need to reassign. Code is easier to follow when most names never change. You may also see `var` in old code. Don't use it.

## Working with strings

Backends build a lot of text: messages, log lines, error messages. The easiest way is a **template literal**, a string in backticks (`\``) where `${…}` inserts a value:

strings.js

```ts
const title = "Buy milk";
const priority = 2;

console.log(`Task "${title}" has priority ${priority}`);
console.log(title.length);
console.log(title.toUpperCase());
console.log("  padded  ".trim());
console.log(title.includes("milk"));
```

Output of `node strings.js` and of the browser terminal

```ts
Task "Buy milk" has priority 2
8
BUY MILK
padded
true
```

`.length`, `.toUpperCase()`, `.trim()` and `.includes()` belong to every string. `.trim()` removes spaces at both ends, which you will do to almost every piece of text a user sends you.

## Making decisions

`if` runs code only when a condition is true. `else` runs when it is not:

if.js

```ts
const title = "";

if (title.trim() === "") {
  console.log("A task needs a title");
} else {
  console.log(`Saving "${title}"`);
}
```

Output of `node if.js` and of the browser terminal

```ts
A task needs a title
```

You compare values with `===` (equal) and `!==` (not equal), and with `<`, `>`, `<=`, `>=`. Combine conditions with `&&` (and), `||` (or) and `!` (not).

> WATCH OUT
>
> JavaScript also has `==`, with two equals signs. It converts values before comparing, so `"1" == 1` is `true`. That surprises people and causes bugs. Always use `===`.

compare.js

```ts
console.log("1" == 1);
console.log("1" === 1);
console.log(5 > 3 && 2 > 3);
console.log(5 > 3 || 2 > 3);
```

Output of `node compare.js` and of the browser terminal

```ts
true
false
false
true
```

## Repeating work

A `for...of` loop runs once for each item in a list:

loop.js

```ts
const titles = ["Buy milk", "Write report", "Call Ada"];

for (const title of titles) {
  console.log(`- ${title}`);
}
```

Output of `node loop.js` and of the browser terminal

```ts
- Buy milk
- Write report
- Call Ada
```

The square brackets make an **array**, an ordered list. You will learn much more about arrays in the next lesson.

## Functions

A **function** is a named piece of code you can run again and again. It takes inputs, called **parameters**, and can give back a result with `return`:

functions.js

```ts
function describeTask(title, done) {
  const mark = done ? "x" : " ";
  return `[${mark}] ${title}`;
}

console.log(describeTask("Buy milk", true));
console.log(describeTask("Write report", false));
```

Output of `node functions.js` and of the browser terminal

```json
[x] Buy milk
[ ] Write report
```

`done ? "x" : " "` is a short if/else that produces a value: if `done` is true it gives `"x"`, otherwise `" "`.

There is a shorter way to write functions, the **arrow function**. You will see it everywhere in modern JavaScript and in ZudoJS:

arrow.js

```ts
const double = (n) => n * 2;
const greet = (name = "friend") => `Hello, ${name}!`;

console.log(double(21));
console.log(greet("Ada"));
console.log(greet());
```

Output of `node arrow.js` and of the browser terminal

```ts
42
Hello, Ada!
Hello, friend!
```

`name = "friend"` is a **default value**: it is used when nobody passes that parameter.

## Practice

TRY IT YOURSELF

### Validate a task title

Write a function `checkTitle(title)` that returns `"Title is required"` when the title is empty or only spaces, `"Title is too long"` when it has more than 50 characters, and `"OK"` otherwise. Test it with three different titles.

**Show a solution**

check-title.js

```ts
function checkTitle(title) {
  const clean = title.trim();
  if (clean === "") {
    return "Title is required";
  }
  if (clean.length > 50) {
    return "Title is too long";
  }
  return "OK";
}

console.log(checkTitle("   "));
console.log(checkTitle("Buy milk"));
console.log(checkTitle("x".repeat(51)));
```

Output of `node check-title.js` and of the browser terminal

```ts
Title is required
OK
Title is too long
```

Checking input like this is called **validation**. Every backend does it, and in lesson 9 ZudoJS will do it for you.

## Recap

- Values are strings, numbers, booleans, `null` and `undefined`. `typeof` tells you which.
- `const` names a value; `let` names one you will change.
- `if`/`else` decides, `for...of` repeats, and functions package logic you can reuse.
- Always compare with `===`.
