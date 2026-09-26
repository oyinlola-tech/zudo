---
title: "Advanced and utility types — ZudoJS Academy"
description: "Derive types from one source of truth with keyof, typeof, indexed access and the utility types, and get a first look at mapped, conditional and template types."
source: https://zudojs.oyinlola.site/learn/ts-advanced
---

LEVEL 5 · LESSON 16 OF 23

Generics and type operators Foundation

# Advanced and utility types

Derive types from one source of truth with keyof, typeof, indexed access and the utility types, and get a first look at mapped, conditional and template types.

- **45 min** to read and try
- **You need:** Generics and Designing generic APIs
- **You build:** Task API types derived from one Task interface - create input, patch, summary, labels and event names - so they can never drift apart

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Derive types from values with typeof, keyof and indexed access
- Keep one list for runtime and types with as const and (typeof LIST)[number]
- Derive create, patch and summary shapes with Omit, Partial, Pick and Record
- Get types from functions with ReturnType, Parameters and Awaited
- Read simple mapped, conditional and template literal types

## One source of truth

A Task API needs several shapes of a task: the full task, what a client sends to create one (no `id`), what it sends to change one (every field optional), a short summary for lists. You could write four interfaces by hand. Then someone adds a `priority` field to one and forgets the other three.

This lesson shows how to **compute** types from other types, so that there is one definition and everything else follows from it. You already did a little of this in [Generics](https://zudojs.oyinlola.site/learn/ts-generics#constraints) with `keyof T` and `T[K]`. This lesson is the everyday toolkit; the Advanced TypeScript course, which follows this one, gives each tool a lesson of its own.

## keyof and typeof

`typeof` exists in JavaScript: `typeof x` gives a string like `"number"` while the program runs. In a **type position** (after a colon, or in a `type` declaration) TypeScript's `typeof` means something else: "the type of this variable". `keyof` then gives the union of a type's property names:

settings.ts

```ts
const defaults = { pageSize: 20, sort: "newest", showDone: false };

type Settings = typeof defaults;
type SettingName = keyof Settings;

function setting<K extends SettingName>(settings: Settings, name: K, value: Settings[K]): Settings {
  return { ...settings, [name]: value };
}

let mine: Settings = defaults;
mine = setting(mine, "pageSize", 50);
mine = setting(mine, "showDone", true);
console.log(mine);
```

Output of `npx tsx settings.ts` and of the browser terminal

```json
{ pageSize: 50, sort: 'newest', showDone: true }
```

`Settings` is `{ pageSize: number; sort: string; showDone: boolean }`, taken from the value, so you never write it twice. `SettingName` is `"pageSize" | "sort" | "showDone"`. And `Settings[K]`, an **indexed access type**, is the type of the property called `K`. Together they tie the value to the name:

settings.ts

```ts
const defaults = { pageSize: 20, sort: "newest", showDone: false };
type Settings = typeof defaults;

function setting<K extends keyof Settings>(settings: Settings, name: K, value: Settings[K]): Settings {
  return { ...settings, [name]: value };
}

setting(defaults, "pageSize", "big");
setting(defaults, "theme", "dark");
```

What `npx tsc --noEmit` prints

```ts
settings.ts:8:31 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

8 setting(defaults, "pageSize", "big");
                                ~~~~~

settings.ts:9:19 - error TS2345: Argument of type '"theme"' is not assignable to parameter of type '"pageSize" | "showDone" | "sort"'.

9 setting(defaults, "theme", "dark");
                    ~~~~~~~


Found 2 errors in the same file, starting at: settings.ts:8
```

## Indexed access and as const

Indexed access works on any type. `Task["status"]` is the type of a task's status, and `T[number]` is the type of an array's elements. Combined with `as const`, this lets you write a list once and use it both at runtime and as a type:

status.ts

```ts
export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

export interface Task {
  readonly id: number;
  title: string;
  status: Status;
  tags: string[];
  dueDate: string | null;
}

type TaskId = Task["id"];
type Tag = Task["tags"][number];

const id: TaskId = 7;
const tag: Tag = "home";
for (const status of STATUSES) console.log(status);
console.log(id, tag);
```

Output of `npx tsx status.ts` and of the browser terminal

```ts
todo
doing
done
7 home
```

- `as const` (from [Type inference in depth](https://zudojs.oyinlola.site/learn/ts-inference#widening)) tells TypeScript the array will never change, so it keeps the exact values: its type is `readonly ["todo", "doing", "done"]`, not `string[]`.
- `(typeof STATUSES)[number]` is "the type of any element": `"todo" | "doing" | "done"`.
- `STATUSES` still exists when the program runs, so you can loop over it, show it in a dropdown, or check input against it. Add a status to the array and the `Status` type follows.

[Type operators](https://zudojs.oyinlola.site/learn/ts-type-operators) goes deeper into `typeof`, `keyof` and indexed access, including lookups inside generic functions.

## The utility types

TypeScript ships with generic types that transform other types. They are called **utility types**, and you will see them all over real code, ZudoJS included:

| Utility | Gives |
| --- | --- |
| `Partial<T>` | Every property optional |
| `Required<T>` | Every property required |
| `Readonly<T>` | Every property `readonly` |
| `Pick<T, "a" \| "b">` | Only the listed properties |
| `Omit<T, "a" \| "b">` | Every property except the listed ones |
| `Record<K, V>` | An object with a property of type `V` for every key in `K` |
| `ReturnType<F>`, `Parameters<F>` | What a function type returns, and its parameters as a tuple |
| `Awaited<T>` | What `await` gives for a `Promise<T>` |
| `NonNullable<T>` | `T` without `null` and `undefined` |
| `Exclude<U, X>` | The members of union `U` that are not in `X` |
| `Extract<U, X>` | The members of union `U` that fit `X` |

### Input shapes: Omit, Partial and Pick

REASON IT OUT

### What may a client send?

The Task API has three endpoints that receive or return tasks: create, update and list. Before deriving any type, decide for each field of `Task` (`id`, `title`, `status`, `tags`, `dueDate`):

1. Which fields may a client send when creating a task, and which does the server decide?
2. In an update, which fields may be left out? Which must never be changed?
3. A client wants to remove a task's due date. How is that different from not mentioning the due date at all?
4. A list only shows ids and titles. Should its items still carry the full task?

**Show the reasoning**

1. Everything except `id`: the server assigns ids. That is `Omit<Task, "id">`.
2. Any field may be left out of an update, so every property is optional, but `id` is still not allowed: `Partial<Omit<Task, "id">>`.
3. Removing sends `dueDate: null`; not mentioning it leaves the property out (`undefined`). The update code must treat those differently, which is why `applyPatch` below checks `=== undefined` instead of using `??` for `dueDate`.
4. No: send only what is shown, `Pick<Task, "id" | "title">`, built by copying those two fields. Smaller responses leak less.

Here are the Task API's shapes, all derived from the `Task` interface above:

task-shapes.ts

```ts
import type { Task } from "./status.js";

export type NewTask = Omit<Task, "id">;
export type TaskPatch = Partial<Omit<Task, "id">>;
export type TaskSummary = Pick<Task, "id" | "title">;

function applyPatch(task: Task, patch: TaskPatch): Task {
  return {
    ...task,
    title: patch.title ?? task.title,
    status: patch.status ?? task.status,
    tags: patch.tags ?? task.tags,
    dueDate: patch.dueDate === undefined ? task.dueDate : patch.dueDate,
  };
}

const input: NewTask = { title: "Buy milk", status: "todo", tags: [], dueDate: null };
const task: Task = { id: 1, ...input };
const updated = applyPatch(task, { status: "doing", dueDate: "2026-10-01" });
const summary: TaskSummary = { id: updated.id, title: updated.title };
console.log(updated, summary);
```

Output of `npx tsx task-shapes.ts` and of the browser terminal

```json
{
  id: 1,
  title: 'Buy milk',
  status: 'doing',
  tags: [],
  dueDate: '2026-10-01'
} { id: 1, title: 'Buy milk' }
```

`applyPatch` copies each field by name instead of spreading the patch, for the reason you saw in [the user module](https://zudojs.oyinlola.site/learn/ts-objects#build): never let outside data overwrite fields it should not touch. Note also `dueDate`: a patch may set it to `null` ("remove the due date"), which is different from leaving it out.

Now the payoff. Each derived type catches a real bug:

task-shapes.ts

```ts
import type { Task } from "./status.js";

type NewTask = Omit<Task, "id">;
type TaskPatch = Partial<Omit<Task, "id">>;

const input: NewTask = { id: 99, title: "Buy milk", status: "todo", tags: [], dueDate: null };
const patch: TaskPatch = { status: "finished" };
const frozen: Readonly<Task> = { id: 1, title: "Call Ada", status: "todo", tags: [], dueDate: null };
frozen.title = "Call Grace";
```

What `npx tsc --noEmit` prints

```ts
task-shapes.ts:6:26 - error TS2353: Object literal may only specify known properties, and 'id' does not exist in type 'NewTask'.

6 const input: NewTask = { id: 99, title: "Buy milk", status: "todo", tags: [], dueDate: null };
                           ~~

task-shapes.ts:7:28 - error TS2322: Type '"finished"' is not assignable to type '"doing" | "done" | "todo" | undefined'.

7 const patch: TaskPatch = { status: "finished" };
                             ~~~~~~

  status.ts:7:3 - The expected type comes from property 'status' which is declared here on type 'Partial<Omit<Task, "id">>'
    7   status: Status;
        ~~~~~~

task-shapes.ts:9:8 - error TS2540: Cannot assign to 'title' because it is a read-only property.

9 frozen.title = "Call Grace";
         ~~~~~


Found 3 errors in the same file, starting at: task-shapes.ts:6
```

A client may not choose its own `id`; a patch cannot set a status that does not exist; a `Readonly` task cannot be changed. None of these types repeats a single property of `Task`.

### Record and Required

record.ts

```ts
import type { Status } from "./status.js";

const labels: Record<Status, string> = { todo: "To do", doing: "In progress", done: "Done" };

interface ListOptions {
  pageSize?: number;
  sort?: "newest" | "oldest";
}

function resolveOptions(options: ListOptions): Required<ListOptions> {
  return { pageSize: options.pageSize ?? 20, sort: options.sort ?? "newest" };
}

console.log(labels.doing);
console.log(resolveOptions({ sort: "oldest" }));
```

Output of `npx tsx record.ts` and of the browser terminal

```ts
In progress
{ pageSize: 20, sort: 'oldest' }
```

`Record<Status, string>` needs a label for **every** status. Add `"blocked"` to `STATUSES`, and this object stops compiling until you add its label. `Required<ListOptions>` is the options after defaults are filled in, so code that receives it never checks for `undefined`.

### Types from functions: ReturnType, Parameters, Awaited

Sometimes the function comes first, and you want its types without writing them again:

derive.ts

```ts
async function loadStats(userId: number, includeDone: boolean) {
  return { userId, open: 3, done: includeDone ? 5 : 0 };
}

type StatsArgs = Parameters<typeof loadStats>;
type Stats = Awaited<ReturnType<typeof loadStats>>;

function printStats(stats: Stats): void {
  console.log(`user ${stats.userId}: ${stats.open} open, ${stats.done} done`);
}

const args: StatsArgs = [7, true];
printStats(await loadStats(...args));
```

Output of `npx tsx derive.ts` and of the browser terminal

```ts
user 7: 3 open, 5 done
```

- `typeof loadStats` is the function's type. `ReturnType` of it is `Promise<{ userId: number; open: number; done: number }>`.
- `Awaited` removes the `Promise`, giving the object type.
- `Parameters` gives the tuple `[userId: number, includeDone: boolean]`.

### NonNullable and Exclude

non-null.ts

```ts
import type { Status } from "./status.js";

type OpenStatus = Exclude<Status, "done">;
type Email = NonNullable<string | null | undefined>;

const open: OpenStatus[] = ["todo", "doing"];
const maybeEmails = ["ada@example.com", null, "grace@example.com", undefined];
const emails: Email[] = maybeEmails.filter((email) => email != null);

console.log(open, emails);
```

Output of `npx tsx non-null.ts` and of the browser terminal

```json
[ 'todo', 'doing' ] [ 'ada@example.com', 'grace@example.com' ]
```

`Exclude<Status, "done">` is `"todo" | "doing"`, and `NonNullable` leaves just `string`. Since version 5.5, TypeScript also understands that `filter((email) => email != null)` removes the nulls, so the result is a `string[]` and fits `Email[]`.

## Mapped types

How are `Partial` and `Readonly` made? With a **mapped type**: a type that loops over the keys of another type, like `for … in` loops over an object's keys. `{ [K in keyof T]: … }` means "for each property name `K` of `T`, make a property with this type":

mapped.ts

```ts
import type { Task } from "./status.js";

type NewTask = Omit<Task, "id">;
type Touched<T> = { [K in keyof T]: boolean };
type Errors<T> = { [K in keyof T]?: string };
type MyPartial<T> = { [K in keyof T]?: T[K] };

const touched: Touched<NewTask> = { title: true, status: false, tags: false, dueDate: true };
const errors: Errors<NewTask> = { title: "must be at least 3 characters" };
const draft: MyPartial<NewTask> = { title: "Bu" };

const shown = Object.keys(errors).filter((field) => touched[field as keyof NewTask]);
console.log(draft, shown);
```

Output of `npx tsx mapped.ts` and of the browser terminal

```json
{ title: 'Bu' } [ 'title' ]
```

This is a form: `Touched` remembers which fields the user has visited, `Errors` holds a message per field, and `MyPartial` is exactly how the built-in `Partial` is written. Add a field to `Task`, and all three follow. (The `as keyof NewTask` is needed because `Object.keys` always returns `string[]`; [Type assertions](https://zudojs.oyinlola.site/learn/ts-assertions#justified) explains when such an `as` is safe.)

Inside a mapped type, `?` and `readonly` add those marks, and `-?` and `-readonly` remove them. `Required<T>` is `{ [K in keyof T]-?: T[K] }`. [Utility types](https://zudojs.oyinlola.site/learn/ts-utility-types) and [Mapped types](https://zudojs.oyinlola.site/learn/ts-mapped-types), in the Advanced TypeScript course, build every utility type from these parts.

## Conditional types and infer

A **conditional type** chooses between two types with a test, written like the `? :` operator: `T extends U ? X : Y` means "if `T` fits `U`, then `X`, else `Y`". Inside the test, `infer` captures a part of the type in a new name:

conditional.ts

```ts
type IsText<T> = T extends string ? "text" : "other";
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type Unwrap<T> = T extends Promise<infer V> ? V : T;

const a: IsText<"hello"> = "other";
const b: ElementOf<boolean[]> = "yes";
const c: Unwrap<Promise<number>> = "42";
const d: Unwrap<string> = 42;
```

What `npx tsc --noEmit` prints

```ts
conditional.ts:5:7 - error TS2322: Type '"other"' is not assignable to type '"text"'.

5 const a: IsText<"hello"> = "other";
        ~

conditional.ts:6:7 - error TS2322: Type 'string' is not assignable to type 'boolean'.

6 const b: ElementOf<boolean[]> = "yes";
        ~

conditional.ts:7:7 - error TS2322: Type 'string' is not assignable to type 'number'.

7 const c: Unwrap<Promise<number>> = "42";
        ~

conditional.ts:8:7 - error TS2322: Type 'number' is not assignable to type 'string'.

8 const d: Unwrap<string> = 42;
        ~


Found 4 errors in the same file, starting at: conditional.ts:5
```

This file is written to fail, as a trick to *see* types: assign a wrong value, and the error message names the type the compiler computed. (In VS Code you can simply hover.) Reading the messages:

- `IsText<"hello">` is `"text"`.
- `ElementOf<boolean[]>` is `boolean`: `infer E` captured the element type.
- `Unwrap<Promise<number>>` is `number`, and `Unwrap<string>` is just `string`, because it is not a promise. That is roughly how `Awaited` works.

When the tested type is a union, a conditional type is applied to each member separately. That is how `Exclude<U, X>` works: it is `U extends X ? never : U`, and `never` members disappear from a union. You will rarely write conditional types in application code, but reading them helps you understand library types. [Conditional types](https://zudojs.oyinlola.site/learn/ts-conditional-types) covers them in depth.

## Template literal types

Template strings have a type-level twin. A **template literal type** builds string types from other string types, and with unions it produces every combination:

events.ts

```ts
type Entity = "task" | "user";
type Action = "created" | "updated" | "deleted";
type EventName = `${Entity}.${Action}`;
type ApiPath = `/${string}`;

const handlers = new Map<EventName, string[]>();

function on(event: EventName, handlerName: string): void {
  handlers.set(event, [...(handlers.get(event) ?? []), handlerName]);
}

const base: ApiPath = "/tasks";
on("task.created", "sendWelcomeEmail");
on("user.deleted", "removeSessions");
console.log(base, [...handlers.keys()]);
```

Output of `npx tsx events.ts` and of the browser terminal

```ts
/tasks [ 'task.created', 'user.deleted' ]
```

`EventName` is a union of six strings, from `"task.created"` to `"user.deleted"`, without writing any of them out. `ApiPath` is any string that starts with `/`. Typos in event names are a classic source of silent bugs: the event fires, nobody listens. Here they cannot compile:

events.ts

```ts
type EventName = `${"task" | "user"}.${"created" | "updated" | "deleted"}`;
type ApiPath = `/${string}`;

function on(event: EventName, handlerName: string): void {}

on("task.create", "sendWelcomeEmail");
const base: ApiPath = "tasks";
```

What `npx tsc --noEmit` prints

```ts
events.ts:6:4 - error TS2345: Argument of type '"task.create"' is not assignable to parameter of type '"task.created" | "task.deleted" | "task.updated" | "user.created" | "user.deleted" | "user.updated"'.

6 on("task.create", "sendWelcomeEmail");
     ~~~~~~~~~~~~~

events.ts:7:7 - error TS2322: Type '"tasks"' is not assignable to type '`/${string}`'.

7 const base: ApiPath = "tasks";
        ~~~~


Found 2 errors in the same file, starting at: events.ts:6
```

TypeScript also has four built-in helpers for string types: `Uppercase`, `Lowercase`, `Capitalize` and `Uncapitalize`. For example, `\`on${Capitalize<Action>}\`` gives `"onCreated" | "onUpdated" | "onDeleted"`. [Template literal types](https://zudojs.oyinlola.site/learn/ts-template-literals) goes further, including taking strings apart with `infer`.

## Practice

TRY IT YOURSELF

### A public user

Given `interface User { id: number; email: string; name: string; passwordHash: string; role: "member" | "admin" }`, write a type `PublicUser` without `passwordHash`, and a function `toPublic(user: User): PublicUser`. Why should `toPublic` build a new object by name instead of deleting a property from a copy?

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Uncomment `PublicUser` and use it as `toPublic`'s return type: `function toPublic(user: User): PublicUser`.

HINT 2

Build a fresh object naming each field to keep: `{ id: user.id, email: user.email, name: user.name, role: user.role }`, the same way `toPublicProduct` does above.

SOLUTION

public-user.ts

```ts
interface User {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  role: "member" | "admin";
}

type PublicUser = Omit<User, "passwordHash">;

function toPublic(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

const ada: User = { id: 1, email: "ada@example.com", name: "Ada", passwordHash: "(a real hash)", role: "admin" };
console.log(toPublic(ada));
```

Output of `npx tsx public-user.ts` and of the browser terminal

```json
{ id: 1, email: 'ada@example.com', name: 'Ada', role: 'admin' }
```

Listing the fields to **keep** is safe by default: when someone later adds a secret field, such as `resetToken`, it is not sent unless you add it here. Deleting the fields to hide is unsafe by default: the new secret leaks until someone remembers to delete it too. And the type alone would not protect you: `return user;` also compiles, because a full `User` has every property a `PublicUser` needs, and the extra `passwordHash` is only refused in a fresh object literal. The runtime object would still carry the hash.

TRY IT YOURSELF

### Labels for every event

Using `EventName` from the lesson, write `const descriptions: Record<EventName, string>`. How many properties must it have? What happens if you add `"archived"` to `Action`?

Work it out first, on paper or in your head. Then use the hints, and compare with the solution.

HINT 1

`EventName` is a template literal type built from two unions. Count how many strings `\`${Entity}.${Action}\`` can produce: it is every combination, not a sum.

HINT 2

`Record<EventName, string>` needs one property per member of that union. Adding a member to `Action` changes `EventName` itself, which is what makes the object react to it.

SOLUTION

Six, one for each combination of `Entity` and `Action`. Adding `"archived"` makes it eight, and the compiler reports the object as missing `"task.archived"` and `"user.archived"` until you add them. That is the point: the list of descriptions can never fall behind the list of events.

TRY IT YOURSELF

### Write your own Nullable

Write a mapped type `Nullable<T>` that allows `null` for every property of `T`, and use it for a task where any field may be missing in an old database row.

Write it in the editor, then press **Check**. Hints and the solution open up once you have checked your code.

HINT 1

Uncomment `Nullable`: `{ [K in keyof T]: T[K] | null }`, one union with `null` per property. Annotate the row with it: `const legacyRow: Nullable<Task> = { id: 3, title: null, dueDate: null };`.

HINT 2

Then default each field when you print it: `console.log(legacyRow.title ?? "(untitled)", legacyRow.dueDate ?? "(no due date)");`.

SOLUTION

nullable.ts

```ts
type Nullable<T> = { [K in keyof T]: T[K] | null };

interface Task {
  id: number;
  title: string;
  dueDate: string;
}

const legacyRow: Nullable<Task> = { id: 3, title: null, dueDate: null };
console.log(legacyRow.title ?? "(untitled)", legacyRow.dueDate ?? "(no due date)");
```

Output of `npx tsx nullable.ts` and of the browser terminal

```ts
(untitled) (no due date)
```

## Recap

- In a type position, `typeof value` is the value's type, `keyof T` the union of its property names, and `T[K]` a property's type.
- `as const` plus `(typeof LIST)[number]` gives one list for runtime and type.
- `Partial`, `Required`, `Readonly`, `Pick`, `Omit` and `Record` derive shapes from one interface. `ReturnType`, `Parameters` and `Awaited` derive types from functions.
- Mapped types loop over keys; conditional types choose with `extends ? :` and capture parts with `infer`.
- Template literal types build string unions such as event names, so typos do not compile.

Next: [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes), where classes get typed properties, access modifiers and interfaces to implement.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
