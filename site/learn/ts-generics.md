---
title: "Unions, narrowing and generics"
description: "Handle values that can be one of several types, write functions that work for any type with generics, and discover the one thing types cannot do for a backend."
source: https://zudojs.oyinlola.site/learn/ts-generics
---

LESSON 8 OF 10

From JavaScript to TypeScript

# Unions, narrowing and generics

Handle values that can be one of several types, write functions that work for any type with generics, and discover the one thing types cannot do for a backend.

- **30 min** to read and try
- **You need:** Lessons 6 and 7
- **You build:** A typed Result helper and a generic repository

## Narrowing a union

A value with a union type, such as `string | number`, could be either. Before you use it, you check which one it is. TypeScript follows your checks and **narrows** the type inside each branch:

narrow.ts

```ts
function parseId(raw: string | number): number {
  if (typeof raw === "number") {
    return raw;
  }
  return Number.parseInt(raw, 10);
}

console.log(parseId(7));
console.log(parseId("42"));
console.log(parseId("abc"));
```

Output of `npx tsx narrow.ts` and of the browser terminal

```ts
7
42
NaN
```

Inside the `if`, `raw` is a `number`. After it, TypeScript knows it can only be a `string`. The last line shows why a backend cannot stop there: `"abc"` is a string, so the types are happy, and yet the result is `NaN`, "not a number". You will fix that properly in lesson 9.

## Results instead of surprises

Many ZudoJS functions do not throw when something goes wrong. They return an object that says whether it worked. The trick is a property, here `ok`, whose literal value tells the two shapes apart. That is a **discriminated union**:

result.ts

```ts
type Result =
  | { ok: true; value: number }
  | { ok: false; error: string };

function parsePort(raw: string): Result {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `"${raw}" is not a valid port` };
  }
  return { ok: true, value: port };
}

for (const input of ["3000", "99999", "http"]) {
  const result = parsePort(input);
  if (result.ok) {
    console.log("port", result.value);
  } else {
    console.log("error:", result.error);
  }
}
```

Output of `npx tsx result.ts` and of the browser terminal

```ts
port 3000
error: "99999" is not a valid port
error: "http" is not a valid port
```

After `if (result.ok)`, TypeScript knows `result` has a `value`. In the `else` branch it knows it has an `error`. Try to read `result.value` in the `else` branch and `tsc` refuses. You cannot forget the failure case.

## Generics: one function, any type

That `Result` only works for numbers. You want the same shape for tasks, users, anything. A **generic** type takes a type as a parameter, written in angle brackets:

generic.ts

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function first<T>(items: T[]): Result<T> {
  if (items.length === 0) {
    return { ok: false, error: "the list is empty" };
  }
  return { ok: true, value: items[0]! };
}

const title = first(["Buy milk", "Call Ada"]);
const count = first([3, 1, 2]);
const none = first<string>([]);

if (title.ok) console.log(title.value.toUpperCase());
if (count.ok) console.log(count.value + 1);
if (!none.ok) console.log(none.error);
```

Output of `npx tsx generic.ts` and of the browser terminal

```ts
BUY MILK
4
the list is empty
```

`T` is a placeholder. When you call `first(["Buy milk", ...])`, TypeScript sees an array of strings, so `T` becomes `string` and `title.value` is a string. For `[3, 1, 2]`, `T` is `number`. With an empty array there is nothing to infer from, so you pass the type yourself: `first<string>([])`.

The `!` in `items[0]!` tells TypeScript "I checked, this is not undefined". Use it only right after a check like the `length` test above.

You have already used generic types without noticing: `Task[]` is short for `Array<Task>`, and an `async` function that returns a task returns a `Promise<Task>`.

## A generic repository

Here is a pattern ZudoJS uses everywhere: a **repository**, the one place that stores and finds one kind of record. Written once with a generic, it works for tasks, users or anything with an `id`:

repository.ts

```ts
interface Entity {
  readonly id: number;
}

class MemoryRepository<T extends Entity> {
  private readonly items = new Map<number, T>();

  async save(item: T): Promise<T> {
    this.items.set(item.id, item);
    return item;
  }

  async findById(id: number): Promise<T | undefined> {
    return this.items.get(id);
  }

  async findAll(): Promise<T[]> {
    return [...this.items.values()];
  }
}

interface Task extends Entity {
  title: string;
  done: boolean;
}

const tasks = new MemoryRepository<Task>();
await tasks.save({ id: 1, title: "Buy milk", done: false });
await tasks.save({ id: 2, title: "Call Ada", done: true });

console.log(await tasks.findById(2));
console.log((await tasks.findAll()).length);
```

Output of `npx tsx repository.ts` and of the browser terminal

```json
{ id: 2, title: 'Call Ada', done: true }
2
```

- `T extends Entity` means "any type, as long as it has an `id`". Without that rule, `item.id` would be an error.
- `private readonly items` can only be used inside the class, and never replaced. A `Map` is a built-in key-to-value store.
- The methods are `async` even though a `Map` answers instantly, because a real database will not. Swapping this class for a database later will not change any code that uses it.

## unknown, any, and the gap types cannot close

TypeScript has two "I don't know" types:

- `any` switches type checking off. Anything goes, nothing is checked. Avoid it.
- `unknown` means "could be anything, so prove what it is before you use it". The compiler refuses to let you use it until you narrow it.

unknown.tsNode.js only

```ts
const body: unknown = JSON.parse('{"title":"Buy milk"}');

console.log(body.title);
```

What `npx tsc --noEmit` prints

```ts
unknown.ts:3:13 - error TS18046: 'body' is of type 'unknown'.

3 console.log(body.title);
              ~~~~


Found 1 error in unknown.ts:3
```

To use it, you would have to check first: `typeof body === "object"`, then that it has a `title`, then that the title is a string. That is tedious to write by hand for every request, which is exactly the problem the next section shows.

Now the problem that matters most for a backend. `JSON.parse` is declared to return `any`, so you can put its result straight into a typed variable, and the compiler believes you:

gap.ts

```ts
interface Task {
  title: string;
  done: boolean;
}

const requestBody = '{"title": 42, "done": "sometimes"}';
const task: Task = JSON.parse(requestBody);

console.log(typeof task.title, typeof task.done);

try {
  console.log(task.title.toUpperCase());
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx gap.ts` and of the browser terminal

```ts
number string
TypeError: task.title.toUpperCase is not a function
```

This file passes `tsc` with no errors, then fails when it runs. Without the `try`, the program would crash. The types said `title` was a string. The data said otherwise, and the data won, because types are removed before the code runs (lesson 6).

Every request that reaches your API is text like `requestBody`, sent by someone else. TypeScript cannot check it. Something has to check it **while the program runs**, and turn it into a value that really matches the type. That is the first job ZudoJS will do for you, in the next lesson.

## Practice

TRY IT YOURSELF

### A generic findOrFail

Write a generic function `findOrFail<T extends { id: number }>(items: T[], id: number): Result<T>` that returns the item, or an error `"Item 7 not found"`. Try it with tasks.

**Show a solution**

find-or-fail.ts

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function findOrFail<T extends { id: number }>(items: T[], id: number): Result<T> {
  const item = items.find((i) => i.id === id);
  return item ? { ok: true, value: item } : { ok: false, error: `Item ${id} not found` };
}

const tasks = [
  { id: 1, title: "Buy milk" },
  { id: 2, title: "Call Ada" },
];

const found = findOrFail(tasks, 2);
const missing = findOrFail(tasks, 7);
console.log(found.ok && found.value.title);
console.log(!missing.ok && missing.error);
```

Output of `npx tsx find-or-fail.ts` and of the browser terminal

```ts
Call Ada
Item 7 not found
```

## Recap

- Check a union's type with `typeof` or a shared literal property, and TypeScript narrows it for you.
- A discriminated union like `{ ok: true; value } | { ok: false; error }` makes failure impossible to ignore.
- Generics (`<T>`) let one function or class work for many types. `T extends Entity` sets rules for `T`.
- Prefer `unknown` to `any`. And remember: data from outside your program is never checked by types. You need a runtime check.

You now know enough TypeScript to read and write ZudoJS code. Time to install it.
