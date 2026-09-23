---
title: "Your first Zudo code"
description: "Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors."
source: https://zudojs.oyinlola.site/learn/zudo-first-code
---

LESSON 9 OF 10

Meet ZudoJS

# Your first Zudo code

Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors.

- **35 min** to read and try
- **You need:** The ts-tasks project from lessons 6 to 8
- **You build:** A task service that validates input and reports errors like an API

## Install two packages

Lesson 8 ended with a problem: types cannot check data that arrives while the program runs. ZudoJS is a set of small packages, and two of them solve exactly that:

- `@zudojs/schema` describes what valid data looks like and checks real values against it, at runtime.
- `@zudojs/errors` has ready-made error classes, like the `NotFoundError` you wrote in lesson 5, with the right HTTP status codes built in.

In the `ts-tasks` folder from lesson 6:

Terminal on your computer

```bash
$ npm install @zudojs/schema @zudojs/errors
added 4 packages, and audited 12 packages in 5s

found 0 vulnerabilities
```

This time there is no `-D`: your program needs these packages to run, so they are ordinary **dependencies**. You asked for two packages and npm added four, because `@zudojs/schema` itself uses two more small ZudoJS packages. npm installs those for you.

> NOTE
>
> These two packages also work in the browser terminal on this page. **Run in browser** loads the same ZudoJS code you just installed.

## Describe a task once

A **schema** is a description of valid data that exists at runtime. Here is what a client must send to create a task:

task.schema.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

export const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"]), "normal"),
});

export type NewTask = Infer<typeof NewTaskSchema>;
```

Read it line by line:

- `title` must be a string. Spaces at both ends are removed with `.trim()`, then it must be 3 to 100 characters long.
- `done` must be a boolean. If the client leaves it out, it becomes `false`.
- `priority` must be one of three words, and defaults to `"normal"`.
- `Infer<typeof NewTaskSchema>` produces the TypeScript type from the schema. You describe the data **once**, and get both the runtime check and the compile-time type. They can never disagree.

## Check real data

`parse` checks a value and gives you back a clean copy that is guaranteed to match. Use it on the same bad request body from lesson 8, and on a good one:

parse.ts

```ts
import { NewTaskSchema } from "./task.schema.js";

const good = NewTaskSchema.parse(JSON.parse('{"title": "  Buy milk  "}'));
console.log(good);

const result = NewTaskSchema.safeParse(JSON.parse('{"title": 42, "done": "sometimes"}'));
if (!result.success) {
  for (const issue of result.issues) {
    console.log(issue.path.join("."), "-", issue.code, "-", issue.message);
  }
}
```

Output of `npx tsx parse.ts` and of the browser terminal

```json
{ title: 'Buy milk', done: false, priority: 'normal' }
title - invalid_type - Expected string, received number
done - invalid_type - Expected boolean, received string
```

The good body came back trimmed, with its two defaults filled in. The bad one was rejected with one **issue** per problem. Each issue says *where* (`path`), *what kind* of problem (`code`, for your code to check) and a `message` a person can read.

There are two ways to check:

| Method | On bad data | Use it when |
| --- | --- | --- |
| `safeParse(value)` | Returns `{ success: false, issues }`. Never throws. | You want to look at the problems yourself. |
| `parse(value)` | Throws a `SchemaError`. | Bad data means "stop here". This is the usual choice inside an API. |

`safeParse` returns a discriminated union, just like the `Result` type you wrote in lesson 8: after `if (!result.success)`, TypeScript knows `result.issues` exists, and after `if (result.success)` it knows `result.data` is a `NewTask`.

## Errors that already know their status code

`@zudojs/errors` replaces the error classes you wrote in lesson 5. Each one carries an HTTP `statusCode` and a stable `code` string that clients can check:

errors.ts

```ts
import { ConflictError, NotFoundError, SchemaError } from "@zudojs/errors";
import { NewTaskSchema } from "./task.schema.js";

const notFound = new NotFoundError("Task 7 not found");
console.log(notFound.name, notFound.statusCode, notFound.code);

const conflict = new ConflictError("A task with that title already exists");
console.log(conflict.name, conflict.statusCode, conflict.code);

try {
  NewTaskSchema.parse({ title: "   " });
} catch (error) {
  if (error instanceof SchemaError) {
    console.log(error.name, error.statusCode, error.message);
    console.log(error.issues.length, "issue");
  }
}
```

Output of `npx tsx errors.ts` and of the browser terminal

```ts
NotFoundError 404 ERR_RESOURCE_NOT_FOUND
ConflictError 409 ERR_CONFLICT
SchemaError 400 Validation failed
1 issue
```

The title `"   "` is a string, but `.trim()` turned it into an empty one, which is shorter than 3 characters. The `SchemaError` that `parse` threw is already a 400 Bad Request.

## Put it together: a task service

A **service** holds the rules of your application. This one creates and finds tasks. Notice its `create` method takes `unknown`: it does not trust its caller, it checks.

task.service.ts

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import { NewTaskSchema } from "./task.schema.js";
import type { NewTask } from "./task.schema.js";

export interface Task extends NewTask {
  readonly id: number;
}

export class TaskService {
  private readonly tasks = new Map<number, Task>();
  private nextId = 1;

  create(input: unknown): Task {
    const data = NewTaskSchema.parse(input);
    const clash = [...this.tasks.values()].some((t) => t.title === data.title);
    if (clash) {
      throw new ConflictError(`A task called "${data.title}" already exists`);
    }
    const task: Task = { id: this.nextId, ...data };
    this.nextId += 1;
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: number): Task {
    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }
}
```

An API answers every request with a **status code** and a JSON **body**, even when something failed. This last file sends a few requests to the service and turns every outcome into that shape. That is the job the HTTP layer will do for you in later lessons:

main.ts

```ts
import { BaseError, SchemaError } from "@zudojs/errors";
import type { SchemaIssue } from "@zudojs/schema";
import { TaskService } from "./task.service.js";

const service = new TaskService();

function respond(action: () => unknown): { status: number; body: unknown } {
  try {
    return { status: 200, body: action() };
  } catch (error) {
    if (error instanceof SchemaError) {
      const found = error.issues as readonly SchemaIssue[];
      const issues = found.map((i) => `${i.path.join(".")}: ${i.message}`);
      return { status: 400, body: { error: error.code, issues } };
    }
    if (error instanceof BaseError && error.expose) {
      return { status: error.statusCode, body: { error: error.code, message: error.message } };
    }
    return { status: 500, body: { error: "ERR_INTERNAL", message: "Something went wrong" } };
  }
}

console.log(respond(() => service.create({ title: "Buy milk", priority: "high" })));
console.log(respond(() => service.create({ title: "Buy milk" })));
console.log(respond(() => service.create({ title: "no", priority: "urgent" })));
console.log(respond(() => service.get(1)));
console.log(respond(() => service.get(99)));
```

Output of `npx tsx main.ts` and of the browser terminal

```json
{
  status: 200,
  body: { id: 1, title: 'Buy milk', done: false, priority: 'high' }
}
{
  status: 409,
  body: {
    error: 'ERR_CONFLICT',
    message: 'A task called "Buy milk" already exists'
  }
}
{
  status: 400,
  body: {
    error: 'ERR_SCHEMA_VALIDATION',
    issues: [
      'title: String must be at least 3 characters',
      'priority: Expected one of "low", "normal", "high"'
    ]
  }
}
{
  status: 200,
  body: { id: 1, title: 'Buy milk', done: false, priority: 'high' }
}
{
  status: 404,
  body: { error: 'ERR_RESOURCE_NOT_FOUND', message: 'Task 99 not found' }
}
```

Every outcome became a status and a body:

- **200**: the task was created, trimmed and completed with defaults, and then found again.
- **409 Conflict**: the same title twice.
- **400 Bad Request**: a title that is too short and a priority that is not allowed, both reported at once.
- **404 Not Found**: a task that does not exist.

One line needs explaining: `error.issues as readonly SchemaIssue[]`. `SchemaError` lives in `@zudojs/errors`, a basic package that every other ZudoJS package builds on, so it cannot know the shape of `@zudojs/schema`'s issues and types them as `unknown`. The word `as` is a **type assertion**: you tell TypeScript "trust me, these are schema issues". It checks nothing at runtime, so only use it when, as here, you know where the value came from.

`error.expose` is `true` for errors whose message is safe to show a client. Anything unexpected becomes a plain 500 with a generic message. You never send internal details, such as a stack trace, to the outside world.

Run it on your computer the same way as before. All four files go in the `ts-tasks` folder:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx main.ts
```

`tsc` prints nothing, and `tsx` prints the same five responses shown above.

## Practice

TRY IT YOURSELF

### Update a task

Add an `update(id, changes)` method to `TaskService`. It should accept any subset of the fields, so use `NewTaskSchema.partial()`, which makes every field optional. It must throw `NotFoundError` for a missing task. Try it through `respond`.

**Show a solution**

task.update.ts

```ts
import { NotFoundError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";

const TaskChanges = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.boolean(),
}).partial();

interface Task {
  readonly id: number;
  title: string;
  done: boolean;
}

const tasks = new Map<number, Task>([[1, { id: 1, title: "Buy milk", done: false }]]);

function update(id: number, input: unknown): Task {
  const task = tasks.get(id);
  if (!task) {
    throw new NotFoundError(`Task ${id} not found`);
  }
  const changes = TaskChanges.parse(input);
  const updated: Task = {
    ...task,
    title: changes.title ?? task.title,
    done: changes.done ?? task.done,
  };
  tasks.set(id, updated);
  return updated;
}

console.log(update(1, { done: true }));
console.log(TaskChanges.safeParse({ done: "yes" }).success);
try {
  update(5, { done: true });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.statusCode, error.message);
  }
}
```

Output of `npx tsx task.update.ts` and of the browser terminal

```json
{ id: 1, title: 'Buy milk', done: true }
false
404 Task 5 not found
```

The schema lives next to the code that uses it here to keep the example short. In your project, put it in `task.schema.ts`.

## Recap

- `npm install @zudojs/schema @zudojs/errors` adds runtime checking and ready-made errors.
- A schema describes valid data once. `Infer` turns it into a type, and `parse`/`safeParse` check real values while the program runs.
- `SchemaError`, `NotFoundError` and `ConflictError` carry status codes 400, 404 and 409, plus a stable `code`.
- A service takes `unknown` input, validates it, and throws the right error. Something at the edge turns errors into status codes and bodies.

You have now written the core of an API. What is missing is the part that listens on the network. For that you need a real ZudoJS project, which the CLI creates in the next lesson.
