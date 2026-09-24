---
title: "Scope and how code runs"
description: "Learn where a name can be used, how closures remember values, why some names exist before their line runs, and how the call stack and the heap work, so you can read error messages and debug real programs."
source: https://zudojs.oyinlola.site/learn/js-scope
---

LESSON 14 OF 84

JavaScript fundamentals Foundation

# Scope and how code runs

Learn where a name can be used, how closures remember values, why some names exist before their line runs, and how the call stack and the heap work, so you can read error messages and debug real programs.

- **40 min** to read and try
- **You need:** Modern JavaScript, and the lessons before it
- **You build:** A task store with private state, and the skill to read a stack trace

  [Test yourself](#test)

## What scope is

Every name you create, with `const`, `let`, `function` or a parameter, can only be used in part of your program. That part is the name's **scope**. Outside it, the name does not exist.

To see what happens when you use a name outside its scope, this lesson needs one tool from a later lesson: `try`/`catch`. Read it as "try to run this block; if it fails, run the `catch` block with the error, instead of stopping the program". [Handling errors](https://zudojs.oyinlola.site/learn/js-errors) explains it fully.

scope.js

```ts
function makeTitle() {
  const prefix = "Task:";
  return `${prefix} Buy milk`;
}

console.log(makeTitle());

try {
  console.log(prefix);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node scope.js` and of the browser terminal

```ts
Task: Buy milk
ReferenceError: prefix is not defined
```

`prefix` lives inside `makeTitle`. Outside the function it does not exist, so reading it throws a **ReferenceError**: "I do not know this name". This is a good thing. Two functions can both use a variable called `prefix` without ever disturbing each other.

## Module, function and block scope

JavaScript has three kinds of scope you meet every day:

- **Module scope**: names declared at the top level of a file. Every function in that file can use them. Other files cannot, unless the file exports them (see [Modules](https://zudojs.oyinlola.site/learn/js-modules)). This is what people often loosely call "global".
- **Function scope**: names declared inside a function, including its parameters. They exist only while that function runs.
- **Block scope**: names declared with `let` or `const` inside `{ }`, such as the body of an `if` or a loop. They exist only inside that block.

The truly **global** scope holds what JavaScript itself provides, such as `console`, `Math` and `JSON`. You can reach it anywhere, and also through the object `globalThis`.

kinds.js

```ts
const appName = "Tasks";

function report(tasks) {
  let openCount = 0;
  for (const task of tasks) {
    if (!task.done) {
      const note = `open: ${task.title}`;
      console.log(note);
      openCount += 1;
    }
  }
  return `${appName}: ${openCount} open`;
}

console.log(report([{ title: "Buy milk", done: false }, { title: "Call Ada", done: true }]));
console.log(typeof openCount, typeof note, typeof appName);
console.log(globalThis.Math === Math);
```

Output of `node kinds.js` and of the browser terminal

```ts
open: Buy milk
Tasks: 1 open
undefined undefined string
true
```

`appName` is in module scope, so `report` can use it. `openCount` belongs to `report`, and `note` belongs to one run of the `if` block. Outside, `typeof` reports them as `undefined`. (`typeof` is the one place where an unknown name does not throw.)

### var ignores blocks

The old keyword `var` has function scope only: it ignores blocks. The most famous bug this causes appears when a loop schedules work for later:

var-loop.js

```ts
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log("var:", i), 0);
}

for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log("let:", j), 0);
}
```

Output of `node var-loop.js` and of the browser terminal

```ts
var: 3
var: 3
var: 3
let: 0
let: 1
let: 2
```

`setTimeout` runs the function later, after the loop has finished ([Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async) explains when). With `var`, there is only *one* `i` for the whole loop, and by the time the functions run it is 3. With `let`, every turn of the loop gets its *own* `j`, and each function remembers its own. That "remembering" has a name: a closure. It comes right after the next section.

## Lexical scope and shadowing

Scopes sit inside each other like boxes. When code uses a name, JavaScript looks in the current scope first, then in the one around it, and so on outwards until the module and global scope. The first match wins.

Which boxes surround a function is decided by *where the function is written* in the file, not where it is called from. That is why it is called **lexical scope** ("lexical" means "about the written text"):

lexical.js

```ts
const label = "module";

function show() {
  return label;
}

function caller() {
  const label = "caller";
  return show();
}

function shadow() {
  const label = "shadow";
  return label;
}

console.log(caller());
console.log(shadow());
console.log(label);
```

Output of `node lexical.js` and of the browser terminal

```ts
module
shadow
module
```

- `show` is written at the top level, so it sees the module's `label`, even when `caller`, which has its own `label`, calls it.
- Inside `shadow`, the local `label` hides the outer one. This is called **shadowing**. The outer variable is not changed, as the last line shows.

> TIP
>
> Shadowing is legal but confusing. If you find yourself with two variables of the same name, one inside the other, rename one of them.

## Closures

A function in JavaScript carries its surrounding scope with it. Even after the outer function has returned, the inner function can still use the outer function's variables. A function together with the variables it remembers is called a **closure**.

counter.js

```ts
function makeCounter() {
  let count = 0;
  return () => {
    count += 1;
    return count;
  };
}

const nextTaskId = makeCounter();
const nextUserId = makeCounter();

console.log(nextTaskId(), nextTaskId(), nextTaskId());
console.log(nextUserId());
console.log(typeof count);
```

Output of `node counter.js` and of the browser terminal

```ts
1 2 3
1
undefined
```

Each call to `makeCounter` creates a new `count`. The arrow function it returns keeps that `count` alive, and nobody else can reach it. `nextTaskId` and `nextUserId` each have their own.

### Private state with closures

This is how you hide data in plain JavaScript. Here is a task store where the list and the id counter are private. The only way in is through the functions it returns:

store.js

```ts
function createTaskStore() {
  const tasks = [];
  let nextId = 1;

  return {
    add(title) {
      const task = { id: nextId, title, done: false };
      nextId += 1;
      tasks.push(task);
      return task;
    },
    complete(id) {
      const task = tasks.find((t) => t.id === id);
      if (task) task.done = true;
      return task;
    },
    list() {
      return tasks.map((t) => ({ ...t }));
    },
  };
}

const store = createTaskStore();
store.add("Buy milk");
store.add("Call Ada");
store.complete(1);

const copy = store.list();
copy[0].title = "HACKED";

console.log(store.list());
console.log(store.tasks, store.nextId);
```

Output of `node store.js` and of the browser terminal

```json
[
  { id: 1, title: 'Buy milk', done: true },
  { id: 2, title: 'Call Ada', done: false }
]
undefined undefined
```

`list` returns copies, so changing the copy did not change the store. And `store.tasks` does not exist: the array is only reachable through the closure. Nobody can set `nextId` back to 1 and create duplicate ids.

### A closure remembers the variable, not the value

A closure does not take a snapshot. It keeps a link to the variable itself, so it always sees the current value:

live.js

```ts
let mode = "normal";
const describe = () => `mode is ${mode}`;

console.log(describe());
mode = "maintenance";
console.log(describe());
```

Output of `node live.js` and of the browser terminal

```ts
mode is normal
mode is maintenance
```

That explains the `var` loop from earlier: all three functions linked to the same single `i`, and read it when it was already 3.

## Hoisting and the temporal dead zone

Before JavaScript runs any code in a scope, it first scans the scope for declarations and creates all the names. This is called **hoisting**, because it looks as if the declarations were lifted to the top. What each name holds before its own line runs depends on how it was declared:

- A `function` declaration is ready to call. You can call it above the line where it is written.
- A `var` exists and holds `undefined`.
- A `let`, `const` or `class` exists but may not be touched. The time between the start of the scope and the declaration line is called the **temporal dead zone** (TDZ). Using the name there throws a `ReferenceError`.

hoisting.js

```ts
console.log(double(4));
function double(n) {
  return n * 2;
}

console.log(oldStyle);
var oldStyle = "set";

try {
  console.log(limit);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
const limit = 10;

try {
  triple(2);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
const triple = (n) => n * 3;
```

Output of `node hoisting.js` and of the browser terminal

```ts
8
undefined
ReferenceError: Cannot access 'limit' before initialization
ReferenceError: Cannot access 'triple' before initialization
```

Compare the two `ReferenceError` messages with the one at the start of the lesson. "`prefix is not defined`" means the name does not exist in any surrounding scope. "`Cannot access 'limit' before initialization`" means the name exists, but its line has not run yet. The TDZ is helpful: `var` quietly gives `undefined`, which hides the mistake, while `let` and `const` fail loudly at the exact spot.

An arrow function stored in a `const` follows the `const` rule, which is why `triple` failed. In practice: declare things before you use them, and the only hoisting you rely on is calling a `function` declaration from higher up in the file.

## Execution context and the call stack

Each time a function is called, JavaScript creates an **execution context** for that call: a record of which function is running, its own local variables and parameters, and where to go back to when it returns. That is why two calls of the same function never share their local variables.

These contexts are kept on the **call stack**. Calling a function puts (*pushes*) a new context on top. Returning removes (*pops*) it, and the function below carries on. Only the context on top is running. This example prints the stack as it grows and shrinks:

stack.js

```ts
const stack = [];

function enter(name) {
  stack.push(name);
  console.log(stack.join(" > "));
}

function leave() {
  stack.pop();
}

function validate(task) {
  enter("validate");
  const ok = task.title !== "";
  leave();
  return ok;
}

function save(task) {
  enter("save");
  const valid = validate(task);
  leave();
  return valid ? "saved" : "rejected";
}

function handleRequest(task) {
  enter("handleRequest");
  const result = save(task);
  leave();
  return result;
}

console.log(handleRequest({ title: "Buy milk" }));
```

Output of `node stack.js` and of the browser terminal

```ts
handleRequest
handleRequest > save
handleRequest > save > validate
saved
```

JavaScript keeps this stack for you automatically: the example only makes it visible. When `validate` runs, `save` and `handleRequest` are still waiting underneath it for their answers.

### When the stack overflows

The stack has a size limit. A function that calls itself is called **recursive**. If it never stops calling itself, the stack fills up, and JavaScript throws a `RangeError`. This is a **stack overflow**:

overflow.js

```ts
let depth = 0;

function countDown(n) {
  depth += 1;
  return countDown(n - 1);
}

try {
  countDown(3);
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
  console.log("calls before the crash:", depth > 1000 ? "thousands" : depth);
}

function countDownFixed(n) {
  if (n === 0) return "lift off";
  return countDownFixed(n - 1);
}

console.log(countDownFixed(3));
```

Output of `node overflow.js` and of the browser terminal

```ts
RangeError: Maximum call stack size exceeded
calls before the crash: thousands
lift off
```

`countDown` has no **base case**: a condition where it stops calling itself. It went on past zero into negative numbers, thousands of calls deep, until the stack was full. (The exact number depends on your computer, so the example only checks that it was large.) `countDownFixed` stops at 0, so its stack never grows past four calls.

## The heap

Local variables live in their execution context on the stack, and disappear when the function returns. Objects, arrays and functions are different. They live in a large area of memory called the **heap**, and a variable only holds a reference to them. You saw this in [Objects and JSON](https://zudojs.oyinlola.site/learn/js-data): two variables can point at one object.

This explains a common surprise. A function can change the object it receives, but assigning a new value to its parameter changes nothing outside:

heap.js

```ts
function markDone(task) {
  task.done = true;
}

function replace(task) {
  task = { title: "Something else", done: false };
}

const task = { title: "Buy milk", done: false };

markDone(task);
console.log(task);

replace(task);
console.log(task);
```

Output of `node heap.js` and of the browser terminal

```json
{ title: 'Buy milk', done: true }
{ title: 'Buy milk', done: true }
```

`markDone` followed the reference to the object on the heap and changed it. `replace` pointed its own local parameter at a new object, which only changed `replace`'s copy of the reference.

You never free heap memory yourself. When no variable, closure or other object can reach an object any more, the **garbage collector** removes it. This is also how a backend leaks memory: a closure or a module-level array that keeps growing (say, a cache that never removes old entries) keeps every object in it reachable forever. Later in the course, `@zudojs/cache` gives you caches with a size limit and expiry times for this reason.

## Reading a stack trace

When an error is not caught, Node.js stops the program and prints the error with a **stack trace**: a copy of the call stack at the moment of the error. This is the most useful debugging information you will get. Create a file `trace.js` in a folder with `"type": "module"` in its `package.json` (as in [Your first program](https://zudojs.oyinlola.site/learn/setup)):

trace.jsNode.js only

```ts
const users = [
  { id: 1, name: "Ada", address: { city: "London" } },
  { id: 2, name: "Grace" },
];

function cityOf(id) {
  const user = users.find((u) => u.id === id);
  return user.address.city;
}

function handleRequest(id) {
  return `User ${id} lives in ${cityOf(id)}`;
}

console.log(handleRequest(1));
console.log(handleRequest(2));
```

Run it:

Terminal on your computer

```bash
$ node trace.js
User 1 lives in London
file://~/scope-demo/trace.js:8
  return user.address.city;
                      ^

TypeError: Cannot read properties of undefined (reading 'city')
    at cityOf (file://~/scope-demo/trace.js:8:23)
    at handleRequest (file://~/scope-demo/trace.js:12:33)
    at file://~/scope-demo/trace.js:16:13
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
```

Read it from the top:

1. The first lines show the file, line 8, and a `^` under the exact spot that failed.
2. Then the error: a `TypeError`, because the code read `city` from something that was `undefined`.
3. Then the stack, top first. `cityOf` failed at line 8, column 23. It was called by `handleRequest` at line 12, which was called from the top level of the file at line 16. Lines that start with `node:internal` are Node.js itself: skip them.

The error happened at line 8, but the *cause* is one step earlier: user 2 has no `address`, so `user.address` is `undefined`. This is the usual pattern. Find the top line that is in your own code, look at the values there, then walk down the stack until you find where the bad value came from. The fix here is `user?.address?.city ?? "unknown"`, or better, deciding what the API should answer when data is missing.

## Practice

TRY IT YOURSELF

### Predict the output

Without running it, write down what this code prints: `fn()` first, then `level`. Then open the solution and compare.

**Show a solution**

predict.js

```ts
const level = "module";

function outer() {
  const level = "outer";
  function inner() {
    return level;
  }
  return inner;
}

const fn = outer();
console.log(fn());
console.log(level);
```

Output of `node predict.js` and of the browser terminal

```ts
outer
module
```

`inner` is written inside `outer`, so it looks up `level` in `outer`'s scope first and finds `"outer"`. It keeps that scope through its closure, even though `outer` has already returned when `fn()` is called. The module's `level` was never changed.

TRY IT YOURSELF

### A call limiter

Write `limit(fn, max)` that returns a new function. The new function calls `fn` at most `max` times, and after that returns `"limit reached"`. Use a closure to count the calls. (This is the idea behind rate limiting, which you will use on login routes later.)

**Show a solution**

limit.js

```ts
function limit(fn, max) {
  let calls = 0;
  return (...args) => {
    if (calls >= max) return "limit reached";
    calls += 1;
    return fn(...args);
  };
}

const login = limit((user) => `welcome ${user}`, 2);

console.log(login("ada"));
console.log(login("ada"));
console.log(login("ada"));
```

Output of `node limit.js` and of the browser terminal

```ts
welcome ada
welcome ada
limit reached
```

TRY IT YOURSELF

### Fix the recursion

This function should add up the numbers from `n` down to 1, but it overflows the stack. Find the missing base case and fix it.

sum-bug.js

```ts
function sumTo(n) {
  return n + sumTo(n - 1);
}

try {
  console.log(sumTo(4));
} catch (error) {
  console.log(error.name);
}
```

Output of `node sum-bug.js` and of the browser terminal

```ts
RangeError
```

**Show a solution**

sum-fix.js

```ts
function sumTo(n) {
  if (n <= 0) return 0;
  return n + sumTo(n - 1);
}

console.log(sumTo(4));
```

Output of `node sum-fix.js` and of the browser terminal

```ts
10
```

Using `n <= 0` rather than `n === 0` also stops the recursion if someone passes a negative number or a fraction.

## Recap

- Scope is where a name exists. Names live in module, function or block scope. `var` ignores blocks, so use `let` and `const`.
- Lexical scope: a function sees the variables around where it is *written*. An inner name with the same spelling shadows the outer one.
- A closure is a function plus the variables it remembers. Use it for private state, such as a counter or a store.
- Declarations are hoisted. Function declarations can be called early, `var` starts as `undefined`, and `let`/`const` throw in the temporal dead zone.
- Each call gets an execution context on the call stack. Endless recursion overflows it with `RangeError: Maximum call stack size exceeded`.
- Objects live on the heap and variables hold references. Unreachable objects are garbage collected, and anything reachable forever is a memory leak.
- Read a stack trace from the top, find the first line in your code, then walk down to where the bad value came from.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
