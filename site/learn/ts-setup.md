---
title: "Why TypeScript exists — ZudoJS Academy"
description: "See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24."
source: https://zudojs.oyinlola.site/learn/ts-setup
---

LEVEL 5 · LESSON 1 OF 23

Why TypeScript Foundation

# Why TypeScript exists

See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24.

- **35 min** to read and try
- **You need:** The JavaScript, Node.js and npm lessons
- **You build:** A ts-tasks project you can check with tsc, run with tsx or node, and compile to JavaScript

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what TypeScript adds to JavaScript and what tsc does
- Install TypeScript, tsx and @types/node and write a short tsconfig.json
- Read a tsc error: file, line, column, error code and message
- Annotate function parameters and let inference type the rest
- Choose between tsc, tsx and node file.ts, and say which of them checks types

## A bug JavaScript lets through

Here is a small piece of the Task API in plain JavaScript. Read it carefully before you run it. There is a mistake.

report.js

```ts
const task = { id: 1, title: "Buy milk", done: false };

function report(task) {
  return `#${task.id} ${task.titel} (${task.done ? "done" : "open"})`;
}

console.log(report(task));
```

Output of `node report.js` and of the browser terminal

```ts
#1 undefined (open)
```

The property is spelled `titel`. JavaScript did not complain. It read a property that does not exist, got `undefined`, and printed it. You saw this trap in [the objects lesson](https://zudojs.oyinlola.site/learn/js-data). In a real API that `undefined` would be sent to users or saved to the database, and nobody would notice until much later.

JavaScript finds mistakes like this only while the program runs, and only on the lines that actually run. A test can catch it (you will write tests in [Testing fundamentals](https://zudojs.oyinlola.site/learn/testing-basics), in the backend course), but only if somebody wrote that test. In a big codebase, with many people changing code every day, that is not enough.

## What TypeScript adds

**TypeScript** is JavaScript plus **types**: notes in the code that say what shape each value has. A program called the **compiler**, `tsc`, reads the notes and reports mistakes before the code ever runs. This is called **type checking**, and because it happens without running the code, it is also called **static** checking.

|  | JavaScript | TypeScript |
| --- | --- | --- |
| File name | `report.js` | `report.ts` |
| Types | Values have types, but the code does not say which | You write them, or the compiler works them out |
| Mistakes found | While the program runs | Before it runs, by `tsc` or your editor |
| What Node.js runs | The file itself | JavaScript: the same file with the types removed |

Every JavaScript feature you know still works. TypeScript only adds the type notes, and removes them again before the code runs. That is why ZudoJS, like most large Node.js projects today, is written in TypeScript: the compiler checks every call between thousands of files each time you save.

## Install TypeScript

Make a new project folder for the TypeScript lessons. You will use it until the end of this part of the course:

Terminal on your computer

```bash
$ mkdir ts-tasks
$ cd ts-tasks
$ npm init -y
$ npm pkg set type=module
$ npm install -D typescript tsx @types/node
added 7 packages, and audited 8 packages in 5s

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

You installed three packages as **dev dependencies** (`-D`), which you met in [the npm lesson](https://zudojs.oyinlola.site/learn/npm-packages): tools you use while writing code, not code your app needs to run.

- `typescript` gives you `tsc`, the TypeScript compiler. It checks your types, and it can turn `.ts` files into `.js` files.
- `tsx` runs a `.ts` file directly, like `node` runs a `.js` file.
- `@types/node` describes Node.js itself to TypeScript, for example what `console.log` and `node:fs` accept.

> ABOUT THAT WARNING
>
> Recent versions of npm ask before running a package's install script. `esbuild`, which `tsx` uses, has one that only double-checks its download. `tsx` works without it. If you want the warning gone, run `npm install-scripts approve esbuild`, which records your approval in `package.json`. Your version numbers and timings may differ from the ones shown.

Check the tools:

Terminal on your computer

```bash
$ npx tsc --version
Version 7.0.2
$ npx tsx --version
tsx v4.23.15
node v24.19.0
```

`npx` runs a program from your project's `node_modules` folder, so you do not need to install anything globally. TypeScript 7 is the first version with the new native compiler, which checks a large project many times faster than before.

## Tell TypeScript about your project

The compiler reads its settings from a file called `tsconfig.json` in the project folder. `npx tsc --init` writes a long one full of comments. You will write a short one instead, so you know what every line does:

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "verbatimModuleSyntax": true
  }
}
```

What each setting means:

| Setting | What it does |
| --- | --- |
| `target` | Which JavaScript version to produce. `ES2024` is modern JavaScript that Node.js 24 runs as it is, so the compiler does not rewrite your code into older syntax. |
| `module` | Which kind of modules to produce. `NodeNext` means "whatever Node.js does": ES modules here, because `package.json` says `"type": "module"`. |
| `moduleResolution` | How `import` paths are found. `NodeNext` uses Node's own rules. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules) explains them. |
| `strict` | Turns on every safety check, for example "this value might be `undefined`". Always use it. It is what makes TypeScript worth having. |
| `noEmit` | `tsc` only checks; it writes no files. Something else does the running. |
| `skipLibCheck` | Do not re-check the type files of installed packages. They were checked when they were published, and skipping them makes `tsc` faster. |
| `types` | Which installed type packages to load. `["node"]` loads `@types/node`, so TypeScript knows `process`, `Buffer` and `node:fs`. |
| `verbatimModuleSyntax` | Makes you mark imports that are only types with `import type`. ZudoJS code follows this rule, and [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules) shows why. |

## Your first TypeScript file

Save the same code as `report.ts`, and add one thing: a **type** that describes a task, and a note on the parameter saying `task` is one of those. The note is called an **annotation**: a colon and a type after a name.

report.ts

```ts
type Task = {
  id: number;
  title: string;
  done: boolean;
};

const task: Task = { id: 1, title: "Buy milk", done: false };

function report(task: Task): string {
  return `#${task.id} ${task.titel} (${task.done ? "done" : "open"})`;
}

console.log(report(task));
```

What `npx tsc --noEmit` prints

```ts
report.ts:10:30 - error TS2551: Property 'titel' does not exist on type 'Task'. Did you mean 'title'?

10   return `#${task.id} ${task.titel} (${task.done ? "done" : "open"})`;
                                ~~~~~

  report.ts:3:3 - 'title' is declared here.
    3   title: string;
        ~~~~~


Found 1 error in report.ts:10
```

Run the compiler. `noEmit` is already in `tsconfig.json`, but writing `--noEmit` keeps the command's meaning clear:

Terminal on your computer

```bash
$ npx tsc --noEmit
```

It prints the error shown above. It names the file, line 10 and column 30, marks the exact spot with `~~~~~`, and even suggests the fix: *Did you mean 'title'?* Every error also has a number, here `TS2551`. Search for it when a message is unclear. The bug was caught without running the program at all.

Fix the typo and check again. When `tsc` prints nothing, there are no errors. Then run the file with `tsx`:

report.ts

```ts
type Task = {
  id: number;
  title: string;
  done: boolean;
};

const task: Task = { id: 1, title: "Buy milk", done: false };

function report(task: Task): string {
  return `#${task.id} ${task.title} (${task.done ? "done" : "open"})`;
}

console.log(report(task));
```

Output of `npx tsx report.ts` and of the browser terminal

```ts
#1 Buy milk (open)
```

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx report.ts
#1 Buy milk (open)
```

`type Task = { ... }` gives a name to an object shape. [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects) and [Type aliases and interfaces](https://zudojs.oyinlola.site/learn/ts-aliases-interfaces) cover the ways to name types. The `: string` after the parameter list is the **return type**: the compiler checks that `report` really returns a string.

## You do not have to write every type

TypeScript works out most types from the values. This is called **type inference**. None of these variables has an annotation, and all of them are still checked:

infer.ts

```ts
const title = "Buy milk";
let count = 0;
const tags = ["home", "shop"];

count = count + tags.length;
console.log(title.toUpperCase(), count, tags.join("+"));
```

Output of `npx tsx infer.ts` and of the browser terminal

```ts
BUY MILK 2 home+shop
```

The compiler knows `title` is a string, `count` a number and `tags` an array of strings. So it refuses a wrong value later:

infer.ts

```ts
let count = 0;
count = "none";

const tags = ["home", "shop"];
tags.push(42);
```

What `npx tsc --noEmit` prints

```ts
infer.ts:2:1 - error TS2322: Type 'string' is not assignable to type 'number'.

2 count = "none";
  ~~~~~

infer.ts:5:11 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

5 tags.push(42);
            ~~


Found 2 errors in the same file, starting at: infer.ts:2
```

The rule of thumb for the rest of the course: **annotate function parameters**, because TypeScript cannot guess what callers will pass, and **let it infer the rest**. In VS Code, hold the mouse over any name to see the type TypeScript inferred for it.

## Three ways to run TypeScript

Node.js was built to run JavaScript. There are three ways to get from `report.ts` to a running program, and you will see all three in real projects.

### 1. tsx: run it directly

You already did this: `npx tsx report.ts`. `tsx` removes the types in memory and hands the JavaScript to Node.js. It is fast, understands every TypeScript feature, and is what this course uses while you develop.

### 2. node: built-in type stripping

Node.js 24 can run many `.ts` files itself. It uses a feature called **type stripping**: it replaces the types with spaces and runs what is left.

Terminal on your computer

```bash
$ node --version
v24.19.0
$ node report.ts
#1 Buy milk (open)
```

This only works for **erasable** syntax: TypeScript where deleting the types leaves valid JavaScript. A few older TypeScript features generate code instead, and Node.js refuses them. An `enum` is one:

status.ts

```ts
enum Status {
  Todo,
  Done,
}

console.log(Status.Done);
```

Output of `npx tsx status.ts` and of the browser terminal

```ts
1
```

Terminal on your computer

```bash
$ npx tsx status.ts
1
$ node status.ts
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

file://~/ts-tasks/status.ts:1
  > enum Status {
      Todo,
      Done,
  > }

SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode
    at parseTypeScript (node:internal/modules/typescript:68:40)
…
Node.js v24.19.0
```

The limits of `node file.ts`:

- **It does not check types.** Neither does `tsx`. Only `tsc` checks.
- **Erasable syntax only.** No `enum`, no `namespace`, no parameter properties (you will meet those in [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes)). This course avoids `enum`; a union of strings does the same job, as [Enums and their alternatives](https://zudojs.oyinlola.site/learn/ts-enums) shows.
- **It ignores `tsconfig.json`.**
- **Imports must name the `.ts` file.** `tsx` and `tsc` accept `import … from "./store.js"` for a file called `store.ts`; `node` does not. [Modules in TypeScript](https://zudojs.oyinlola.site/learn/ts-modules) explains why the course writes `.js`.

> UNKNOWN FILE EXTENSION .TS?
>
> Some Linux distributions build their own Node.js package without type stripping. There, `node report.ts` fails with `Unknown file extension ".ts"`. Install Node.js from nodejs.org, or use `tsx`, which works everywhere.

### 3. tsc: compile to JavaScript

For production, you usually compile once and run plain JavaScript: nothing has to remove types while the server starts, and you run exactly the files you tested. Turn `noEmit` off for one run and tell `tsc` where to write the output:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
$ ls dist
report.js
```

This is the file `tsc` wrote:

dist/report.js

```ts
const task = { id: 1, title: "Buy milk", done: false };
function report(task) {
    return `#${task.id} ${task.title} (${task.done ? "done" : "open"})`;
}
console.log(report(task));
export {};
```

Terminal on your computer

```bash
$ node dist/report.js
#1 Buy milk (open)
```

Look at `dist/report.js`. The `type Task` block is gone, and so are `: Task` and `: string`. What is left is the JavaScript you started with, with the typo fixed. The last line, `export {};`, keeps the file an ES module even though it exports nothing. `tsc` refuses to write output only when you ask it to (`noEmitOnError`); by default it writes the JavaScript even when there are type errors, so always read what it prints.

| Command | Checks types? | Use it for |
| --- | --- | --- |
| `npx tsc --noEmit` | Yes | Checking, before every commit and in CI |
| `npx tsx file.ts` | No | Running while you develop |
| `node file.ts` | No | Quick scripts with erasable syntax only |
| `npx tsc` + `node dist/file.js` | Yes | Building for production |

REASON IT OUT

### Which command runs, and which one checks?

A small team runs its Task API in production with `npx tsx src/server.ts`. A teammate says: "We use TypeScript, so a type error can never reach our users." Before reading the answer, think it through:

1. Which of the commands in the table ever reads your types and reports a mistake?
2. A typo like `task.titel` is pushed on Friday evening. What happens when the server restarts with `tsx`?
3. Where should `npx tsc --noEmit` run so that the typo is caught before it is deployed?
4. Is the teammate's sentence ever true? What would have to change?

**Show the reasoning**

1. Only `tsc` (and your editor, which runs the same checker in the background). `tsx` and `node` remove the types and run the rest without looking at them.
2. The server starts normally and prints `undefined` wherever the title should be, exactly like the JavaScript version at the top of this lesson. Nothing fails until a user notices.
3. Before every commit, and as a required step in CI (the server that tests every push), so that code with a type error cannot be merged or deployed at all.
4. Only when a failing `tsc` blocks the deploy. TypeScript's safety is a step you run, not a property of the files. [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler), the next lesson, builds package scripts that make that step impossible to skip.

## Types disappear when the code runs

You just saw it in `dist/report.js`: types exist only for the compiler. That has two consequences:

- **Running does not check.** `tsx` and `node` will happily run `report.ts` with the typo in it and print `undefined`. Run `npx tsc --noEmit` before you trust your code.
- **The browser terminal on this page does not check either.** It removes types the same way `tsx` does. Type errors only show on your computer, with `npx tsc --noEmit`, or in your editor.

> TIP
>
> VS Code runs the TypeScript checker as you type. The typo above gets a red squiggle the moment you write it, which is the fastest feedback of all.

There is one more consequence, and it matters a lot for a backend: types cannot check data that arrives while the program is running, such as a request from a user. [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime) and [Runtime validation](https://zudojs.oyinlola.site/learn/ts-validation), near the end of this course, deal with that.

## Practice

TRY IT YOURSELF

### Let the compiler find three bugs

This file has three mistakes. Save it as `bugs.ts` in your project and run `npx tsc --noEmit`. Read each error, fix it, and run the file with `npx tsx bugs.ts`.

bugs.tsNode.js only

```ts
type Task = {
  id: number;
  title: string;
  done: boolean;
};

const task: Task = { id: "1", title: "Buy milk", done: false };

function complete(task: Task): Task {
  return { ...task, done: "yes" };
}

console.log(complete(task, true).title);
```

What `npx tsc --noEmit` prints

```ts
bugs.ts:7:22 - error TS2322: Type 'string' is not assignable to type 'number'.

7 const task: Task = { id: "1", title: "Buy milk", done: false };
                       ~~

  bugs.ts:2:3 - The expected type comes from property 'id' which is declared here on type 'Task'
    2   id: number;
        ~~

bugs.ts:10:21 - error TS2322: Type 'string' is not assignable to type 'boolean'.

10   return { ...task, done: "yes" };
                       ~~~~

  bugs.ts:4:3 - The expected type comes from property 'done' which is declared here on type 'Task'
    4   done: boolean;
        ~~~~

bugs.ts:13:28 - error TS2554: Expected 1 arguments, but got 2.

13 console.log(complete(task, true).title);
                              ~~~~


Found 3 errors in the same file, starting at: bugs.ts:7
```

**Show a solution**

bugs.ts

```ts
type Task = {
  id: number;
  title: string;
  done: boolean;
};

const task: Task = { id: 1, title: "Buy milk", done: false };

function complete(task: Task): Task {
  return { ...task, done: true };
}

console.log(complete(task).title);
```

Output of `npx tsx bugs.ts` and of the browser terminal

```ts
Buy milk
```

TRY IT YOURSELF

### Compile it and read the JavaScript

Compile your fixed `bugs.ts` to a `dist` folder and run the result with `node`. Before you open `dist/bugs.js`, guess which lines of your file will be different in it.

**Show a solution**

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
$ node dist/bugs.js
Buy milk
```

In `dist/bugs.js`, the whole `type Task` block is gone, and so are the three annotations: `: Task` after `task`, and `: Task` twice in the `complete` line. Everything else is the same code you wrote.

TRY IT YOURSELF

### Which one is not erasable?

Two of these lines run with `node file.ts` and one does not. Which one, and why?

```ts
const limit: number = 10;
enum Priority { Low, High }
function double(n: number): number { return n * 2; }
```

**Show a solution**

The `enum`. Deleting the types from the other two lines leaves valid JavaScript (`const limit = 10;` and `function double(n) { return n * 2; }`). An `enum` has no JavaScript equivalent, so TypeScript must generate an object for it, and Node's type stripping does not generate code. Use `tsx`, or write a union of strings instead: `type Priority = "low" | "high"`.

## Recap

- TypeScript adds types to JavaScript. The compiler, `tsc`, uses them to catch mistakes before the code runs.
- `npm install -D typescript tsx @types/node`, plus a `tsconfig.json` with `strict` on, sets up a project.
- Annotate function parameters; let TypeScript infer the rest.
- `npx tsc --noEmit` checks. `npx tsx file.ts` runs. `node file.ts` runs erasable TypeScript. `tsc` without `noEmit` compiles to `.js`. Only `tsc` checks.
- Types are removed before the code runs, so they cannot check data that arrives at runtime.

Next: [What the TypeScript compiler does](https://zudojs.oyinlola.site/learn/ts-compiler), where you look underneath all three ways of running TypeScript.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
