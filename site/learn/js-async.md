---
title: "Asynchronous JavaScript — ZudoJS Academy"
description: "See why a backend waits without blocking, use callbacks, promises and async/await, handle errors in async code, and run work in sequence or in parallel."
source: https://zudojs.oyinlola.site/learn/js-async
---

LEVEL 2 · LESSON 18 OF 19

Classes, errors, async and modules Foundation

# Asynchronous JavaScript

See why a backend waits without blocking, use callbacks, promises and async/await, handle errors in async code, and run work in sequence or in parallel.

- **50 min** to read and try
- **You need:** Handling errors, and the lessons before it
- **You build:** A concurrent data loader that fetches several sources at once, with time limits and partial results

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain why a single-threaded backend must not block, and tell blocking from non-blocking code
- Read error-first callbacks and explain the problems promises solve
- Create and chain promises, and describe their three states
- Write async functions with await and handle their errors with try and catch
- Run independent work in parallel with Promise.all or allSettled, and put a time limit on slow work

## Why a backend waits

A backend spends most of its time waiting: for the database to answer, for a file to be read, for another service to reply. If it stopped everything while it waited, it could only serve one person at a time.

JavaScript solves this by never standing still. When code has to wait, it says "call me back when the answer is ready" and moves on. That is **asynchronous** code. Code that runs line by line, each line finishing before the next starts, is **synchronous**.

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

## Blocking and non-blocking

JavaScript runs your code on a single **thread**: it can only do one thing at a time. While one piece of synchronous code runs, nothing else can, not even a timer that is already due. Code that keeps the thread busy like this is **blocking**:

blocking.js

```ts
const start = Date.now();

setTimeout(() => {
  const waited = Date.now() - start;
  console.log("timer ran after", waited >= 200 ? "at least 200 ms" : "less than 200 ms");
}, 0);

while (Date.now() - start < 200) {
  // busy: keep the thread working for 200 ms
}
console.log("busy loop finished");
```

Output of `node blocking.js` and of the browser terminal

```ts
busy loop finished
timer ran after at least 200 ms
```

The timer asked to run after 0 ms, but it had to wait until the loop let go of the thread. On a server, a blocking loop like this freezes *every* request, not just one. The part of JavaScript that decides what runs next, when the thread is free, is the **event loop**; [The event loop](https://zudojs.oyinlola.site/learn/js-event-loop), in the Advanced JavaScript course, explains its queues and ordering rules.

Waiting for the outside world should be **non-blocking**: start the work, give the thread back, and get told when it is done. Node.js offers both styles for many tasks. Reading a file is a good example:

read-file.jsNode.js only

```ts
import { readFile, readFileSync, writeFileSync } from "node:fs";

writeFileSync("tasks.json", '[{"title":"Buy milk"}]');

const text = readFileSync("tasks.json", "utf8");
console.log("sync:", text);

readFile("tasks.json", "utf8", (error, data) => {
  console.log("async:", data);
});

console.log("after calling readFile");
```

Output of `node read-file.js`

```ts
sync: [{"title":"Buy milk"}]
after calling readFile
async: [{"title":"Buy milk"}]
```

`readFileSync` blocks until the file is read. `readFile` returns at once and calls your function later, which is why `after calling readFile` came first. A server should use the non-blocking version.

## Callbacks and their problems

The function you give `readFile` is a **callback**: a function you pass to other code so it can call you back when it is done. Node.js callbacks follow a rule called **error-first**: the first argument is an error (or `null` when all went well), and the result comes second. You must check the error every time:

error-first.jsNode.js only

```ts
import { readFile } from "node:fs";

readFile("missing.json", "utf8", (error, data) => {
  if (error) {
    console.log("failed:", error.code);
    return;
  }
  console.log(data);
});
```

Output of `node error-first.js`

```ts
failed: ENOENT
```

`ENOENT` is the system's code for "no such file". Callbacks work, but they get painful as soon as one step depends on another. Here are three fake database calls, each taking a callback, and a report that needs all three in order:

callback-hell.js

```ts
function getUser(id, callback) {
  setTimeout(() => callback(null, { id, name: "Ada" }), 20);
}
function getTasks(user, callback) {
  setTimeout(() => callback(null, ["Buy milk", "Call Grace"]), 20);
}
function saveReport(report, callback) {
  setTimeout(() => callback(report.length > 50 ? new Error("too long") : null, report), 20);
}

getUser(1, (error, user) => {
  if (error) return console.log("failed:", error.message);
  getTasks(user, (error, tasks) => {
    if (error) return console.log("failed:", error.message);
    saveReport(`${user.name}: ${tasks.join(", ")}`, (error, saved) => {
      if (error) return console.log("failed:", error.message);
      console.log("saved:", saved);
    });
  });
});
```

Output of `node callback-hell.js` and of the browser terminal

```ts
saved: Ada: Buy milk, Call Grace
```

This shape is called **callback hell**. Every step pushes the code further right, every level repeats the same error check, and forgetting one check silently loses an error. There is no `try`/`catch` across the steps, and nothing stops a buggy function from calling its callback twice. Promises were invented to fix all of this.

## Promises

A **Promise** is an object that stands for a value you will have later. Instead of passing a callback in, the function returns a promise, and you attach what should happen next. Here is a helper that waits a number of milliseconds and a fake database that answers after a short delay:

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

`findTask` returns straight away with a promise. `.then(...)` registers what to do once the promise has its value. This lesson covers what you need to read and write everyday promise code; [Promises in depth](https://zudojs.oyinlola.site/learn/js-promises) covers the exact guarantees, thenables and turning callback APIs into promises.

### The three states of a promise

A promise is always in one of three states:

- **pending**: the work is still going on.
- **fulfilled**: it finished and has a value.
- **rejected**: it failed and has a reason, usually an `Error`.

Fulfilled and rejected together are called **settled**. A promise settles only once, and then never changes. You make your own promise with `new Promise((resolve, reject) => { ... })`: call `resolve(value)` to fulfil it, or `reject(error)` to reject it. JavaScript does not let you read a promise's state directly, so this example records it:

states.js

```ts
function track(name, promise) {
  const record = { name, state: "pending" };
  promise.then(
    (value) => Object.assign(record, { state: "fulfilled", value }),
    (error) => Object.assign(record, { state: "rejected", reason: error.message }),
  );
  return record;
}

const ok = new Promise((resolve) => setTimeout(() => resolve(42), 30));
const bad = new Promise((resolve, reject) => {
  setTimeout(() => reject(new Error("disk full")), 30);
  setTimeout(() => resolve("too late"), 40);
});

const records = [track("ok", ok), track("bad", bad)];
console.log(records);

setTimeout(() => console.log(records), 60);
```

Output of `node states.js` and of the browser terminal

```json
[ { name: 'ok', state: 'pending' }, { name: 'bad', state: 'pending' } ]
[
  { name: 'ok', state: 'fulfilled', value: 42 },
  { name: 'bad', state: 'rejected', reason: 'disk full' }
]
```

Both started `pending`. After 30 ms one was fulfilled and one rejected. `bad` also tried to `resolve("too late")` after it had been rejected, and that call was ignored: a settled promise never changes. That rule alone removes the "callback called twice" bug.

### Chaining with then, catch and finally

`.then` returns a *new* promise with whatever your function returns, so you can chain steps. `.catch` handles a rejection from any step above it. `.finally` runs at the end either way. Here is the callback-hell report again, with promise-returning versions of the same functions:

chain.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getUser = (id) => wait(20).then(() => ({ id, name: "Ada" }));
const getTasks = () => wait(20).then(() => ["Buy milk", "Call Grace"]);
const saveReport = (report) =>
  wait(20).then(() => {
    if (report.length > 30) throw new Error("report too long");
    return report;
  });

getUser(1)
  .then((user) => getTasks(user).then((tasks) => `${user.name}: ${tasks.join(", ")}`))
  .then((report) => saveReport(report))
  .then((saved) => console.log("saved:", saved))
  .catch((error) => console.log("failed:", error.message))
  .finally(() => console.log("done"));
```

Output of `node chain.js` and of the browser terminal

```ts
saved: Ada: Buy milk, Call Grace
done
```

The steps now read top to bottom, and one `.catch` covers all of them. Try changing `30` to `10` in `saveReport`: the output becomes `failed: report too long` and then `done`.

## async and await

Chains of `.then` are still hard to read. Mark a function `async` and you can write `await` in front of a promise. The function pauses at that line until the value is ready, while the rest of the program keeps running. The code reads top to bottom again:

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

An `async` function always returns a promise, even when it returns a plain value. That is why the database helper is `async`: anything that talks to the outside world is. `await` is just a nicer way to write `.then`: underneath, it is the same promises.

> TIP
>
> In an ES module, which is what your project is since [Set up your computer](https://zudojs.oyinlola.site/learn/setup#package-json), you can also use `await` at the top level of a file, outside any function. The next examples do that.

## When waiting fails

Databases go down and networks drop. When an `async` function throws, its promise is rejected. `await` turns that rejection back into a thrown error, so you handle it with `try` and `catch`, exactly as in [Handling errors](https://zudojs.oyinlola.site/learn/js-errors):

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

### The forgotten await

The most common async bug is a missing `await`. Without it, the call returns a pending promise immediately, `try` finishes happily, and the error happens later, when nobody is listening. Save this as `forgot.js`:

forgot.jsNode.js only

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function saveTask(task) {
  await wait(20);
  if (task.title === "") throw new Error("title must not be empty");
  return task;
}

try {
  saveTask({ title: "" });
  console.log("Saved, I think");
} catch (error) {
  console.log("Could not save:", error.message);
}
```

Terminal on your computer

```bash
$ node forgot.js
Saved, I think
file://~/async-demo/forgot.js:5
  if (task.title === "") throw new Error("title must not be empty");
                               ^

Error: title must not be empty
    at saveTask (file://~/async-demo/forgot.js:5:32)

Node.js v24.19.0
```

The program claimed success, then crashed. A rejected promise that nobody handles is an **unhandled rejection**, and Node.js stops the whole process for it, because an error nobody saw is dangerous. The fix is one word: `await saveTask(...)`. Whenever you call an `async` function, either `await` it or attach a `.catch`.

## Sequential or parallel

Several `await`s one after another run **sequentially**: each waits for the one before. That is right when a step needs the previous result. When the waits do not depend on each other, start them all first and wait for them together. `Promise.all` takes an array of promises and gives back an array of their values:

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

Each wait is 100 ms, yet the pair finishes in about 100 ms, not 200, because they ran at the same time. `const [tasks, users] = ...` is array destructuring from [Modern JavaScript](https://zudojs.oyinlola.site/learn/js-modern).

### Measuring the difference

Here are the same three lookups done both ways, timed. Your exact numbers will differ by a few milliseconds each run:

timing.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTask(id) {
  await wait(100);
  return { id };
}

let start = Date.now();
for (const id of [1, 2, 3]) {
  await fetchTask(id);
}
const sequential = Date.now() - start;

start = Date.now();
await Promise.all([1, 2, 3].map((id) => fetchTask(id)));
const parallel = Date.now() - start;

console.log(`sequential: ${sequential} ms`);
console.log(`parallel: ${parallel} ms`);
console.log("parallel is faster:", parallel < sequential);
```

Output of `node timing.js` and of the browser terminal

```ts
sequential: 302 ms
parallel: 101 ms
parallel is faster: true
```

Sequential took about 3 × 100 ms, parallel about 100 ms. In a real API that is the difference between a fast page and a slow one. Parallel is not always right, though: if you start 10,000 database queries at once, the database will struggle. For large lists, work in batches.

## all, allSettled, race and any

`Promise` has four ways to wait for several promises. They differ in what happens when some fail:

- `Promise.all`: all values, or the *first* error. Use it when you need every result.
- `Promise.allSettled`: never fails. Gives a report for each promise, `fulfilled` with a `value` or `rejected` with a `reason`. Use it when partial results are useful.
- `Promise.race`: settles like whichever promise settles *first*, success or failure. The build below uses it for a time limit.
- `Promise.any`: the first *success*. Fails only if all fail, with an `AggregateError`.

The difference between the first two matters most in everyday code:

combinators.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const succeed = (value, ms) => wait(ms).then(() => value);
const fail = (message, ms) => wait(ms).then(() => { throw new Error(message); });

try {
  await Promise.all([succeed("tasks", 20), fail("users down", 10)]);
} catch (error) {
  console.log("all:", error.message);
}

const results = await Promise.allSettled([succeed("tasks", 20), fail("users down", 10)]);
console.log("allSettled:", results.map((r) => r.status === "fulfilled" ? r.value : r.reason.message));
```

Output of `node combinators.js` and of the browser terminal

```ts
all: users down
allSettled: [ 'tasks', 'users down' ]
```

One failure made `Promise.all` fail, and the successful `tasks` value was lost. `allSettled` kept both results. [Combining promises](https://zudojs.oyinlola.site/learn/js-promise-combinators), in the Advanced JavaScript course, takes all four apart with timelines, adds `Promise.withResolvers`, and shows when each one is the right shape.

## Build: a concurrent data loader

A dashboard page needs data from three services: the user (required), their tasks and their notifications (nice to have). A backend loads all three at the same time. Rules:

- If the user cannot be loaded, the whole request fails.
- If tasks or notifications fail, show the rest and report what is missing.
- No service may take longer than 150 ms. A slow service counts as failed.

REASON IT OUT

### Before you build: what if one service is slow or down?

Before writing the loader, think through the failure cases, because in production they happen every day:

- If you `await` the three services one after another, how long does the page take when each needs 50, 80 and 500 ms?
- If you use `Promise.all` and the notifications service fails, what does the user see?
- If a service never answers at all, what happens to the request?
- Which failure must still fail the whole request?

**Show the reasoning**

**One after another** takes the sum: 630 ms. The three calls do not depend on each other, so start them together and the page takes as long as the slowest one.

**`Promise.all`** rejects as soon as one promise rejects, so a broken notifications service would take the whole dashboard down with it, although tasks and the user loaded fine. For optional parts, `allSettled` keeps what succeeded.

**A service that never answers** keeps the request waiting forever, and `allSettled` waits for it too. Everything that leaves your process needs a time limit, after which you treat it as failed.

**Required parts** still fail the request: without the user there is no dashboard to show. So the loader checks the user's result first and throws if it failed.

The time limit uses `Promise.race` between the real work and a timer that rejects. `finally` clears the timer, so it does not keep the program waiting once the work has finished:

loader.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const services = {
  user: async (id) => { await wait(50); return { id, name: "Ada" }; },
  tasks: async () => { await wait(80); return ["Buy milk", "Call Grace"]; },
  notifications: async () => { await wait(500); return ["Welcome!"]; },
};

async function loadDashboard(userId) {
  const load = (name) => withTimeout(services[name](userId), 150, name);
  const [user, tasks, notifications] = await Promise.allSettled(
    ["user", "tasks", "notifications"].map(load),
  );
  if (user.status === "rejected") throw user.reason;

  const optional = { tasks, notifications };
  const dashboard = { user: user.value, missing: [] };
  for (const [name, result] of Object.entries(optional)) {
    if (result.status === "fulfilled") dashboard[name] = result.value;
    else dashboard.missing.push(result.reason.message);
  }
  return dashboard;
}

const started = Date.now();
console.log(await loadDashboard(1));
console.log("did not wait for the 500 ms service:", Date.now() - started < 450);
```

Output of `node loader.js` and of the browser terminal

```json
{
  user: { id: 1, name: 'Ada' },
  missing: [ 'notifications timed out after 150 ms' ],
  tasks: [ 'Buy milk', 'Call Grace' ]
}
did not wait for the 500 ms service: true
```

All three requests started together. The user and the tasks arrived in time. The notifications service would have taken 500 ms, so the time limit cut it off at 150 ms and it went into `missing`. The page still loaded in about 150 ms instead of 630 ms (50 + 80 + 500, one after another), and a slow service could not hold it hostage.

This is the everyday work of a backend: start independent work in parallel, put a time limit on everything that leaves your process, and decide what is required and what is optional. The time limit here only stops *waiting*; the slow work itself keeps running in the background. [Concurrency and cancellation](https://zudojs.oyinlola.site/learn/js-concurrency) shows how to really cancel it with `AbortController` and `AbortSignal.timeout`.

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

TRY IT YOURSELF

### Retry a flaky service

Write `retry(fn, attempts)` that calls the async function `fn`. If it fails, wait 20 ms and try again, up to `attempts` times in total. If every attempt fails, throw the last error. Test it with a fake service that fails twice and then works.

**Show a solution**

retry.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(fn, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      console.log(`attempt ${attempt} failed: ${error.message}`);
      if (attempt < attempts) await wait(20);
    }
  }
  throw lastError;
}

const flaky = async (attempt) => {
  if (attempt < 3) throw new Error("service unavailable");
  return "tasks loaded";
};

console.log(await retry(flaky, 5));

try {
  await retry(flaky, 2);
} catch (error) {
  console.log("gave up:", error.message);
}
```

Output of `node retry.js` and of the browser terminal

```ts
attempt 1 failed: service unavailable
attempt 2 failed: service unavailable
tasks loaded
attempt 1 failed: service unavailable
attempt 2 failed: service unavailable
gave up: service unavailable
```

Note `return await fn(attempt)` inside `try`. Without `await`, the function would return the promise before it failed, and `catch` would never see the error: the forgotten-await bug from above.

TRY IT YOURSELF

### Parallel with a limit

Load the tasks with ids 1 to 6 using `fetchTask` from the timing example, but never more than 2 at a time: split the ids into batches of 2, and use `Promise.all` for each batch. Print the ids in order.

**Show a solution**

batches.js

```ts
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTask(id) {
  await wait(30);
  return { id };
}

const ids = [1, 2, 3, 4, 5, 6];
const loaded = [];

for (let i = 0; i < ids.length; i += 2) {
  const batch = ids.slice(i, i + 2);
  const tasks = await Promise.all(batch.map((id) => fetchTask(id)));
  console.log("batch done:", batch);
  loaded.push(...tasks);
}

console.log(loaded.map((task) => task.id));
```

Output of `node batches.js` and of the browser terminal

```ts
batch done: [ 1, 2 ]
batch done: [ 3, 4 ]
batch done: [ 5, 6 ]
[ 1, 2, 3, 4, 5, 6 ]
```

Each batch runs in parallel, and the batches run one after another. `Promise.all` keeps the results in the same order as the input, whatever order they finish in.

## Recap

- JavaScript runs on one thread. Synchronous, blocking code holds it; asynchronous, non-blocking code starts work and gets called back later.
- Callbacks work, but nest badly. Node.js callbacks are error-first: `(error, result)`.
- A promise is pending, then settles once: fulfilled with a value or rejected with a reason. `.then` chains steps, `.catch` handles failures, `.finally` always runs.
- `async` functions return promises, and `await` pauses until one settles. A rejection becomes a thrown error at `await`. Forgetting `await` leads to unhandled rejections, which crash Node.js.
- Run independent work in parallel. `all` needs every result, `allSettled` reports each one, `race` takes the first to settle (good for time limits), and `any` takes the first success.

Next, [Modules](https://zudojs.oyinlola.site/learn/js-modules): split a program into files with `import` and `export`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
