---
title: "From JavaScript to TypeScript"
description: "Install TypeScript, turn a JavaScript file into TypeScript, and watch the compiler catch a bug that JavaScript ran without complaint."
source: https://zudojs.oyinlola.site/learn/ts-setup
---

LESSON 6 OF 10

From JavaScript to TypeScript

# From JavaScript to TypeScript

Install TypeScript, turn a JavaScript file into TypeScript, and watch the compiler catch a bug that JavaScript ran without complaint.

- **25 min** to read and try
- **You need:** Lessons 1 to 5
- **You build:** A TypeScript project with tsx and tsc set up

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

The property is spelled `titel`. JavaScript did not complain. It read a property that does not exist, got `undefined`, and printed it. In a real API that `undefined` would be sent to users or saved to the database, and nobody would notice until much later.

**TypeScript** is JavaScript plus **types**: notes that say what shape each value has. A program called the **compiler** reads those notes and reports mistakes like this before the code ever runs. ZudoJS is written in TypeScript, and so is the rest of this course.

## Install TypeScript

Make a new project folder for the TypeScript lessons:

Terminal on your computer

```bash
$ mkdir ts-tasks
$ cd ts-tasks
$ npm init -y
$ npm pkg set type=module
$ npm install -D typescript tsx @types/node
added 7 packages, and audited 8 packages in 10s

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

Three packages, installed as **dev dependencies** (`-D`), meaning tools you use while writing code, not code your app needs to run:

- `typescript` gives you `tsc`, the TypeScript compiler. It checks your types.
- `tsx` runs a `.ts` file directly, like `node` runs a `.js` file.
- `@types/node` describes Node.js itself to TypeScript, for example what `console.log` accepts.

> ABOUT THAT WARNING
>
> Recent versions of npm ask before running a package's install script. `esbuild`, which `tsx` uses, has one that only double-checks its download. `tsx` works without it. If you want the warning gone, run `npm install-scripts approve esbuild`, which records your approval in `package.json`. Your version numbers and timings may differ from the ones shown.

Check both tools:

Terminal on your computer

```bash
$ npx tsc --version
Version 7.0.2
$ npx tsx --version
tsx v4.23.15
node v24.19.0
```

`npx` runs a program from your project's `node_modules` folder, so you do not need to install anything globally.

## Tell TypeScript about your project

The compiler reads its settings from `tsconfig.json`. Create it in the project folder:

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

What the settings mean:

| Setting | Why |
| --- | --- |
| `target`, `module`, `moduleResolution` | Modern JavaScript and Node.js ES modules, the same as your `package.json` says. |
| `strict` | Turns on every safety check. Always use it. It is what makes TypeScript worth having. |
| `noEmit` | `tsc` only checks; it writes no files. `tsx` does the running. |
| `skipLibCheck`, `types` | Skip checking installed packages' own type files, and load the Node.js types you installed. |
| `verbatimModuleSyntax` | Makes you mark imports that are only types with `import type`. ZudoJS code follows this rule. |

## Your first TypeScript file

Save the same code as `report.ts`, and add one thing: a **type** that describes a task, and a note on the parameter saying `task` is one of those.

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

Run the compiler. `--noEmit` is already in `tsconfig.json`, but writing it keeps the command's meaning clear:

Terminal on your computer

```bash
$ npx tsc --noEmit
```

It prints the error shown above. It names the file, line 10 and column 30, marks the exact spot with `~~~~~`, and even suggests the fix: *Did you mean 'title'?* The bug was caught without running the program at all.

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

The workflow for the rest of the course is these two commands: `tsc` to check, `tsx` to run.

## Types disappear when the code runs

Types exist only for the compiler. `tsx` removes them and runs what is left, which is ordinary JavaScript. That has two consequences:

- **tsx does not check types.** It will happily run `report.ts` with the typo in it and print `undefined`. Only `tsc` checks. Run it before you trust your code.
- **The browser terminal does not check types either.** It removes them the same way `tsx` does. Type errors only show on your computer, with `npx tsc --noEmit`.

> TIP
>
> VS Code runs the TypeScript checker as you type. The typo above gets a red squiggle the moment you write it, which is the fastest feedback of all.

There is one more consequence, and it matters a lot for a backend: types cannot check data that arrives while the program is running, such as a request from a user. Lesson 8 shows the problem and lesson 9 solves it with ZudoJS.

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

## Recap

- TypeScript adds types to JavaScript. The compiler, `tsc`, uses them to catch mistakes before the code runs.
- `npm install -D typescript tsx @types/node`, plus a `tsconfig.json` with `strict` on, sets up a project.
- `npx tsc --noEmit` checks. `npx tsx file.ts` runs. Running does not check.
- Types are removed before the code runs, so they cannot check data that arrives at runtime.
