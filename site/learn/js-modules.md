---
title: "Modules and errors"
description: "Split a program into files with import and export, and handle things that go wrong with throw, try, catch and your own error classes."
source: https://zudojs.oyinlola.site/learn/js-modules
---

LESSON 5 OF 10

JavaScript for the backend

# Modules and errors

Split a program into files with import and export, and handle things that go wrong with throw, try, catch and your own error classes.

- **30 min** to read and try
- **You need:** Lessons 1 to 4
- **You build:** A task store in its own file, with a NotFound error

## One file is not enough

Real backends have hundreds of files. Each file is a **module**: it keeps its variables to itself and **exports** only what other files should use. Another file **imports** those names.

Make a new folder for this lesson, run `npm init -y` and `npm pkg set type=module` in it as in lesson 1, then create two files. The first one holds the tasks:

tasks.js

```ts
const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write report", done: true },
];

let nextId = 3;

export function listTasks() {
  return tasks;
}

export function addTask(title) {
  const task = { id: nextId, title, done: false };
  nextId += 1;
  tasks.push(task);
  return task;
}
```

The second one uses it:

main.js

```ts
import { addTask, listTasks } from "./tasks.js";

addTask("Call Ada");
console.log(listTasks());
```

Output of `node main.js` and of the browser terminal

```json
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Write report', done: true },
  { id: 3, title: 'Call Ada', done: false }
]
```

Run `main.js`, not `tasks.js`. The browser terminal knows about both files on this page, so **Run in browser** works too. On your computer:

Terminal on your computer

```bash
$ node main.js
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Write report', done: true },
  { id: 3, title: 'Call Ada', done: false }
]
```

A few rules to remember:

- A relative import starts with `./` and includes the file extension: `"./tasks.js"`, not `"./tasks"`.
- `tasks` and `nextId` are not exported, so no other file can reach them. The only way to add a task is through `addTask`. Hiding details like this keeps a codebase safe to change.
- A package import has no `./`: `import { schema } from "@zudojs/schema"`. Node.js finds it in the `node_modules` folder that `npm install` fills.

> WATCH OUT
>
> If you see `SyntaxError: Cannot use import statement outside a module`, your `package.json` is missing `"type": "module"`. Run `npm pkg set type=module`.

## Throwing and catching errors

When code cannot do what was asked, it should say so loudly rather than carry on with bad data. `throw` stops the current function and hands an error to whoever called it. `try`/`catch` is where you receive it:

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

- Good JSON with a string title passed.
- Our own `throw` rejected a title that was a number.
- `JSON.parse` itself threw a `SyntaxError` on text that was not JSON. You did not write that `throw`. Built-in functions throw too.

`finally` runs whether or not there was an error. Use it for clean-up, such as closing a file.

> NOTE
>
> The exact wording of the `SyntaxError` comes from the JavaScript engine. Node.js and Chrome use the same engine, which is why the browser terminal prints the same message.

## Your own error classes

A backend has to answer differently for different failures: "that task does not exist" is not the same as "the database is down". Give each failure its own **class**, so the code that catches it can tell them apart.

A class is a template for objects. `extends Error` means "an error, plus my extras". Here the extra is `statusCode`, the number an HTTP API sends back. 404 means Not Found:

errors.js

```ts
export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}
```

find.js

```ts
import { NotFoundError } from "./errors.js";

const tasks = [{ id: 1, title: "Buy milk", done: false }];

function getTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) {
    throw new NotFoundError(`Task ${id} not found`);
  }
  return task;
}

for (const id of [1, 7]) {
  try {
    console.log(getTask(id));
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log(error.statusCode, error.message);
    } else {
      throw error;
    }
  }
}
```

Output of `node find.js` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: false }
404 Task 7 not found
```

`instanceof` asks "was this error made from that class?". The `else { throw error; }` part matters: only handle the errors you expect, and let anything else keep going up so it is not silently lost.

This pattern is exactly how ZudoJS works. `@zudojs/errors` ships `NotFoundError`, `ValidationError`, `ConflictError` and dozens more, each with the right status code, so you will not write these classes yourself after this lesson.

## Practice

TRY IT YOURSELF

### Add a ValidationError

Add a `ValidationError` class with status code 400 (Bad Request) to `errors.js`. Write `createTask(title)` that throws it when the title is empty, and show that the catching code can tell the two errors apart.

**Show a solution**

errors.js

```ts
export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}
```

create.js

```ts
import { NotFoundError, ValidationError } from "./errors.js";

function createTask(title) {
  if (title.trim() === "") {
    throw new ValidationError("title must not be empty");
  }
  return { id: 2, title, done: false };
}

function describe(error) {
  if (error instanceof ValidationError) return "Fix your input";
  if (error instanceof NotFoundError) return "Check the id";
  return "Something else went wrong";
}

try {
  createTask("  ");
} catch (error) {
  console.log(error.statusCode, error.name, "-", describe(error));
}
```

Output of `node create.js` and of the browser terminal

```ts
400 ValidationError - Fix your input
```

## Recap

- Each file is a module. `export` what others may use and `import` it by path, with the extension.
- `throw` reports a failure; `try`/`catch`/`finally` handles it.
- Give each kind of failure its own class, check it with `instanceof`, and re-throw what you don't handle.

That completes the JavaScript part. Next, you will add types to this same code, and watch TypeScript catch mistakes JavaScript let through.
