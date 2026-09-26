---
title: "Handling errors — ZudoJS Academy"
description: "Tell syntax, runtime and logic errors apart, throw and catch errors, write your own error classes, and turn every error into a safe answer from an API."
source: https://zudojs.oyinlola.site/learn/js-errors
---

LEVEL 2 · LESSON 17 OF 19

Classes, errors, async and modules Foundation

# Handling errors

Tell syntax, runtime and logic errors apart, throw and catch errors, write your own error classes, and turn every error into a safe answer from an API.

- **40 min** to read and try
- **You need:** this, prototypes and classes, and the lessons before it
- **You build:** The logic of a calculator API that validates its input, throws typed errors and maps them to HTTP status codes and messages

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell syntax, runtime and logic errors apart by when they appear
- Throw errors and handle them with try, catch and finally
- Read an error's name, message, stack and cause, and wrap a low-level error with a cause
- Write your own error classes and handle only the errors you expect, re-throwing the rest
- Map errors to HTTP status codes without leaking internal details

## Three kinds of errors

An **error** is anything that stops your program from doing what you meant. There are three kinds, and each one shows up at a different moment.

### Syntax errors: the code cannot even start

A **syntax error** means the code is not valid JavaScript: a missing bracket, a typo in a keyword. Node.js reads the whole file before it runs any of it, so a syntax error stops everything, even the lines above the mistake. Save this file as `syntax.js` in a project folder with `"type": "module"` (see [Set up your computer](https://zudojs.oyinlola.site/learn/setup#package-json)):

syntax.jsNode.js only

```ts
console.log("Starting the task report");

function countOpen(tasks {
  return tasks.filter((task) => !task.done).length;
}
```

Terminal on your computer

```bash
$ node syntax.js
file://~/errors-demo/syntax.js:3
function countOpen(tasks {
                         ^

SyntaxError: Unexpected token '{'
    at compileSourceTextModule (node:internal/modules/esm/utils:318:16)
…

Node.js v24.19.0
```

The first line, `Starting the task report`, never printed. Node.js points at line 3 with `^`: it expected a `)` to close the parameter list. Your editor usually underlines syntax errors in red before you even run the code.

### Runtime errors: the code crashes while running

A **runtime error** happens while the program runs, when an operation is impossible, such as reading a property of `undefined`. Everything before it runs; nothing after it does:

crash.jsNode.js only

```ts
console.log("Starting the task report");

const tasks = JSON.parse('[{"title":"Buy milk","done":false}]');
console.log(tasks.lenght.toFixed(0));

console.log("Report finished");
```

Terminal on your computer

```bash
$ node crash.js
Starting the task report
file://~/errors-demo/crash.js:4
console.log(tasks.lenght.toFixed(0));
                         ^

TypeError: Cannot read properties of undefined (reading 'toFixed')
    at file://~/errors-demo/crash.js:4:26
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
```

The typo `lenght` gave `undefined`, and calling a method on `undefined` threw a `TypeError`. The program stopped, so `Report finished` never printed. In a backend, an uncaught error like this can stop the whole server. [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope) showed how to read the stack trace underneath.

### Logic errors: wrong answers, no message

A **logic error** is the worst kind: the code runs without complaint and gives the wrong result.

logic.js

```ts
function averagePriority(tasks) {
  let total = 0;
  for (const task of tasks) {
    total += task.priority;
  }
  return total / tasks.length + 1;
}

console.log(averagePriority([{ priority: 2 }, { priority: 4 }]));
```

Output of `node logic.js` and of the browser terminal

```ts
4
```

The average of 2 and 4 is 3, not 4. Someone wrote `+ 1` by mistake. JavaScript cannot know what you meant, so nothing warns you. Logic errors are found by checking results against known answers, which is what tests do. You will write them in [Testing](https://zudojs.oyinlola.site/learn/testing-basics).

## throw, try, catch and finally

When your own code cannot do what was asked, it should say so loudly rather than carry on with bad data. `throw` stops normal execution and hands the error to the nearest `catch`: in the same function if the `throw` is inside a `try` there, otherwise in the function that called it, then in its caller, and so on up the call stack. `try`/`catch` is where you receive it. If nothing catches it, the program crashes as you saw above.

catch.js

```ts
function parseTask(text) {
  const data = JSON.parse(text);
  if (typeof data.title !== "string") {
    throw new Error("title must be a string");
  }
  return data;
}

const inputs = ['{"title":"Buy milk"}', '{"title":42}', "{not json"];

for (const input of inputs) {
  try {
    const task = parseTask(input);
    console.log("OK:", task.title);
  } catch (error) {
    console.log(`${error.name}: ${error.message}`);
  } finally {
    console.log("  (checked one input)");
  }
}
```

Output of `node catch.js` and of the browser terminal

```ts
OK: Buy milk
  (checked one input)
Error: title must be a string
  (checked one input)
SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)
  (checked one input)
```

Three things happened:

- Good JSON with a string title passed. The `catch` block was skipped.
- Our own `throw` rejected a title that was a number. The line `console.log("OK:" ...)` never ran: `throw` jumped straight to `catch`.
- `JSON.parse` itself threw a `SyntaxError` on text that was not JSON. You did not write that `throw`: built-in functions throw too.

The loop carried on after each error, because each one was caught. That is the point of `catch`: one bad request must not stop the server from answering the next one.

> NOTE
>
> The exact wording of the `SyntaxError` comes from the JavaScript engine. Node.js and Chrome use the same engine, V8, which is why the browser terminal prints the same message.

### finally always runs

`finally` runs whether the `try` block succeeded, threw, or even returned. Use it for clean-up that must happen no matter what, such as closing a file or giving a database connection back:

finally.js

```ts
let openConnections = 0;

function query(sql) {
  openConnections += 1;
  try {
    if (sql === "") throw new Error("empty query");
    return `rows for: ${sql}`;
  } finally {
    openConnections -= 1;
  }
}

console.log(query("SELECT * FROM tasks"));
try {
  query("");
} catch (error) {
  console.log("failed:", error.message);
}
console.log("open connections:", openConnections);
```

Output of `node finally.js` and of the browser terminal

```ts
rows for: SELECT * FROM tasks
failed: empty query
open connections: 0
```

The first call returned from inside `try`, the second threw. In both cases `finally` ran and closed the connection. Without it, every failed query would leak a connection until the server ran out.

## What is inside an error

An error is an ordinary object made from the `Error` class or one of its built-in subclasses. The ones you will meet most:

- `TypeError`: a value has the wrong type for the operation, such as calling something that is not a function.
- `ReferenceError`: a name that does not exist, or a `let`/`const` used before its line ([Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#hoisting)).
- `RangeError`: a value is out of range, or the call stack overflowed.
- `SyntaxError`: invalid code, or invalid JSON passed to `JSON.parse`.

Every error has a `name`, a `message` and a `stack`, the stack trace as text:

error-object.js

```ts
function checkPriority(priority) {
  if (priority < 1 || priority > 5) {
    throw new RangeError(`priority must be 1 to 5, got ${priority}`);
  }
  return priority;
}

try {
  checkPriority(9);
} catch (error) {
  console.log(error instanceof RangeError, error instanceof Error);
  console.log(error.name);
  console.log(error.message);
  console.log(error.stack.split("\n")[0]);
  console.log(error.stack.split("\n")[1].trim().split(" (")[0]);
}
```

Output of `node error-object.js` and of the browser terminal

```ts
true true
RangeError
priority must be 1 to 5, got 9
RangeError: priority must be 1 to 5, got 9
at checkPriority
```

The first line of `stack` is the name and message. The next lines are the call stack, top first: the error was made in `checkPriority`. The example cuts off the file path, which is different on every computer. In real code you log the whole `stack` for yourself, and never send it to users (more on that in the build below).

> Always throw Error objects
>
> JavaScript lets you `throw` anything, even a string: `throw "not found"`. Don't. A string has no `name`, no `stack`, and `instanceof` cannot recognise it, so whoever catches it cannot tell what happened or where. Always throw an `Error` or a subclass.

### Wrapping an error with cause

Often you catch a low-level error and want to report it in words that make sense at your level: not "unexpected token" but "could not load the settings". Pass the original error as the **cause**, so the detail is not lost:

cause.js

```ts
function loadSettings(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Could not load settings", { cause: error });
  }
}

try {
  loadSettings("{ theme: dark }");
} catch (error) {
  console.log(error.message);
  console.log("cause:", error.cause.name, "-", error.cause.message);
}
```

Output of `node cause.js` and of the browser terminal

```ts
Could not load settings
cause: SyntaxError - Expected property name or '}' in JSON at position 2 (line 1 column 3)
```

The caller gets a clear message, and `error.cause` still holds the original `SyntaxError` for debugging. Deciding *which* layer of a program should catch, wrap or re-throw an error is a design question of its own; [Designing error handling](https://zudojs.oyinlola.site/learn/js-error-design), in the Advanced JavaScript course, covers it, together with `AggregateError`.

## Your own error classes

A backend has to answer differently for different failures. "That task does not exist" is not the same as "your input is wrong", and neither is the same as "the database is down". Give each kind of failure its own **class**, so the code that catches it can tell them apart with `instanceof`.

You learned `extends` and `super` in [this, prototypes and classes](https://zudojs.oyinlola.site/learn/js-classes). An error class is a class that extends `Error`. Start with a common base class that carries what every API error needs: an HTTP **status code** (the number the server sends back, such as 404 for "Not Found") and a short machine-readable `code`:

errors.js

```ts
export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL", cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, { status: 404, code: "NOT_FOUND" });
  }
}

export class ValidationError extends AppError {
  constructor(message, field) {
    super(message, { status: 400, code: "VALIDATION" });
    this.field = field;
  }
}
```

`new.target` is the class that `new` was actually called with, so `this.name` becomes `"NotFoundError"` or `"ValidationError"` automatically. Now use them:

find.js

```ts
import { NotFoundError, ValidationError } from "./errors.js";

const tasks = [{ id: 1, title: "Buy milk", done: false }];

function getTask(id) {
  if (!Number.isInteger(id)) {
    throw new ValidationError("id must be a whole number", "id");
  }
  const task = tasks.find((t) => t.id === id);
  if (!task) {
    throw new NotFoundError(`Task ${id} not found`);
  }
  return task;
}

for (const id of [1, 7, "abc"]) {
  try {
    console.log(getTask(id));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      console.log(error.status, error.name, error.message);
    } else {
      throw error;
    }
  }
}
```

Output of `node find.js` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: false }
404 NotFoundError Task 7 not found
400 ValidationError id must be a whole number
```

The `else { throw error; }` part matters. Only handle the errors you expect, and **re-throw** anything else so it keeps going up and is not silently lost. A `catch` that swallows every error hides bugs.

This pattern is exactly how ZudoJS works. `@zudojs/errors` ships `NotFoundError`, `ValidationError`, `ConflictError` and dozens more, each with the right status code, so after this lesson you will rarely write these classes yourself. You will meet them in [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors).

## Build: a reliable calculator API

Put it all together in the logic of a small API. A client asks for a calculation with three values, for example from the address `/calculate?a=10&b=4&op=divide`. Values from a URL always arrive as **strings**, and they may be missing or nonsense. The API must:

1. Validate the input and throw a `ValidationError` for anything wrong.
2. Throw its own error for a calculation that is impossible, dividing by zero.
3. Turn every error into an answer with a status code and a safe message, and never crash.

REASON IT OUT

### Before you build: what can arrive, and what may the client see?

The API receives `a`, `b` and `op` from a web address. Before writing any code, decide:

- What values can `a` and `b` really have? List at least four different kinds of bad input.
- Which failures are the *client's* fault, which are requests that are well-formed but impossible, and which are bugs in your own code? Should they get the same status code?
- For each kind, what may the client see in the answer, and what must stay in your logs?

**Show the reasoning**

**Inputs:** every value from a URL is a string, or missing. Bad inputs include a missing `a`, an empty string, text such as `"ten"`, `"Infinity"`, an unknown `op`, and an `op` such as `"constructor"` that happens to be the name of an inherited property. A whole request can even arrive as `null` if some earlier code has a bug.

**Three kinds, three answers:** bad input is the client's fault: 400, with the field that is wrong. Dividing by zero is a valid request that cannot be done: 422. Anything you did not plan for is your bug: 500.

**What to show:** errors you designed for users (the 400s and the 422) carry messages written for them, so they are safe to send. An unexpected error's message and stack describe your code; log them for yourself and send the client only a generic message.

First, the error classes. They are the ones from above plus one new class. Status 422 means "I understood the request, but I cannot do it":

errors.js

```ts
export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL" } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message, field) {
    super(message, { status: 400, code: "VALIDATION" });
    this.field = field;
  }
}

export class DivisionByZeroError extends AppError {
  constructor() {
    super("cannot divide by zero", { status: 422, code: "DIVISION_BY_ZERO" });
  }
}
```

Next, the calculator. It knows nothing about HTTP. It only validates and calculates, and throws when it cannot:

calculator.js

```ts
import { DivisionByZeroError, ValidationError } from "./errors.js";

const OPERATIONS = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => {
    if (b === 0) throw new DivisionByZeroError();
    return a / b;
  },
};

function toNumber(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} is required`, field);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ValidationError(`${field} must be a number`, field);
  }
  return number;
}

export function calculate({ a, b, op }) {
  if (!Object.hasOwn(OPERATIONS, op)) {
    throw new ValidationError(`unknown operation "${op}"`, "op");
  }
  return OPERATIONS[op](toNumber(a, "a"), toNumber(b, "b"));
}
```

Two safety details:

- The operation name is looked up in an **allow-list**, the `OPERATIONS` object. The input is never run as code. Never use `eval` to "calculate" what a user typed: that would let them run any code on your server.
- `Object.hasOwn` matters. A plain `OPERATIONS[op]` check would accept `op=constructor` or `op=toString`, because every object inherits those from `Object.prototype` ([the prototype chain](https://zudojs.oyinlola.site/learn/js-classes#prototypes)).

Finally, the API layer. It is the only place that knows about status codes. It catches every error and turns it into a response:

api.js

```ts
import { calculate } from "./calculator.js";
import { AppError, ValidationError } from "./errors.js";

export function handleCalculate(query) {
  try {
    return { status: 200, body: { result: calculate(query) } };
  } catch (error) {
    if (error instanceof AppError) {
      const body = { error: { code: error.code, message: error.message } };
      if (error instanceof ValidationError) body.error.field = error.field;
      return { status: error.status, body };
    }
    console.log(`[internal] ${error.name}: ${error.message}`);
    return { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong" } } };
  }
}

const requests = [
  { a: "10", b: "4", op: "divide" },
  { a: "10", b: "0", op: "divide" },
  { a: "ten", b: "4", op: "add" },
  { b: "4", op: "add" },
  { a: "1", b: "2", op: "constructor" },
  null,
];

for (const query of requests) {
  const response = handleCalculate(query);
  console.log(response.status, JSON.stringify(response.body));
}
```

Output of `node api.js` and of the browser terminal

```ts
200 {"result":2.5}
422 {"error":{"code":"DIVISION_BY_ZERO","message":"cannot divide by zero"}}
400 {"error":{"code":"VALIDATION","message":"a must be a number","field":"a"}}
400 {"error":{"code":"VALIDATION","message":"a is required","field":"a"}}
400 {"error":{"code":"VALIDATION","message":"unknown operation \"constructor\"","field":"op"}}
[internal] TypeError: Cannot destructure property 'a' of 'object null' as it is null.
500 {"error":{"code":"INTERNAL","message":"Something went wrong"}}
```

Every request got an answer, and the program never crashed. Look at each one:

- A good request returns 200 with the result.
- Dividing by zero is a well-formed request that cannot be done: 422.
- Bad or missing input returns 400, with the `field` that is wrong so a client can highlight it.
- `op=constructor` was refused by the allow-list.
- The `null` request caused an error nobody planned for, a `TypeError` inside `calculate`. It is not an `AppError`, so the API logs the real details for the developers and sends the client only a generic 500 message.

> Never send internal errors to the client
>
> An unexpected error's message and stack can reveal file paths, library versions, SQL or data. Attackers collect those details. Log them where only you can read them, and send the client a generic message. Errors you designed for users, like `ValidationError`, are safe to show.

Errors in asynchronous code, such as a database call that fails, follow the same rules with one twist: you need `await`. That is in the next lesson, [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async).

## Practice

TRY IT YOURSELF

### Add a ConflictError

Add a `ConflictError` class with status 409 (Conflict) and code `CONFLICT`, extending `AppError`. Write `createUser(users, email)` that throws it when the e-mail is already taken, and show the status and message when it happens.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

`ConflictError` only needs to pass the right status and code up to `AppError`'s constructor: `super(message, { status: 409, code: "CONFLICT" });`.

HINT 2

In `createUser`: `if (users.some((user) => user.email === email)) throw new ConflictError(\`${email} is already registered\`);` then push and return the new user.

SOLUTION

conflict.js

```ts
class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL" } = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, { status: 409, code: "CONFLICT" });
  }
}

function createUser(users, email) {
  if (users.some((user) => user.email === email)) {
    throw new ConflictError(`${email} is already registered`);
  }
  const user = { id: users.length + 1, email };
  users.push(user);
  return user;
}

const users = [];
console.log(createUser(users, "ada@example.com"));

try {
  createUser(users, "ada@example.com");
} catch (error) {
  console.log(error.status, error.name, error.message);
}
```

Output of `node conflict.js` and of the browser terminal

```json
{ id: 1, email: 'ada@example.com' }
409 ConflictError ada@example.com is already registered
```

TRY IT YOURSELF

### Find the swallowed error

This function is supposed to return `null` only when the text is not valid JSON. Why does it also return `null` when the JSON is fine? Fix it so that only the `SyntaxError` from `JSON.parse` is turned into `null`.

swallow-bug.js

```ts
function readTitle(text) {
  try {
    const data = JSON.parse(text);
    return data.title.toUpperCase();
  } catch {
    return null;
  }
}

console.log(readTitle('{"title":"buy milk"}'));
console.log(readTitle("{oops"));
console.log(readTitle('{"name":"buy milk"}'));
```

Output of `node swallow-bug.js` and of the browser terminal

```ts
BUY MILK
null
null
```

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Put only the `JSON.parse` call inside the `try`. In its `catch`, check `error instanceof SyntaxError` before deciding to return `null`; otherwise re-throw.

HINT 2

After a successful parse, check the title *outside* the `try`: `if (typeof data.title !== "string") throw new TypeError("title must be a string");`

SOLUTION

The third input is valid JSON, but it has no `title`, so `data.title.toUpperCase()` throws a `TypeError`. The `catch` catches *every* error and hides that bug behind `null`. Only catch what you expect, and re-throw the rest:

swallow-fix.js

```ts
function readTitle(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (typeof data.title !== "string") {
    throw new TypeError("title must be a string");
  }
  return data.title.toUpperCase();
}

console.log(readTitle('{"title":"buy milk"}'));
console.log(readTitle("{oops"));
try {
  readTitle('{"name":"buy milk"}');
} catch (error) {
  console.log(`${error.name}: ${error.message}`);
}
```

Output of `node swallow-fix.js` and of the browser terminal

```ts
BUY MILK
null
TypeError: title must be a string
```

The `try` block now contains only the one line that may throw the error you expect. The missing title is reported as its own clear error instead of being hidden.

TRY IT YOURSELF

### Extend the calculator

Add a `power` operation to the calculator. Make it throw a `ValidationError` on field `b` when the exponent is larger than 100, so nobody can ask the server for huge numbers. What status code will the API answer with?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Guard first: `if (b > 100) throw new ValidationError("b must be at most 100", "b");`

HINT 2

After the guard, the only line left is `return a ** b;`.

SOLUTION

Add a `power` entry to `OPERATIONS` in `calculator.js`. Here it is on its own, with a copy of `ValidationError` so you can run it:

power.js

```ts
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.field = field;
  }
}

const power = (a, b) => {
  if (b > 100) throw new ValidationError("b must be at most 100", "b");
  return a ** b;
};

console.log(power(2, 10));
try {
  power(2, 1000);
} catch (error) {
  console.log(error.status, `field ${error.field}:`, error.message);
}
```

Output of `node power.js` and of the browser terminal

```ts
1024
400 field b: b must be at most 100
```

Because it is a `ValidationError`, `handleCalculate` answers 400 with the field `b`, without any change to the API layer. That is the payoff of typed errors: new failures fit into the existing mapping.

## Recap

- Syntax errors stop the file before it runs. Runtime errors throw while it runs. Logic errors give wrong answers silently, and only tests find them.
- `throw` hands an error up the call stack. `try`/`catch` receives it. `finally` always runs, so put clean-up there.
- Errors have `name`, `message` and `stack`. Wrap a low-level error with `new Error(message, { cause })`. Always throw `Error` objects, never strings.
- Give each kind of failure its own class, check it with `instanceof`, and re-throw what you do not handle.
- Validate outside input with an allow-list, map known errors to status codes, and answer unknown errors with a generic 500 while logging the details privately.

Next, [Asynchronous JavaScript](https://zudojs.oyinlola.site/learn/js-async): code that waits without blocking, and how errors travel through it.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
