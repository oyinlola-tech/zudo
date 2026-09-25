---
title: "Modules — ZudoJS Academy"
description: "Split a program into files with ES modules, understand the older CommonJS require, choose between named and default exports, and avoid circular dependencies."
source: https://zudojs.oyinlola.site/learn/js-modules
---

LEVEL 2 · LESSON 19 OF 19

Classes, errors, async and modules Foundation

# Modules

Split a program into files with ES modules, understand the older CommonJS require, choose between named and default exports, and avoid circular dependencies.

- **40 min** to read and try
- **You need:** Asynchronous JavaScript, and the lessons before it
- **You build:** A task feature split into modules with a clear public entry point, and a circular dependency found and fixed

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Split a program into ES modules with import and export
- Choose named exports over default exports, and rename imports with as and import * as
- Explain that a module runs once and its state is shared by every importer
- Read CommonJS require and module.exports, and know how the two systems load each other in Node.js 24
- Give a feature one public entry point and find and break a circular dependency

## Why modules exist

Real backends have hundreds of files. Putting everything in one file does not work: it becomes impossible to find anything, two parts of the code accidentally use the same variable name, and any function can change any data.

A **module** is a file with its own private scope. Nothing inside it is visible to other files unless the module **exports** it, and another file must **import** it by name to use it. That gives you three things:

- **Organisation**: each file does one job and has a name that says what it is.
- **No name clashes**: a variable called `tasks` in one file has nothing to do with `tasks` in another. That is the module scope from [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope).
- **Hiding**: a module decides exactly what the rest of the program may touch. Everything else is an internal detail you can change safely.

JavaScript has two module systems. **ES modules** (ESM), with `import` and `export`, are the standard, and what this course uses. **CommonJS**, with `require`, is the older Node.js system that you will still meet. This lesson covers both.

## ES modules: import and export

Make a new folder for this lesson, run `npm init -y` and `npm pkg set type=module` in it as in [Set up your computer](https://zudojs.oyinlola.site/learn/setup#package-json), then create two files. The first one holds the tasks:

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

- A relative import starts with `./` (this folder) or `../` (the folder above) and includes the file extension: `"./tasks.js"`, not `"./tasks"`.
- `tasks` and `nextId` are not exported, so no other file can reach them. The only way to add a task is through `addTask`, so ids can never be duplicated.
- A package import has no `./`: `import { schema } from "@zudojs/schema"`. Node.js finds it in the `node_modules` folder that `npm install` fills. [npm and packages](https://zudojs.oyinlola.site/learn/npm-packages) covers that.
- `import` lines go at the top of the file. They run before any other code in the file.

> WATCH OUT
>
> If you see `SyntaxError: Cannot use import statement outside a module`, your `package.json` says `"type": "commonjs"`, which is what `npm init -y` writes. Run `npm pkg set type=module`. (If `package.json` has no `"type"` at all, Node.js 24 notices the `import`, runs the file as an ES module anyway, and prints a warning asking you to add `"type": "module"`.)

## Named and default exports

Everything you exported so far is a **named export**: the importing file must use the exact name, inside `{ }`. A module may also have one **default export**, written `export default`. The importing file picks any name for it, with no braces:

task-store.js

```ts
export const MAX_TASKS = 100;

export default class TaskStore {
  #tasks = [];

  add(title) {
    if (this.#tasks.length >= MAX_TASKS) throw new Error("store is full");
    this.#tasks.push(title);
    return this.#tasks.length;
  }
}
```

main.js

```ts
import Store, { MAX_TASKS } from "./task-store.js";
import Whatever from "./task-store.js";

const store = new Store();
console.log(store.add("Buy milk"), "of", MAX_TASKS);
console.log(Store === Whatever);
```

Output of `node main.js` and of the browser terminal

```ts
1 of 100
true
```

`Store` and `Whatever` are the same class, under two different names. That freedom is the problem with default exports: every file can call the same thing something different, so searching the code for `TaskStore` misses them, and editors cannot rename it reliably. A typo in a named import is an error; a "typo" in a default import is just a new name.

> TIP
>
> Prefer named exports. They keep one name for one thing across the whole codebase. ZudoJS packages only use named exports. You will still see `export default` in some libraries and frameworks, so you need to recognise it.

## Import aliases and namespaces

Sometimes two modules export the same name. Rename one when you import it with `as`. Or import the whole module as one object with `import * as name`, called a **namespace import**:

tasks.js

```ts
export function create(title) {
  return { kind: "task", title };
}

export function count(list) {
  return list.filter((item) => item.kind === "task").length;
}
```

users.js

```ts
export function create(name) {
  return { kind: "user", name };
}
```

main.js

```ts
import { create as createTask } from "./tasks.js";
import { create as createUser } from "./users.js";
import * as taskModule from "./tasks.js";

const items = [createTask("Buy milk"), createUser("Ada"), createTask("Call Ada")];
console.log(items);
console.log(taskModule.count(items));
console.log(typeof taskModule.create);
```

Output of `node main.js` and of the browser terminal

```json
[
  { kind: 'task', title: 'Buy milk' },
  { kind: 'user', name: 'Ada' },
  { kind: 'task', title: 'Call Ada' }
]
2
function
```

Inside `main.js`, the two `create` functions are now `createTask` and `createUser`. The namespace `taskModule` holds every export of `tasks.js` as a property, which makes it obvious where `count` comes from.

## A module runs once

However many files import a module, its code runs only the *first* time. Every importer gets the same exports, so they share any state inside it:

counter.js

```ts
console.log("counter.js is running");

let count = 0;

export function next() {
  count += 1;
  return count;
}
```

tasks.js

```ts
import { next } from "./counter.js";

export const taskId = () => `task-${next()}`;
```

users.js

```ts
import { next } from "./counter.js";

export const userId = () => `user-${next()}`;
```

main.js

```ts
import { taskId } from "./tasks.js";
import { userId } from "./users.js";

console.log(taskId(), userId(), taskId());
```

Output of `node main.js` and of the browser terminal

```ts
counter.js is running
task-1 user-2 task-3
```

`counter.js` printed its message once, and the two modules share one `count`. This is useful (one database connection for the whole app, created in one module) and a trap (state you thought was private to `tasks.js` is shared). If each part needs its own counter, export a function that *creates* one, like `makeCounter` in [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#closures).

## CommonJS: require and module.exports

Before ES modules existed, Node.js had its own system, **CommonJS**. Many older packages and tutorials still use it, so you need to read it. A CommonJS file assigns what it shares to `module.exports`, and another file loads it with `require`.

In a project with `"type": "module"`, a file must end in `.cjs` to be treated as CommonJS. (In a project with `"type": "commonjs"` it is the other way round: every `.js` file is CommonJS, and a file must end in `.mjs` to be an ES module.) Here is the task store again:

tasks.cjsNode.js only

```ts
const tasks = [];

function addTask(title) {
  const task = { id: tasks.length + 1, title, done: false };
  tasks.push(task);
  return task;
}

function listTasks() {
  return tasks;
}

module.exports = { addTask, listTasks };
```

main.cjsNode.js only

```ts
const { addTask, listTasks } = require("./tasks.cjs");

addTask("Buy milk");
addTask("Call Ada");
console.log(listTasks());
console.log(typeof require, typeof module);
```

Output of `npx tsx main.cjs`

```json
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Call Ada', done: false }
]
function object
```

Terminal on your computer

```bash
$ node main.cjs
[
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Call Ada', done: false }
]
function object
```

The ideas are the same, the spelling is different:

- `require` is an ordinary function. It loads the file right then, synchronously, and returns its `module.exports` object. `import` is special syntax that Node.js reads before running anything.
- `const { addTask } = require(...)` is just destructuring the returned object.
- These examples are "Node.js only": the browser terminal only understands ES modules.

The two systems can load each other, within limits. An ES module can import a CommonJS file: its `module.exports` object arrives as the default export, and Node.js also detects simple named exports. Inside an ES module, `require` itself is not defined:

app.jsNode.js only

```ts
import tasks from "./tasks.cjs";
import { addTask } from "./tasks.cjs";

addTask("Plan week");
console.log(tasks.listTasks());
console.log(typeof require);
```

Output of `node app.js`

```json
[ { id: 1, title: 'Plan week', done: false } ]
undefined
```

The other direction works too. Since Node.js 22.12, and so in Node.js 24, a CommonJS file can `require()` an ES module, as long as that module does not use top-level `await`. The result is the module's namespace object, with every named export as a property and the default export under `default`. This is what lets older CommonJS code use newer packages that only ship ES modules:

prices.js

```ts
export const VAT_PERCENT = 7.5;

export function withVat(kobo) {
  return Math.round(kobo * (1 + VAT_PERCENT / 100));
}
```

report.cjsNode.js only

```ts
const prices = require("./prices.js");

console.log(prices.VAT_PERCENT, prices.withVat(1000000));
console.log(Object.keys(prices));
```

Output of `npx tsx report.cjs`

```ts
7.5 1075000
[ 'VAT_PERCENT', 'withVat' ]
```

If the ES module does use top-level `await`, `require` throws an error with the code `ERR_REQUIRE_ASYNC_MODULE`, because `require` must finish synchronously. [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems#interop) covers every interop rule, including how older Node.js versions behave.

For new code, always write ES modules. Use this knowledge to read older code and to understand why some packages are imported with a default import.

## Module boundaries: a public entry point

As a feature grows, it becomes several files: one that stores data, one with the rules, maybe one with helpers. Other parts of the app should not reach into all of them.

REASON IT OUT

### Before you split: what should the rest of the app see?

The tasks feature has a store (`insert`, `all`) and a service with the rules (`createTask` trims and validates the title, `listTasks`). Before you decide what to export, think:

- If other features could import `insert` directly, which rule could they skip?
- Next year the store moves from an array to a database. Which files should have to change?
- Where would a reader look to find out what the tasks feature offers?

**Show the reasoning**

**Skipped rules:** `insert` stores whatever it is given, so a direct call would save a task with an empty or untrimmed title. Only `createTask` may be public.

**Changes:** only the files inside `tasks/`. If the rest of the app imports only the service functions, swapping the store behind them is invisible to every other file.

**One place to look:** a single entry file that re-exports the public functions is the feature's table of contents, and the only door into it.

Give the feature's folder one **entry point**, usually `index.js`, that re-exports only the public functions. `export { name } from "./file.js"` re-exports without importing into the current file:

tasks/store.jsNode.js only

```ts
const rows = [];

export function insert(task) {
  rows.push(task);
  return task;
}

export function all() {
  return rows.map((row) => ({ ...row }));
}
```

tasks/service.jsNode.js only

```ts
import { all, insert } from "./store.js";

export function createTask(title) {
  const clean = title.trim();
  if (clean === "") throw new Error("title must not be empty");
  return insert({ id: all().length + 1, title: clean, done: false });
}

export function listTasks() {
  return all();
}
```

tasks/index.jsNode.js only

```ts
export { createTask, listTasks } from "./service.js";
```

main.jsNode.js only

```ts
import * as tasks from "./tasks/index.js";

tasks.createTask("  Buy milk ");
console.log(tasks.listTasks());
console.log(Object.keys(tasks));
```

Output of `node main.js`

```json
[ { id: 1, title: 'Buy milk', done: false } ]
[ 'createTask', 'listTasks' ]
```

The rest of the app sees exactly two functions. `insert` exists, but it is not part of the feature's public face, so nobody can store a task that skipped the validation in `createTask`. You are free to replace `store.js` with a real database later without changing any other file. That line between "public" and "internal" is a **module boundary**.

> NOTE
>
> npm packages draw the same line with the `"exports"` field in their `package.json`: only the paths listed there can be imported. That is why you import `@zudojs/errors`, not a file deep inside it.

## Circular dependencies

A **circular dependency** is when module A imports module B, and B (directly or through others) imports A. It usually happens by accident as a project grows. Here, `tasks.js` uses a logger, and the logger wants a constant from `tasks.js`:

tasks.js

```ts
import { logChange } from "./logger.js";

export const DEFAULT_PRIORITY = 3;

export function createTask(title) {
  const task = { title, priority: DEFAULT_PRIORITY };
  logChange("created", task);
  return task;
}
```

logger.js

```ts
import { DEFAULT_PRIORITY } from "./tasks.js";

const prefix = `[tasks, default priority ${DEFAULT_PRIORITY}]`;

export function logChange(event, task) {
  console.log(`${prefix} ${event}: ${task.title}`);
}
```

main.js

```ts
import { createTask } from "./tasks.js";

createTask("Buy milk");
```

Terminal on your computer

```bash
$ node main.js
file://~/modules-demo/cycle/logger.js:3
const prefix = `[tasks, default priority ${DEFAULT_PRIORITY}]`;
                                           ^

ReferenceError: Cannot access 'DEFAULT_PRIORITY' before initialization
    at file://~/modules-demo/cycle/logger.js:3:44
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.19.0
```

Follow what Node.js did:

1. `main.js` imports `tasks.js`. Before running `tasks.js`, Node.js must run what *it* imports: `logger.js`.
2. `logger.js` imports `tasks.js`, which is already being loaded, so Node.js does not start it again. It runs `logger.js` first.
3. `logger.js` reads `DEFAULT_PRIORITY` on line 3, but the line in `tasks.js` that creates it has not run yet. That is the temporal dead zone from [Scope and how code runs](https://zudojs.oyinlola.site/learn/js-scope#hoisting), across two files.

This error message, "Cannot access ... before initialization" pointing at an *imported* name, is the typical sign of a circular import. CommonJS is worse: if you rewrite the same three files with `require`, nothing crashes. `require` returns the half-finished exports object, the value is quietly `undefined`, and you only get a warning:

Terminal on your computer

```bash
$ node main.cjs
[tasks, default priority undefined] created: Buy milk
(node:258000) Warning: Accessing non-existent property 'DEFAULT_PRIORITY' of module exports inside circular dependency
(Use `node --trace-warnings ...` to show where the warning was created)
```

### The fix: break the cycle

Move what both modules need into a third module that imports neither of them. Dependencies then point one way only:

constants.js

```ts
export const DEFAULT_PRIORITY = 3;
```

logger.js

```ts
import { DEFAULT_PRIORITY } from "./constants.js";

const prefix = `[tasks, default priority ${DEFAULT_PRIORITY}]`;

export function logChange(event, task) {
  console.log(`${prefix} ${event}: ${task.title}`);
}
```

tasks.js

```ts
import { DEFAULT_PRIORITY } from "./constants.js";
import { logChange } from "./logger.js";

export function createTask(title) {
  const task = { title, priority: DEFAULT_PRIORITY };
  logChange("created", task);
  return task;
}
```

main.js

```ts
import { createTask } from "./tasks.js";

createTask("Buy milk");
```

Output of `node main.js` and of the browser terminal

```json
[tasks, default priority 3] created: Buy milk
```

Now `main.js` → `tasks.js` → `logger.js` → `constants.js`, and `tasks.js` → `constants.js`. No arrow points back. Other ways to break a cycle: pass the value in as an argument instead of importing it, or merge two modules that cannot live without each other. [Module systems in depth](https://zudojs.oyinlola.site/learn/js-module-systems#circular) explains exactly how each system loads a cycle.

## Choosing a module structure

There are two common ways to arrange the files of a backend:

- **By technical type**: a `routes/` folder, a `services/` folder, a `models/` folder. Every feature is spread across all of them.
- **By feature**: a `tasks/` folder, a `users/` folder, each holding its own routes, service and store, with one `index.js` entry point.

```ts
src/
  main.js
  shared/
    errors.js
    constants.js
  tasks/
    index.js        public entry point
    service.js
    store.js
  users/
    index.js
    service.js
    store.js
```

Organising by feature scales better. Everything about tasks is in one place, a feature can be understood (or deleted) on its own, and the entry points keep features from reaching into each other's internals. A few rules keep it healthy:

- A feature imports another feature only through its `index.js`.
- Shared code lives in `shared/` and never imports from a feature. That rule alone prevents most circular dependencies.
- One module, one job. When a file grows past a screen or two, split it.

ZudoJS projects use this feature-based layout, and [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture) explains the layers inside each feature.

## Practice

TRY IT YOURSELF

### Split a file into modules

Move `formatTask` into its own file `format.js` as a named export, and `isOverdue` into `dates.js`. Import both into `main.js` and print the result for one task that is overdue.

**Show a solution**

format.js

```ts
export function formatTask(task) {
  return `${task.done ? "[x]" : "[ ]"} ${task.title}`;
}
```

dates.js

```ts
export function isOverdue(task, today) {
  return !task.done && task.due < today;
}
```

main.js

```ts
import { isOverdue } from "./dates.js";
import { formatTask } from "./format.js";

const task = { title: "File taxes", done: false, due: "2026-04-30" };
const warning = isOverdue(task, "2026-09-23") ? " (overdue)" : "";
console.log(formatTask(task) + warning);
```

Output of `node main.js` and of the browser terminal

```json
[ ] File taxes (overdue)
```

The dates are strings in `YYYY-MM-DD` form, which sort correctly as text, so `<` works on them.

TRY IT YOURSELF

### Read some CommonJS

Rewrite this CommonJS module and its user as ES modules with named exports.

old.cjsNode.js only

```ts
const LIMIT = 20;

function paginate(items, page) {
  return items.slice((page - 1) * LIMIT, page * LIMIT);
}

module.exports = { LIMIT, paginate };

// in another file:
// const { paginate } = require("./old.cjs");
```

**Show a solution**

paginate.js

```ts
export const LIMIT = 20;

export function paginate(items, page) {
  return items.slice((page - 1) * LIMIT, page * LIMIT);
}
```

main.js

```ts
import { LIMIT, paginate } from "./paginate.js";

const items = Array.from({ length: 45 }, (_, i) => i + 1);
console.log(LIMIT, paginate(items, 3));
```

Output of `node main.js` and of the browser terminal

```ts
20 [ 41, 42, 43, 44, 45 ]
```

TRY IT YOURSELF

### Spot the cycle

`users.js` imports `getTasksFor` from `tasks.js`, and `tasks.js` imports `findUser` from `users.js`. Both only use the imported function *inside* their own functions, never at the top level. Will it crash? Is it still a problem?

**Show a solution**

It will usually not crash. By the time any function is *called*, both modules have finished loading, so both imports are ready. Only code that runs at the top level while the modules are still loading, like the `prefix` line above, hits the error. It is still a warning sign: the two modules cannot be understood or tested separately, and the first top-level use of either import will break. Move the shared logic into a third module, or have one side receive the function as an argument.

## Recap

- Each file is a module with its own scope. `export` what others may use, and `import` it by relative path with the extension.
- Prefer named exports. A default export can be imported under any name, which makes code harder to search.
- `import { a as b }` renames an import, and `import * as ns` gathers all exports into one object.
- A module runs once, and every importer shares its state.
- CommonJS uses `require` and `module.exports` (`.cjs` files in an ES module project). An ES module can import CommonJS, and in Node.js 24 CommonJS can `require()` an ES module without top-level `await`. Read CommonJS, but write ES modules.
- Give each feature one public entry point, and keep its internals private.
- A circular import shows up as "Cannot access ... before initialization" (ESM) or a silent `undefined` (CommonJS). Break it by moving the shared part into a third module.

That completes JavaScript fundamentals. The next course, Algorithms and data structures, puts the language to work on problems where speed matters. It starts with [Big O and complexity](https://zudojs.oyinlola.site/learn/dsa-complexity): how to measure how code slows down as data grows.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
