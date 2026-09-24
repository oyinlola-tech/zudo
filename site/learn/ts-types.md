---
title: "Basic types"
description: "The everyday types of TypeScript - strings, numbers, booleans, arrays, tuples and object types - plus any vs unknown, null and undefined under strict mode, void, and never for exhaustive checks."
source: https://zudojs.oyinlola.site/learn/ts-types
---

LESSON 33 OF 84

TypeScript Foundation

# Basic types

The everyday types of TypeScript - strings, numbers, booleans, arrays, tuples and object types - plus any vs unknown, null and undefined under strict mode, void, and never for exhaustive checks.

- **35 min** to read and try
- **You need:** The ts-tasks project from Why TypeScript exists
- **You build:** A small task-statistics module where every value has a checked type

  [Test yourself](#test)

## Strings, numbers and booleans

You met the JavaScript value types in [the values lesson](https://zudojs.oyinlola.site/learn/js-values). TypeScript has a type for each one, written in lowercase: `string`, `number` and `boolean`. There is only one `number` type, for whole numbers and decimals alike.

primitives.ts

```ts
const title: string = "Buy milk";
const priority: number = 2;
const estimateHours: number = 0.5;
const done: boolean = false;

function label(title: string, priority: number): string {
  return `${title} (P${priority}, ${estimateHours}h)`;
}

console.log(label(title, priority), done);
```

Output of `npx tsx primitives.ts` and of the browser terminal

```ts
Buy milk (P2, 0.5h) false
```

You saw in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup) that TypeScript infers the type of `const title = "Buy milk"` by itself. The annotations on the first four lines are only there to show the names. In your own code, annotate the parameters, like `label` does, and leave the rest to inference.

> LOWERCASE, NOT STRING
>
> Write `string`, not `String`. The capitalised names are JavaScript's wrapper objects, which you almost never want. The same goes for `number` and `boolean`.

## Arrays

An array type is the element type followed by `[]`. `string[]` is "an array of strings". There is a second spelling, `Array<string>`, which means the same thing. Put `readonly` in front when a function must not change the array it gets:

arrays.ts

```ts
const tags: string[] = ["home", "shop"];
const estimates: Array<number> = [0.5, 2, 1];

function total(numbers: readonly number[]): number {
  let sum = 0;
  for (const n of numbers) sum += n;
  return sum;
}

tags.push("urgent");
console.log(tags, total(estimates));
```

Output of `npx tsx arrays.ts` and of the browser terminal

```json
[ 'home', 'shop', 'urgent' ] 3.5
```

Every element is checked, and so is every change:

arrays.ts

```ts
const tags: string[] = ["home", "shop"];
tags.push(42);

function total(numbers: readonly number[]): number {
  numbers.push(0);
  return numbers.length;
}
```

What `npx tsc --noEmit` prints

```ts
arrays.ts:2:11 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

2 tags.push(42);
            ~~

arrays.ts:5:11 - error TS2339: Property 'push' does not exist on type 'readonly number[]'.

5   numbers.push(0);
            ~~~~


Found 2 errors in the same file, starting at: arrays.ts:2
```

A `readonly number[]` has no `push`, `pop` or `sort` at all. The caller can be sure that `total` leaves their array alone.

## Tuples: arrays with a fixed shape

Sometimes an array has a fixed length, and each position has its own meaning and type. That is a **tuple**. You write the type of each position in square brackets. You can also give each position a label, which only serves as documentation:

tuples.ts

```ts
const entry: [number, string] = [1, "Buy milk"];

function countTasks(doneFlags: boolean[]): [open: number, done: number] {
  const done = doneFlags.filter((flag) => flag).length;
  return [doneFlags.length - done, done];
}

const [open, done] = countTasks([true, false, false]);
console.log(entry[1].toUpperCase(), open, done);
```

Output of `npx tsx tuples.ts` and of the browser terminal

```ts
BUY MILK 2 1
```

`entry[1]` is a `string`, so `.toUpperCase()` is allowed. Returning a tuple is a handy way to give back two values, and the caller takes them apart with the destructuring you learned in [the objects lesson](https://zudojs.oyinlola.site/learn/js-data). TypeScript also knows the length:

tuples.ts

```ts
const entry: [number, string] = [1, "Buy milk"];
console.log(entry[2]);

const swapped: [number, string] = ["Buy milk", 1];
```

What `npx tsc --noEmit` prints

```ts
tuples.ts:2:19 - error TS2493: Tuple type '[number, string]' of length '2' has no element at index '2'.

2 console.log(entry[2]);
                    ~

tuples.ts:4:36 - error TS2322: Type 'string' is not assignable to type 'number'.

4 const swapped: [number, string] = ["Buy milk", 1];
                                     ~~~~~~~~~~

tuples.ts:4:48 - error TS2322: Type 'number' is not assignable to type 'string'.

4 const swapped: [number, string] = ["Buy milk", 1];
                                                 ~


Found 3 errors in the same file, starting at: tuples.ts:2
```

Use tuples for small, obvious pairs. When there are more than two or three positions, an object with named properties is easier to read.

## Object types

An **object type** lists property names and their types between braces, separated by semicolons. You can write one straight on a parameter:

objects.ts

```ts
function describe(task: { id: number; title: string; done: boolean }): string {
  return `#${task.id} ${task.title}${task.done ? " (done)" : ""}`;
}

console.log(describe({ id: 1, title: "Buy milk", done: false }));
console.log(describe({ id: 2, title: "Call Ada", done: true }));
```

Output of `npx tsx objects.ts` and of the browser terminal

```ts
#1 Buy milk
#2 Call Ada (done)
```

Writing the same shape on every function would be tiring, so in practice you give it a name, like the `type Task = { ... }` you wrote before. [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects) covers naming, optional and read-only properties. For now, see what the compiler checks when you pass an object literal:

objects.ts

```ts
type Task = { id: number; title: string; done: boolean };

const a: Task = { id: 1, title: "Buy milk" };
const b: Task = { id: 2, titel: "Call Ada", done: false };
```

What `npx tsc --noEmit` prints

```ts
objects.ts:3:7 - error TS2741: Property 'done' is missing in type '{ id: number; title: string; }' but required in type 'Task'.

3 const a: Task = { id: 1, title: "Buy milk" };
        ~

  objects.ts:1:42 - 'done' is declared here.
    1 type Task = { id: number; title: string; done: boolean };
                                               ~~~~

objects.ts:4:26 - error TS2561: Object literal may only specify known properties, but 'titel' does not exist in type 'Task'. Did you mean to write 'title'?

4 const b: Task = { id: 2, titel: "Call Ada", done: false };
                           ~~~~~


Found 2 errors in the same file, starting at: objects.ts:3
```

A missing property is an error. An **extra** property in an object literal is an error too, because it is almost always a typo, like `titel` here.

## null and undefined

In JavaScript, `find` gives `undefined` when nothing matches. With `strict` on (it turns on a check called `strictNullChecks`), TypeScript remembers that. The result of `find` on a list of tasks has the type `Task | undefined`: "a task, or undefined". The `|` means "or"; it is a **union**, and you will use unions a lot from now on.

find.ts

```ts
type Task = { id: number; title: string };

const tasks: Task[] = [{ id: 1, title: "Buy milk" }];

const task = tasks.find((t) => t.id === 2);
console.log(task.title);
```

What `npx tsc --noEmit` prints

```ts
find.ts:6:13 - error TS18048: 'task' is possibly 'undefined'.

6 console.log(task.title);
              ~~~~


Found 1 error in find.ts:6
```

Without this check, the program would crash with `TypeError: Cannot read properties of undefined`, one of the most common JavaScript errors there is. The compiler makes you handle the missing case first. There are three ways:

find.ts

```ts
type Task = { id: number; title: string; note: string | null };

const tasks: Task[] = [{ id: 1, title: "Buy milk", note: null }];

const task = tasks.find((t) => t.id === 2);
if (task === undefined) {
  console.log("task 2 not found");
} else {
  console.log(task.title);
}

console.log(tasks[0]?.title);
console.log(task?.title ?? "(no title)");
console.log(tasks[0]?.note ?? "(no note)");
```

Output of `npx tsx find.ts` and of the browser terminal

```ts
task 2 not found
Buy milk
(no title)
(no note)
```

- An `if` check. Inside `else`, TypeScript knows `task` is a `Task`. This is called **narrowing**: a check makes the type smaller.
- `value?.title` (optional chaining) gives `undefined` instead of crashing when `value` is missing.
- `a ?? b` (nullish coalescing) gives `b` only when `a` is `null` or `undefined`.

`null` works the same way. `note: string | null` says the note is a string or deliberately empty. A common convention, and the one ZudoJS follows: `undefined` means "not there", `null` means "there, and empty", which is also how a database `NULL` column arrives in your code.

> NOTE
>
> Reading `tasks[0]` gives type `Task`, not `Task | undefined`, even though the array might be empty. The optional `noUncheckedIndexedAccess` setting in `tsconfig.json` changes that. It is stricter, and `npx tsc --init` turns it on.

## any and unknown

TypeScript has two types for "I do not know what this is". They behave in opposite ways.

`any` switches type checking off. Anything you do with an `any` value is allowed, so every mistake gets through:

any.ts

```ts
let input: any = "Buy milk";

console.log(input.toUpperCase());

try {
  console.log(input.toFixed(2));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx any.ts` and of the browser terminal

```ts
BUY MILK
TypeError: input.toFixed is not a function
```

This file passes `tsc`. `toFixed` is a number method, and the value is a string, yet the compiler said nothing. That is the problem with `any`: it is JavaScript without the safety net, and it spreads to everything it touches.

`unknown` is the safe version. It can hold anything too, but the compiler lets you do nothing with it until you check what it is:

unknown.ts

```ts
const input: unknown = "Buy milk";

console.log(input.toUpperCase());
```

What `npx tsc --noEmit` prints

```ts
unknown.ts:3:13 - error TS18046: 'input' is of type 'unknown'.

3 console.log(input.toUpperCase());
              ~~~~~


Found 1 error in unknown.ts:3
```

Check with `typeof`, which you know from JavaScript, and TypeScript narrows the type inside each branch:

unknown.ts

```ts
function shout(input: unknown): string {
  if (typeof input === "string") {
    return input.toUpperCase();
  }
  if (typeof input === "number") {
    return input.toFixed(2);
  }
  return "(not text)";
}

console.log(shout("Buy milk"));
console.log(shout(3));
console.log(shout({ title: "Buy milk" }));
```

Output of `npx tsx unknown.ts` and of the browser terminal

```ts
BUY MILK
3.00
(not text)
```

The rule: **never write `any`**. When you really do not know a type, use `unknown` and check. Data from outside your program, such as a request body, is exactly that case. [TypeScript and JavaScript together](https://zudojs.oyinlola.site/learn/ts-runtime) shows how to check a whole object.

## void and never

Two types describe what a function gives back when it gives back nothing useful:

- `void`: the function returns, but without a value. Most functions that only print or save something return `void`.
- `never`: the function never returns at all. It always throws, or loops forever.

void-never.ts

```ts
function logTask(title: string): void {
  console.log(`- ${title}`);
}

function fail(message: string): never {
  throw new Error(message);
}

logTask("Buy milk");
try {
  fail("database is down");
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx void-never.ts` and of the browser terminal

```ts
- Buy milk
Error: database is down
```

`never` has a second, more useful job. It is the type of a value that cannot exist. After you have checked every possibility, what is left is `never`. That lets the compiler prove a `switch` handles every case. Here, a status is one of three words (a union of **literal types**, which the next lessons cover in depth):

status.ts

```ts
type Status = "todo" | "doing" | "done";

function statusLabel(status: Status): string {
  switch (status) {
    case "todo":
      return "To do";
    case "doing":
      return "In progress";
    case "done":
      return "Done";
    default: {
      const unreachable: never = status;
      throw new Error(`Unknown status: ${unreachable}`);
    }
  }
}

console.log(statusLabel("doing"));
```

Output of `npx tsx status.ts` and of the browser terminal

```ts
In progress
```

In the `default` branch, every status has been handled, so `status` has type `never` and the assignment is fine. Now a teammate adds a fourth status and forgets the `switch`:

status.ts

```ts
type Status = "todo" | "doing" | "done" | "blocked";

function statusLabel(status: Status): string {
  switch (status) {
    case "todo":
      return "To do";
    case "doing":
      return "In progress";
    case "done":
      return "Done";
    default: {
      const unreachable: never = status;
      throw new Error(`Unknown status: ${unreachable}`);
    }
  }
}
```

What `npx tsc --noEmit` prints

```ts
status.ts:12:13 - error TS2322: Type '"blocked"' is not assignable to type 'never'.

12       const unreachable: never = status;
               ~~~~~~~~~~~


Found 1 error in status.ts:12
```

The compiler points straight at the `switch` that is now incomplete, and names the case that is left over: `"blocked"` reached the `default` branch, where only `never` is allowed. In a big project, where that `switch` may be in a file the teammate never opened, this is how nothing gets forgotten. This pattern is called an **exhaustiveness check**.

## Put it together: task statistics

Here is a small module that uses most of this lesson's types. Read the signatures first: they tell you what each function takes and gives back without reading the bodies.

stats.ts

```ts
type Task = { id: number; title: string; done: boolean; estimate: number | null };

function progress(tasks: readonly Task[]): [done: number, total: number] {
  return [tasks.filter((t) => t.done).length, tasks.length];
}

function totalEstimate(tasks: readonly Task[]): number {
  let hours = 0;
  for (const task of tasks) hours += task.estimate ?? 0;
  return hours;
}

function nextTask(tasks: readonly Task[]): Task | undefined {
  return tasks.find((t) => !t.done);
}

const tasks: Task[] = [
  { id: 1, title: "Buy milk", done: true, estimate: 0.5 },
  { id: 2, title: "File taxes", done: false, estimate: 3 },
  { id: 3, title: "Call Ada", done: false, estimate: null },
];

const [done, total] = progress(tasks);
console.log(`${done}/${total} done, ${totalEstimate(tasks)}h estimated`);
console.log("next:", nextTask(tasks)?.title ?? "nothing left");
```

Output of `npx tsx stats.ts` and of the browser terminal

```ts
1/3 done, 3.5h estimated
next: File taxes
```

## Practice

TRY IT YOURSELF

### Handle the missing task

This code does not compile. Fix it so it prints the title, or `not found` when there is no task with that id. Do not use `any` or `!`.

lookup.ts

```ts
const titles: { id: number; title: string }[] = [{ id: 1, title: "Buy milk" }];

function titleOf(id: number): string {
  return titles.find((t) => t.id === id).title;
}
```

What `npx tsc --noEmit` prints

```ts
lookup.ts:4:10 - error TS2532: Object is possibly 'undefined'.

4   return titles.find((t) => t.id === id).title;
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in lookup.ts:4
```

**Show a solution**

lookup.ts

```ts
const titles: { id: number; title: string }[] = [{ id: 1, title: "Buy milk" }];

function titleOf(id: number): string {
  return titles.find((t) => t.id === id)?.title ?? "not found";
}

console.log(titleOf(1));
console.log(titleOf(5));
```

Output of `npx tsx lookup.ts` and of the browser terminal

```ts
Buy milk
not found
```

TRY IT YOURSELF

### Count from unknown

Write `toCount(value: unknown): number`. A number is returned as it is. A string such as `"3"` is converted with `Number`. Anything else, and any result that is not a whole number of 0 or more, gives `0`.

**Show a solution**

count.ts

```ts
function toCount(value: unknown): number {
  let n = 0;
  if (typeof value === "number") n = value;
  if (typeof value === "string") n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

console.log(toCount(4), toCount("3"), toCount("three"), toCount(-1), toCount(null));
```

Output of `npx tsx count.ts` and of the browser terminal

```ts
4 3 0 0 0
```

TRY IT YOURSELF

### Smallest and largest

Write `minMax(numbers: readonly number[])` that returns a tuple `[min, max]`, or `undefined` for an empty array. Write the return type yourself.

**Show a solution**

min-max.ts

```ts
function minMax(numbers: readonly number[]): [min: number, max: number] | undefined {
  if (numbers.length === 0) return undefined;
  return [Math.min(...numbers), Math.max(...numbers)];
}

console.log(minMax([3, 1, 4, 1, 5]));
console.log(minMax([]));
```

Output of `npx tsx min-max.ts` and of the browser terminal

```json
[ 1, 5 ]
undefined
```

## Recap

- `string`, `number` and `boolean` are the basic types. Always lowercase.
- `string[]` is an array; `readonly string[]` cannot be changed; `[number, string]` is a tuple with a fixed shape.
- Object types list properties. Missing and extra properties in an object literal are errors.
- With `strict` on, a value that may be `undefined` or `null` must be checked before use: with `if`, `?.` or `??`.
- `any` turns checking off; `unknown` makes you check first. Prefer `unknown`, always.
- `void` means "returns nothing"; `never` means "cannot happen", which powers exhaustive `switch` checks.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
