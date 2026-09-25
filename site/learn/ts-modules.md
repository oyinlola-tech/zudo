---
title: "Modules in TypeScript — ZudoJS Academy"
description: "Split a project into files, import types with import type, write .js in import paths, and see how NodeNext, \"type\": \"module\" and \"exports\" fit together."
source: https://zudojs.oyinlola.site/learn/ts-modules
---

LEVEL 5 · LESSON 18 OF 23

Classes, modules and configuration Foundation

# Modules in TypeScript

Split a project into files, import types with import type, write .js in import paths, and see how NodeNext, "type": "module" and "exports" fit together.

- **40 min** to read and try
- **You need:** Classes in TypeScript, and the JavaScript modules lesson
- **You build:** A multi-file ts-modules project with src/ and dist/ folders, a barrel file and npm scripts to check, build and run it

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Lay out a project with src and dist using rootDir and outDir
- Import and re-export types with import type and export type, and explain TS1484
- Write .js in relative import paths and explain why TypeScript never rewrites them
- Explain how NodeNext, "type": "module" and a package's "exports" field decide what an import loads
- Set up check, build, start and dev scripts

## A project with src and dist

You learned `import` and `export` in [the JavaScript modules lesson](https://zudojs.oyinlola.site/learn/js-modules). TypeScript uses the same syntax, adds a few rules for types, and then the compiled JavaScript has to work in Node.js. This lesson builds a small project that shows every rule. Make a new folder next to `ts-tasks`:

Terminal on your computer

```bash
$ mkdir ts-modules
$ cd ts-modules
$ npm init -y
$ npm pkg set type=module
$ npm install -D typescript tsx @types/node
added 7 packages, and audited 8 packages in 7s

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
$ mkdir src
```

This time the source files live in `src/`, and the compiled JavaScript will go to `dist/`. That is the usual layout of a real project, ZudoJS packages included. Two new settings tell `tsc` about it:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "rootDir": "src",
    "outDir": "dist"
  }
}
```

- `rootDir`: where the `.ts` files are. The folder structure inside it is copied to `outDir`.
- `outDir`: where compiled `.js` files are written. There is no `noEmit` this time, because this project will be built. `npx tsc --noEmit` still only checks.

## Exporting and importing types

The first file holds the types and one value:

src/task.ts

```ts
export type Status = "todo" | "doing" | "done";

export interface Task {
  readonly id: number;
  title: string;
  status: Status;
}

export const STATUSES: readonly Status[] = ["todo", "doing", "done"];
```

You export a type exactly like a value. The difference is on the importing side. A type-only import is written `import type`:

src/store.ts

```ts
import type { Status, Task } from "./task.js";

const tasks: Task[] = [];

export function addTask(title: string): Task {
  const task: Task = { id: tasks.length + 1, title, status: "todo" };
  tasks.push(task);
  return task;
}

export function moveTask(id: number, status: Status): Task | undefined {
  const task = tasks.find((t) => t.id === id);
  if (task) task.status = status;
  return task;
}

export function allTasks(): readonly Task[] {
  return tasks;
}
```

When one import brings both a value and a type, mark just the type with `type` inside the braces:

src/format.ts

```ts
import { STATUSES, type Task } from "./task.js";

export function board(tasks: readonly Task[]): string {
  const lines = STATUSES.map((status) => {
    const titles = tasks.filter((t) => t.status === status).map((t) => t.title);
    return `${status}: ${titles.join(", ") || "-"}`;
  });
  return lines.join("\n");
}
```

Why the fuss? Remember that types are erased. `STATUSES` exists when the program runs; `Task` does not. With `verbatimModuleSyntax` on, TypeScript follows one simple rule: **an `import type` is removed, and every other import stays exactly as written**. So if you forget the `type`, the compiled file asks Node.js for an export that does not exist. The compiler stops you first:

src/oops.ts

```ts
import { STATUSES, Task } from "./task.js";

const task: Task = { id: 1, title: "Buy milk", status: "todo" };
console.log(task.title, STATUSES.length);
```

What `npx tsc --noEmit` prints

```ts
src/oops.ts:1:20 - error TS1484: 'Task' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.

1 import { STATUSES, Task } from "./task.js";
                     ~~~~


Found 1 error in src/oops.ts:1
```

And here is what happens if you run that file anyway, since `tsx` does not check types:

Terminal on your computer

```bash
$ npx tsx src/oops.ts
~/ts-modules/src/oops.ts:1
import { STATUSES, Task } from "./task.js";
                   ^
SyntaxError: The requested module './task.js' does not provide an export named 'Task'
    at #asyncInstantiate (node:internal/modules/esm/module_job:327:21)
…
Node.js v24.19.0
```

`STATUSES` is a real export of `task.js`, but `Task` was an interface, and the compiled `task.js` has no trace of it. Without `verbatimModuleSyntax`, TypeScript would guess which imports are types and drop them silently. The guess is usually right, but other tools that strip types, such as `tsx`, Node.js and the browser terminal, look at one file at a time and cannot guess. Being explicit makes every tool agree. That is why ZudoJS turns it on, and why this course has used `import type` since [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler#type-stripping).

## A barrel file

Other code should not need to know which file each function lives in. A **barrel** is an `index.ts` that re-exports the public parts of a folder, so there is one place to import from. Types are re-exported with `export type`:

src/index.ts

```ts
export type { Status, Task } from "./task.js";
export { STATUSES } from "./task.js";
export { addTask, allTasks, moveTask } from "./store.js";
export { board } from "./format.js";
```

Every ZudoJS package is built this way: each folder has an `index.ts` barrel, and `import { schema } from "@zudojs/schema"` reaches the top one. A barrel contains only exports, never logic. Now the program:

src/main.ts

```ts
import { addTask, allTasks, board, moveTask } from "./index.js";
import type { Task } from "./index.js";

const first: Task = addTask("Buy milk");
addTask("Call Ada");
addTask("File taxes");
moveTask(first.id, "done");
moveTask(2, "doing");
console.log(board(allTasks()));
```

Output of `npx tsx src/main.ts` and of the browser terminal

```ts
todo: File taxes
doing: Call Ada
done: Buy milk
```

## Why the imports say .js

REASON IT OUT

### Which file will the import load?

`src/main.ts` imports from `src/index.ts`. After `npx tsc`, Node.js will run `dist/main.js`. Before reading on, think:

1. Which files exist in `dist/` after the build, and which do not?
2. Node.js reads the import string in `dist/main.js` literally. Which file name must that string contain for the import to work?
3. Does `tsc` change import strings when it removes the types?
4. So which name should you write in `src/main.ts`: `./index`, `./index.ts` or `./index.js`?

**Show the reasoning**

1. Only `.js` files (and `.d.ts` or maps if you ask for them). No `.ts` file is copied to `dist`.
2. `./index.js`: Node's ES modules never add or guess an extension.
3. No. It removes types and leaves the rest of the code, import paths included, as you wrote it.
4. `./index.js`, the file that will exist when the code runs. `tsc` knows that `./index.js` is built from `./index.ts` and reads the types from there.

The files are called `store.ts` and `index.ts`, yet every import says `"./store.js"` and `"./index.js"`. This surprises everyone once. The reason: **TypeScript does not change import paths**. It removes types, and leaves the rest of your code as you wrote it. Build the project and look:

Terminal on your computer

```bash
$ npx tsc
$ ls dist
format.js
index.js
main.js
store.js
task.js
$ cat dist/main.js
import { addTask, allTasks, board, moveTask } from "./index.js";
const first = addTask("Buy milk");
addTask("Call Ada");
addTask("File taxes");
moveTask(first.id, "done");
moveTask(2, "doing");
console.log(board(allTasks()));
$ node dist/main.js
todo: File taxes
doing: Call Ada
done: Buy milk
```

`dist/main.js` imports `"./index.js"`, and there is a `dist/index.js` next to it, so Node.js finds it. The `import type` line is gone completely. When `tsc` checks `src/main.ts`, it knows that `./index.js` will be built from `./index.ts`, and reads that file's types. You write the path of the file that will **run**.

The other spellings do not work with `NodeNext`:

src/paths.ts

```ts
import { addTask } from "./store";
import { board } from "./format.ts";

console.log(board([addTask("Buy milk")]));
```

What `npx tsc --noEmit` prints

```ts
src/paths.ts:1:25 - error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './store.js'?

1 import { addTask } from "./store";
                          ~~~~~~~~~

src/paths.ts:2:23 - error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

2 import { board } from "./format.ts";
                        ~~~~~~~~~~~~~


Found 2 errors in the same file, starting at: src/paths.ts:1
```

- `"./store"` without an extension: Node's ES modules never guess file extensions, so neither does TypeScript. The error even suggests the fix.
- `"./format.ts"`: `dist/main.js` would then import a `.ts` file that does not exist in `dist`. (Newer TypeScript can rewrite `.ts` to `.js` while building, with the `rewriteRelativeImportExtensions` setting. That is what you would use to run the same files with `node src/main.ts`. This course sticks with `.js`, like ZudoJS.)
- A folder name alone, like `"./tasks"`, does not load `./tasks/index.js` in ES modules either. Write the full path.

## Module resolution and "type": "module"

**Module resolution** is how a tool turns an import string into a file. `"moduleResolution": "NodeNext"` tells TypeScript to use exactly Node's rules, so anything that passes `tsc` also loads in Node.js:

- A path starting with `./` or `../` is a file next to this one, with its full extension.
- Anything else, like `"@zudojs/schema"`, is a package in `node_modules`, found through its `package.json`.
- Whether a file is an ES module or old-style CommonJS depends on the nearest `package.json`: `"type": "module"` means ES modules. The file extensions `.mts` and `.cts` force one or the other, whatever `package.json` says.

See what happens when the `"type"` line is missing:

Terminal on your computer

```bash
$ npm pkg delete type
$ npx tsc --noEmit
src/format.ts:1:10 - error TS1295: ECMAScript imports and exports cannot be written in a CommonJS file under 'verbatimModuleSyntax'. Adjust the 'type' field in the nearest 'package.json' to make this file an ECMAScript module, or adjust your 'verbatimModuleSyntax', 'module', and 'moduleResolution' settings in TypeScript.

1 import { STATUSES, type Task } from "./task.js";
           ~~~~~~~~
…
Found 15 errors in 5 files.

Errors  Files
     2  src/format.ts:1
     5  src/index.ts:2
     4  src/main.ts:1
     3  src/store.ts:5
     1  src/task.ts:9
$ npm pkg set type=module
$ npx tsc --noEmit
```

Without `"type": "module"`, Node.js treats every `.js` file as CommonJS, so TypeScript does too, and `import`/`export` are not allowed. Fifteen errors, one fix: put the line back. Whenever you see TS1295 or TS1287, check `package.json` first.

## Packages and the "exports" field

When you import a package, TypeScript and Node.js read its `package.json`. Modern packages list their public entry points in the **`"exports"`** field. Here is the relevant part of `@zudojs/schema`'s `package.json`, the package whose `safeParse` you tried in [Generics](https://zudojs.oyinlola.site/learn/ts-generics#result) and which [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code) installs:

package.json

```json
{
  "name": "@zudojs/schema",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

- `"."` is the package's main entry: `import … from "@zudojs/schema"`.
- `"types"` is the file TypeScript reads. A `.d.ts` file (a **declaration file**) holds only types; `tsc` writes one next to each `.js` file when a package is built with the `declaration` setting.
- `"import"` is the file Node.js runs for an `import`.

Anything not listed in `"exports"` is private to the package, even though the file is right there in `node_modules`. Reaching into it is refused by both tools:

deep-import.ts

```ts
import { schema } from "@zudojs/schema/dist/schemaRoot/index.js";

console.log(schema.string().parse("Buy milk"));
```

What `npx tsc --noEmit` prints

```ts
deep-import.ts:1:24 - error TS2307: Cannot find module '@zudojs/schema/dist/schemaRoot/index.js' or its corresponding type declarations.

1 import { schema } from "@zudojs/schema/dist/schemaRoot/index.js";
                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in deep-import.ts:1
```

Node.js reports the same thing at runtime as `ERR_PACKAGE_PATH_NOT_EXPORTED`. That is a feature: a package author can reorganise internal files without breaking your code, because you could only ever use what `"exports"` promised. Import from the package name.

## Scripts for check, build and run

Put the commands in `package.json` so nobody has to remember them. With `npm pkg set`, or by editing the file, add four scripts:

package.json

```json
{
  "name": "ts-modules",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "check": "tsc --noEmit",
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "tsx src/main.ts"
  },
  "devDependencies": {
    "@types/node": "^26.6.2",
    "tsx": "^4.23.15",
    "typescript": "^7.0.2"
  }
}
```

Terminal on your computer

```bash
$ npm run check

> ts-modules@1.0.0 check
> tsc --noEmit

$ npm run build

> ts-modules@1.0.0 build
> tsc

$ npm start

> ts-modules@1.0.0 start
> node dist/main.js

todo: File taxes
doing: Call Ada
done: Buy milk
```

`npm run dev` runs the source with `tsx` while you work; `check` and `build` before you ship; `start` runs the built JavaScript, which is what a server does in production. A project created by the ZudoJS CLI comes with scripts like these; there, the check script is called `typecheck`. Add `dist/` to your `.gitignore`, as you learned in [the Git lesson](https://zudojs.oyinlola.site/learn/git): it is generated, so it does not belong in the repository.

## Practice

TRY IT YOURSELF

### Add a module

Add `src/stats.ts` with a function `countByStatus(tasks: readonly Task[])` that returns a `Record<Status, number>`. Export it from the barrel, use it in `main.ts`, and check that `npm run check` and `npm run build` pass.

**Show a solution**

src/task.ts

```ts
export type Status = "todo" | "doing" | "done";

export interface Task {
  readonly id: number;
  title: string;
  status: Status;
}
```

src/stats.ts

```ts
import type { Status, Task } from "./task.js";

export function countByStatus(tasks: readonly Task[]): Record<Status, number> {
  const counts: Record<Status, number> = { todo: 0, doing: 0, done: 0 };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}
```

src/main.ts

```ts
import { countByStatus } from "./stats.js";
import type { Task } from "./task.js";

const tasks: Task[] = [
  { id: 1, title: "Buy milk", status: "done" },
  { id: 2, title: "Call Ada", status: "todo" },
  { id: 3, title: "File taxes", status: "todo" },
];
console.log(countByStatus(tasks));
```

Output of `npx tsx src/main.ts` and of the browser terminal

```json
{ todo: 2, doing: 0, done: 1 }
```

In your project, add `export { countByStatus } from "./stats.js";` to `src/index.ts` and import it from `"./index.js"` in `main.ts`. `stats.ts` only needs `import type`, because it uses `Task` and `Status` only as types.

TRY IT YOURSELF

### Which imports are wrong?

With `NodeNext` and `verbatimModuleSyntax`, which of these lines does `tsc` reject, and how do you fix each one?

```ts
import { Task } from "./task.js";
import { addTask } from "./store.js";
import { board } from "./format";
import type { STATUSES } from "./task.js";
import { schema } from "@zudojs/schema";
```

**Show a solution**

- Line 1 is rejected (TS1484): `Task` is a type. Write `import type { Task }`.
- Line 2 is correct.
- Line 3 is rejected (TS2835): write `"./format.js"`.
- Line 4 compiles, but `STATUSES` can then only be used as a type: `STATUSES.map(…)` would be an error, because an `import type` is removed before the code runs. A value needs a normal import.
- Line 5 is correct, once the package is installed: it uses the package's `"exports"` entry.

## Recap

- Import types with `import type` (or `type` inside the braces), and re-export them with `export type`. `verbatimModuleSyntax` enforces it, so every tool agrees on what is removed.
- TypeScript never changes import paths. Write the `.js` name of the file that will run; `tsc` maps it to the `.ts` file.
- `NodeNext` follows Node's rules: full relative paths, packages through `node_modules`, and `"type": "module"` for ES modules.
- A package's `"exports"` field lists what you may import; everything else is private.
- `rootDir`/`outDir` separate `src/` from `dist/`; `check`, `build`, `start` and `dev` scripts run the whole workflow.

Next: [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig), every compiler option you will meet in a real project, and the bug each one prevents.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
