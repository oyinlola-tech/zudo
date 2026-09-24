---
title: "Generics"
description: "Write one function, interface or class that works for many types without losing type safety, set rules with constraints and keyof, give type parameters defaults, and build a Result type and a generic repository."
source: https://zudojs.oyinlola.site/learn/ts-generics
---

LESSON 36 OF 84

TypeScript Foundation

# Generics

Write one function, interface or class that works for many types without losing type safety, set rules with constraints and keyof, give type parameters defaults, and build a Result type and a generic repository.

- **35 min** to read and try
- **You need:** Interfaces, unions and literal types
- **You build:** A typed Result helper and a generic in-memory repository for tasks and users

  [Test yourself](#test)

## Why generics

Here is a small helper that returns the first task in a list, and the same helper for users:

why.ts

```ts
interface Task { id: number; title: string }
interface User { id: number; name: string }

function firstTask(items: Task[]): Task | undefined {
  return items[0];
}

function firstUser(items: User[]): User | undefined {
  return items[0];
}

console.log(firstTask([{ id: 1, title: "Buy milk" }])?.title);
console.log(firstUser([{ id: 7, name: "Ada" }])?.name);
```

Output of `npx tsx why.ts` and of the browser terminal

```ts
Buy milk
Ada
```

The two bodies are identical. Only the types differ. You could write one version with `any`, but you learned in [Basic types](https://zudojs.oyinlola.site/learn/ts-types#any-unknown) what that costs:

any-first.ts

```ts
function firstAny(items: any[]): any {
  return items[0];
}

const title = firstAny(["Buy milk", "Call Ada"]);
try {
  console.log(title.toFixed(2));
} catch (error) {
  console.log(String(error));
}
```

Output of `npx tsx any-first.ts` and of the browser terminal

```ts
TypeError: title.toFixed is not a function
```

It compiles, and crashes. The compiler forgot that the list held strings. A **generic** is the fix: a function (or interface, or class) with a **type parameter**, a placeholder for a type that the caller fills in.

## Generic functions

A type parameter goes in angle brackets before the parameter list. By convention a single one is called `T` (for "type"):

first.ts

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const title = first(["Buy milk", "Call Ada"]);
const count = first([3, 1, 2]);
const nothing = first<string>([]);

console.log(title?.toUpperCase(), (count ?? 0) + 1, nothing);
```

Output of `npx tsx first.ts` and of the browser terminal

```ts
BUY MILK 4 undefined
```

When you call `first(["Buy milk", "Call Ada"])`, TypeScript sees an array of strings, so `T` becomes `string` and `title` is `string | undefined`. For `[3, 1, 2]`, `T` is `number`. This is **inference** again. With an empty array there is nothing to infer from, so you pass the type yourself: `first<string>([])`.

A function can have several type parameters. This one turns a list into a `Map`, looked up by a key that a callback picks:

index-by.ts

```ts
function indexBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of items) map.set(keyOf(item), item);
  return map;
}

const users = [
  { id: 1, email: "ada@example.com", name: "Ada" },
  { id: 2, email: "grace@example.com", name: "Grace" },
];

const byEmail = indexBy(users, (user) => user.email);
const byId = indexBy(users, (user) => user.id);

console.log(byEmail.get("grace@example.com")?.name);
console.log(byId.get(1)?.name, byId.size);
```

Output of `npx tsx index-by.ts` and of the browser terminal

```ts
Grace
Ada 2
```

`T` is inferred from the list and `K` from what the callback returns: `string` for `byEmail`, `number` for `byId`. So `byId.get("1")` would be a type error, which is right, because the map's keys are numbers.

You have used generic types since the first lessons without the name: `Array<string>`, `Promise<Task>` and `Map<K, T>` are all generic types from JavaScript's standard library.

## Generic interfaces and types

Interfaces and type aliases can take type parameters too. An API that returns long lists sends them one page at a time. The page shape is the same for tasks and users; only the items differ:

page.ts

```ts
interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly totalPages: number;
}

function paginate<T>(all: readonly T[], page: number, size: number): Page<T> {
  const start = (page - 1) * size;
  return { items: all.slice(start, start + size), page, totalPages: Math.ceil(all.length / size) };
}

const titles = ["Buy milk", "Call Ada", "File taxes", "Fix bug", "Water plants"];
const second: Page<string> = paginate(titles, 2, 2);
console.log(second);
```

Output of `npx tsx page.ts` and of the browser terminal

```json
{ items: [ 'File taxes', 'Fix bug' ], page: 2, totalPages: 3 }
```

A generic type is like a function for types: `Page<string>` "calls" `Page` with `T = string`, and gives an object whose `items` are strings.

## Constraints: extends and keyof

Inside a generic function, `T` could be anything, so TypeScript lets you do almost nothing with it. Try to read an `id`:

find.ts

```ts
function findById<T>(items: readonly T[], id: number): T | undefined {
  return items.find((item) => item.id === id);
}
```

What `npx tsc --noEmit` prints

```ts
find.ts:2:36 - error TS2339: Property 'id' does not exist on type 'T'.

2   return items.find((item) => item.id === id);
                                     ~~


Found 1 error in find.ts:2
```

That is correct: someone could call `findById([1, 2, 3], 1)`, and numbers have no `id`. A **constraint**, written `T extends …`, sets a rule for `T`: "any type, as long as it has at least this shape".

find.ts

```ts
function findById<T extends { id: number }>(items: readonly T[], id: number): T | undefined {
  return items.find((item) => item.id === id);
}

function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

const tasks = [
  { id: 1, title: "Buy milk", done: false },
  { id: 2, title: "Call Ada", done: true },
];

console.log(findById(tasks, 2)?.title);
console.log(pluck(tasks, "title"));
console.log(pluck(tasks, "done"));
```

Output of `npx tsx find.ts` and of the browser terminal

```ts
Call Ada
[ 'Buy milk', 'Call Ada' ]
[ false, true ]
```

- `T extends { id: number }`: `T` can be a task, a user, anything with a numeric `id`. And the result is still the full `T`: `findById(tasks, 2)?.title` works.
- `keyof T` is the union of `T`'s property names, here `"id" | "title" | "done"`. `K extends keyof T` means "one of those names", and `T[K]` is the type of that property. So `pluck(tasks, "title")` is a `string[]` and `pluck(tasks, "done")` a `boolean[]`.

A name that is not a property is refused:

pluck-typo.ts

```ts
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

pluck([{ id: 1, title: "Buy milk" }], "titel");
```

What `npx tsc --noEmit` prints

```ts
pluck-typo.ts:5:39 - error TS2345: Argument of type '"titel"' is not assignable to parameter of type '"id" | "title"'.

5 pluck([{ id: 1, title: "Buy milk" }], "titel");
                                        ~~~~~~~


Found 1 error in pluck-typo.ts:5
```

`keyof` and `T[K]` get a full section of their own in [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced).

## A Result type, with defaults

Many functions can fail in expected ways: a port number out of range, a missing record. Instead of throwing, they can return an object that says whether it worked. You know the tool for that from [Interfaces, unions and literal types](https://zudojs.oyinlola.site/learn/ts-objects#discriminated): a discriminated union. Made generic, it works for any value and any error:

result.ts

```ts
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

function parsePort(raw: string): Result<number> {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return err(`"${raw}" is not a valid port`);
  }
  return ok(port);
}

for (const input of ["3000", "99999", "http"]) {
  const result = parsePort(input);
  console.log(result.ok ? `port ${result.value}` : `error: ${result.error}`);
}
```

Output of `npx tsx result.ts` and of the browser terminal

```ts
port 3000
error: "99999" is not a valid port
error: "http" is not a valid port
```

- `E = string` is a **default type parameter**. `Result<number>` means `Result<number, string>`. Pass a second type when you need a different error: `Result<User, "not-found" | "suspended">`.
- `ok` returns `Result<T, never>`: a success can never hold an error, so it fits any `Result<T, E>`. The same goes for `err`.
- After `result.ok`, TypeScript knows which member you have. You cannot read `result.value` without checking first, so you cannot forget the failure case.

Some ZudoJS packages use this idea: `@zudojs/schema`'s `safeParse` returns a result object with a `success` flag instead of throwing.

## Generic classes: a repository

Classes can be generic too. Here is a pattern ZudoJS uses everywhere: a **repository**, the one place that stores and finds one kind of record. Written once, it works for tasks, users or anything with an `id`:

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

  async findWhere(match: (item: T) => boolean): Promise<T[]> {
    return [...this.items.values()].filter(match);
  }
}

interface Task extends Entity { title: string; done: boolean }
interface User extends Entity { email: string }

const tasks = new MemoryRepository<Task>();
await tasks.save({ id: 1, title: "Buy milk", done: false });
await tasks.save({ id: 2, title: "Call Ada", done: true });

const users = new MemoryRepository<User>();
await users.save({ id: 1, email: "ada@example.com" });

console.log(await tasks.findById(2));
console.log((await tasks.findWhere((task) => !task.done)).map((task) => task.title));
console.log((await users.findById(1))?.email);
```

Output of `npx tsx repository.ts` and of the browser terminal

```json
{ id: 2, title: 'Call Ada', done: true }
[ 'Buy milk' ]
ada@example.com
```

- `new MemoryRepository<Task>()` fixes `T` for that object. `tasks.save` now only accepts tasks, and `findById` returns a `Task`. Try `tasks.save({ id: 3, email: "x" })`: it is a type error.
- `private readonly items` can only be used inside the class and never replaced. [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes) covers these words.
- The methods are `async` even though a `Map` answers instantly, because a real database will not. Swapping this class for a database version later will not change any code that uses it.

## Practice

TRY IT YOURSELF

### A generic findOrFail

Using the `Result` type from this lesson, write `findOrFail<T extends { id: number }>(items: readonly T[], id: number): Result<T>` that returns the item, or the error `"Item 7 not found"`.

**Show a solution**

find-or-fail.ts

```ts
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

function findOrFail<T extends { id: number }>(items: readonly T[], id: number): Result<T> {
  const item = items.find((i) => i.id === id);
  return item ? { ok: true, value: item } : { ok: false, error: `Item ${id} not found` };
}

const tasks = [
  { id: 1, title: "Buy milk" },
  { id: 2, title: "Call Ada" },
];

const found = findOrFail(tasks, 2);
const missing = findOrFail(tasks, 7);
if (found.ok) console.log(found.value.title);
if (!missing.ok) console.log(missing.error);
```

Output of `npx tsx find-or-fail.ts` and of the browser terminal

```ts
Call Ada
Item 7 not found
```

TRY IT YOURSELF

### Group by a key

Write `groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]>`. Group tasks by their `status` and print how many are in each group.

**Show a solution**

group-by.ts

```ts
function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

type Status = "todo" | "doing" | "done";
const tasks: { title: string; status: Status }[] = [
  { title: "Buy milk", status: "done" },
  { title: "Fix bug", status: "doing" },
  { title: "Call Ada", status: "done" },
];

for (const [status, group] of groupBy(tasks, (task) => task.status)) {
  console.log(status, group.length);
}
```

Output of `npx tsx group-by.ts` and of the browser terminal

```ts
done 2
doing 1
```

TRY IT YOURSELF

### A typed stack

Write a class `Stack<T>` with `push(item: T): void`, `pop(): T | undefined` and a `size` getter. Use it for an "undo" list of task titles.

**Show a solution**

stack.ts

```ts
class Stack<T> {
  private readonly items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  get size(): number {
    return this.items.length;
  }
}

const undo = new Stack<string>();
undo.push("rename: Buy milk");
undo.push("delete: Call Ada");
console.log(undo.pop(), undo.size);
```

Output of `npx tsx stack.ts` and of the browser terminal

```ts
delete: Call Ada 1
```

## Recap

- A generic has type parameters (`<T>`) that the caller fills in, usually by inference. It keeps full type safety where `any` would lose it.
- Functions, interfaces, type aliases and classes can all be generic.
- `T extends Shape` sets a rule for `T`. `K extends keyof T` means "one of `T`'s property names", and `T[K]` is that property's type.
- `E = string` gives a type parameter a default.
- `Result<T, E>` makes failure part of the return type; a generic repository stores any kind of record.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
