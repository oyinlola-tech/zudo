---
title: "Meet JavaScript — ZudoJS Academy"
description: "Learn where JavaScript comes from, who decides how it changes, how to tell which features you can use, and the syntax rules every line of code follows."
source: https://zudojs.oyinlola.site/learn/js-intro
---

LEVEL 2 · LESSON 1 OF 19

Getting started Foundation

# Meet JavaScript

Learn where JavaScript comes from, who decides how it changes, how to tell which features you can use, and the syntax rules every line of code follows.

- **40 min** to read and try
- **You need:** The Programming thinking course
- **You build:** A small till-receipt program, plus the habits to read and write JavaScript syntax without the classic traps

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what ECMAScript, TC39 and the proposal stages are, and why a new edition of JavaScript appears every year
- Decide whether a feature is safe to use by checking its stage, your runtimes and feature detection
- Tell the language (ECMAScript) apart from what the browser or Node.js adds to it
- Tell statements from expressions, and know where each is allowed
- Avoid the automatic semicolon insertion traps and follow common naming conventions

## Two snippets, one language

You search the web for "JavaScript group orders by status" and find two answers. One, from 2013, is fifteen lines long and starts with `var self = this;`. The other, from 2025, is one line: `Object.groupBy(orders, …)`. Both say they are JavaScript. Both have hundreds of upvotes. Which one should you use? Will the short one work in your customers' browsers? On your server?

These questions have precise answers, and knowing where to find them saves you from two expensive mistakes: copying old code full of workarounds for problems that were solved years ago, and shipping new code that crashes for part of your users. This lesson answers them. It explains where JavaScript comes from, who changes it and how, and how you check what you can use. Then it covers the grammar rules every line of JavaScript follows: statements and expressions, comments, semicolons, whitespace and names.

You will write code in the browser terminal on this page. The [next lesson](https://zudojs.oyinlola.site/learn/setup) installs Node.js so you can run the same code on your own computer.

## A short history

In 1995, Netscape, whose browser most people used to reach the web, wanted a small language that anyone could write straight into a web page to make it react: check a form, change an image. Brendan Eich wrote the first version in about ten days. It was called Mocha, then LiveScript, and finally **JavaScript**, a name chosen to ride on the popularity of Java. The two languages have little in common (see [How programs run](https://zudojs.oyinlola.site/learn/how-programs-run#where-js-runs)).

Microsoft soon shipped its own copy in Internet Explorer. Two browsers with two slightly different languages is a disaster for anyone writing a web page, so in 1996 Netscape handed the language to **Ecma International**, a standards organisation, to write an official description that every browser would follow. That description is the **ECMAScript** standard, officially called ECMA-262. "ECMAScript" is the name of the standard; "JavaScript" is what everybody calls the language. For practical purposes they are the same thing.

| Year | Edition | What changed |
| --- | --- | --- |
| 1997 | ES1 | The first standard. |
| 1999 | ES3 | Regular expressions, `try`/`catch`. The language most of the early web was written in. |
| 2008 | ES4 (abandoned) | A huge redesign that the committee could not agree on. It was dropped. |
| 2009 | ES5 | Strict mode, built-in JSON support, array helpers. Node.js also appeared this year, taking JavaScript to servers. |
| 2015 | ES2015 (also called ES6) | The biggest update ever: `let` and `const`, arrow functions, classes, modules, promises, template literals, `Map` and `Set`. |
| 2016 onwards | ES2016, ES2017, … | A new, smaller edition every June, named after its year. |

The six-year gap between ES5 and ES2015, and the failed ES4 before it, taught the committee a lesson: one giant release every few years is too slow and too risky. Since 2016 the standard has been released every year with whatever features are finished by then. A feature that is not ready simply waits for next year's train.

So "which JavaScript is real?" has an answer: all of it. The 2013 snippet is valid, old-style JavaScript that still runs today; the 2025 one uses a feature added in ES2024. JavaScript almost never removes anything (you will see why below), so old code keeps working and new code gets shorter.

Here are a few features from recent editions, working on a list of orders. You do not need to understand every piece yet; each one gets its own lesson. Just notice how each year adds a tool that used to need several lines of your own code:

recent-features.js

```ts
const orders = [
  { id: "ORD-1", status: "paid", total: 4500 },
  { id: "ORD-2", status: "pending", total: 1200 },
  { id: "ORD-3", status: "paid", total: 9900 },
];

console.log(orders.at(-1).id);                                  // ES2022: count from the end
console.log(orders.findLast((o) => o.status === "paid").id);    // ES2023: search from the end
const byStatus = Object.groupBy(orders, (o) => o.status);       // ES2024: group a list
console.log(Object.keys(byStatus), byStatus.paid.length);
console.log(new Set(["vip", "new"]).union(new Set(["new", "bulk"])));   // ES2025: set operations
```

Output of `node recent-features.js` and of the browser terminal

```ts
ORD-3
ORD-3
[ 'paid', 'pending' ] 2
Set(3) { 'vip', 'new', 'bulk' }
```

## Who changes JavaScript: TC39 and the stages

The standard is maintained by a committee of Ecma International called **TC39** (Technical Committee 39). Its members are the companies that build JavaScript engines (Google, Mozilla, Apple, Microsoft), other companies that depend heavily on the language, and invited experts. They meet regularly, in public, and decide by **consensus**: a change goes ahead only when nobody in the room objects. Anyone can read the proposals and the meeting notes on GitHub.

A new feature starts as a **proposal** and moves through numbered **stages**. Each stage is a promise about how finished the feature is:

| Stage | Meaning | Can you use it? |
| --- | --- | --- |
| 0 | An idea that a committee member wants to discuss. | No. |
| 1 | The committee agrees the problem is worth solving and explores solutions. | No: the whole design may change. |
| 2 | A preferred solution is chosen and a first draft of the specification text exists. | No: details still change. |
| 2.7 | The design is approved in principle; tests are being written. | Not in production. |
| 3 | The design is finished. Engines are asked to implement it; only problems found while implementing can change it. | Maybe, if your runtimes already have it. Changes are rare but possible. |
| 4 | Finished: tested by the official test suite (**Test262**) and shipped in at least two engines. It goes into the next June edition. | Yes, once the runtimes you support have it. |

Stage 2.7 is a recent addition; older articles describe only stages 0 to 4. The practical rule: **stage 4 means "this is JavaScript"**. Before that, the feature can still change or be dropped, and blog posts about it may be out of date.

### Don't break the web

TC39 has one rule above all others: a new edition must not break existing websites. There are billions of pages that nobody will ever update, and they must keep working. That is why mistakes in JavaScript are almost never fixed. `typeof null` is `"object"`, a bug from 1995 that you will meet in [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#types), and it will stay that way forever.

A famous example: in 2018 a proposal wanted to add `flatten()` to arrays. It turned out that an old library called MooTools, still used on many sites, had added its own incompatible `flatten`. Shipping the new one would have broken those sites. The committee renamed the new method to `flat()`, and that is its name today:

flat.js

```ts
const cartsPerDay = [["rice", "beans"], ["oil"], []];
console.log(cartsPerDay.flat());
console.log(typeof [].flatten);
```

Output of `node flat.js` and of the browser terminal

```json
[ 'rice', 'beans', 'oil' ]
undefined
```

For you, "don't break the web" is good news: JavaScript you learn today will still run in twenty years.

## Engines, hosts and what belongs to the language

In [How programs run](https://zudojs.oyinlola.site/learn/how-programs-run#engines) you met the engines that run JavaScript: **V8** (Chrome, Edge and Node.js), **SpiderMonkey** (Firefox) and **JavaScriptCore** (Safari, and the Bun runtime). Each engine implements the ECMAScript standard, so the language behaves the same in all of them. Each team implements new features on its own schedule, which is why a stage 4 feature may be in Chrome months before it reaches Safari.

An engine alone cannot do much: it has no way to print, wait, read a file or talk to the network. Those abilities come from the **host**, the program that embeds the engine: a browser, or Node.js (or another server runtime such as Deno or Bun). This gives you a useful split:

| Part of the language (ECMAScript) | Added by the host |
| --- | --- |
| `Math`, `JSON`, `Array`, `Object`, `Promise`, `Map`, `Set`, `Date`, `String`, `Number` | Both hosts: `console`, `setTimeout`, `fetch`, `URL` |
| `if`, `for`, `function`, `class`, `import`, operators | Browser only: `document`, `window`, `localStorage` |
| `globalThis`: the object that holds the global names | Node.js only: `process`, `node:fs`, `node:http` |

Even `console.log` is not part of ECMAScript. Browsers and Node.js both provide it, following a separate standard. You can see what exists with `typeof`, which reports `"undefined"` for a name that does not exist instead of crashing:

language-or-host.js

```ts
console.log("Math:", typeof Math, "| JSON:", typeof JSON);
console.log("console:", typeof console, "| setTimeout:", typeof setTimeout);
console.log("globalThis:", typeof globalThis);
console.log("Math is on globalThis:", globalThis.Math === Math);
```

Output of `node language-or-host.js` and of the browser terminal

```ts
Math: object | JSON: object
console: object | setTimeout: function
globalThis: object
Math is on globalThis: true
```

This example prints the same everywhere. What differs is the host-only part. Run this one with Node.js on your computer, then paste it into your browser's developer console:

which-host.jsNode.js only

```ts
const host = typeof process === "object" ? "Node.js" : "a browser";
console.log(`Running in ${host}`);
console.log("document:", typeof document);
```

Output of `node which-host.js`

```ts
Running in Node.js
document: undefined
```

Why does the split matter? Because when a feature is missing, you need to know whom to blame and where to look it up. A missing `Object.groupBy` means the engine is too old. A missing `document` means you are on the server, where there is no page. The [JavaScript platforms course](https://zudojs.oyinlola.site/learn/javascript-platforms) covers both hosts in depth.

## Can I use this feature?

Back to the question from the start: can you use `Object.groupBy`?

REASON IT OUT

### Before you decide: is a feature safe to use?

You want to use a JavaScript feature you found in a blog post. Think through what you need to know before it goes into a real product:

- Where will this code run? Who controls that runtime, and how old can it be?
- Is the feature finished, or can it still change?
- What happens to a user whose runtime does not have it?
- Can your program check for the feature while it runs?

**Show the reasoning**

**Where it runs** decides everything. Backend code runs on a server with a Node.js version *you* choose, so you check one version and you are done. Code sent to browsers runs on whatever your visitors have, including phones that have not been updated for years; you do not control it.

**Is it finished?** Check its stage in the TC39 proposals list, or check that it appears in the MDN documentation with a "Baseline" badge (a label MDN uses for features that work in all major browsers). Stage 4 is safe to learn; anything lower can change.

**Missing feature:** calling a method that does not exist is a `TypeError`, and the program stops at that line. For a server, that shows up the first time the code runs; for a browser, only the users with old browsers see it, which makes it easy to miss.

**Checking while running** is called **feature detection**: `typeof Object.groupBy === "function"` is true only if the feature exists. You can then use a fallback. For browsers, build tools can also translate new syntax into old syntax (a **transpiler**, such as Babel or the TypeScript compiler) and add missing functions (a **polyfill**). The [tooling lesson](https://zudojs.oyinlola.site/learn/js-tooling) covers both.

Useful places to check: **MDN Web Docs** (every feature has a compatibility table at the bottom), **caniuse.com** for browsers, and **node.green** for Node.js versions. Feature detection looks like this:

feature-detect.js

```ts
const orders = [
  { id: "ORD-1", status: "paid" },
  { id: "ORD-2", status: "pending" },
  { id: "ORD-3", status: "paid" },
];

function countByStatus(list) {
  if (typeof Object.groupBy === "function") {
    const groups = Object.groupBy(list, (o) => o.status);
    return `paid=${groups.paid.length} (built-in)`;
  }
  let paid = 0;
  for (const order of list) {
    if (order.status === "paid") paid = paid + 1;
  }
  return `paid=${paid} (fallback)`;
}

console.log(countByStatus(orders));
console.log(typeof Object.groupBy, typeof Object.thisDoesNotExist);
```

Output of `node feature-detect.js` and of the browser terminal

```ts
paid=2 (built-in)
function undefined
```

ZudoJS requires Node.js 24 or newer, which includes everything up to ES2025, so on the backend in this course you can use every stage 4 feature you meet. Checking *once* which runtime you support is better than guessing every time.

## Your first program: a till receipt

Enough history. Here is a complete program. A shop's till prints a receipt for two items. Press **Run in browser**, then change a price and run it again:

receipt.js

```ts
// A till receipt for one customer.
console.log("MAMA TITI'S STORE");
console.log("Rice 5kg      x1", 8500);
console.log("Palm oil 1L   x2", 2 * 2500);
console.log("-----------------------");
console.log("TOTAL           ", 8500 + 2 * 2500);
console.log("Thank you for shopping with us!");
```

Output of `node receipt.js` and of the browser terminal

```ts
MAMA TITI'S STORE
Rice 5kg      x1 8500
Palm oil 1L   x2 5000
-----------------------
TOTAL            13500
Thank you for shopping with us!
```

The program runs from top to bottom, one line at a time, as you traced in [Why doesn't this work?](https://zudojs.oyinlola.site/learn/solve-broken). JavaScript worked out `2 * 2500` and `8500 + 2 * 2500` before printing them, multiplying before adding as in school maths. The prices are typed twice, which is a bug waiting to happen: change one and forget the other. [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values) fixes that with variables. The rest of this lesson looks at the grammar of these lines.

## Statements and expressions

Every piece of JavaScript is one of two kinds of thing:

- An **expression** is code that *produces a value*. `8500` is an expression (its value is 8500). So are `2 * 2500`, `"Rice"`, `8500 + 2 * 2500` and `Math.max(3, 9)`. Expressions can be combined into bigger expressions.
- A **statement** is code that *does something*: an instruction. `const total = 13500;` creates a variable. `if (…) { … }` makes a decision. `for (…) { … }` repeats. `return total;` ends a function. A program is a list of statements.

The two fit together: statements contain expressions. In `const total = 8500 + 5000;` the whole line is a statement, and `8500 + 5000` is the expression that gives it a value. And an expression on its own can be used as a statement: `console.log("Hi");` is a function call (an expression) used as a statement. This is called an **expression statement**.

### Why the difference matters

Some places accept *only* expressions: the right-hand side of `=`, the arguments of a function call, and the `${…}` slots in a template literal. A statement in those places is a syntax error. The example below uses `new Function(code)`, which turns text into a function, only so that it can show you the syntax error without stopping the whole page. You will not need it in real code.

statement-in-expression.js

```ts
const attempts = [
  "console.log(2 * 2500)",
  "console.log(if (true) 5000)",
  "const total = if (true) 5000",
];

for (const code of attempts) {
  try {
    new Function(code);
    console.log(`OK:    ${code}`);
  } catch (error) {
    console.log(`ERROR: ${code} -> ${error.message}`);
  }
}
```

Output of `node statement-in-expression.js` and of the browser terminal

```ts
OK:    console.log(2 * 2500)
ERROR: console.log(if (true) 5000) -> Unexpected token 'if'
ERROR: const total = if (true) 5000 -> Unexpected token 'if'
```

`if` is a statement, so it cannot stand where a value is expected. When you need a choice *inside* an expression, JavaScript has an expression form of `if`/`else`: the **ternary operator** `condition ? valueIfTrue : valueIfFalse`, which you met in the problem workshops and will study in [Making decisions](https://zudojs.oyinlola.site/learn/js-conditions#ternary):

ternary.js

```ts
const total = 13500;
console.log(`Delivery: ${total >= 20000 ? "free" : "₦1,500"}`);
const label = total >= 10000 ? "big order" : "small order";
console.log(label);
```

Output of `node ternary.js` and of the browser terminal

```ts
Delivery: ₦1,500
big order
```

A quick test: "could I put this on the right of `const x =`?" If yes, it is an expression.

## Comments

[The next lesson](https://zudojs.oyinlola.site/learn/setup#statements-comments) shows the two comment forms in a program you run on your computer. In short: `//` starts a comment that runs to the end of the line, and `/* … */` wraps a comment over several lines. The engine skips both completely. Three more things are worth knowing now.

**Documentation comments.** A block comment that starts with `/**` is a **JSDoc** comment. Editors show it when you hover over the function, and tools can check it. ZudoJS documents its whole public API this way:

jsdoc.js

```ts
/**
 * Works out the delivery fee for an order.
 * @param {number} totalKobo - The order total, in kobo.
 * @returns {number} The fee in kobo: free from ₦20,000.
 */
function deliveryFee(totalKobo) {
  return totalKobo >= 2000000 ? 0 : 150000;
}

console.log(deliveryFee(1350000), deliveryFee(2000000));
```

Output of `node jsdoc.js` and of the browser terminal

```ts
150000 0
```

**Block comments do not nest.** The first `*/` ends the comment, whatever came before it. So commenting out a piece of code that already contains a block comment leaves the rest of it as broken code:

nested-comment.js

```ts
try {
  new Function("/* outer /* inner */ still outside */");
} catch (error) {
  console.log(error.name + ": " + error.message);
}
```

Output of `node nested-comment.js` and of the browser terminal

```ts
SyntaxError: Unexpected identifier 'outside'
```

After `inner */` the comment is over, so JavaScript tries to read `still outside */` as code. `still` could be a variable name, but two names in a row mean nothing, so it stops at `outside`. Notice that the error points at `outside`, while the real mistake is the `/*` much earlier. That is typical of syntax errors: the cause is often *before* the place the error is reported. To disable several lines, put `//` in front of each one; every editor does it with one shortcut (usually Ctrl/Cmd + /).

**Comment the why.** `// add 1 to count` repeats the code. `// the bank counts the first day as day 1` explains a decision the code cannot show. The problem workshops asked you to write down every decision; a comment is one place to put it, and a test is the other.

## Semicolons and automatic semicolon insertion

Statements end with a semicolon. But if you leave one out at the end of a line, the program usually still works, because of a rule called **automatic semicolon insertion** (ASI). When the engine reaches a line break and the next line *cannot* continue the current statement, it pretends a semicolon was there. The word "cannot" is the trap: if the next line *can* continue the statement, no semicolon is inserted, and two lines you meant to be separate become one.

REASON IT OUT

### Before you run it: where are the semicolons?

Both of these functions are written without the semicolons you might expect. Before you run the example below, predict what each one does.

```ts
function makeReceipt() {
  return
    { total: 13500 }
}

const shop = "Mama Titi"
[1, 2].forEach((n) => console.log(n))
```

- Can a `return` statement continue onto the next line?
- Can a line that starts with `[` continue the line before it? What would `"Mama Titi"[1, 2]` mean?

**Show the reasoning**

**return:** the language has a rule that a line break is not allowed directly after `return`. So ASI puts a semicolon right after it: the function runs `return;` and gives back `undefined`. The object on the next line is never reached. The same rule applies after `throw`, `break` and `continue`, and before `++`, `--` and `=>`.

**The `[` line:** `"Mama Titi"[…]` is valid JavaScript (it reads a character from the string), so the second line *can* continue the first and no semicolon is inserted. The engine reads one statement: `const shop = "Mama Titi"[1, 2].forEach(…)`. `[1, 2]` here is not a list but an index, and `1, 2` evaluates to 2, so it reads the character at position 2, `"m"`, and then tries to call `.forEach` on it. Strings have no `forEach`, so it throws a TypeError. Lines that start with `(`, `[` or `\`` are the dangerous ones.

asi-traps.js

```ts
function makeReceipt() {
  return
    { total: 13500 }
}
console.log(makeReceipt())

try {
  const shop = "Mama Titi"
  [1, 2].forEach((n) => console.log(n))
} catch (error) {
  console.log(error.name)
}

const price = 2500
try {
  const total = price
  (1 + 1) * price
} catch (error) {
  console.log(error.name + ": " + error.message)
}
```

Output of `node asi-traps.js` and of the browser terminal

```ts
undefined
TypeError
TypeError: price is not a function
```

The third trap: `price` followed by a line starting with `(` is read as `price(1 + 1)`, a function call. The fix for all three is the same: end your statements with semicolons, and put a returned value on the same line as `return`:

asi-fixed.js

```ts
function makeReceipt() {
  return {
    total: 13500,
  };
}
console.log(makeReceipt());

const shop = "Mama Titi";
[1, 2].forEach((n) => console.log(n));
```

Output of `node asi-fixed.js` and of the browser terminal

```json
{ total: 13500 }
1
2
```

> TIP
>
> This course writes semicolons everywhere, like ZudoJS itself. Some teams leave them out and rely on ASI; they then must start any line that begins with `(`, `[` or `\`` with a `;`. Either style works if it is applied consistently, which is exactly what a code formatter such as Prettier does for you ([JavaScript tooling](https://zudojs.oyinlola.site/learn/js-tooling)). What does not work is mixing the two by accident.

## Whitespace and layout

Outside of strings, spaces, tabs and line breaks (together called **whitespace**) mostly do not matter to the engine. These two statements are identical to JavaScript:

whitespace.js

```ts
const total=8500+2*2500;console.log(total);

const sameTotal =
  8500 +
  2 * 2500;
console.log(sameTotal);
console.log("  spaces inside a string are kept  ".length);
```

Output of `node whitespace.js` and of the browser terminal

```ts
13500
13500
35
```

Whitespace matters in three places: inside strings (every space is part of the text), between words that would otherwise merge (`const total`, not `consttotal`), and at line breaks, because of ASI. Everywhere else, layout is for people. That makes it a team decision, and teams settle it by using a formatter so nobody has to argue about it. The common conventions, which this course follows:

- Indent each level of braces by two spaces.
- Put spaces around operators (`a + b`) and after commas.
- Keep lines short (around 80 to 100 characters) and one statement per line.
- Use a blank line to separate groups of related statements, like paragraphs.

## Naming conventions

[Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#variables) will give you the rules for names: letters, digits, `_` and `$`, never starting with a digit, case-sensitive, and never a reserved word. Break a rule and the file does not run:

name-rules.js

```ts
const tries = ["const café = 1", "const _count = 1", "const $price = 1", "const 2fast = 1", "const class = 1", "const ₦price = 1"];

for (const code of tries) {
  try {
    new Function(code);
    console.log(`valid:   ${code}`);
  } catch (error) {
    console.log(`invalid: ${code} (${error.message})`);
  }
}
```

Output of `node name-rules.js` and of the browser terminal

```ts
valid:   const café = 1
valid:   const _count = 1
valid:   const $price = 1
invalid: const 2fast = 1 (Invalid or unexpected token)
invalid: const class = 1 (Unexpected token 'class')
invalid: const ₦price = 1 (Invalid or unexpected token)
```

Letters from any alphabet are allowed (`café`), but symbols such as `₦` are not. Beyond the rules, JavaScript developers follow **conventions**: habits that are not enforced, but that everyone recognises. Following them lets another developer understand what a name is before reading its definition:

| Kind of name | Convention | Examples |
| --- | --- | --- |
| Variables and functions | **camelCase** | `orderTotal`, `deliveryFee` |
| Classes and constructors | **PascalCase** (every word capitalised) | `BankAccount`, `Date`, `Map` |
| Fixed settings | **UPPER_SNAKE_CASE** | `MAX_LOGIN_ATTEMPTS`, `DAILY_LIMIT` |
| Functions | Start with a verb | `calculateTotal`, `findCustomer`, `sendInvoice` |
| Booleans | A yes/no question | `isPaid`, `hasStock`, `canWithdraw` |
| Lists | Plural; one item singular | `for (const order of orders)` |
| Deliberately unused | A leading underscore | `_event` |
| File names | Lowercase, words joined by dashes (or dots in some projects) | `order-service.js` |

The built-in objects follow these rules too, which is how you can guess what an unfamiliar name is: `Math.max` is a camelCase function, `Number.MAX_SAFE_INTEGER` is a constant, `Set` is something you create with `new`.

The most important convention has no special spelling: a name should say what the value *means*. `d` tells the reader nothing; `daysOverdue` tells them everything, including the unit. Abbreviations save a few keystrokes once and cost every reader a moment, forever. When a name is hard to choose, it often means the code is doing two jobs at once.

### Strict mode

One more piece of history explains an error you will see. ES5 added **strict mode**, an opt-in version of the language that turns some silent mistakes into errors. The most important one: assigning to a name you never declared. Without strict mode, a typo like `totl = 5` silently creates a new global variable; in strict mode it is a `ReferenceError`. You switch it on with the text `"use strict";` at the top of a file or function, and every ES module, which includes every file in this course and in ZudoJS, is strict automatically.

strict.js

```ts
function addDeliveryFee() {
  "use strict";
  let total = 13500;
  try {
    totl = total + 1500;   // typo: totl was never declared
  } catch (error) {
    return `${error.name}: ${error.message}`;
  }
  return total;
}

console.log(addDeliveryFee());
```

Output of `node strict.js` and of the browser terminal

```ts
ReferenceError: totl is not defined
```

## Practice

TRY IT YOURSELF

### Statement or expression?

For each piece of code, decide whether it is an expression (it produces a value) or only a statement. Then check the expressions by putting each one after `console.log(`.

1. `8500 * 2`
2. `const fee = 1500;`
3. `"Receipt for " + "Ada"`
4. `fee >= 1000 ? "high" : "low"`
5. `if (fee > 0) { console.log("fee"); }`
6. `Math.round(2.6)`

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Wrap each expression in its own `console.log(...)` call, in the order given.

HINT 2

The ternary reads `condition ? valueIfTrue : valueIfFalse`: `console.log(fee >= 1000 ? "high" : "low")`.

SOLUTION

1, 3, 4 and 6 are expressions; 2 and 5 are statements. Only expressions can go inside `console.log(…)`:

classify.js

```ts
const fee = 1500;
console.log(8500 * 2);
console.log("Receipt for " + "Ada");
console.log(fee >= 1000 ? "high" : "low");
console.log(Math.round(2.6));
```

Output of `node classify.js` and of the browser terminal

```ts
17000
Receipt for Ada
high
3
```

A variable declaration and an `if` produce no value you can pass along, so `console.log(const fee = 1500)` or `console.log(if …)` would be syntax errors.

TRY IT YOURSELF

### Fix the missing semicolons

This program should print the receipt total, then `Paid` and `Thank you`. It crashes instead. Find the line that ASI joins to the one before it, explain what the engine reads, and fix it.

```ts
const total = 13500
const message = "Paid"
[message, "Thank you"].forEach((line) => console.log(line))
console.log(total)
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

A missing semicolon lets the next line continue the statement when that line *could* be part of an expression, such as one starting with `[`, `(` or a backtick. Add a `;` at the end of every statement.

HINT 2

Three semicolons are missing: after `13500`, after `"Paid"`, and after the `.forEach(...)` call.

SOLUTION

The third line starts with `[`, so it continues the second: the engine reads `const message = "Paid"[message, "Thank you"].forEach(…)`. That uses `message` while it is still being created, which is itself an error. Adding semicolons separates the statements:

asi-exercise.js

```ts
const total = 13500;
const message = "Paid";
[message, "Thank you"].forEach((line) => console.log(line));
console.log(total);
```

Output of `node asi-exercise.js` and of the browser terminal

```ts
Paid
Thank you
13500
```

TRY IT YOURSELF

### Rename by convention

Rename everything in this snippet so that it follows the conventions from the naming table, and so that every name says what it means. Keep the behaviour the same.

```ts
const x = 100000;
const l = [30000, 50000, 40000];
let t = 0;
for (const a of l) t = t + a;
const ok = t <= x;
console.log(t, ok);
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Check the naming table earlier in this lesson: a fixed setting that never changes is UPPER_SNAKE_CASE, a list is plural, and its loop variable is the singular of that name.

HINT 2

For example, the list becomes plural, such as `withdrawals`, and its loop variable becomes the singular of that, such as `amount`. Do the same for the limit, the running total and the boolean, then end with `console.log(yourTotal, yourBoolean);`.

SOLUTION

rename.js

```ts
const DAILY_LIMIT = 100000;
const withdrawals = [30000, 50000, 40000];
let withdrawnToday = 0;
for (const amount of withdrawals) withdrawnToday = withdrawnToday + amount;
const isWithinLimit = withdrawnToday <= DAILY_LIMIT;
console.log(withdrawnToday, isWithinLimit);
```

Output of `node rename.js` and of the browser terminal

```ts
120000 false
```

The fixed setting is UPPER_SNAKE_CASE, the list is plural with a singular loop variable, and the boolean reads as a question. With good names, the last line explains the bug report by itself: the customer went over the daily limit.

## Recap

- JavaScript was created in 1995; ECMAScript (ECMA-262) is its standard. ES2015 was the big modern update, and since 2016 a new edition appears every June.
- TC39 changes the language by consensus. Proposals move from stage 0 to stage 4; stage 4 means finished and part of the language. Nothing that would break existing websites is ever changed.
- Engines (V8, SpiderMonkey, JavaScriptCore) implement the language; hosts (browsers, Node.js) add abilities like `console`, `document` or `process`. Check features on MDN, caniuse.com or node.green, and detect them with `typeof`.
- Expressions produce values; statements do things. Only expressions can go where a value is expected.
- End statements with semicolons. Never break a line right after `return`, and watch lines that start with `(`, `[` or `\``.
- camelCase for variables and functions, PascalCase for classes, UPPER_SNAKE_CASE for fixed settings, and names that say what the value means. ES modules are always in strict mode.

Next, [Set up your computer](https://zudojs.oyinlola.site/learn/setup) installs Node.js, so you can run everything from this lesson outside the browser.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
