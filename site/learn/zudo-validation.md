---
title: "Schemas and validation in depth"
description: "Validate everything that crosses the Task API's boundary with @zudojs/schema. Read issues, coerce query strings, transform and refine values, block unknown fields, validate requests in routes and responses on the way out, and guard against hostile JSON with @zudojs/validation."
source: https://zudojs.oyinlola.site/learn/zudo-validation
---

LESSON 54 OF 84

The ZudoJS core Core

# Schemas and validation in depth

Validate everything that crosses the Task API's boundary with @zudojs/schema. Read issues, coerce query strings, transform and refine values, block unknown fields, validate requests in routes and responses on the way out, and guard against hostile JSON with @zudojs/validation.

- **50 min** to read and try
- **You need:** Configuration, and Your first Zudo code
- **You build:** A Task API that validates route parameters, query strings and bodies, supports filtered lists and partial updates, and never sends a field it did not mean to

  [Test yourself](#test)

## Validate at the boundary

In [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code) you met `@zudojs/schema`: describe data once, then `parse` (throws a `SchemaError`) or `safeParse` (returns `{ success, data }` or `{ success, issues }`). You have since used schemas for request bodies and for configuration. This lesson goes deeper.

The rule behind all of it: every value that enters your program from outside is **untrusted** until a schema has checked it. For an HTTP API, "outside" means the route parameters, the query string, the headers and the body. The place where outside data comes in is the **trust boundary**. Validate there, once, and the code behind it (the services) can rely on clean, typed data.

First, a closer look at the **issues** a failed check returns, and how to turn them into something a client can use:

issues.ts

```ts
import { schema } from "@zudojs/schema";
import type { SchemaIssue } from "@zudojs/schema";

const NewTask = schema.object({
  title: schema.string().trim().min(3).max(100),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
  tags: schema.default(schema.array(schema.string().max(20)).max(5), []),
});

function fieldErrors(issues: readonly SchemaIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    errors[issue.path.join(".") || "(body)"] ??= issue.message;
  }
  return errors;
}

const result = NewTask.safeParse({ title: "no", priority: "urgent", tags: ["home", 42] });
if (!result.success) {
  console.log(result.issues[1]);
  console.log(fieldErrors(result.issues));
}

const early = NewTask.safeParse({ title: 1, priority: 2 }, { abortEarly: true });
console.log(early.success ? "ok" : early.issues.length);
```

Output of `npx tsx issues.ts` and of the browser terminal

```json
{
  code: 'invalid_enum',
  path: [ 'priority' ],
  message: 'Expected one of "low", "normal", "high"',
  expected: '"low", "normal", "high"',
  received: '"urgent"'
}
{
  title: 'String must be at least 3 characters',
  priority: 'Expected one of "low", "normal", "high"',
  'tags.1': 'Expected string, received number'
}
1
```

An issue has a `code` for your program, a `path` to the field (`["tags", 1]` means the second tag), a `message` for people, and often `expected` and `received`. `fieldErrors` turns the list into one message per field, which is easy for a web form to show next to each input. `abortEarly: true` stops at the first problem when you do not need them all.

## Coercion: query strings are strings

You saw in [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http#query) that every query value is a string, or an array of strings for a repeated key, and checking them by hand took many lines. **Coercion** means converting a value to the right type *before* checking it. `schema.coerce.number()` and `schema.coerce.boolean()` do that, strictly:

query.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const ListTasksQuery = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  limit: schema.coerce.number().int().min(1).max(50).default(20),
  done: schema.coerce.boolean().optional(),
  priority: schema.optional(schema.enum(["low", "normal", "high"] as const)),
});
export type ListTasks = Infer<typeof ListTasksQuery>;

for (const query of [
  {},
  { page: "2", limit: "10", done: "false", priority: "high" },
  { done: "yes" },
  { limit: "7.5", page: "" },
  { page: ["1", "2"], priority: "urgent" },
]) {
  const result = ListTasksQuery.safeParse(query);
  console.log(JSON.stringify(query), "->", result.success ? result.data : result.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
}
```

Output of `npx tsx query.ts` and of the browser terminal

```json
{} -> { page: 1, limit: 20 }
{"page":"2","limit":"10","done":"false","priority":"high"} -> { page: 2, limit: 10, done: false, priority: 'high' }
{"done":"yes"} -> { page: 1, limit: 20, done: true }
{"limit":"7.5","page":""} -> [
  'page: Cannot coerce string to number',
  'limit: Expected integer, received 7.5'
]
{"page":["1","2"],"priority":"urgent"} -> [
  'page: Cannot coerce array to number',
  'priority: Expected one of "low", "normal", "high"'
]
```

Read the results:

- An empty query got the defaults: page 1, 20 per page. The optional `done` and `priority` were not sent, so they are not in the result at all.
- `"2"` became the number 2, and `"false"` the boolean `false`. `"yes"` is also accepted as `true`, like `"1"` and `"on"`.
- `"7.5"` is a number but not a whole one, and an empty `page=` is refused instead of becoming 0.
- A repeated key (an array) cannot become one number, and `"urgent"` is not an allowed priority.

Only coerce input that really arrives as text: query strings, route parameters, headers, form fields, environment variables. A JSON body has real numbers and booleans, so use the normal `schema.number()` there; coercing would accept `"1"` where the client should have sent `1`.

## Transformations

A schema can also **transform**: return a changed value after the check passes. You already use small built-in ones, `trim()` and `toLowerCase()`. `.transform(fn)` runs your own function, and the output type follows whatever the function returns:

transform.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer, SchemaInput } from "@zudojs/schema";

const TagList = schema
  .string()
  .max(200)
  .transform((text) => text.split(",").map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0));

type TagListInput = SchemaInput<typeof TagList>;
type TagListOutput = Infer<typeof TagList>;

const input: TagListInput = " Home, URGENT,,errands ";
const output: TagListOutput = TagList.parse(input);
console.log(output);
console.log(TagList.safeParse(42).success);
```

Output of `npx tsx transform.ts` and of the browser terminal

```json
[ 'home', 'urgent', 'errands' ]
false
```

`SchemaInput` names what the schema accepts, a `string`, and `Infer` says what it gives back: a `string[]`. The transform only ran because the input was a valid string of at most 200 characters; for `42` it never ran.

`.transform()` and `.refine()` exist as methods on every simple schema: strings, numbers, booleans, enums and the `coerce` schemas. For an object or an array, use the wrapper functions `schema.transform(inner, fn)` and `schema.refine(inner, check, message)`.

## Refinements: your own rules

Built-in rules cover types, lengths and formats. A **refinement** adds a rule of your own: a function that returns `true` when the value is fine, plus the message to report when it is not.

The Task API gets due dates. `schema.string().date()` accepts a real calendar date written as `YYYY-MM-DD`. Your own rule on top: the team does not work at weekends, so a due date must be a weekday:

dates.ts

```ts
import { schema } from "@zudojs/schema";

const CalendarDate = schema.string().date();

function isWeekday(text: string): boolean {
  const day = new Date(`${text}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

const DueDate = CalendarDate.refine(isWeekday, "Due dates must be on a weekday");

for (const text of ["2026-10-01", "2026-10-03", "2026-02-30", "2026-13-45", "1 October"]) {
  const result = DueDate.safeParse(text);
  console.log(text.padEnd(10), CalendarDate.safeParse(text).success, result.success ? "ok" : result.issues[0]?.message);
}
```

Output of `npx tsx dates.ts` and of the browser terminal

```ts
2026-10-01 true ok
2026-10-03 true Due dates must be on a weekday
2026-02-30 false Not a real calendar date
2026-13-45 false Not a real calendar date
1 October  false Invalid date format
```

The middle column shows what `.date()` alone decides. It checks the shape of the text *and* that the date exists: 30 February and month 13 have the right shape, so they get their own message, "Not a real calendar date", while "1 October" has the wrong shape and gets "Invalid date format". (Before `@zudojs/schema` 1.2.0, `.date()` only checked the shape.) Only 3 October 2026 passed `.date()` and then failed the refinement, because it is a Saturday. `getUTCDay()` returns 0 for Sunday and 6 for Saturday.

A rule that compares two fields belongs on the object. `schema.refine` wraps the object schema. The `path`-less issue it reports belongs to the whole object:

object-refine.ts

```ts
import { schema } from "@zudojs/schema";

const Reminder = schema.refine(
  schema.object({ remindOn: schema.string().date(), dueOn: schema.string().date() }),
  (value) => value.remindOn <= value.dueOn,
  "The reminder must not be after the due date",
);

console.log(Reminder.safeParse({ remindOn: "2026-09-30", dueOn: "2026-10-01" }).success);
console.log(Reminder.safeParse({ remindOn: "2026-10-05", dueOn: "2026-10-01" }));
```

Output of `npx tsx object-refine.ts` and of the browser terminal

```ts
true
{
  success: false,
  issues: [
    {
      code: 'custom',
      path: [],
      message: 'The reminder must not be after the due date'
    }
  ]
}
```

Comparing the two strings works because dates in `YYYY-MM-DD` form sort in the same order as the dates themselves. Keep refinements **synchronous and pure**: they check the value, nothing else. "Does this title already exist?" needs the database, so it belongs in the service, which throws `ConflictError`, not in the schema.

## Partial updates and unknown fields

A `PATCH /tasks/:id` request changes only the fields it sends. `NewTaskSchema.partial()` makes every field optional. Look at what it does with a field that has a **default**:

partial.ts

```ts
import { schema } from "@zudojs/schema";

const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
});

console.log(NewTaskSchema.parse({ title: "Walk the dog" }));
console.log(NewTaskSchema.partial().parse({ title: "Walk the dog" }));
```

Output of `npx tsx partial.ts` and of the browser terminal

```json
{ title: 'Walk the dog', priority: 'normal' }
{ title: 'Walk the dog' }
```

Creating a task fills in `priority: 'normal'`. The partial version does not: it contains exactly the fields the client sent. That is what an update needs. Defaults describe *creating* a task, and an update must not invent values, or it would quietly reset a stored `high` priority to `normal`. This is how `partial()` works since `@zudojs/schema` 1.2.0.

What about fields the client must not change at all, such as `id` or `createdAt`? By default an object schema **strips** unknown keys: they disappear from the result. That is already safe. `.strict()` goes further and **rejects** them, so a client that sends a field you do not accept learns about its mistake instead of wondering why nothing changed. A refinement also refuses an empty update:

update-schema.ts

```ts
import { schema } from "@zudojs/schema";

const NewTaskSchema = schema.object({
  title: schema.string().trim().min(3).max(100),
  done: schema.default(schema.boolean(), false),
  priority: schema.default(schema.enum(["low", "normal", "high"] as const), "normal"),
});

const UpdateTaskSchema = schema.refine(
  NewTaskSchema.partial().strict(),
  (changes) => Object.keys(changes).length > 0,
  "Send at least one field to change",
);

for (const body of [{ done: true }, { title: "Walk", id: 1, createdAt: "2020-01-01" }, {}]) {
  const result = UpdateTaskSchema.safeParse(body);
  console.log(JSON.stringify(body), "->", result.success ? result.data : result.issues.map((i) => i.message));
}
```

Output of `npx tsx update-schema.ts` and of the browser terminal

```json
{"done":true} -> { done: true }
{"title":"Walk","id":1,"createdAt":"2020-01-01"} -> [ 'Unknown key: id', 'Unknown key: createdAt' ]
{} -> [ 'Send at least one field to change' ]
```

Blindly copying request fields onto a stored object is a classic security hole called **mass assignment**: a client adds `"ownerId": 1` or `"role": "admin"` to a request and takes over data or rights. An explicit schema that lists exactly the changeable fields, strict or stripping, is the defence. Never spread the raw body (`{ ...task, ...body }`).

The *parsed* changes are a different matter. They only contain allowed fields, and only the ones the client sent, so merging them over the stored task keeps everything else:

merge.ts

```ts
import { schema } from "@zudojs/schema";

const UpdateTask = schema
  .object({ title: schema.string().trim().min(3).max(100), done: schema.boolean() })
  .partial()
  .strict();

const stored = { id: 1, title: "Buy milk", done: false };
const changes = UpdateTask.parse({ done: true });

console.log("changes:", changes);
console.log("merged:", { ...stored, ...changes });
```

Output of `npx tsx merge.ts` and of the browser terminal

```ts
changes: { done: true }
merged: { id: 1, title: 'Buy milk', done: true }
```

The title the client did not mention is still there. The Task API's service below still copies each field by name with `??`. That is one line longer, but it makes the list of changeable fields visible right where the stored task is written.

## Validating requests in a route

A route has up to three inputs to check: route parameters, the query string and the body. A small helper makes each check one line. It uses `parse`, so a failure throws a `SchemaError`, which `@zudojs/http` already answers with 400. To also show *which* fields failed, this version catches the error and returns the issues:

route.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createResponseContext, createRouter } from "@zudojs/http";
import { isSchemaValidationError, schema } from "@zudojs/schema";

const Params = schema.object({ id: schema.coerce.number().int().min(1) });
const Query = schema.object({ fields: schema.optional(schema.enum(["title", "all"] as const)) });

const router = createRouter();
router.get("/tasks/:id", (ctx) => {
  try {
    const { id } = Params.parse(ctx.params);
    const { fields } = Query.parse(ctx.query);
    const task = { id, title: "Buy milk", done: false };
    return fields === "title" ? { id, title: task.title } : task;
  } catch (error) {
    if (isSchemaValidationError(error)) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return createResponseContext({ status: 400 }).json({ error: "ERR_VALIDATION", issues });
    }
    throw error;
  }
});

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
for (const path of ["/tasks/1?fields=title", "/tasks/0", "/tasks/abc?fields=everything"]) {
  const response = await fetch(`http://127.0.0.1:${server.address?.port}${path}`);
  console.log(path, response.status, await response.text());
}
await server.stop();
```

Output of `npx tsx route.ts`

```ts
/tasks/1?fields=title 200 {"id":1,"title":"Buy milk"}
/tasks/0 400 {"error":"ERR_VALIDATION","issues":["id: Expected >= 1, received 0"]}
/tasks/abc?fields=everything 400 {"error":"ERR_VALIDATION","issues":["id: Cannot coerce string to number"]}
```

`isSchemaValidationError` is the type guard you know from [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code#service): after it, `error.issues` is typed as schema issues. With `safeParse` you need no guard at all, because `result.issues` is already typed.

Catching in every route would repeat the same lines everywhere. In [The ZudoJS error system](https://zudojs.oyinlola.site/learn/zudo-errors) one error handler does it for all routes, so routes can simply call `parse`.

## Validating responses

Validation is not only for what comes in. What goes *out* matters too. A stored task may carry fields that are none of the client's business: an internal owner id, a flag for soft deletion, a password hash on a user record. If a route sends the stored object as it is, every field goes out, including ones added next year by someone who never looked at this route.

A **response schema** is an allow-list: because object schemas strip unknown keys, parsing the stored object keeps only the listed fields. It also catches bugs, such as a missing field, before the client sees them:

response.ts

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const TaskResponse = schema.object({
  id: schema.number().int().min(1),
  title: schema.string().max(100),
  done: schema.boolean(),
  priority: schema.enum(["low", "normal", "high"] as const),
});
type TaskResponse = Infer<typeof TaskResponse>;

const stored = {
  id: 7,
  title: "Buy milk",
  done: false,
  priority: "normal",
  ownerId: 42,
  deletedAt: null,
  internalNotes: "flagged by the spam filter",
};

const body: TaskResponse = TaskResponse.parse(stored);
console.log(body);

const broken = TaskResponse.safeParse({ ...stored, priority: undefined });
console.log(broken.success ? "ok" : broken.issues[0]);
```

Output of `npx tsx response.ts` and of the browser terminal

```json
{ id: 7, title: 'Buy milk', done: false, priority: 'normal' }
{
  code: 'required',
  path: [ 'priority' ],
  message: 'Required field missing: priority'
}
```

The three internal fields were dropped. And a stored task with a missing priority, a bug somewhere in your own code, was caught instead of sent. That is a server error, not a client error, so in a route let it become a 500 and fix the bug.

Validating every response costs a little time. Many teams validate responses in development and tests, and only apply the allow-list (by parsing) in production. For small objects like tasks, simply always parsing is fine.

## Guards for hostile JSON

A schema walks through a value to check it. A hostile client can send JSON built to make that walk expensive: an array nested thousands of levels deep, or megabytes of data in one field. `@zudojs/validation` has cheap **structural guards** that stop as soon as a limit is passed, before any schema runs. It is already in the Task API's dependencies:

guards.ts

```ts
import { assertDepthWithinLimit, assertSizeWithinLimit } from "@zudojs/validation";
import { BaseError } from "@zudojs/errors";

const bodies: [string, unknown][] = [
  ["normal", { title: "Buy milk", tags: ["home"] }],
  ["too deep", JSON.parse("[".repeat(1000) + "]".repeat(1000))],
  ["too big", { title: "x".repeat(50_000) }],
];

for (const [label, body] of bodies) {
  try {
    assertDepthWithinLimit(body, 10);
    assertSizeWithinLimit(body, 16_384);
    console.log(label, "-> passed");
  } catch (error) {
    const e = error as BaseError;
    console.log(label, "->", e.name, e.statusCode, e.message);
  }
}
```

Output of `npx tsx guards.ts` and of the browser terminal

```ts
normal -> passed
too deep -> SerializationDepthError 400 Maximum serialization depth exceeded: 11 > 10
too big -> SerializationPayloadTooLargeError 413 Serialized payload too large: 100013 bytes (max: 16384)
```

Both hostile bodies were stopped. The size check is an estimate: it counts two bytes per character, so it is deliberately on the high side.

Look at the status codes. The size error is a **413 Payload Too Large**, and the depth error a **400 Bad Request**: both are the client's mistake, so thrown from a route they become the right 4xx answer by themselves.

> NOTE
>
> `@zudojs/validation` also offers a complete schema system based on the Zod library (`validate`, `z.object(...)`). It does not share schemas with `@zudojs/schema`. Pick one per project; this course uses `@zudojs/schema` and only borrows the guards.

## Put it in the Task API

Now give the Task API a filtered, paginated list and a `PATCH` route. First the schemas. Replace `src/dtos/tasks.dto.ts`:

src/dtos/tasks.dto.tsNode.js only

```ts
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const Title = schema.string().trim().min(3).max(100);
const Priority = schema.enum(["low", "normal", "high"] as const);

export const NewTaskSchema = schema.object({
  title: Title,
  done: schema.default(schema.boolean(), false),
  priority: schema.default(Priority, "normal"),
});
export type NewTask = Infer<typeof NewTaskSchema>;

export const UpdateTaskSchema = schema.refine(
  NewTaskSchema.partial().strict(),
  (changes) => Object.keys(changes).length > 0,
  "Send at least one field to change",
);
export type TaskChanges = Infer<typeof UpdateTaskSchema>;

export const TaskIdParams = schema.object({ id: schema.coerce.number().int().min(1) });

export const ListTasksQuery = schema.object({
  page: schema.coerce.number().int().min(1).default(1),
  limit: schema.coerce.number().int().min(1).max(50).default(20),
  done: schema.coerce.boolean().optional(),
  priority: schema.optional(Priority),
});
export type ListTasks = Infer<typeof ListTasksQuery>;

export const TaskResponse = schema.object({
  id: schema.number(),
  title: schema.string().max(100),
  done: schema.boolean(),
  priority: Priority,
  createdAt: schema.string().max(40),
});
```

The `TaskStore` is unchanged. The service gets a filtered `list` and an `update` method. Its input types come from the schemas, so it trusts that the route has validated them:

**Show the unchanged task store**

src/repositories/tasks.store.ts

```ts
export type Priority = "low" | "normal" | "high";

export interface StoredTask {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
  readonly priority: Priority;
  readonly createdAt: string;
}

export class TaskStore {
  public readonly tasks = new Map<number, StoredTask>();
  public connected = false;
  private lastId = 0;

  public nextId(): number {
    this.lastId += 1;
    return this.lastId;
  }
}
```

src/services/tasks.service.tsNode.js only

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import { ListTasksQuery, NewTaskSchema } from "../dtos/tasks.dto.js";
import type { ListTasks, TaskChanges } from "../dtos/tasks.dto.js";
import type { StoredTask, TaskStore } from "../repositories/tasks.store.js";

export interface Clock {
  now(): Date;
}

export class TaskService {
  public constructor(private readonly store: TaskStore, private readonly clock: Clock) {}

  public create(input: unknown): StoredTask {
    const data = NewTaskSchema.parse(input);
    this.assertUniqueTitle(data.title);
    const task: StoredTask = { id: this.store.nextId(), ...data, createdAt: this.clock.now().toISOString() };
    this.store.tasks.set(task.id, task);
    return task;
  }

  public list(query: ListTasks = ListTasksQuery.parse({})): StoredTask[] {
    const matching = [...this.store.tasks.values()].filter(
      (t) => (query.done === undefined || t.done === query.done) && (query.priority === undefined || t.priority === query.priority),
    );
    const start = (query.page - 1) * query.limit;
    return matching.slice(start, start + query.limit);
  }

  public get(id: number): StoredTask {
    const task = this.store.tasks.get(id);
    if (!task) {
      throw new NotFoundError(`Task ${id} not found`);
    }
    return task;
  }

  public update(id: number, changes: TaskChanges): StoredTask {
    const task = this.get(id);
    if (changes.title !== undefined && changes.title !== task.title) {
      this.assertUniqueTitle(changes.title);
    }
    const updated: StoredTask = {
      ...task,
      title: changes.title ?? task.title,
      done: changes.done ?? task.done,
      priority: changes.priority ?? task.priority,
    };
    this.store.tasks.set(id, updated);
    return updated;
  }

  private assertUniqueTitle(title: string): void {
    if ([...this.store.tasks.values()].some((t) => t.title === title)) {
      throw new ConflictError(`A task called "${title}" already exists`);
    }
  }
}
```

When `list` is called without a query, it uses the schema's defaults (page 1, 20 tasks), so the check scripts from earlier lessons keep working. `update` copies each field explicitly: only the three changeable fields can ever change, whatever the request contained.

In `src/utils/http.ts`, `readJsonBody` now runs the guards on every body, right after parsing. Add `import { assertDepthWithinLimit, assertSizeWithinLimit } from "@zudojs/validation";` at the top (the package is already in the project's dependencies), and change the end of the function. Delete `parseId` from the same file: the `TaskIdParams` schema replaces it.

src/utils/http.ts (part)Node.js only

```ts
/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400,
 * JSON nested deeper than 10 levels with 400 and more than 64 KB of data with 413.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  assertDepthWithinLimit(data, 10);
  assertSizeWithinLimit(data, 65_536);
  return data;
}
```

**Show the whole src/utils/http.ts**

src/utils/http.ts

```ts
import {
  HttpError,
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";
import { assertDepthWithinLimit, assertSizeWithinLimit } from "@zudojs/validation";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * A body that is not sent as JSON is answered with 415, malformed JSON with 400,
 * JSON nested deeper than 10 levels with 400 and more than 64 KB of data with 413.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  const type = ctx.request.getHeader("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send JSON with Content-Type: application/json");
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  assertDepthWithinLimit(data, 10);
  assertSizeWithinLimit(data, 65_536);
  return data;
}

/**
 * The response for an error that carries an exposed 4xx status
 * (NotFoundError, badRequest(), ...). Anything else is left to the server,
 * which answers a generic 500 and never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

The routes validate every input and send every task through `TaskResponse`:

src/routes/tasks.routes.tsNode.js only

```ts
import type { HttpRouter } from "@zudojs/http";
import { ListTasksQuery, TaskIdParams, TaskResponse, UpdateTaskSchema } from "../dtos/tasks.dto.js";
import type { StoredTask } from "../repositories/tasks.store.js";
import type { TaskService } from "../services/tasks.service.js";
import { json, readJsonBody } from "../utils/http.js";

const send = (task: StoredTask) => TaskResponse.parse(task);

export function registerTaskRoutes(router: HttpRouter, tasks: TaskService): void {
  router.get("/tasks", (ctx) => tasks.list(ListTasksQuery.parse(ctx.query)).map(send));

  router.get("/tasks/:id", (ctx) => send(tasks.get(TaskIdParams.parse(ctx.params).id)));

  router.post("/tasks", (ctx) => {
    const task = tasks.create(readJsonBody(ctx));
    return json(201, send(task)).setHeader("location", `/tasks/${task.id}`);
  });

  router.patch("/tasks/:id", (ctx) => {
    const { id } = TaskIdParams.parse(ctx.params);
    const changes = UpdateTaskSchema.parse(readJsonBody(ctx));
    return send(tasks.update(id, changes));
  });
}
```

A check script exercises all of it against a real server:

src/check-validation.tsNode.js only

```ts
import { createHttpServer, createNodeHttpAdapter, createRouter } from "@zudojs/http";
import { TaskStore } from "./repositories/tasks.store.js";
import { registerTaskRoutes } from "./routes/tasks.routes.js";
import { TaskService } from "./services/tasks.service.js";

const service = new TaskService(new TaskStore(), { now: () => new Date("2026-09-23T09:00:00Z") });
const router = createRouter();
registerTaskRoutes(router, service);
const server = createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
});
await server.start();
const base = `http://127.0.0.1:${server.address?.port}`;
const json = { "content-type": "application/json" };

for (const title of ["Buy milk", "Walk the dog", "Water the plants"]) {
  await fetch(`${base}/tasks`, { method: "POST", headers: json, body: JSON.stringify({ title, priority: "high" }) });
}
for (const [method, path, body] of [
  ["PATCH", "/tasks/2", '{"done":true,"id":99}'],
  ["PATCH", "/tasks/2", '{"done":true}'],
  ["GET", "/tasks?done=false&limit=1&page=2", undefined],
  ["GET", "/tasks?limit=500", undefined],
  ["PATCH", "/tasks/2", JSON.stringify({ title: "x".repeat(40_000) })],
] as const) {
  const response = await fetch(base + path, { method, headers: json, body });
  console.log(method, path, response.status, (await response.text()).slice(0, 120));
}
await server.stop();
```

Output of `npx tsx src/check-validation.ts`

```ts
PATCH /tasks/2 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
PATCH /tasks/2 200 {"id":2,"title":"Walk the dog","done":true,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}
GET /tasks?done=false&limit=1&page=2 200 [{"id":3,"title":"Water the plants","done":false,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}]
GET /tasks?limit=500 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
PATCH /tasks/2 413 {"error":"Serialized payload too large: 80013 bytes (max: 65536)","code":"ERR_PAYLOAD_TOO_LARGE"}
```

The unknown `id` was refused, the valid change went through, the list was filtered and paged, an out-of-range limit got a 400, and a huge body never reached a schema: it got a 413 that names the size and the limit, and nothing from the body itself. You do not map this error yourself: the guard marks it as safe to show, so the router's default answer here, and the generated `errorResponse` in the running server, both send it as it is. The 400 bodies still only say "Validation failed". The next lesson fixes that for every route at once. Run the same script in your project:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ npx tsx src/check-validation.ts
PATCH /tasks/2 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
PATCH /tasks/2 200 {"id":2,"title":"Walk the dog","done":true,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}
GET /tasks?done=false&limit=1&page=2 200 [{"id":3,"title":"Water the plants","done":false,"priority":"high","createdAt":"2026-09-23T09:00:00.000Z"}]
GET /tasks?limit=500 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION"}
PATCH /tasks/2 413 {"error":"Serialized payload too large: 80013 bytes (max: 65536)","code":"ERR_PAYLOAD_TOO_LARGE"}
```

`registerRoutes` already registers `registerTaskRoutes`, so the running server has the new `PATCH /tasks/:id` route as soon as `npm run dev` restarts.

## Practice

TRY IT YOURSELF

### A search parameter

Add a `q` parameter to `ListTasksQuery` for searching titles. It is optional, is trimmed, must be 1 to 50 characters, and is compared in lower case, so turn it to lower case in the schema. Test it with `?q=%20MILK%20` (the `%20` are spaces) and with `?q=`.

**Show a solution**

search.ts

```ts
import { schema } from "@zudojs/schema";

const ListTasksQuery = schema.object({
  q: schema.string().trim().toLowerCase().min(1).max(50).optional(),
});

for (const q of [" MILK ", ""]) {
  const result = ListTasksQuery.safeParse({ q });
  console.log(JSON.stringify(q), "->", result.success ? result.data : result.issues[0]?.message);
}
console.log(ListTasksQuery.parse({}));
```

Output of `npx tsx search.ts` and of the browser terminal

```ts
" MILK " -> { q: 'milk' }
"" -> String must be at least 1 character
{}
```

`URLSearchParams` and the router decode `%20` into a space before your schema sees the value. An empty `q=` is refused rather than matching everything; leaving the parameter out entirely is what "no search" looks like.

TRY IT YOURSELF

### Spot the mass assignment

This update function has a security hole. Find it, and fix it using `UpdateTaskSchema`.

hole.ts

```ts
function updateTask(task: StoredTask, body: Record<string, unknown>): StoredTask {
  return { ...task, ...body } as StoredTask;
}
```

**Show a solution**

`{ ...task, ...body }` copies *every* field of the request body onto the task: `id`, `createdAt`, and in later lessons `ownerId`. A client could move a task to another user or overwrite its id. The `as StoredTask` hides the problem from TypeScript. The fix parses first and copies only known fields:

fixed.ts

```ts
import { schema } from "@zudojs/schema";

const UpdateTaskSchema = schema
  .object({ title: schema.string().trim().min(3).max(100), done: schema.boolean() })
  .partial()
  .strict();

interface StoredTask {
  readonly id: number;
  readonly ownerId: number;
  readonly title: string;
  readonly done: boolean;
}

function updateTask(task: StoredTask, body: unknown): StoredTask {
  const changes = UpdateTaskSchema.parse(body);
  return { ...task, title: changes.title ?? task.title, done: changes.done ?? task.done };
}

const task: StoredTask = { id: 1, ownerId: 7, title: "Buy milk", done: false };
console.log(updateTask(task, { done: true }));
try {
  updateTask(task, { done: true, ownerId: 1 });
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
```

Output of `npx tsx fixed.ts` and of the browser terminal

```json
{ id: 1, ownerId: 7, title: 'Buy milk', done: true }
SchemaError Validation failed
```

## Recap

- Validate at the trust boundary: route parameters, query strings, headers and bodies. Services then work with clean, typed data.
- Issues have `code`, `path` and `message`; turn them into per-field messages for clients.
- Query strings, parameters and environment variables are text: use `schema.coerce`. JSON bodies are not: use the normal schemas.
- `.transform()` changes the output (and its type); `.refine()` and `schema.refine()` add your own synchronous rules. `.date()` accepts only real calendar dates.
- For an update, `partial()` of the create schema keeps only the fields the client sent and applies no defaults. Add `.strict()` to refuse unknown fields, and never spread a raw body onto stored data (mass assignment).
- A response schema is an allow-list for what leaves the server.
- `@zudojs/validation`'s depth and size guards stop hostile JSON before a schema walks it.

Validation errors are still answered with a bare "Validation failed". The next lesson builds one error handler that gives every error the right status and a helpful, safe body.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
