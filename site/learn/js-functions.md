---
title: "Functions — ZudoJS Academy"
description: "Package logic into reusable functions, pass values in and get results out, pass functions to other functions, and meet scope, closures and recursion."
source: https://zudojs.oyinlola.site/learn/js-functions
---

LEVEL 2 · LESSON 8 OF 19

Functions Foundation

# Functions

Package logic into reusable functions, pass values in and get results out, pass functions to other functions, and meet scope, closures and recursion.

- **40 min** to read and try
- **You need:** The lessons up to Loops
- **You build:** A small calculator library, checked by its own tests

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Declare and call functions, and tell parameters from arguments and printing from returning
- Write function expressions and arrow functions, and explain why only declarations can be called early
- Use default and rest parameters
- Pass functions to functions (callbacks) and return functions from functions
- Keep logic in pure functions and validate inputs so a small library can be tested

## Why functions

You have already used functions: `console.log`, `Number`, `Math.round`. In [Making decisions](https://zudojs.oyinlola.site/learn/js-conditions#guard-clauses) and [Loops](https://zudojs.oyinlola.site/learn/js-loops#build) you also wrote a few of your own. This lesson explains them properly.

A **function** is a named block of code that you can run whenever you want, as often as you want. Running it is called **calling** the function. Functions let you:

- write a piece of logic once and reuse it,
- give that logic a name that says what it does,
- test it on its own, as you did with `checkAge` and `checkGuess`.

## Declaring and calling a function

A **function declaration** starts with the keyword `function`, then a name, the parameters in parentheses, and the body in braces:

declaration.js

```ts
function formatTask(title, done) {
  const mark = done ? "x" : " ";
  return `[${mark}] ${title}`;
}

console.log(formatTask("Buy milk", true));
console.log(formatTask("Write report", false));
```

Output of `node declaration.js` and of the browser terminal

```json
[x] Buy milk
[ ] Write report
```

- **Parameters** are the names in the definition: `title` and `done`. Inside the function they work like variables.
- **Arguments** are the actual values you pass when you call it: `"Buy milk"` and `true`. The first argument goes to the first parameter, the second to the second.
- `return` ends the function and hands a value back to the caller. That value is the **return value**.

### Return values

A function without `return` still gives something back: `undefined`. The same happens to a parameter you did not pass an argument for, and extra arguments are ignored:

return.js

```ts
function logTask(title) {
  console.log(`Task: ${title}`);
}

const result = logTask("Buy milk");
console.log(result);

logTask();                      // no argument
logTask("Call Ada", "extra");   // extra argument is ignored
```

Output of `node return.js` and of the browser terminal

```ts
Task: Buy milk
undefined
Task: undefined
Task: Call Ada
```

Printing something and returning something are different. `logTask` prints, but returns nothing. A function that *returns* a value is more useful: the caller decides whether to print it, save it or send it over the network.

## Function expressions and arrow functions

A function is a value, just like a number or a string. You can store it in a variable. That is a **function expression**. Because it has no name of its own after `function`, it is also an **anonymous function**:

expression.js

```ts
const double = function (n) {
  return n * 2;
};

console.log(double(21));
console.log(typeof double);
```

Output of `node expression.js` and of the browser terminal

```ts
42
function
```

Modern JavaScript usually writes this with an **arrow function**: the parameters, an arrow `=>`, and the body. When the body is a single expression, you can drop the braces and the `return`; the value of the expression is returned automatically:

arrow.js

```ts
const double = (n) => n * 2;
const add = (a, b) => a + b;
const hello = () => "Hello!";            // no parameters: empty ()
const describe = (title, done) => {      // several lines: braces and return
  const mark = done ? "x" : " ";
  return `[${mark}] ${title}`;
};

console.log(double(21), add(2, 3), hello());
console.log(describe("Buy milk", false));
```

Output of `node arrow.js` and of the browser terminal

```ts
42 5 Hello!
[ ] Buy milk
```

One difference between declarations and expressions: you can call a function declaration *before* the line where it is written, because JavaScript sets up declarations first. This is called **hoisting**. A function stored in a `const` cannot be used before that line runs.

hoisting.js

```ts
console.log(square(4));      // works: declarations are hoisted

function square(n) {
  return n * n;
}

try {
  console.log(cube(2));      // fails: cube is not set yet
} catch (error) {
  console.log(error.message);
}

const cube = (n) => n ** 3;
```

Output of `node hoisting.js` and of the browser terminal

```ts
16
Cannot access 'cube' before initialization
```

> TIP
>
> Both styles are fine. A common habit: `function` declarations for the main named functions of a file, and arrow functions for short functions passed to other functions, which you will see next.

## Default and rest parameters

A **default parameter** has a value after `=`. It is used when the argument is missing or `undefined`. A **rest parameter**, written with three dots, collects all remaining arguments into an array:

parameters.js

```ts
function greet(name = "friend", greeting = "Hello") {
  return `${greeting}, ${name}!`;
}

console.log(greet("Ada"));
console.log(greet());
console.log(greet("Ada", "Welcome back"));

function sum(...numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total;
}

console.log(sum(1, 2, 3));
console.log(sum(10));
console.log(sum());
```

Output of `node parameters.js` and of the browser terminal

```ts
Hello, Ada!
Hello, friend!
Welcome back, Ada!
6
10
0
```

The rest parameter must be the last one. It is always an array, even when no arguments are left (then it is empty).

## Callbacks and higher-order functions

Because functions are values, you can pass a function as an argument to another function. The function you pass is called a **callback**: the other function "calls it back" when it needs to. A function that takes or returns another function is called a **higher-order function**.

callback.js

```ts
function repeat(times, action) {
  for (let i = 1; i <= times; i++) {
    action(i);
  }
}

repeat(3, (i) => console.log(`Reminder ${i}`));

function applyToAll(numbers, transform) {
  const results = [];
  for (const n of numbers) results.push(transform(n));
  return results;
}

console.log(applyToAll([1, 2, 3], (n) => n * 10));
console.log(applyToAll([1.4, 2.6], Math.round));
```

Output of `node callback.js` and of the browser terminal

```ts
Reminder 1
Reminder 2
Reminder 3
[ 10, 20, 30 ]
[ 1, 3 ]
```

`repeat` knows *how often* to do something; the callback says *what* to do. `results.push(…)` adds an item to the end of an array. In [the next lesson](https://zudojs.oyinlola.site/learn/js-arrays) you will meet array methods such as `map` and `filter`, which are higher-order functions exactly like `applyToAll`.

A higher-order function can also *return* a function:

factory.js

```ts
function multiplier(factor) {
  return (n) => n * factor;
}

const triple = multiplier(3);
const half = multiplier(0.5);

console.log(triple(10), half(10));
```

Output of `node factory.js` and of the browser terminal

```ts
30 5
```

## Pure functions

A **pure function** follows two rules:

1. It gives the same result every time for the same arguments.
2. It has no **side effects**: it changes nothing outside itself. No printing, no changing outside variables, no writing files.

pure.js

```ts
let total = 0;

function addToTotal(amount) {     // impure: changes a variable outside
  total += amount;
  return total;
}

function add(a, b) {             // pure: only uses its arguments
  return a + b;
}

console.log(addToTotal(5), addToTotal(5));   // same call, different results
console.log(add(5, 5), add(5, 5));
```

Output of `node pure.js` and of the browser terminal

```ts
5 10
10 10
```

Pure functions are easy to test and easy to trust: you only need to look at the arguments to know the result. A backend cannot be pure everywhere, because saving to a database is a side effect. A good habit is to keep the logic in pure functions and the side effects in a few clear places, like the thin keyboard part of the guessing game in the previous lesson. [Functional JavaScript](https://zudojs.oyinlola.site/learn/js-functional), in the Advanced JavaScript course, builds a whole style on this idea.

## Scope and closures

Variables created inside a function exist only inside it. The part of the code where a variable is visible is its **scope**. A function can read variables from outside it, but the outside cannot see in:

scope.js

```ts
const appName = "Tasks";

function makeTitle(title) {
  const prefix = `[${appName}]`;   // appName comes from outside
  return `${prefix} ${title}`;
}

console.log(makeTitle("Buy milk"));
console.log(typeof prefix);        // prefix only exists inside makeTitle
```

Output of `node scope.js` and of the browser terminal

```json
[Tasks] Buy milk
undefined
```

A function also *remembers* the variables around it at the place where it was created, even after the outer function has finished. This is called a **closure**:

closure.js

```ts
function createCounter() {
  let count = 0;
  return () => {
    count++;
    return count;
  };
}

const nextId = createCounter();
const otherIds = createCounter();

console.log(nextId(), nextId(), nextId());
console.log(otherIds());
```

Output of `node closure.js` and of the browser terminal

```ts
1 2 3
1
```

`createCounter` finished long ago, but the arrow function it returned still has access to its `count`. Each call to `createCounter` makes a new, separate `count`, so the two counters do not share. Nothing outside can change `count` directly, which makes closures a simple way to keep data private. Later in this course, [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope) explains scope precisely, and [Closures in depth](https://zudojs.oyinlola.site/learn/js-closures) shows how closures work and what they are used for.

## Recursion

A function can call itself. This is **recursion**. Every recursive function needs a **base case**: a situation where it stops calling itself and just returns. Without one it would call itself forever (JavaScript stops it with a "Maximum call stack size exceeded" error).

recursion.js

```ts
function factorial(n) {
  if (n <= 1) return 1;            // base case
  return n * factorial(n - 1);     // the same problem, one step smaller
}

console.log(factorial(5));         // 5 * 4 * 3 * 2 * 1

function countSubtasks(task) {
  let count = 0;
  for (const sub of task.subtasks) {
    count += 1 + countSubtasks(sub);
  }
  return count;
}

const project = {
  subtasks: [
    { subtasks: [] },
    { subtasks: [{ subtasks: [] }, { subtasks: [{ subtasks: [] }] }] },
  ],
};
console.log(countSubtasks(project));
```

Output of `node recursion.js` and of the browser terminal

```ts
120
5
```

`factorial` could just as well be a loop. Recursion shines on data that contains smaller copies of itself, like tasks with subtasks, folders with folders, or comments with replies. There the base case is a task with no subtasks: the loop runs zero times and the function returns 0. [Recursion](https://zudojs.oyinlola.site/learn/js-recursion), later in this course, teaches you to design and trace functions like this one.

## Build: a calculator library

A **library** is a set of related functions that other code uses. You can group functions in an **object**: a set of named values between braces, where each value here is a function. You will learn objects in [their own lesson](https://zudojs.oyinlola.site/learn/js-data); for now, `calculator.add(2, 3)` means "call the `add` function inside `calculator`".

REASON IT OUT

### Before you code: what should the calculator refuse?

A calculator library will be called by other code, some of it passing values that came from users. Before writing it, decide:

- What should `add("2", 3)` do? What would JavaScript do on its own?
- What should `divide(1, 0)` give? What does `1 / 0` give in JavaScript?
- What is the average of no numbers at all?
- Where should each check live, so that it is written only once?

**Show the reasoning**

**`add("2", 3)`:** on its own, `"2" + 3` is the text `"23"`, a wrong answer with no warning. A library should refuse anything that is not a real number (including `NaN`) with a clear error, instead of guessing.

**Dividing by zero:** JavaScript gives `Infinity`, which is not an amount anyone can use. For a calculator it is a mistake by the caller, so the library should say so.

**Average of nothing:** `0 / 0` is `NaN`. There is no sensible answer, so the right answer is an error, not `0`.

**Where:** the number check is the same for every operation, so it belongs in one helper function that every operation calls. A check written six times will be fixed in five places.

The library validates its inputs. When something is wrong it `throw`s an error, which stops the function; the caller can catch it with `try`/`catch`. You will learn errors fully in [the lesson on errors](https://zudojs.oyinlola.site/learn/js-errors). Below the library is a tiny test helper, and a list of checks:

calculator.js

```ts
function requireNumbers(...values) {
  for (const v of values) {
    if (typeof v !== "number" || Number.isNaN(v)) throw new Error(`Not a number: ${v}`);
  }
}

const calculator = {
  add(a, b) {
    requireNumbers(a, b);
    return a + b;
  },
  subtract(a, b) {
    requireNumbers(a, b);
    return a - b;
  },
  multiply(a, b) {
    requireNumbers(a, b);
    return a * b;
  },
  divide(a, b) {
    requireNumbers(a, b);
    if (b === 0) throw new Error("Cannot divide by zero");
    return a / b;
  },
  sum(...numbers) {
    requireNumbers(...numbers);
    let total = 0;
    for (const n of numbers) total += n;
    return total;
  },
  average(...numbers) {
    if (numbers.length === 0) throw new Error("Need at least one number");
    return calculator.sum(...numbers) / numbers.length;
  },
};

function check(label, run, expected) {
  let actual;
  try {
    actual = run();
  } catch (error) {
    actual = `error: ${error.message}`;
  }
  console.log(`${actual === expected ? "PASS" : "FAIL"} ${label} -> ${actual}`);
}

check("add", () => calculator.add(2, 3), 5);
check("subtract", () => calculator.subtract(2, 5), -3);
check("multiply", () => calculator.multiply(4, 2.5), 10);
check("divide", () => calculator.divide(9, 3), 3);
check("divide by zero", () => calculator.divide(1, 0), "error: Cannot divide by zero");
check("sum", () => calculator.sum(1, 2, 3, 4), 10);
check("average", () => calculator.average(2, 4, 9), 5);
check("average of nothing", () => calculator.average(), "error: Need at least one number");
check("text input", () => calculator.add("2", 3), "error: Not a number: 2");
check("float", () => calculator.add(0.1, 0.2), 0.3);
```

Output of `node calculator.js` and of the browser terminal

```ts
PASS add -> 5
PASS subtract -> -3
PASS multiply -> 10
PASS divide -> 3
PASS divide by zero -> error: Cannot divide by zero
PASS sum -> 10
PASS average -> 5
PASS average of nothing -> error: Need at least one number
PASS text input -> error: Not a number: 2
FAIL float -> 0.30000000000000004
```

What is new here:

- `add(a, b) { … }` inside the object is a short way to write `add: function (a, b) { … }`. Commas separate the functions.
- Every function first calls `requireNumbers`. Putting the shared check in one helper means it is written, and fixed, in one place.
- `calculator.sum(...numbers)`: three dots in a *call* spread an array back out into separate arguments. It is the opposite of a rest parameter.
- `check` takes a callback, so it can run the code inside `try` and report a thrown error as a result instead of crashing.
- `"2"` is rejected instead of silently turning `2 + 3` into `"23"`. Always refuse bad input loudly.

The last test fails on purpose. It is the floating point error from [Values, variables and types](https://zudojs.oyinlola.site/learn/js-values#numbers): a test found it, and exercise 2 fixes it. Real projects use a test runner like Vitest instead of a hand-made `check`; you will meet it in [the lesson on testing](https://zudojs.oyinlola.site/learn/testing-basics), and the idea is exactly the same.

## Practice

TRY IT YOURSELF

### Add power and remainder

Add `power(base, exponent)` and `remainder(a, b)` functions, as arrow functions, and check them with `2 ** 10` and `17 % 5`.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

An arrow function whose body is a single expression needs no braces or `return`: the expression's value comes back automatically.

HINT 2

`const power = (base, exponent) => base ** exponent;` and `const remainder = (a, b) => a % b;`

SOLUTION

calc-more.js

```ts
const power = (base, exponent) => base ** exponent;
const remainder = (a, b) => a % b;

console.log(power(2, 10));
console.log(remainder(17, 5));
```

Output of `node calc-more.js` and of the browser terminal

```ts
1024
2
```

In the library you would also call `requireNumbers`, and `remainder` should reject `b === 0`, because `17 % 0` is `NaN`.

TRY IT YOURSELF

### Compare decimals safely

The float test failed because `0.1 + 0.2` is not exactly `0.3`. Write `closeTo(a, b)` that returns `true` when two numbers differ by less than `0.000001`, and use it.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`Math.abs(a - b)` gives the size of the difference, whichever number is bigger. Compare that to the tolerance.

HINT 2

`const closeTo = (a, b) => Math.abs(a - b) < 0.000001;`

SOLUTION

close-to.js

```ts
const closeTo = (a, b) => Math.abs(a - b) < 0.000001;

console.log(0.1 + 0.2 === 0.3);
console.log(closeTo(0.1 + 0.2, 0.3));
console.log(closeTo(0.3, 0.4));
```

Output of `node close-to.js` and of the browser terminal

```ts
false
true
false
```

This is how test runners compare decimals too: Vitest calls it `toBeCloseTo`.

TRY IT YOURSELF

### Count down with recursion

Write a recursive function `countdown(n)` that returns a string like `"3 2 1 go"`. What is the base case?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

What should `countdown(0)` return directly, without calling itself? That is the base case.

HINT 2

`if (n <= 0) return "go"; return \`${n} ${countdown(n - 1)}\`;`

SOLUTION

countdown.js

```ts
function countdown(n) {
  if (n <= 0) return "go";
  return `${n} ${countdown(n - 1)}`;
}

console.log(countdown(3));
console.log(countdown(0));
```

Output of `node countdown.js` and of the browser terminal

```ts
3 2 1 go
go
```

The base case is `n <= 0`. Using `<=` instead of `===` also protects you from a negative start, which would otherwise never reach 0.

## Recap

- Parameters are the names in the definition; arguments are the values in the call. `return` hands back a value; without it you get `undefined`.
- Functions are values: store them in variables (expressions, arrow functions) and pass them to other functions (callbacks).
- Default parameters fill in missing arguments; a rest parameter collects the remaining ones into an array.
- Pure functions depend only on their arguments and change nothing outside. Keep logic pure and side effects few.
- A closure remembers the variables around it. A recursive function calls itself and needs a base case.

Next, [Arrays](https://zudojs.oyinlola.site/learn/js-arrays): keep lists of values and transform them with functions like the ones you just wrote.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
