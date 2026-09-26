---
title: "Values, variables and types — ZudoJS Academy"
description: "Store values in variables with const and let, meet the seven primitive types, and learn how JavaScript handles text, numbers, true and false, and \"no value\"."
source: https://zudojs.oyinlola.site/learn/js-values
---

LEVEL 2 · LESSON 3 OF 19

Values and operators Foundation

# Values, variables and types

Store values in variables with const and let, meet the seven primitive types, and learn how JavaScript handles text, numbers, true and false, and "no value".

- **35 min** to read and try
- **You need:** Meet JavaScript and Set up your computer (or just the browser terminal on this page)
- **You build:** A small task summary built from variables, strings and numbers

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Store values with const and let, and explain why var is avoided
- Name the seven primitive types and check a value's type with typeof
- Convert text to numbers on purpose and spot the Number("") and NaN traps
- Build and clean text with template literals and string methods
- Tell truthy from falsy values, and null from undefined

## Variables

A program works with **values**: a piece of text, a number, a yes or no. A **variable** is a name you give to a value so you can use it later. Think of it as a label stuck on the value.

You create a variable with `const` or `let`, a name, an equals sign, and the value:

variables.js

```ts
const title = "Buy milk";
let doneCount = 0;

console.log(title);
console.log(doneCount);

doneCount = doneCount + 1;   // give doneCount a new value
doneCount = doneCount + 1;
console.log(doneCount);
```

Output of `node variables.js` and of the browser terminal

```ts
Buy milk
0
2
```

Anything after `//` is a comment, as in [Meet JavaScript](https://zudojs.oyinlola.site/learn/js-intro#comments).

The `=` sign does not mean "equals" like in maths. It means "store the value on the right under the name on the left". `doneCount = doneCount + 1` reads the old value, adds 1, and stores the result. Changing the value of an existing variable is called **reassigning** it.

### const or let

A `const` variable can never be reassigned. A `let` variable can. If you try to reassign a `const`, JavaScript stops with an error:

const.js

```ts
const maxTasks = 100;

try {
  maxTasks = 200;
} catch (error) {
  console.log(error.message);
}

console.log(maxTasks);
```

Output of `node const.js` and of the browser terminal

```ts
Assignment to constant variable.
100
```

`try` and `catch` let the program print the error and keep going. You will learn them properly in [the lesson on errors](https://zudojs.oyinlola.site/learn/js-errors); for now, read them as "try this, and if it fails, show why".

> TIP
>
> Use `const` by default. Switch to `let` only when you really need to reassign. When most names never change, code is much easier to follow.

### Why not var

Old code uses a third keyword, `var`. It works, but it has two surprises: you can declare the same name twice by accident, and a `var` made inside a block (the code between `{` and `}`) leaks out of it.

var.js

```ts
var count = 1;
var count = 2;          // no error, the first count is silently replaced
console.log(count);

{
  var leaked = "I escaped the block";
  let kept = "I stay inside";
}
console.log(leaked);
console.log(typeof kept);
```

Output of `node var.js` and of the browser terminal

```ts
2
I escaped the block
undefined
```

`let` and `const` fix both problems: declaring the same name twice is an error, and they stay inside their block. Never write `var` in new code. The [lesson on scope](https://zudojs.oyinlola.site/learn/js-scope) explains the details.

### Naming variables

- A name can use letters, digits, `_` and `$`, but cannot start with a digit. `task1` is fine; `1task` is not.
- Names are case-sensitive: `title` and `Title` are two different variables.
- You cannot use words that JavaScript reserves, such as `let`, `if` or `return`.
- JavaScript uses **camelCase**: the first word in lowercase, each next word starts with a capital: `doneCount`, `maxTitleLength`.
- For a true constant, a fixed setting that never changes while the program runs, many teams use UPPER_SNAKE_CASE: `const MAX_TASKS = 100;`.

Pick names that say what the value means. `doneCount` tells the reader far more than `x` or `n2`.

## The primitive types

Every value has a **type**, the kind of value it is. JavaScript has seven basic types, called **primitive types**. The operator `typeof` tells you the type of any value:

types.js

```ts
console.log(typeof "Buy milk");       // text
console.log(typeof 42);               // a number, whole or decimal
console.log(typeof 3.5);
console.log(typeof 9007199254740993n); // a very big whole number
console.log(typeof true);             // yes or no
console.log(typeof undefined);        // "no value yet"
console.log(typeof null);             // "no value, on purpose"
console.log(typeof Symbol("id"));     // a unique label
```

Output of `node types.js` and of the browser terminal

```ts
string
number
number
bigint
boolean
undefined
object
symbol
```

- **string**: text, in quotes.
- **number**: any number. JavaScript does not have a separate type for whole numbers and decimals.
- **bigint**: whole numbers of any size, written with an `n` at the end. You need it only for numbers too large for `number`; you will see why below.
- **boolean**: exactly two values, `true` and `false`.
- **undefined** and **null**: two ways to say "nothing here". The last section of this lesson explains the difference.
- **symbol**: a value that is guaranteed to be unique. `Symbol("id") === Symbol("id")` is `false`. Libraries use symbols as hidden keys; you will rarely create one yourself.

> typeof null is “object”
>
> This is a bug from the first version of JavaScript in 1995 that can never be fixed without breaking old websites. `null` is its own type. To check for it, write `value === null`, not `typeof`.

Everything that is not a primitive is an **object**: lists, functions, dates, and the objects you will build in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data). The [next lesson, Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep), maps every type and explains how primitives and objects behave differently.

## Converting between types

When an operation gets a type it did not expect, JavaScript quietly converts the value. This is called **type coercion**. It is the source of many beginner bugs:

coercion.js

```ts
console.log("5" + 1);     // + with a string joins text
console.log("5" - 1);     // - only works on numbers, so "5" becomes 5
console.log("5" * "2");
console.log(true + 1);    // true becomes 1
console.log("abc" - 1);   // "abc" is not a number
```

Output of `node coercion.js` and of the browser terminal

```ts
51
4
10
2
NaN
```

The first line is the classic trap. Text from a form, a URL or a file is always a string, so `"5" + 1` gives `"51"`, not `6`. `NaN` means "not a number"; you will meet it again below. The exact conversion rules are in [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep#coercion).

REASON IT OUT

### Before you convert: a quantity typed into a form

A shop's order form has a quantity box. Whatever the customer types reaches your code as a string. Before you look at the conversion functions below, think it through:

- List what might arrive: a normal number, nothing at all, spaces, a decimal, a word, a number with a unit.
- Which of those should become a quantity, and which should be refused?
- If the conversion quietly turned empty text into `0`, what would the customer see?

**Show the reasoning**

**What arrives:** `"3"`, `""` (the box was left empty), `" 3 "`, `"2.5"`, `"three"`, `"3 bags"`. Every one of them is a string, even `"3"`.

**What to accept:** only text that is a whole number from 1 up. Spaces around the digits are a harmless accident; a decimal, a word or a unit is not a quantity.

**Empty text is the dangerous one.** As you will see next, `Number("")` is `0`, not `NaN`. A check that only looks for `NaN` lets an empty box through as a quantity of 0, and the customer gets an order for nothing, or an error far away from the form. So check for empty text *first*, then convert, then check that the result is a whole number in range. [Making decisions](https://zudojs.oyinlola.site/learn/js-conditions#build) builds exactly this kind of check for an age field.

Do not rely on coercion. Convert values yourself, on purpose, with `Number()`, `String()` and `Boolean()`. This is **explicit conversion**:

convert.js

```ts
const fromForm = "5";

console.log(Number(fromForm) + 1);
console.log(String(42) + "!");
console.log(Number(""));        // careful: empty text becomes 0
console.log(Number("12px"));    // not a clean number
console.log(Boolean("hello"));
console.log(Boolean(""));
```

Output of `node convert.js` and of the browser terminal

```ts
6
42!
0
NaN
true
false
```

`Number()` is strict: text that is not entirely a number gives `NaN`. The one surprise is `Number("")`, which is `0`. When you validate input, check for empty text first.

## Strings

A string is text. You can write it in double quotes, single quotes or backticks. Inside quotes, a backslash starts an **escape sequence**: `\n` is a new line and `\"` is a quote character.

string-literals.js

```ts
const a = "Buy milk";
const b = 'Write report';
const c = "She said \"hi\"";
const d = "line one\nline two";

console.log(a, b);
console.log(c);
console.log(d);
console.log("Task: " + a + "!");   // + joins strings: concatenation
```

Output of `node string-literals.js` and of the browser terminal

```ts
Buy milk Write report
She said "hi"
line one
line two
Task: Buy milk!
```

Joining strings with `+` is called **concatenation**. It gets hard to read once you mix in several values. A **template literal**, a string in backticks (`\``), is easier: `${…}` inserts any value, and it can span several lines.

template.js

```ts
const title = "Buy milk";
const priority = 2;
const done = false;

console.log(`Task "${title}" has priority ${priority}`);
console.log(`Next priority: ${priority + 1}, done: ${done}`);
console.log(`Line 1
Line 2`);
```

Output of `node template.js` and of the browser terminal

```ts
Task "Buy milk" has priority 2
Next priority: 3, done: false
Line 1
Line 2
```

### String methods

Every string has a `.length` and many **methods**: built-in functions you call with a dot. Each character has a position, its **index**, counted from 0.

string-methods.js

```ts
const title = "Write the report";

console.log(title.length);
console.log(title[0], title.at(-1));    // first and last character
console.log(title.toUpperCase());
console.log(title.toLowerCase());
console.log(title.slice(0, 5));         // from index 0 up to (not including) 5
console.log(title.slice(-6));           // the last 6 characters
console.log("7".padStart(3, "0"));
console.log("-".repeat(10));
```

Output of `node string-methods.js` and of the browser terminal

```ts
16
W t
WRITE THE REPORT
write the report
Write
report
007
----------
```

Strings never change. `toUpperCase()` does not change `title`; it gives you back a new string. To keep the result, store it in a variable.

### Search, replace, split and trim

These are the methods you will use on almost every piece of text a user sends to your backend:

string-search.js

```ts
const input = "  buy milk, buy bread  ";
const clean = input.trim();              // remove spaces at both ends

console.log(`[${clean}]`);
console.log(clean.includes("milk"));
console.log(clean.startsWith("buy"), clean.endsWith("tea"));
console.log(clean.indexOf("bread"));     // where it starts, or -1
console.log(clean.indexOf("tea"));
console.log(clean.replace("buy", "get"));      // first match only
console.log(clean.replaceAll("buy", "get"));   // every match
console.log(clean.split(", "));                // cut into a list
```

Output of `node string-search.js` and of the browser terminal

```json
[buy milk, buy bread]
true
true false
14
-1
get milk, buy bread
get milk, get bread
[ 'buy milk', 'buy bread' ]
```

`split` gives back an **array**, a list of values in square brackets. Arrays get [a lesson of their own](https://zudojs.oyinlola.site/learn/js-arrays). Text has more surprises than these methods show (an emoji can have a `length` of 2, and accented letters can be written in two ways); [Strings in depth](https://zudojs.oyinlola.site/learn/js-strings) covers them.

## Numbers

Numbers support the usual arithmetic: `+`, `-`, `*` and `/`. [Operators](https://zudojs.oyinlola.site/learn/js-operators) covers all the operators. Here is what makes JavaScript numbers special:

floating-point.js

```ts
console.log(7 / 2);
console.log(0.1 + 0.2);
console.log(0.1 + 0.2 === 0.3);
console.log((0.1 + 0.2).toFixed(2));
```

Output of `node floating-point.js` and of the browser terminal

```ts
3.5
0.30000000000000004
false
0.30
```

Why is `0.1 + 0.2` not `0.3`? Computers store numbers in binary (only 0s and 1s). In binary, `0.1` has no exact form, just like 1/3 has no exact form in decimal (0.3333…). The tiny error shows up after adding. This is called **floating point** error, and almost every language has it. `toFixed(2)` rounds for display and gives back a string. [Numbers in depth](https://zudojs.oyinlola.site/learn/js-numbers), in the Advanced JavaScript course, explains the binary format and how to compare and round safely.

> Money
>
> Never store money as decimals like `19.99`. Store whole cents (`1999`) and divide by 100 only when you show the amount.

### Math and rounding

`Math` is a built-in object full of number functions:

math.js

```ts
console.log(Math.round(2.5), Math.round(2.4));  // nearest whole number
console.log(Math.floor(2.9), Math.ceil(2.1));   // always down, always up
console.log(Math.trunc(-2.9));                  // cut off the decimals
console.log(Math.max(3, 9, 4), Math.min(3, 9, 4));
console.log(Math.abs(-7));                      // distance from zero
console.log(Math.sqrt(16), 2 ** 10);            // square root, power
console.log(Math.round(4.567 * 100) / 100);     // round to 2 decimals
```

Output of `node math.js` and of the browser terminal

```ts
3 2
2 3
-2
9 3
7
4 1024
4.57
```

`Math.random()` gives a different decimal between 0 and 1 every time, for example `0.7361…`. `Math.floor(Math.random() * 6) + 1` rolls a die. You will use it in the guessing game in [the lesson on loops](https://zudojs.oyinlola.site/learn/js-loops).

### Parsing, NaN and Infinity

`parseInt` and `parseFloat` read a number from the start of a string and stop at the first character that does not fit. They are more forgiving than `Number()`:

parse.js

```ts
console.log(parseInt("42px", 10));
console.log(parseFloat("3.75 kg"));
console.log(parseInt("abc", 10));

const result = Number("twelve");
console.log(result);
console.log(result === NaN);        // never true!
console.log(Number.isNaN(result));  // the right check

console.log(1 / 0, -1 / 0);
console.log(Number.MAX_SAFE_INTEGER);
console.log(9007199254740992 + 1);  // too big to be exact
console.log(9007199254740992n + 1n);
```

Output of `node parse.js` and of the browser terminal

```ts
42
3.75
NaN
NaN
false
true
Infinity -Infinity
9007199254740991
9007199254740992
9007199254740993n
```

- Always pass `10` as the second argument of `parseInt`. It says "read this as a normal base-10 number".
- `NaN` is the only value that is not equal to itself, so `=== NaN` is always `false`. Use `Number.isNaN(value)`.
- Dividing by zero does not crash; it gives `Infinity`.
- Above `Number.MAX_SAFE_INTEGER`, numbers lose precision: adding 1 did nothing. A `bigint` stays exact. You cannot mix the two in one sum; convert with `BigInt(n)` or `Number(big)` first.

## Booleans, truthy and falsy

A **boolean** is `true` or `false`. Comparisons produce booleans:

booleans.js

```ts
const priority = 3;
const isUrgent = priority > 2;

console.log(isUrgent);
console.log(typeof isUrgent);
console.log(priority === 5);
```

Output of `node booleans.js` and of the browser terminal

```ts
true
boolean
false
```

When JavaScript needs a yes or no, for example in an `if`, it converts any value to a boolean. Only eight values become `false`. They are called **falsy**. Every other value is **truthy**:

truthy.js

```ts
const falsy = [false, 0, -0, 0n, "", null, undefined, NaN];
for (const value of falsy) {
  console.log(Boolean(value));
}

console.log(Boolean("0"), Boolean(" "), Boolean("false"), Boolean(-1));
```

Output of `node truthy.js` and of the browser terminal

```ts
false
false
false
false
false
false
false
false
true true true true
```

The loop runs the `console.log` once for each value in the list; [Loops](https://zudojs.oyinlola.site/learn/js-loops) come later in this course. The last line is the surprise: the strings `"0"`, `" "` and `"false"` are all truthy, because they are not empty.

## null and undefined

Both mean "no value", but they appear in different places:

- **undefined** is what JavaScript gives you when something was never set: a variable declared without a value, a function parameter nobody passed, a missing property, or a function that returns nothing.
- **null** is what a *programmer* writes to say "there is deliberately nothing here", for example "this task has no due date".

null-undefined.js

```ts
let dueDate;
console.log(dueDate);            // declared, never set

const task = { title: "Buy milk", assignee: null };
console.log(task.assignee);      // set to "nobody", on purpose
console.log(task.priority);      // this property does not exist

console.log(dueDate === undefined);
console.log(task.assignee === null);
console.log(task.assignee == null, dueDate == null);   // == null catches both
```

Output of `node null-undefined.js` and of the browser terminal

```ts
undefined
null
undefined
true
true
true true
```

`{ title: "Buy milk", assignee: null }` is an **object**: several named values kept together. [Objects](https://zudojs.oyinlola.site/learn/js-data) come a few lessons later; here you only need to read `task.assignee` as "the assignee of the task".

To check for "no value", use `=== undefined` or `=== null`. The one accepted use of the loose `==` is `value == null`, which is true for both `null` and `undefined` and nothing else. [Operators](https://zudojs.oyinlola.site/learn/js-operators#nullish) shows the `??` operator, the modern way to give a missing value a default.

## Put it together: a task summary

Here is everything from this lesson in one small program. It takes raw values, the way they arrive from a form, cleans and converts them, and prints a summary:

task-summary.js

```ts
const rawTitle = "   write the REPORT  ";
const rawEstimate = "90";     // minutes, as text from a form
const rawPriority = "high";   // not a number at all
const assignee = null;

const title = rawTitle.trim().toLowerCase();
const estimate = Number(rawEstimate);
const priority = Number(rawPriority);

const hours = Math.floor(estimate / 60);
const minutes = estimate % 60;     // % gives the remainder of a division

console.log(`Title: ${title[0].toUpperCase()}${title.slice(1)}`);
console.log(`Estimate: ${hours}h ${minutes}min`);
console.log(`Priority valid: ${!Number.isNaN(priority)}`);
console.log(`Assigned: ${assignee !== null}`);
```

Output of `node task-summary.js` and of the browser terminal

```ts
Title: Write the report
Estimate: 1h 30min
Priority valid: false
Assigned: false
```

`!` turns `true` into `false` and back. You will see it, and `%`, in [Operators](https://zudojs.oyinlola.site/learn/js-operators).

## Practice

TRY IT YOURSELF

### Fix the total

This code should print `Total: 30`, but prints `Total: 1020`. Find out why and fix it without changing the two strings.

```ts
const a = "10";
const b = "20";
console.log(`Total: ${a + b}`);
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`a` and `b` are strings, so `+` joins them as text instead of adding them. Convert each one first, with `Number(...)`.

HINT 2

`console.log(\`Total: ${Number(a) + Number(b)}\`);`

SOLUTION

Both values are strings, so `+` joins them. Convert them to numbers first:

fix-total.js

```ts
const a = "10";
const b = "20";
console.log(`Total: ${Number(a) + Number(b)}`);
```

Output of `node fix-total.js` and of the browser terminal

```ts
Total: 30
```

TRY IT YOURSELF

### Make a URL slug

Turn the title `"  Buy Milk and Bread "` into `"buy-milk-and-bread"`: no spaces at the ends, all lowercase, spaces replaced with dashes. Print the result and its length.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Chain the string methods, in order: `title.trim().toLowerCase().replaceAll(...)`. Each method works on the string the one before it gave back.

HINT 2

`replaceAll(" ", "-")` replaces every remaining space with a dash, after trimming and lowercasing.

SOLUTION

slug.js

```ts
const title = "  Buy Milk and Bread ";
const slug = title.trim().toLowerCase().replaceAll(" ", "-");

console.log(slug);
console.log(slug.length);
```

Output of `node slug.js` and of the browser terminal

```ts
buy-milk-and-bread
18
```

You can chain methods: each one works on the string the previous one gave back.

TRY IT YOURSELF

### Predict the type

Before you run it, write down what each line prints. Then open the solution, press Run and compare.

```ts
console.log(typeof "42");
console.log(typeof Number("42"));
console.log(typeof NaN);
console.log(typeof null);
console.log(Boolean("0"));
console.log(Number(" 7 "));
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Write down your prediction for each line first. Then wrap each of the six expressions in its own `console.log(...)`, in order, and compare.

HINT 2

`typeof null` is a famous exception: it reports `"object"`, not `"null"`, a bug kept for compatibility since 1995.

SOLUTION

predict.js

```ts
console.log(typeof "42");
console.log(typeof Number("42"));
console.log(typeof NaN);
console.log(typeof null);
console.log(Boolean("0"));
console.log(Number(" 7 "));
```

Output of `node predict.js` and of the browser terminal

```ts
string
number
number
object
true
7
```

`NaN` is, oddly, of type `number`: it is the number result of a failed calculation. `Number()` ignores spaces around the digits.

## Recap

- A variable is a name for a value. Use `const` by default, `let` when you must reassign, and never `var`.
- The seven primitive types are string, number, bigint, boolean, undefined, null and symbol. `typeof` tells you which, except that `typeof null` is `"object"`.
- JavaScript converts types on its own (`"5" + 1` is `"51"`). Convert on purpose with `Number()`, `String()` and `Boolean()`.
- Template literals build text; `trim`, `includes`, `replaceAll` and `split` clean and search it.
- `0.1 + 0.2` is not exactly `0.3`. Check for `NaN` with `Number.isNaN`.
- Only eight values are falsy. `undefined` means "never set", `null` means "empty on purpose".

Next, [Types in depth](https://zudojs.oyinlola.site/learn/js-types-deep): every type on one map, why objects are shared while primitives are copied, and the exact rules behind equality and coercion.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
