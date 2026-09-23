---
title: "Describing data with types"
description: "Annotate variables and functions, describe a task with type aliases and interfaces, and use optional, readonly and literal types to make wrong data impossible to write."
source: https://zudojs.oyinlola.site/learn/ts-types
---

LESSON 7 OF 10

From JavaScript to TypeScript

# Describing data with types

Annotate variables and functions, describe a task with type aliases and interfaces, and use optional, readonly and literal types to make wrong data impossible to write.

- **30 min** to read and try
- **You need:** The ts-tasks project from lesson 6
- **You build:** A fully typed task module

## Annotations and inference

An **annotation** is a colon and a type after a name. You can annotate variables, parameters and return values:

annotate.ts

```ts
const title: string = "Buy milk";
const priority: number = 2;
const done: boolean = false;

function label(title: string, priority: number): string {
  return `${title} (P${priority})`;
}

console.log(label(title, priority), done);
```

Output of `npx tsx annotate.ts` and of the browser terminal

```ts
Buy milk (P2) false
```

Most of the time you do not need to write the type of a variable, because TypeScript works it out from the value. That is **type inference**:

infer.ts

```ts
const title = "Buy milk";     // TypeScript knows: a string
let count = 0;                // a number
const tags = ["home", "shop"]; // an array of strings

count = count + tags.length;
console.log(title, count);
```

Output of `npx tsx infer.ts` and of the browser terminal

```ts
Buy milk 2
```

The rule of thumb: **always annotate function parameters**, because TypeScript cannot guess what callers will pass. Let it infer the rest. Annotate a return type when you want the compiler to check that the function really returns what you promised.

## Describing a task

You met a **type alias** in lesson 6: `type Task = { ... }`. An **interface** does the same job for objects, with slightly different syntax. ZudoJS uses interfaces for most public shapes, so you will see both.

task.ts

```ts
export interface Task {
  readonly id: number;
  title: string;
  done: boolean;
  dueDate?: string;
}

export const example: Task = { id: 1, title: "Buy milk", done: false };
```

Two new marks:

- `readonly id`: once a task exists, nobody may change its id.
- `dueDate?`: the question mark makes the property **optional**. A task may have a due date or not. Its type is `string | undefined`.

Now the compiler guards the task for you:

guard.tsNode.js only

```ts
import type { Task } from "./task.js";

const task: Task = { id: 1, title: "Buy milk", done: false };

task.id = 2;
task.done = "yes";
const other: Task = { id: 2, title: "Call Ada" };
```

What `npx tsc --noEmit` prints

```ts
guard.ts:5:6 - error TS2540: Cannot assign to 'id' because it is a read-only property.

5 task.id = 2;
       ~~

guard.ts:6:1 - error TS2322: Type 'string' is not assignable to type 'boolean'.

6 task.done = "yes";
  ~~~~~~~~~

guard.ts:7:7 - error TS2741: Property 'done' is missing in type '{ id: number; title: string; }' but required in type 'Task'.

7 const other: Task = { id: 2, title: "Call Ada" };
        ~~~~~

  task.ts:4:3 - 'done' is declared here.
    4   done: boolean;
        ~~~~


Found 3 errors in the same file, starting at: guard.ts:5
```

Three mistakes, three errors: changing a `readonly` id, putting a string where a boolean belongs, and leaving out a required property.

Notice `import type`: `Task` is only a type, so it is imported with `import type`, as your `tsconfig.json` requires. Also notice that the import path is `"./task.js"`, even though the file is `task.ts`. With Node.js modules, you always write the name of the JavaScript file it will run as.

## Working with optional values

An optional property might be `undefined`, and the compiler will not let you forget it:

optional.ts

```ts
import type { Task } from "./task.js";

function dueLabel(task: Task): string {
  if (task.dueDate === undefined) {
    return "no due date";
  }
  return `due ${task.dueDate.slice(0, 10)}`;
}

console.log(dueLabel({ id: 1, title: "Buy milk", done: false }));
console.log(dueLabel({ id: 2, title: "File taxes", done: false, dueDate: "2026-04-30T12:00:00Z" }));
const call: Task = { id: 3, title: "Call Ada", done: false };
console.log(call.dueDate?.length);
console.log(call.dueDate ?? "whenever you like");
```

Output of `npx tsx optional.ts` and of the browser terminal

```ts
no due date
due 2026-04-30
undefined
whenever you like
```

Inside the `if`, TypeScript knows the date is missing, and after it, TypeScript knows it is a string, so `.slice` is allowed. Two shortcuts help with optional values:

- `value?.length` (optional chaining) gives `undefined` instead of crashing when `value` is missing.
- `a ?? b` (nullish coalescing) gives `b` only when `a` is `null` or `undefined`.

## Only these values allowed

A task that is `done: true` or `false` is too simple. Real teams want *todo*, *doing* and *done*. A **literal type** is a type with exactly one value, and a **union** (`|`) combines several. Together they say "only one of these strings":

status.ts

```ts
type Status = "todo" | "doing" | "done";

interface Task {
  readonly id: number;
  title: string;
  status: Status;
}

function advance(task: Task): Task {
  const next: Record<Status, Status> = { todo: "doing", doing: "done", done: "done" };
  return { ...task, status: next[task.status] };
}

let task: Task = { id: 1, title: "Write report", status: "todo" };
task = advance(task);
console.log(task.status);
task = advance(advance(task));
console.log(task.status);
```

Output of `npx tsx status.ts` and of the browser terminal

```ts
doing
done
```

`Record<Status, Status>` means "an object with a key for every status, and a status as each value". If you add a fourth status to the union later, the compiler will point at this object until you handle it. That is how types keep a growing codebase honest.

typo.tsNode.js only

```ts
type Status = "todo" | "doing" | "done";

const status: Status = "finished";
```

What `npx tsc --noEmit` prints

```ts
typo.ts:3:7 - error TS2322: Type '"finished"' is not assignable to type 'Status'.

3 const status: Status = "finished";
        ~~~~~~


Found 1 error in typo.ts:3
```

## Typing functions

A function's type lists its parameters and its return type. Here is the start of a typed task store, similar to the one from lesson 5, now in TypeScript:

store.ts

```ts
import type { Task } from "./task.js";

const tasks: Task[] = [];
let nextId = 1;

export function addTask(title: string, dueDate?: string): Task {
  const task: Task = { id: nextId, title, done: false };
  if (dueDate !== undefined) {
    task.dueDate = dueDate;
  }
  nextId += 1;
  tasks.push(task);
  return task;
}

export function findTask(id: number): Task | undefined {
  return tasks.find((task) => task.id === id);
}

addTask("Buy milk");
addTask("File taxes", "2026-04-30");
console.log(findTask(2));
console.log(findTask(9));
```

Output of `npx tsx store.ts` and of the browser terminal

```json
{ id: 2, title: 'File taxes', done: false, dueDate: '2026-04-30' }
undefined
```

- `Task[]` means "an array of tasks".
- `dueDate?: string` makes the parameter optional.
- `Task | undefined` is honest: the task might not exist. Every caller now has to deal with that case, and the compiler checks that they do.

## Practice

TRY IT YOURSELF

### Add a priority

Add a `priority` property to a task that can only be `"low"`, `"normal"` or `"high"`. Write `sortByPriority(tasks)` that returns a new array with high-priority tasks first. Check it with `tsc` and run it.

**Show a solution**

priority.ts

```ts
type Priority = "low" | "normal" | "high";

interface Task {
  readonly id: number;
  title: string;
  priority: Priority;
}

const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => rank[a.priority] - rank[b.priority]);
}

const tasks: Task[] = [
  { id: 1, title: "Water plants", priority: "low" },
  { id: 2, title: "Fix login bug", priority: "high" },
  { id: 3, title: "Write report", priority: "normal" },
];

console.log(sortByPriority(tasks).map((t) => t.title));
```

Output of `npx tsx priority.ts` and of the browser terminal

```json
[ 'Fix login bug', 'Write report', 'Water plants' ]
```

`[...tasks]` copies the array first, because `sort` changes the array it is called on.

## Recap

- Annotate parameters; let TypeScript infer the rest.
- `interface` and `type` describe objects. `readonly` blocks changes, `?` marks optional properties.
- Literal types and unions (`"todo" | "doing" | "done"`) make invalid values impossible to write.
- `Task | undefined` forces every caller to handle "not found".
