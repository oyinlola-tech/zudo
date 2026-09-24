---
title: "TypeScript and JavaScript together"
description: "See exactly what TypeScript becomes when it runs, why types cannot check outside data, and how to close that gap by hand with type guards, assertion functions and a validator that returns a Result."
source: https://zudojs.oyinlola.site/learn/ts-runtime
---

LESSON 40 OF 84

TypeScript Foundation

# TypeScript and JavaScript together

See exactly what TypeScript becomes when it runs, why types cannot check outside data, and how to close that gap by hand with type guards, assertion functions and a validator that returns a Result.

- **45 min** to read and try
- **You need:** Modules in TypeScript
- **You build:** A type-safe create-task handler that turns untrusted JSON into a checked NewTask, or a list of problems

  [Test yourself](#test)

## From TypeScript to a running program

Every TypeScript program goes through the same steps:

1. **TypeScript**: you write `.ts` files with types. `tsc` checks them.
2. **JavaScript**: the types are removed, by `tsc`, `tsx` or Node.js.
3. **Node.js**: runs the JavaScript. It has never heard of your types.
4. **Your application**: receives requests, reads files and databases, and talks to other services, all while running.

Here is a small file. It has an interface, a type alias, annotations, a default parameter and a type assertion (`as`):

erase.ts

```ts
interface Task {
  id: number;
  title: string;
}

type Status = "todo" | "done";

function label(task: Task, status: Status = "todo"): string {
  return `${task.title} (${status})`;
}

const raw: unknown = { id: 1, title: "Buy milk" };
const task = raw as Task;
console.log(label(task));
```

Output of `npx tsx erase.ts` and of the browser terminal

```ts
Buy milk (todo)
```

Compile it in your `ts-tasks` folder, and read what Node.js will actually run:

Terminal on your computer

```bash
$ npx tsc --noEmit false --outDir dist
$ cat dist/erase.js
function label(task, status = "todo") {
    return `${task.title} (${status})`;
}
const raw = { id: 1, title: "Buy milk" };
const task = raw;
console.log(label(task));
export {};
```

The interface and the type alias are gone. So are the annotations. The default value `= "todo"` stayed, because it is JavaScript. And look at `const task = raw;`: the `as Task` became **nothing at all**. No check, no conversion. This is called **type erasure**, and it explains everything in this lesson.

## Compile time and runtime

There are two worlds. **Compile time** is when `tsc` reads your code. **Runtime** is when Node.js runs it. Types live only in the first:

| Only at compile time (erased) | Also at runtime (real JavaScript) |
| --- | --- |
| `interface`, `type`, annotations, generics | Values, functions, classes |
| `value as Task` | `typeof value === "string"` |
| `private`, `readonly`, `import type` | `#private`, `Object.freeze`, `import` |
| Checking that `task.title` exists | `"title" in task`, `value instanceof Date`, `Array.isArray(value)` |

So you cannot ask, while the program runs, "is this value a `Task`?". There is no `Task` left to ask about:

instanceof.ts

```ts
interface Task {
  id: number;
  title: string;
}

function isTask(value: unknown): boolean {
  return value instanceof Task;
}
```

What `npx tsc --noEmit` prints

```ts
instanceof.ts:7:27 - error TS2693: 'Task' only refers to a type, but is being used as a value here.

7   return value instanceof Task;
                            ~~~~


Found 1 error in instanceof.ts:7
```

`instanceof` works with classes, because a class is also a real JavaScript value. An interface is not. To check a value against an interface, you have to check its parts with runtime tools: `typeof`, `in`, `Array.isArray`.

## The gap: data from outside

Inside your program, the compiler follows every value from where it is made to where it is used. But a backend's most important data comes from **outside**: request bodies, query strings, environment variables, files, database rows, other APIs. That data arrives while the program runs, as text, and the compiler never saw it.

The trap is `JSON.parse`. It is declared to return `any`, so you can put its result straight into a typed variable, and the compiler believes you:

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

This file passes `tsc` with no errors, then fails when it runs. Without the `try`, the program would crash. The types said `title` was a string. The data said otherwise, and the data won, because the types were erased before the code ran.

Every request that reaches your API is text like `requestBody`, sent by someone else, possibly an attacker. Something has to check it **at runtime** and turn it into a value that really matches the type. The rest of this lesson builds that check by hand.

## Type assertions: when as lies

`value as Task` is a **type assertion**. It tells the compiler "trust me, this is a `Task`". You just saw it compile to nothing. It changes the type the compiler believes, never the value:

as-lies.ts

```ts
interface Task {
  id: number;
  title: string;
}

const body: unknown = JSON.parse('{"id": "7"}');
const task = body as Task;
const id = "42" as unknown as number;

console.log(typeof task.id, task.title);
console.log(typeof id, id + 1);
```

Output of `npx tsx as-lies.ts` and of the browser terminal

```ts
string undefined
string 421
```

- `task.id` is typed as a `number`, but it is the string `"7"`, and `task.title` is typed as a `string` but does not exist.
- `"42" as unknown as number` compiles, and `id + 1` gives `"421"`: string joining, not addition. TypeScript refuses `"42" as number` directly because it is obviously wrong, but going through `unknown` silences every objection.

When is `as` acceptable? Only when **you know something the compiler cannot**, and you have checked it yourself. `as const` is always safe: it makes a type narrower, not different. `field as keyof NewTask` right after `Object.keys` on an object you built yourself, as in [Advanced and utility types](https://zudojs.oyinlola.site/learn/ts-advanced#mapped), is safe. On data from outside, `as` is never a check. The same goes for `any` and for the `!` operator (`value!`, "not null, trust me"): each one switches the compiler off for one spot.

## Type guards: value is T

You already narrow types with `typeof` and `in`. A **type guard** packs such checks into a function you can reuse. Its return type, `value is NewTask`, is called a **type predicate**: when the function returns `true`, TypeScript narrows the argument to that type.

guard.ts

```ts
interface NewTask {
  title: string;
  done: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNewTask(value: unknown): value is NewTask {
  return isRecord(value) && typeof value.title === "string" && typeof value.done === "boolean";
}

for (const text of ['{"title": "Buy milk", "done": false}', '{"title": 42, "done": "sometimes"}', "[1, 2]", "null"]) {
  const body: unknown = JSON.parse(text);
  if (isNewTask(body)) {
    console.log("valid:", body.title.toUpperCase());
  } else {
    console.log("invalid:", text);
  }
}
```

Output of `npx tsx guard.ts` and of the browser terminal

```ts
valid: BUY MILK
invalid: {"title": 42, "done": "sometimes"}
invalid: [1, 2]
invalid: null
```

- `body` is `unknown`: the honest type for parsed JSON. Writing `const body: unknown` stops `any` from spreading.
- `isRecord` checks the value is a plain object. `typeof null` is `"object"` in JavaScript, and so is an array, so both need their own test.
- Inside `if (isNewTask(body))`, `body` is a `NewTask`, and `.toUpperCase()` is allowed.

> THE COMPILER TRUSTS YOUR GUARD
>
> TypeScript does not check that the body of a type guard matches its predicate. A guard that forgets to check `done` still narrows to `NewTask`, and the bug is back. Type guards are the one place where a type can lie, so keep them short and write tests for them.

## Assertion functions: asserts value is T

A type guard returns a boolean and you write the `if`. An **assertion function** throws instead, and when it returns normally, the value is narrowed for the rest of the code. Its return type is `asserts value is T`:

asserts.ts

```ts
interface NewTask {
  title: string;
  done: boolean;
}

function assertNewTask(value: unknown): asserts value is NewTask {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("body must be a JSON object");
  }
  if (!("title" in value) || typeof value.title !== "string") {
    throw new TypeError("title must be a string");
  }
  if (!("done" in value) || typeof value.done !== "boolean") {
    throw new TypeError("done must be true or false");
  }
}

for (const text of ['{"title": "Call Ada", "done": true}', '{"title": "Call Ada"}']) {
  const body: unknown = JSON.parse(text);
  try {
    assertNewTask(body);
    console.log(body.title, body.done);
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx asserts.ts` and of the browser terminal

```ts
Call Ada true
TypeError: done must be true or false
```

After `assertNewTask(body)`, `body` is a `NewTask` on every following line. This version also uses `in` instead of `isRecord`: after `"title" in value`, TypeScript knows `value` has a `title` property, of type `unknown`, which `typeof` then narrows. Use an assertion function when bad data should stop the work, and a type guard when you want to choose what to do.

## unknown in catch

There is one more place where outside data sneaks in: `catch`. JavaScript lets code `throw` anything, not only `Error` objects. So with `strict` on, the variable in `catch (error)` has the type `unknown`:

catch.ts

```ts
try {
  JSON.parse("{not json");
} catch (error) {
  console.log(error.message);
}
```

What `npx tsc --noEmit` prints

```ts
catch.ts:4:15 - error TS18046: 'error' is of type 'unknown'.

4   console.log(error.message);
                ~~~~~


Found 1 error in catch.ts:4
```

catch.ts

```ts
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

try {
  JSON.parse("{not json");
} catch (error) {
  console.log("bad JSON:", messageOf(error));
}

try {
  throw "a plain string";
} catch (error) {
  console.log("thrown:", messageOf(error));
}
```

Output of `npx tsx catch.ts` and of the browser terminal

```ts
bad JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)
thrown: a plain string
```

`error instanceof Error` is a runtime check (`Error` is a class), so it narrows. Never write `catch (error: any)`; it just hides the question.

## Build: a validator that returns a Result

A real API should not stop at the first problem. It should tell the client everything that is wrong, in one answer. It should also clean the data: trim spaces, enforce lengths, and **copy only the fields it expects**, so a client cannot sneak in an `id` or a `role` (the mass assignment hole from [the user module](https://zudojs.oyinlola.site/learn/ts-objects#build)). Here is a validator that does all of that and returns the `Result` type from [Generics](https://zudojs.oyinlola.site/learn/ts-generics#result):

validate.ts

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type Priority = "low" | "normal" | "high";
export interface NewTask {
  title: string;
  done: boolean;
  priority: Priority;
}

const PRIORITIES: readonly Priority[] = ["low", "normal", "high"];

function isPriority(value: unknown): value is Priority {
  return PRIORITIES.some((p) => p === value);
}

export function parseNewTask(body: unknown): Result<NewTask, string[]> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: ["body must be a JSON object"] };
  }
  const input = body as Record<string, unknown>;
  const issues: string[] = [];
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3 || title.length > 100) issues.push("title must be a string of 3 to 100 characters");
  const done = input.done ?? false;
  if (typeof done !== "boolean") issues.push("done must be true or false");
  const priority = input.priority ?? "normal";
  if (!isPriority(priority)) issues.push(`priority must be one of ${PRIORITIES.join(", ")}`);
  if (issues.length > 0 || typeof done !== "boolean" || !isPriority(priority)) {
    return { ok: false, error: issues };
  }
  return { ok: true, value: { title, done, priority } };
}
```

Read it top to bottom. The one `as` is safe: the line before it proved `body` is a non-null, non-array object, and `Record<string, unknown>` still says "every property is unknown". Each field is read, checked, and given its default. The final object is built by hand from three checked variables, so nothing else the client sent can get through.

The last `if` repeats `typeof done` and `isPriority` even though `issues` already says whether they failed. The compiler cannot connect "the array is empty" to "these checks passed", so the checks are written where it can see them. Now the handler, the one function that touches the raw request:

handler.ts

```ts
import { parseNewTask } from "./validate.js";
import type { NewTask } from "./validate.js";

interface Reply {
  status: number;
  body: unknown;
}

let nextId = 1;
function createTask(input: NewTask): { id: number } & NewTask {
  return { id: nextId++, ...input };
}

export function handleCreateTask(rawBody: string): Reply {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "body is not valid JSON" } };
  }
  const result = parseNewTask(body);
  if (!result.ok) return { status: 422, body: { error: "invalid task", issues: result.error } };
  return { status: 201, body: createTask(result.value) };
}

console.log(handleCreateTask('{"title": "  Buy milk ", "priority": "high"}'));
console.log(handleCreateTask('{"title": 42, "done": "sometimes"}'));
console.log(handleCreateTask('{"title": "Fix bug", "id": 999, "role": "admin"}'));
console.log(handleCreateTask("{not json"));
```

Output of `npx tsx handler.ts` and of the browser terminal

```json
{
  status: 201,
  body: { id: 1, title: 'Buy milk', done: false, priority: 'high' }
}
{
  status: 422,
  body: {
    error: 'invalid task',
    issues: [
      'title must be a string of 3 to 100 characters',
      'done must be true or false'
    ]
  }
}
{
  status: 201,
  body: { id: 2, title: 'Fix bug', done: false, priority: 'normal' }
}
{ status: 400, body: { error: 'body is not valid JSON' } }
```

Four requests, four correct answers. The spaces around `"Buy milk"` were trimmed. The bad body from earlier got a **422** with both problems listed, as you designed in [the REST design lesson](https://zudojs.oyinlola.site/learn/rest-design). The third client tried to choose its own `id` and make itself an `admin`; both fields were simply dropped. Broken JSON got a **400**. And `createTask` takes a `NewTask`, so it can only ever be called with checked data.

## Designing type-safe APIs

What you just built follows a handful of rules that hold for any TypeScript backend:

- **Type the boundary as `unknown`.** Everything from outside (request bodies, `process.env`, files, other APIs) starts as `unknown`, never `any`.
- **Validate once, at the edge.** Turn `unknown` into a precise type in one place. Inner functions such as `createTask(input: NewTask)` take only checked types, so they never need to check again.
- **Return failures in the type.** `Result<T, E>` or a discriminated union makes the caller handle the bad case. Throw for things that should never happen.
- **Prefer guards to `as`, `unknown` to `any`, checks to `!`.** Every escape hatch is a spot the compiler can no longer help you.
- **Allow-list fields.** Build output and input objects from named fields, never by spreading what a client sent, and never by sending a whole internal object.
- **Make wrong states unwritable.** Literal unions instead of free strings, `readonly` where things must not change, discriminated unions instead of many optional fields.

## Hand-written validators get long

Count the lines. Checking three fields took about twenty lines of careful code, plus a trick to keep the compiler convinced, plus the `NewTask` interface written separately from the checks. If someone adds a field to the interface and forgets the validator, nothing warns them. A real API has dozens of request shapes, with nested objects, arrays, e-mail addresses and dates.

That is exactly the problem `@zudojs/schema` solves. You describe the shape once, as a schema; it checks values at runtime, collects every issue, strips unknown fields, and gives you the TypeScript type for free, so the type and the check can never disagree. The same task, with ZudoJS:

```ts
const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"]), "normal"),
});
type NewTask = Infer<typeof NewTaskSchema>;
```

You will install it and use it in [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code). Now you know exactly what it does for you, and why.

## Practice

TRY IT YOURSELF

### Read a port from the environment

Write `readPort(value: string | undefined): Result<number, string>` for `process.env.PORT`. Missing means `3000`. Anything that is not a whole number from 1 to 65535 is an error. Why is the parameter `string | undefined` and not `number`?

**Show a solution**

port.ts

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function readPort(value: string | undefined): Result<number, string> {
  if (value === undefined || value.trim() === "") return { ok: true, value: 3000 };
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `PORT must be a whole number from 1 to 65535, got "${value}"` };
  }
  return { ok: true, value: port };
}

for (const input of [undefined, "8080", "80.5", "http"]) {
  console.log(readPort(input));
}
```

Output of `npx tsx port.ts` and of the browser terminal

```json
{ ok: true, value: 3000 }
{ ok: true, value: 8080 }
{
  ok: false,
  error: 'PORT must be a whole number from 1 to 65535, got "80.5"'
}
{
  ok: false,
  error: 'PORT must be a whole number from 1 to 65535, got "http"'
}
```

Environment variables are always strings, or missing. That is what `@types/node` says too: `process.env.PORT` has the type `string | undefined`. In your program you would call `readPort(process.env.PORT)` and stop with a clear message when the result is not `ok`.

TRY IT YOURSELF

### Find the lying guard

This guard compiles, and the program crashes. Find the bug, fix the guard, and explain why `tsc` did not catch it.

lying-guard.ts

```ts
interface User {
  email: string;
  tags: string[];
}

function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null && "email" in value;
}

const body: unknown = JSON.parse('{"email": "ada@example.com"}');
if (isUser(body)) {
  try {
    console.log(body.tags.join(", "));
  } catch (error) {
    console.log(String(error));
  }
}
```

Output of `npx tsx lying-guard.ts` and of the browser terminal

```ts
TypeError: Cannot read properties of undefined (reading 'join')
```

**Show a solution**

The guard only checks that `email` exists. It checks neither that `email` is a string nor that `tags` is an array of strings. `tsc` does not compare a guard's body with its `value is User` promise; it simply believes it.

lying-guard.ts

```ts
interface User {
  email: string;
  tags: string[];
}

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  if (!("email" in value) || typeof value.email !== "string") return false;
  if (!("tags" in value) || !Array.isArray(value.tags)) return false;
  return value.tags.every((tag: unknown) => typeof tag === "string");
}

const body: unknown = JSON.parse('{"email": "ada@example.com"}');
console.log(isUser(body) ? body.tags.join(", ") : "not a user");
```

Output of `npx tsx lying-guard.ts` and of the browser terminal

```ts
not a user
```

TRY IT YOURSELF

### Validate a patch

Write `parseTaskPatch(body: unknown): Result<{ title?: string; done?: boolean }, string[]>`. Both fields are optional, but when present they must be valid (title 3 to 100 characters after trimming). An empty patch `{}` is an error: there is nothing to change.

**Show a solution**

patch.ts

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
interface TaskPatch {
  title?: string;
  done?: boolean;
}

function parseTaskPatch(body: unknown): Result<TaskPatch, string[]> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: ["body must be a JSON object"] };
  }
  const input = body as Record<string, unknown>;
  const patch: TaskPatch = {};
  const issues: string[] = [];
  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length >= 3 && title.length <= 100) patch.title = title;
    else issues.push("title must be a string of 3 to 100 characters");
  }
  if (input.done !== undefined) {
    if (typeof input.done === "boolean") patch.done = input.done;
    else issues.push("done must be true or false");
  }
  if (issues.length === 0 && Object.keys(patch).length === 0) issues.push("nothing to change");
  return issues.length > 0 ? { ok: false, error: issues } : { ok: true, value: patch };
}

console.log(parseTaskPatch({ done: true }));
console.log(parseTaskPatch({ title: "  Buy oat milk " }));
console.log(parseTaskPatch({ id: 5 }));
console.log(parseTaskPatch({ title: "x", done: "yes" }));
```

Output of `npx tsx patch.ts` and of the browser terminal

```json
{ ok: true, value: { done: true } }
{ ok: true, value: { title: 'Buy oat milk' } }
{ ok: false, error: [ 'nothing to change' ] }
{
  ok: false,
  error: [
    'title must be a string of 3 to 100 characters',
    'done must be true or false'
  ]
}
```

`{ id: 5 }` is refused as "nothing to change": the `id` is ignored, because only allowed fields are ever copied into `patch`.

## Recap

- TypeScript becomes JavaScript before it runs. Types, interfaces and `as` are erased; only JavaScript checks exist at runtime.
- Outside data (JSON, `process.env`, files, other APIs) was never seen by the compiler. Type it as `unknown`.
- `as` changes what the compiler believes, never the value. Do not use it on outside data.
- Type guards (`value is T`) and assertion functions (`asserts value is T`) narrow `unknown` after real checks. The compiler trusts them, so keep them correct.
- In `catch`, the error is `unknown`; check with `instanceof Error`.
- Validate once at the boundary, return a `Result` with every issue, and copy only allowed fields. `@zudojs/schema` does this for you, next.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
