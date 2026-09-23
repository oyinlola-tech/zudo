---
title: "Asynchronous JavaScript"
description: "Learn why a backend waits without blocking, and how to write code that waits with promises, async and await."
source: https://zudojs.oyinlola.site/learn/js-async
---

LESSON 4 OF 10

JavaScript for the backend

# Asynchronous JavaScript

Learn why a backend waits without blocking, and how to write code that waits with promises, async and await.

- **30 min** to read and try
- **You need:** Lessons 1 to 3
- **You build:** A fake database that answers after a delay

## Why a backend waits

A backend spends most of its time waiting: for the database to answer, for a file to be read, for another service to reply. If it stopped everything while it waited, it could only serve one person at a time.

JavaScript solves this by never standing still. When code has to wait, it says "call me back when the answer is ready" and moves on. That is **asynchronous** code.

`setTimeout` is the simplest way to see it. It runs a function later, after a number of milliseconds:

timeout.js

```ts
console.log("1. Ask the database for tasks");

setTimeout(() => {
  console.log("3. The database answered");
}, 100);

console.log("2. Carry on with other work");
```

Output of `node timeout.js` and of the browser terminal

```ts
1. Ask the database for tasks
2. Carry on with other work
3. The database answered
```

Line 2 printed before line 3, even though it comes later in the file. JavaScript did not wait for the timer: it registered the function, kept going, and ran the function when the time was up.

## Promises

Callbacks get messy when one wait depends on another. Modern JavaScript uses a **Promise** instead: an object that stands for a value you will have later. Here is a helper that waits a number of milliseconds and a fake database that answers after a short delay:

promise.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findTask(id) {
  return wait(50).then(() => ({ id, title: "Buy milk", done: false }));
}

const promise = findTask(1);
console.log(promise instanceof Promise);

promise.then((task) => {
  console.log("Found:", task.title);
});
```

Output of `node promise.js` and of the browser terminal

```ts
true
Found: Buy milk
```

`findTask` returns straight away with a promise. `.then(...)` registers what to do once the promise has its value.

## async and await

Chains of `.then` are hard to read. Mark a function `async` and you can write `await` in front of a promise. The function pauses at that line until the value is ready, while the rest of the program keeps running. The code reads top to bottom again:

await.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const db = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Write report", done: true },
];

async function findTask(id) {
  await wait(50);
  return db.find((task) => task.id === id);
}

async function main() {
  console.log("Looking up task 2...");
  const task = await findTask(2);
  console.log(task);
  const missing = await findTask(7);
  console.log(missing);
}

main();
```

Output of `node await.js` and of the browser terminal

```ts
Looking up task 2...
{ id: 2, title: 'Write report', done: true }
undefined
```

An `async` function always returns a promise, even when it returns a plain value. That is why the database helper is `async`: anything that talks to the outside world is.

> TIP
>
> In an ES module, which is what your project is since lesson 1, you can also use `await` at the top level of a file, outside any function. The next examples do that.

## When waiting fails

Databases go down and networks drop. A promise can **reject** with an error instead of giving a value. With `await`, you handle that with `try` and `catch`, the same way you will handle any error:

reject.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function saveTask(task) {
  await wait(20);
  if (task.title === "") {
    throw new Error("title must not be empty");
  }
  return { ...task, id: 3 };
}

try {
  const saved = await saveTask({ title: "Call Ada", done: false });
  console.log("Saved:", saved);
  await saveTask({ title: "", done: false });
  console.log("This line never runs");
} catch (error) {
  console.log("Could not save:", error.message);
}
```

Output of `node reject.js` and of the browser terminal

```ts
Saved: { title: 'Call Ada', done: false, id: 3 }
Could not save: title must not be empty
```

`throw` stops the function and rejects its promise. `await` turns that rejection back into a thrown error, and `catch` receives it. Lesson 5 covers errors properly.

## Waiting for several things at once

`await` one after another is slow when the waits do not depend on each other. `Promise.all` starts them all together and waits for every one:

all.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function countTasks() {
  await wait(100);
  return 3;
}

async function countUsers() {
  await wait(100);
  return 2;
}

const started = Date.now();
const [tasks, users] = await Promise.all([countTasks(), countUsers()]);
const tookMs = Date.now() - started;

console.log({ tasks, users });
console.log("Took less than 200ms:", tookMs < 200);
```

Output of `node all.js` and of the browser terminal

```json
{ tasks: 3, users: 2 }
Took less than 200ms: true
```

Each wait is 100 ms, yet the pair finishes in about 100 ms, not 200, because they ran at the same time. `const [tasks, users] = ...` is destructuring again, this time for an array.

## Practice

TRY IT YOURSELF

### Complete a task in the fake database

Write an `async` function `completeTask(id)` that waits 30 ms, finds the task, throws an error with the message `Task 9 not found` (with the real id) if it is missing, and otherwise returns a copy with `done: true`. Call it for an existing task and a missing one.

**Show a solution**

complete.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const db = [{ id: 1, title: "Buy milk", done: false }];

async function completeTask(id) {
  await wait(30);
  const task = db.find((t) => t.id === id);
  if (!task) {
    throw new Error(`Task ${id} not found`);
  }
  return { ...task, done: true };
}

console.log(await completeTask(1));

try {
  await completeTask(9);
} catch (error) {
  console.log(error.message);
}
```

Output of `node complete.js` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: true }
Task 9 not found
```

## Recap

- A backend waits a lot. JavaScript keeps working while it waits instead of blocking.
- A promise is a value that arrives later. `async` functions return promises, and `await` pauses until one is ready.
- A failed promise becomes a thrown error at `await`. Catch it with `try`/`catch`.
- `Promise.all` runs independent waits at the same time.
