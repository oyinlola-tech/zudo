---
title: "Typing functions"
description: "Give functions parameter and return types, use optional, default and rest parameters, describe functions and callbacks as types, type async functions with Promise, and meet overloads."
source: https://zudojs.oyinlola.site/learn/ts-functions
---

LESSON 34 OF 84

TypeScript Foundation

# Typing functions

Give functions parameter and return types, use optional, default and rest parameters, describe functions and callbacks as types, type async functions with Promise, and meet overloads.

- **35 min** to read and try
- **You need:** Basic types
- **You build:** Typed task helpers - filters, callbacks and an async loader - that the compiler checks at every call

  [Test yourself](#test)

## Parameters and return types

A function is a contract between the code that writes it and the code that calls it. In TypeScript you write the contract down: a type on every parameter, and optionally a return type after the parameter list.

basics.ts

```ts
function priorityLabel(priority: number): string {
  if (priority >= 3) return "high";
  if (priority === 2) return "normal";
  return "low";
}

const estimate = (hours: number, people: number): number => hours / people;

console.log(priorityLabel(3), priorityLabel(1));
console.log(estimate(6, 2));
```

Output of `npx tsx basics.ts` and of the browser terminal

```ts
high low
3
```

Arrow functions, which you know from [the functions lesson](https://zudojs.oyinlola.site/learn/js-functions), take types in the same places. Two checks happen here:

- Inside the function, `priority` is a number, so only number operations are allowed.
- At every call, the arguments must match the parameters, and the result is known to be a `string`.

What happens if you leave a type out, or break the promise of the return type?

basics.ts

```ts
function titleOf(task) {
  return task.title;
}

function isFinished(status: string): boolean {
  if (status === "done") {
    return true;
  }
}
```

What `npx tsc --noEmit` prints

```ts
basics.ts:1:18 - error TS7006: Parameter 'task' implicitly has an 'any' type.

1 function titleOf(task) {
                   ~~~~

basics.ts:5:38 - error TS2366: Function lacks ending return statement and return type does not include 'undefined'.

5 function isFinished(status: string): boolean {
                                       ~~~~~~~


Found 2 errors in the same file, starting at: basics.ts:1
```

- **TS7006**: a parameter without a type would silently become `any`, which you learned to avoid in [Basic types](https://zudojs.oyinlola.site/learn/ts-types). `strict` turns that into an error.
- **TS2366**: when the status is not `"done"`, the function falls off the end and returns `undefined`, not a `boolean`. The return type made the compiler check every path.

You may leave the return type out: TypeScript infers it from the `return` statements. Writing it is still a good habit for exported functions, because then a mistake is reported inside the function, not at some distant caller.

## Optional, default and rest parameters

JavaScript lets callers leave arguments out. TypeScript makes you say which ones may be left out:

params.ts

```ts
function formatTask(title: string, priority: number = 1, note?: string): string {
  const base = `${title} [P${priority}]`;
  return note === undefined ? base : `${base} - ${note}`;
}

function tagged(title: string, ...tags: string[]): string {
  return tags.length === 0 ? title : `${title} #${tags.join(" #")}`;
}

console.log(formatTask("Buy milk"));
console.log(formatTask("File taxes", 3));
console.log(formatTask("Call Ada", 2, "after 5pm"));
console.log(tagged("Buy milk", "home", "shop"));
```

Output of `npx tsx params.ts` and of the browser terminal

```ts
Buy milk [P1]
File taxes [P3]
Call Ada [P2] - after 5pm
Buy milk #home #shop
```

- `priority: number = 1` is a **default parameter**. Callers may leave it out, and inside the function it is always a number.
- `note?: string` is an **optional parameter**. Inside the function its type is `string | undefined`, so you must check it before using it as a string.
- `...tags: string[]` is a **rest parameter**. It collects any number of extra arguments into an array.

Optional and default parameters must come after the required ones. Every call is checked against this list:

params.ts

```ts
function formatTask(title: string, priority: number = 1, note?: string): string {
  return `${title} [P${priority}] ${note ?? ""}`;
}

formatTask();
formatTask("Buy milk", "high");
formatTask("Buy milk", 2, "soon", "extra");
```

What `npx tsc --noEmit` prints

```ts
params.ts:5:1 - error TS2554: Expected 1-3 arguments, but got 0.

5 formatTask();
  ~~~~~~~~~~

  params.ts:1:21 - An argument for 'title' was not provided.
    1 function formatTask(title: string, priority: number = 1, note?: string): string {
                          ~~~~~~~~~~~~~

params.ts:6:24 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

6 formatTask("Buy milk", "high");
                         ~~~~~~

params.ts:7:35 - error TS2554: Expected 1-3 arguments, but got 4.

7 formatTask("Buy milk", 2, "soon", "extra");
                                    ~~~~~~~


Found 3 errors in the same file, starting at: params.ts:5
```

## Functions as types

In JavaScript, a function is a value: you can store it in a variable and pass it around. So a function also has a type. A **function type** looks like an arrow function without a body: `(task: Task) => boolean` means "a function that takes a task and returns a boolean".

filters.ts

```ts
type Task = { id: number; title: string; done: boolean; priority: number };
type TaskFilter = (task: Task) => boolean;

const isOpen: TaskFilter = (task) => !task.done;
const isUrgent: TaskFilter = (task) => task.priority >= 3;

function matchAll(task: Task, filters: TaskFilter[]): boolean {
  return filters.every((filter) => filter(task));
}

const tasks: Task[] = [
  { id: 1, title: "Buy milk", done: false, priority: 1 },
  { id: 2, title: "Fix login bug", done: false, priority: 3 },
  { id: 3, title: "Call Ada", done: true, priority: 3 },
];

const todo = tasks.filter((task) => matchAll(task, [isOpen, isUrgent]));
console.log(todo.map((task) => task.title));
```

Output of `npx tsx filters.ts` and of the browser terminal

```json
[ 'Fix login bug' ]
```

Notice that `(task) => !task.done` has no type on `task`, and yet there is no TS7006 error. The variable's type, `TaskFilter`, already says what the parameter is, so TypeScript fills it in. This is called **contextual typing**. It is also why `tasks.filter((task) => …)` never needs an annotation: `filter` is declared to call its callback with an element of the array.

## Callback types

A **callback** is a function you hand to another function, for it to call later. Its type goes on the parameter, like any other type. Here is a helper that reports progress while it works through a list:

callbacks.ts

```ts
type Task = { id: number; title: string; done: boolean };

function completeAll(tasks: Task[], onEach: (task: Task, index: number) => void): number {
  let changed = 0;
  tasks.forEach((task, index) => {
    if (!task.done) {
      task.done = true;
      changed += 1;
      onEach(task, index);
    }
  });
  return changed;
}

const tasks: Task[] = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Call Ada", done: true },
  { id: 3, title: "File taxes", done: false },
];

const count = completeAll(tasks, (task, index) => console.log(`#${index} ${task.title} done`));
console.log("changed:", count);
completeAll(tasks, () => console.log("never printed"));
```

Output of `npx tsx callbacks.ts` and of the browser terminal

```ts
#0 Buy milk done
#2 File taxes done
changed: 2
```

Two rules about callbacks are worth knowing:

- **A callback may take fewer parameters than the type lists.** `() => console.log(…)` ignores both arguments, and that is allowed. JavaScript simply drops extra arguments.
- **A `void` return means "the result is ignored".** A callback that happens to return something is still accepted, but the caller promises not to use the value.

The parameters that are there must have the right types:

callbacks.ts

```ts
type Task = { id: number; title: string; done: boolean };

function completeAll(tasks: Task[], onEach: (task: Task, index: number) => void): void {
  tasks.forEach((task, index) => onEach(task, index));
}

completeAll([], (task, index: string) => console.log(index.toUpperCase()));
```

What `npx tsc --noEmit` prints

```ts
callbacks.ts:7:17 - error TS2345: Argument of type '(task: Task, index: string) => void' is not assignable to parameter of type '(task: Task, index: number) => void'.
  Types of parameters 'index' and 'index' are incompatible.
    Type 'number' is not assignable to type 'string'.

7 completeAll([], (task, index: string) => console.log(index.toUpperCase()));
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Found 1 error in callbacks.ts:7
```

Read long errors from the bottom up: the last line is the root cause (`number` is not `string`), and each line above it adds context.

## Async functions and Promise<T>

In [the asynchronous code lesson](https://zudojs.oyinlola.site/learn/js-async) you learned that an `async` function always returns a promise. TypeScript writes that as `Promise<T>`, where `T` is the type of the value the promise gives you when it is done. `Promise<Task | undefined>` reads "a promise of a task or undefined".

load.ts

```ts
type Task = { id: number; title: string; done: boolean };

const saved: Task[] = [{ id: 1, title: "Buy milk", done: false }];

async function loadTask(id: number): Promise<Task | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return saved.find((task) => task.id === id);
}

async function titleOrDefault(id: number): Promise<string> {
  const task = await loadTask(id);
  return task?.title ?? `task ${id} not found`;
}

console.log(await titleOrDefault(1));
console.log(await titleOrDefault(2));
```

Output of `npx tsx load.ts` and of the browser terminal

```ts
Buy milk
task 2 not found
```

Inside the function you `return` a plain `Task`; the `async` keyword wraps it in a promise. `await` unwraps it again: `await loadTask(id)` has the type `Task | undefined`.

The classic async bug is forgetting `await`. JavaScript would give you a promise object, and `task.title` would quietly be `undefined`. TypeScript catches it:

load.ts

```ts
type Task = { id: number; title: string };

async function loadTask(id: number): Promise<Task> {
  return { id, title: "Buy milk" };
}

const task = loadTask(1);
console.log(task.title);
```

What `npx tsc --noEmit` prints

```ts
load.ts:8:18 - error TS2339: Property 'title' does not exist on type 'Promise<Task>'.

8 console.log(task.title);
                   ~~~~~

  load.ts:8:18 - Did you forget to use 'await'?
    8 console.log(task.title);
                       ~~~~~


Found 1 error in load.ts:8
```

A function type can be async too. `() => Promise<string>` is "a function with no parameters that returns a promise of a string". This helper runs jobs one after another:

jobs.ts

```ts
type Job = () => Promise<string>;

async function runInOrder(jobs: Job[]): Promise<string[]> {
  const results: string[] = [];
  for (const job of jobs) {
    results.push(await job());
  }
  return results;
}

const sendEmail: Job = async () => "email sent";
const writeLog: Job = async () => "log written";

console.log(await runInOrder([sendEmail, writeLog]));
```

Output of `npx tsx jobs.ts` and of the browser terminal

```json
[ 'email sent', 'log written' ]
```

## Overloads, briefly

Sometimes the return type depends on what you pass in. Pass one id, get one task or `undefined`; pass a list of ids, get a list of tasks. A union return type (`Task | Task[] | undefined`) would force every caller to check which one came back. **Overloads** let you list each form of the call separately, followed by one function body that handles them all:

overloads.ts

```ts
type Task = { id: number; title: string };

const all: Task[] = [
  { id: 1, title: "Buy milk" },
  { id: 2, title: "Call Ada" },
];

function find(id: number): Task | undefined;
function find(ids: number[]): Task[];
function find(idOrIds: number | number[]): Task | Task[] | undefined {
  if (Array.isArray(idOrIds)) {
    return all.filter((task) => idOrIds.includes(task.id));
  }
  return all.find((task) => task.id === idOrIds);
}

const one = find(2);
const many = find([1, 2, 9]);
console.log(one?.title);
console.log(many.length);
```

Output of `npx tsx overloads.ts` and of the browser terminal

```ts
Call Ada
2
```

The first two lines are the **overload signatures**: what callers see. `find(2)` has the type `Task | undefined`, and `find([1, 2, 9])` has the type `Task[]`, so `many.length` needs no check. The third signature, with the body, is the **implementation**. Callers cannot use it directly, and it must be compatible with every overload.

Use overloads rarely. When the return type is the same for every input, a union parameter is simpler: `function label(id: number | string): string`.

## Practice

TRY IT YOURSELF

### A reusable sorter

Write a type `TaskCompare = (a: Task, b: Task) => number`, two comparers `byPriority` (highest first) and `byTitle` (A to Z, with `localeCompare`), and `sortTasks(tasks: readonly Task[], compare: TaskCompare): Task[]` that returns a sorted copy.

**Show a solution**

sort.ts

```ts
type Task = { title: string; priority: number };
type TaskCompare = (a: Task, b: Task) => number;

const byPriority: TaskCompare = (a, b) => b.priority - a.priority;
const byTitle: TaskCompare = (a, b) => a.title.localeCompare(b.title);

function sortTasks(tasks: readonly Task[], compare: TaskCompare): Task[] {
  return [...tasks].sort(compare);
}

const tasks: Task[] = [
  { title: "Water plants", priority: 1 },
  { title: "Fix login bug", priority: 3 },
  { title: "Call Ada", priority: 2 },
];

console.log(sortTasks(tasks, byPriority).map((t) => t.title));
console.log(sortTasks(tasks, byTitle).map((t) => t.title));
```

Output of `npx tsx sort.ts` and of the browser terminal

```json
[ 'Fix login bug', 'Call Ada', 'Water plants' ]
[ 'Call Ada', 'Fix login bug', 'Water plants' ]
```

`[...tasks]` copies the array first. It is also required: `sort` changes the array it is called on, and a `readonly Task[]` has no `sort` method.

TRY IT YOURSELF

### Retry an async job

Write `retry(job: () => Promise<string>, attempts: number): Promise<string>`. It calls `job`; if the promise rejects, it tries again, up to `attempts` times in total, then throws the last error. Test it with a job that fails twice and then works.

**Show a solution**

retry.ts

```ts
async function retry(job: () => Promise<string>, attempts: number): Promise<string> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await job();
    } catch (error) {
      lastError = error;
      console.log(`attempt ${i} failed`);
    }
  }
  throw lastError;
}

let calls = 0;
async function flaky(): Promise<string> {
  calls += 1;
  if (calls < 3) throw new Error("timeout");
  return "connected";
}

console.log(await retry(flaky, 5));
```

Output of `npx tsx retry.ts` and of the browser terminal

```ts
attempt 1 failed
attempt 2 failed
connected
```

`return await job()` matters: without `await`, a rejected promise would be returned, not caught, and the loop would never retry.

TRY IT YOURSELF

### Spot the bugs

Without running `tsc`, find the three errors it would report here. Then check with `npx tsc --noEmit`.

spot.ts

```ts
type Notify = (userId: number, message: string) => Promise<void>;

const notify: Notify = async (userId, message) => {
  console.log(`to ${userId}: ${message.trim()}`);
};

notify("7", "Your task is due");
notify(7);
const sent: string = notify(7, "Hi");
```

What `npx tsc --noEmit` prints

```ts
spot.ts:7:8 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

7 notify("7", "Your task is due");
         ~~~

spot.ts:8:1 - error TS2554: Expected 2 arguments, but got 1.

8 notify(7);
  ~~~~~~

  spot.ts:1:32 - An argument for 'message' was not provided.
    1 type Notify = (userId: number, message: string) => Promise<void>;
                                     ~~~~~~~~~~~~~~~

spot.ts:9:7 - error TS2322: Type 'Promise<void>' is not assignable to type 'string'.

9 const sent: string = notify(7, "Hi");
        ~~~~


Found 3 errors in the same file, starting at: spot.ts:7
```

**Show a solution**

The id is a string, not a number; the message is missing; and `notify` returns a `Promise<void>`, which is not a string. Even with `await`, it would give `undefined`, because the function returns nothing.

## Recap

- Type every parameter. Add a return type to exported functions so mistakes are reported inside them.
- `p = 1` is a default, `p?: T` is optional (`T | undefined` inside), `...rest: T[]` collects extra arguments.
- `(task: Task) => boolean` is a function type. Contextual typing fills in callback parameter types for you.
- A callback may ignore parameters; a `void` return means the result is ignored.
- An `async` function returns `Promise<T>`. Forgetting `await` is a type error.
- Overloads list several call forms for one function. Prefer a union when the return type does not change.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
