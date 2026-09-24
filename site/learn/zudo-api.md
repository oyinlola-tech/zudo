---
title: "One operation, many transports"
description: "Write your business logic once as an operation with @zudojs/api, then run it from HTTP, RPC and a queue with the same validation, errors, interceptors and timeouts."
source: https://zudojs.oyinlola.site/learn/zudo-api
---

LESSON 71 OF 84

APIs and services Advanced

# One operation, many transports

Write your business logic once as an operation with @zudojs/api, then run it from HTTP, RPC and a queue with the same validation, errors, interceptors and timeouts.

- **45 min** to read and try
- **You need:** The Task API project, and the lessons on validation, HTTP routing, queues and RPC
- **You build:** Task operations that the Task API serves over HTTP, over RPC, from a background queue and from the command line, with one set of rules

  [Test yourself](#test)

## One piece of logic, many doors

In the Task API, "create a task" lives inside an HTTP route. In [the RPC lesson](https://zudojs.oyinlola.site/learn/zudo-rpc) you wrote it a second time as an RPC procedure. A nightly import job would need it a third time. Three copies drift apart: one of them forgets the title check, another returns a different error.

`@zudojs/api` fixes that with an **operation**: one named piece of logic with a declared input, a declared output and a handler. An **executor** runs operations, a **registry** finds them by name, and **interceptors** wrap every call with shared rules such as logging or sign-in checks.

A **transport** is the door a call comes through: an HTTP request, an RPC frame, a queue job, a command in a terminal. Each transport only translates. The rules live in the operation. The package ships a ready-made **binding** for each of these four transports.

In your Task API folder, add the package. This lesson also uses `@zudojs/queue`; the other packages come from the RPC lesson. Every example is a `.ts` file that you run with `npx tsx file.ts`.

Terminal on your computer

```bash
$ npm install @zudojs/api @zudojs/queue

added 2 packages, and audited 17 packages in 2s

1 package is looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

## Define an operation

`defineOperation(options)` takes a `name`, an optional `input` and `output` schema from `@zudojs/schema`, and a `handler(input, context)`. It checks the definition at once, so a bad name or timeout fails when the program starts, not on the first request. This file defines two operations:

tasks.tsNode.js only

```ts
import { APIConflictError, APINotFoundError, defineOperation } from "@zudojs/api";
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const NewTaskSchema = schema.object({ title: schema.string().trim().min(3).max(100) });
const TaskIdSchema = schema.object({ id: schema.coerce.number().int().min(1) });
const TaskSchema = schema.object({ id: schema.number(), title: schema.string(), done: schema.boolean() });

export type Task = Infer<typeof TaskSchema>;

const tasks = new Map<number, Task>();

export const createTask = defineOperation({
  name: "tasks.create",
  input: NewTaskSchema,
  output: TaskSchema,
  metadata: { description: "Create a task", tags: ["Tasks"], http: { method: "POST", path: "/tasks" } },
  handler: async (input): Promise<Task> => {
    if ([...tasks.values()].some((task) => task.title === input.title)) {
      throw new APIConflictError(`A task called "${input.title}" already exists.`);
    }
    const task: Task = { id: tasks.size + 1, title: input.title, done: false };
    tasks.set(task.id, task);
    return task;
  },
});

export const getTask = defineOperation({
  name: "tasks.get",
  input: TaskIdSchema,
  output: TaskSchema,
  metadata: { description: "Get one task", tags: ["Tasks"], http: { method: "GET", path: "/tasks/:id" } },
  handler: async (input): Promise<Task> => {
    const task = tasks.get(input.id);
    if (!task) throw new APINotFoundError(`Task ${input.id} not found.`);
    return task;
  },
});
```

- TypeScript **infers** the type of `input` from the input schema, so `input.title` is a `string` and `input.id` a `number` without any type parameters. `Infer`, which you met in [your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code), names the output type. The types and the runtime checks describe the same data.
- `schema.coerce.number()` turns the text `"1"` into the number 1. The id will arrive in a URL, where every value is text.
- `metadata.http` says which HTTP route the operation gets. It only matters for the HTTP binding, later in this lesson. Without it, the route is `POST /tasks.create`.
- `APIConflictError` (409) and `APINotFoundError` (404) are ready-made errors.

Now run it with an executor. `createAPIContext(requestId, state)` makes the **context**: the small object that travels with one call. You will look at it closely soon.

run.tsNode.js only

```ts
import { APIExecutor, APIValidationError, createAPIContext } from "@zudojs/api";
import { createTask } from "./tasks.js";

const executor = new APIExecutor();
const context = createAPIContext("req-1", {});
console.log(await executor.execute(createTask, { title: "  Buy milk  " }, context));
const invalid = await executor.execute(createTask, { title: "no" }, context);
if (!invalid.ok && invalid.error instanceof APIValidationError) {
  console.log(invalid.error.statusCode, invalid.error.message, invalid.error.issues);
}
const twice = await executor.execute(createTask, { title: "Buy milk" }, context);
if (!twice.ok) console.log(twice.error.statusCode, twice.error.code, "-", twice.error.message);
```

Output of `npx tsx run.ts`

```json
{ ok: true, data: { id: 1, title: 'Buy milk', done: false } }
422 Invalid input for operation "tasks.create". [ 'title: invalid' ]
409 ERR_API_CONFLICT - A task called "Buy milk" already exists.
```

- Every call gave back a **result**: `{ ok: true, data }` or `{ ok: false, error }`. The executor never throws, so you check `ok` instead of writing `try`/`catch`.
- The handler got the *cleaned* input: the spaces around "Buy milk" were trimmed by the schema.
- The bad title failed with 422. The issue says *where* the problem is, `title: invalid`, but not *what* was sent. Schema messages often repeat the value, and that value can be a password. The executor leaves it out on purpose.
- The handler's own `APIConflictError` came through unchanged, with its status and message.

### Typed operations

Because `createTask` knows its input and output types, TypeScript checks the input you pass to `execute`, and `result.data` has the type `Task`.

typed.tsNode.js only

```ts
import { APIExecutor, createAPIContext } from "@zudojs/api";
import { createTask } from "./tasks.js";

const result = await new APIExecutor().execute(createTask, { titel: "Buy milk" }, createAPIContext("req-1", {}));
if (result.ok) console.log(result.data.title);
```

What `npx tsc --noEmit` prints

```ts
typed.ts:4:62 - error TS2561: Object literal may only specify known properties, but 'titel' does not exist in type '{ title: string; }'. Did you mean to write 'title'?

4 const result = await new APIExecutor().execute(createTask, { titel: "Buy milk" }, createAPIContext("req-1", {}));
                                                               ~~~~~


Found 1 error in typed.ts:4
```

The typo is caught before the program runs. Transports get operations from the registry as `APIOperation<unknown, unknown>`: there the input really is unknown, because it comes from outside, and the schema checks it at runtime.

### Errors the caller must not see

A handler can also fail by accident, for example with a database message. Such a message can contain table names, hosts or file paths. The executor turns every error that is not an API error into an `APIInternalError` with a fixed message, and keeps the original on `cause` for your logs:

internal.tsNode.js only

```ts
import { APIExecutor, createAPIContext, defineOperation } from "@zudojs/api";

const exportTasks = defineOperation({
  name: "tasks.export",
  handler: async () => { throw new Error('relation "tasks" does not exist (host 10.0.0.5)'); },
});
const result = await new APIExecutor().execute(exportTasks, {}, createAPIContext("req-7", {}));
if (!result.ok) {
  console.log(result.error.name, result.error.statusCode, "expose:", result.error.expose);
  console.log("message:", result.error.message);
  console.log("for the log only:", (result.error.cause as Error).message);
}
```

Output of `npx tsx internal.ts`

```ts
APIInternalError 500 expose: false
message: An unexpected internal error occurred in operation "tasks.export".
for the log only: relation "tasks" does not exist (host 10.0.0.5)
```

`expose` is the flag that matters. `true` means "safe to show to the caller". `false` means "log it, send a generic message".

> NEVER SEND THE ERROR OBJECT AS IT IS
>
> An `APIError` turns into JSON with its `cause`, and that includes the original message and stack. `res.json(result.error)` would leak the database message after all. If you call the executor yourself, pick the fields a caller may see. The bindings later in this lesson already do that for you.

## The API context

The context carries four things through one call: a **request id**, an optional `AbortSignal` for cancelling, a `state` object you choose, and typed **slots**. A slot is read and written through a **key** made with `createContextKey<T>(name)`, so TypeScript knows the type of each value. Six keys are built in, such as `UserIdContextKey`, and `TransportContextKey`, which the bindings set to `"http"`, `"rpc"`, `"queue"` or `"cli"`. A request id often comes from an `x-request-id` header, which the client writes. `createAPIContext` throws a `TypeError` on an unsafe id. `normalizeRequestId` keeps a safe id and replaces anything else with a fresh UUID:

context.tsNode.js only

```ts
import { createAPIContext, createContextKey, normalizeRequestId, UserIdContextKey } from "@zudojs/api";

console.log(normalizeRequestId("web-42"));
console.log(normalizeRequestId("x\nFAKE LOG LINE: admin signed in"));
const PlanKey = createContextKey<"free" | "pro">("plan");
const context = createAPIContext("web-42", { locale: "en" });
context.set(UserIdContextKey, "ada");
context.set(PlanKey, "pro");
console.log(context.get(UserIdContextKey), context.get(PlanKey), context.state.locale);
```

Output of `npx tsx context.ts`

```ts
web-42
266de21a-0e98-4d5f-af95-48b24dc287b2
ada pro en
```

The id with a line break was replaced. Written into a log file as it was, it would have added a fake line to your logs. That trick is called **log injection**. `context.set(PlanKey, "gold")` would not compile, because the key says the value is `"free" | "pro"`.

## Interceptors: rules for every transport

An **interceptor** is an object with an `intercept(call, next)` method. It works like the middleware you know: do something, `await next()`, do something after. `call` holds the `operation`, the `input` and the `context`. An interceptor may also answer early, without calling `next()`, by returning `apiFailure(error)`. This file is the heart of the Task API. It registers the operations and builds one executor with two interceptors, which every transport below uses:

app.tsNode.js only

```ts
import { APIAuthenticationError, APIExecutor, APIOperationRegistry, apiFailure, TransportContextKey, UserIdContextKey } from "@zudojs/api";
import type { APIInterceptor } from "@zudojs/api";
import { createTask, getTask } from "./tasks.js";

export interface Caller {
  readonly userId?: string;
}

const log: APIInterceptor = {
  async intercept(call, next) {
    const result = await next();
    const outcome = result.ok ? "ok" : result.error.code;
    console.log(`[log] ${call.context.get(TransportContextKey)} ${call.operation.name} -> ${outcome}`);
    return result;
  },
};

const requireUser: APIInterceptor = {
  async intercept(call, next) {
    const { userId } = call.context.state as Caller;
    if (typeof userId !== "string") {
      return apiFailure(new APIAuthenticationError("Sign in first."));
    }
    call.context.set(UserIdContextKey, userId);
    return next();
  },
};

export const registry = new APIOperationRegistry();
registry.register(createTask);
registry.register(getTask);
registry.freeze();
export const executor = new APIExecutor({ interceptors: [log, requireUser] });
```

- The first interceptor in the list is the outermost, so `log` also sees the answers of `requireUser`.
- `call.context.state` is what the transport verified about the caller. Each binding below fills it with a `Caller` object, which is why the `as Caller` is safe here. `requireUser` refuses a call without a user, and copies the user id into the typed `UserIdContextKey` slot for the handlers.
- `registry.freeze()` locks the registry, so nobody can add or replace an operation while requests run. `get(name)`, `require(name)`, `getAll()` and `findByTag(tag)` read it.

The interceptors run *before* the input is checked against the schema. So an unknown caller is refused with 401 before anything tells it what a valid input looks like, and the `log` interceptor sees invalid calls too. `call.input` is the input as the caller sent it. If an interceptor replaces it, the new value is checked by the schema before the handler runs, so no interceptor can slip bad data past it.

## One operation, four transports

Now the payoff. Each binding below does the same work for you: find the operation, build a context, run the executor with its interceptors, and turn the result into its own kind of answer. You only tell it one thing, in its `state` option: who the caller is, from what *that* transport verified. Every binding sends failures in the same safe shape, `{ code, message, statusCode, requestId, issues? }`, with the message hidden unless the error is exposed.

### HTTP

`createApiFetchHandler(registry, options)` returns a web-standard handler, a function from a `Request` to a `Response`, like the RPC fetch handler in the last lesson. Each operation gets the route from its `metadata.http`. `mountFetchHandler` serves it under `/api` on your `@zudojs/http` router. The user comes from a bearer token. The `users` map stands in for the session or JWT check from [the authentication lesson](https://zudojs.oyinlola.site/learn/zudo-auth). At the end, the file calls its own server six times:

http-transport.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createApiFetchHandler } from "@zudojs/api";
import { createHttpServer, createNodeHttpAdapter, createRouter, mountFetchHandler } from "@zudojs/http";
import { executor, registry } from "./app.js";
import type { Caller } from "./app.js";

const token = randomBytes(32).toString("hex");
const users = new Map([[token, "ada"]]);

const router = createRouter();
mountFetchHandler(router, "/api", createApiFetchHandler(registry, {
  executor,
  state: (request): Caller => {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    return { userId: users.get(bearer) };
  },
}));
const server = await createHttpServer({
  adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
  handler: async (request) => (await router.dispatch(request)).response,
}).start();

const calls: [string, string, string, unknown][] = [
  ["POST", "/tasks", token, { title: "Buy milk" }],
  ["GET", "/tasks/1", token, undefined],
  ["POST", "/tasks", "guessed-token", { title: "Buy milk" }],
  ["POST", "/tasks", "guessed-token", { title: 42 }],
  ["POST", "/tasks", token, { title: 42 }],
  ["DELETE", "/tasks/1", token, undefined],
];
for (const [method, path, bearer, body] of calls) {
  const response = await fetch(`http://127.0.0.1:${server.address?.port}/api${path}`, {
    method,
    headers: { "content-type": "application/json", "x-request-id": "web-1", authorization: `Bearer ${bearer}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  console.log(method, path, response.status, JSON.stringify(await response.json()));
}
await server.stop();
```

Output of `npx tsx http-transport.ts`

```json
[log] http tasks.create -> ok
POST /tasks 200 {"ok":true,"data":{"id":1,"title":"Buy milk","done":false}}
[log] http tasks.get -> ok
GET /tasks/1 200 {"ok":true,"data":{"id":1,"title":"Buy milk","done":false}}
[log] http tasks.create -> ERR_API_AUTHENTICATION
POST /tasks 401 {"ok":false,"error":{"code":"ERR_API_AUTHENTICATION","message":"Sign in first.","statusCode":401,"requestId":"web-1"}}
[log] http tasks.create -> ERR_API_AUTHENTICATION
POST /tasks 401 {"ok":false,"error":{"code":"ERR_API_AUTHENTICATION","message":"Sign in first.","statusCode":401,"requestId":"web-1"}}
[log] http tasks.create -> ERR_API_VALIDATION
POST /tasks 422 {"ok":false,"error":{"code":"ERR_API_VALIDATION","message":"Invalid input for operation \"tasks.create\".","statusCode":422,"requestId":"web-1","issues":["title: invalid"]}}
DELETE /tasks/1 405 {"ok":false,"error":{"code":"ERR_API_ERROR","message":"Method not allowed; use GET.","statusCode":405,"requestId":"web-1"}}
```

- There is no task logic in the HTTP code at all. `GET /tasks/1` took the `id` from the path, and the schema turned `"1"` into a number.
- Both calls with a guessed token got 401, even the one with an invalid title. The interceptors run first, so an unknown caller never learns what your input should look like. Only the signed-in user's invalid call got the 422 with its `issues`.
- The request id came from the `x-request-id` header (a safe one is kept, anything else replaced), and the handler sends it back in the error, so a user can quote it to support.
- `DELETE` has no route, so the answer is 405. The handler also refuses bodies that are too big or not JSON, and runs every call under the request's signal, so a client that hangs up cancels it.

### RPC

`registerApiRpcProcedures(server, registry, options)` registers one RPC procedure per operation, named like the operation. The user comes from `call.auth`, the identity the RPC transport verified, never from frame metadata, which the caller writes:

rpc-transport.tsNode.js only

```ts
import { registerApiRpcProcedures } from "@zudojs/api";
import { createRPCMemoryTransport, RPCClient, RPCServer, isRPCError } from "@zudojs/rpc";
import { executor, registry } from "./app.js";
import type { Caller } from "./app.js";

const rpc = new RPCServer();
registerApiRpcProcedures(rpc, registry, {
  executor,
  state: (call): Caller => ({ userId: typeof call.auth?.userId === "string" ? call.auth.userId : undefined }),
});

const client = new RPCClient(createRPCMemoryTransport(rpc, { auth: { userId: "ada" } }));
console.log(await client.call("tasks.create", { title: "Walk the dog" }));
for (const input of [{ title: "Walk the dog" }, { title: "" }]) {
  try {
    await client.call("tasks.create", input);
  } catch (error) {
    if (isRPCError(error)) console.log(error.name, error.code, "-", error.message);
  }
}
```

Output of `npx tsx rpc-transport.ts`

```json
[log] rpc tasks.create -> ok
{ id: 1, title: 'Walk the dog', done: false }
[log] rpc tasks.create -> ERR_API_CONFLICT
RPCError ERR_API_CONFLICT - A task called "Walk the dog" already exists.
[log] rpc tasks.create -> ERR_API_VALIDATION
RPCValidationError RPC_VALIDATION_ERROR - Invalid input for operation "tasks.create".
```

API errors become their RPC equivalents: a validation failure is an `RPCValidationError`, as in the RPC lesson. An error with no RPC equivalent, such as the conflict, keeps its own code. To serve this over HTTP, mount `createRPCFetchHandler(rpc)` exactly as in the last lesson.

### Queue

A background job has no HTTP request and no token. Only your own code adds jobs, after it has checked who the user is, so the job carries that user id in its `metadata`. `bindApiQueue(queue, registry, options)` makes each operation a job name, and the job data is the input. The job fails when the operation fails, and the queue's retry and dead-letter rules take over:

queue-transport.tsNode.js only

```ts
import { bindApiQueue } from "@zudojs/api";
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { executor, registry } from "./app.js";
import type { Caller } from "./app.js";

const queue = createInMemoryQueue(createQueueName("operations"));
bindApiQueue(queue, registry, {
  executor,
  state: (job): Caller => ({ userId: typeof job.metadata?.userId === "string" ? job.metadata.userId : undefined }),
});
queue.events?.on("job:completed", ({ job, result }) => console.log("[queue] completed", job.name, result));
queue.events?.on("job:failed", ({ job, error }) => console.log("[queue] failed", job.name, error.message));

await queue.add("tasks.create", { title: "Water plants" }, { attempts: 1, metadata: { userId: "ada" } });
await queue.add("tasks.create", { title: "" }, { attempts: 1, metadata: { userId: "ada" } });
await new Promise((resolve) => setTimeout(resolve, 200));
await queue.close();
```

Output of `npx tsx queue-transport.ts`

```json
[log] queue tasks.create -> ok
[queue] completed tasks.create { id: 1, title: 'Water plants', done: false }
[log] queue tasks.create -> ERR_API_VALIDATION
[queue] failed tasks.create Invalid input for operation "tasks.create".
```

`attempts: 1` matters here: a validation error fails the same way every time, so retrying it only wastes work. Never let a client choose the job's `metadata`: whoever writes `userId` there acts as that user.

### Command line

`runApiCli(registry, argv, options)` runs an operation from command-line arguments: the operation name first, then `--field value` pairs (or `--json '{…}'`). It prints the result as JSON and returns an **exit code**, the number a program reports to the shell: 0 for success, 65 for invalid input, 77 for a permission problem, and so on. It is handy for admin tasks run on the server. Here it runs three commands in a row, as if typed in a terminal:

cli-transport.tsNode.js only

```ts
import { runApiCli } from "@zudojs/api";
import { executor, registry } from "./app.js";
import type { Caller } from "./app.js";

const options = {
  executor,
  programName: "tasks",
  state: (): Caller => ({ userId: "cli-operator" }),
};

for (const argv of [["tasks.create", "--title", "Read a book"], ["tasks.get", "--id", "1"], ["tasks.create", "--title", "no"]]) {
  const code = await runApiCli(registry, argv, options);
  console.log("exit code:", code);
}
```

Output of `npx tsx cli-transport.ts`

```json
[log] cli tasks.create -> ok
{
  "id": 1,
  "title": "Read a book",
  "done": false
}
exit code: 0
[log] cli tasks.get -> ok
{
  "id": 1,
  "title": "Read a book",
  "done": false
}
exit code: 0
[log] cli tasks.create -> ERR_API_VALIDATION
{
  "ok": false,
  "error": {
    "code": "ERR_API_VALIDATION",
    "message": "Invalid input for operation \"tasks.create\".",
    "statusCode": 422,
    "requestId": "bd48d927-8e87-44b5-94d7-955bf7ae57d5",
    "issues": [
      "title: invalid"
    ]
  }
}
exit code: 65
```

In a real script you would write `process.exitCode = await runApiCli(registry, process.argv.slice(2), options)`, so `npx tsx src/cli.ts tasks.get --id 1` works from your terminal. Whoever can run commands on the server is trusted here, which is why `state` names a fixed operator. Do not expose such a tool to users.

### Routes and documentation

Because every route comes from the operations, the package can also describe them. `describeApiRoutes` lists what the HTTP binding serves, and `toOpenAPIRouteDescriptors` hands the same routes to `@zudojs/openapi`, the subject of [the next lesson](https://zudojs.oyinlola.site/learn/zudo-openapi):

routes.tsNode.js only

```ts
import { describeApiRoutes, toOpenAPIRouteDescriptors } from "@zudojs/api";
import { createOpenAPIDocumentFromRoutes } from "@zudojs/openapi";
import { registry } from "./app.js";

for (const route of describeApiRoutes(registry, { basePath: "/api" })) {
  console.log(route.method.padEnd(4), route.path.padEnd(14), route.operationId, `(input from ${route.inputSource})`);
}

const document = createOpenAPIDocumentFromRoutes(toOpenAPIRouteDescriptors(registry, { basePath: "/api" }), {
  info: { title: "Task API", version: "1.0.0" },
});
console.log(Object.keys(document.paths ?? {}));
```

Output of `npx tsx routes.ts`

```ts
POST /api/tasks     tasks.create (input from body)
GET  /api/tasks/:id tasks.get (input from query)
[ '/api/tasks', '/api/tasks/{id}' ]
```

The document stays in step with the code: add an operation to the registry, and it is served and documented at once.

## Timeouts and cancelling

Every operation has a **timeout**: 30 seconds by default, or the `timeout` you set in milliseconds. When time runs out, the caller gets `ERR_API_TIMEOUT` (504). JavaScript cannot stop a running handler from outside, so the executor also *aborts* the handler's `context.signal`. The same signal aborts when the caller cancels, for example when an HTTP client hangs up. Pass it to `fetch`, to database calls, or check it in a loop, and a slow handler stops instead of working for a caller who already left:

deadline.tsNode.js only

```ts
import { APIExecutor, createAPIContext, defineOperation } from "@zudojs/api";

const sleep = (ms: number, signal?: AbortSignal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

const report = defineOperation({
  name: "tasks.report",
  timeout: 100,
  handler: async (_input: unknown, context) => {
    try {
      await sleep(300, context.signal);
    } catch (reason) {
      console.log("[handler] stopped:", (reason as Error).name);
      throw reason;
    }
    return "report.csv";
  },
});

const executor = new APIExecutor();
const late = await executor.execute(report, {}, createAPIContext("req-1", {}));
if (!late.ok) console.log("[caller]", late.error.code, late.error.statusCode);
const controller = new AbortController();
setTimeout(() => controller.abort(), 50);
const cancelled = await executor.execute(report, {}, createAPIContext("req-2", {}, controller.signal));
if (!cancelled.ok) console.log("[caller]", cancelled.error.code, cancelled.error.statusCode);
```

Output of `npx tsx deadline.ts`

```json
[handler] stopped: APITimeoutError
[caller] ERR_API_TIMEOUT 504
[handler] stopped: APIError
[caller] ERR_OPERATION_CANCELLED 499
```

First call: after 100 ms the executor aborted the signal with the same `APITimeoutError` the caller got, so the handler stopped at once. Second call: the caller aborted after 50 ms, like a browser tab that was closed, and the handler stopped too. The result code is `ERR_OPERATION_CANCELLED`. Check that code, not the unusual status 499. The handler gets a signal even when the caller passed none, so every handler can rely on it.

## Practice

TRY IT YOURSELF

### Admins only

Write an interceptor that refuses every operation tagged `"Admin"` unless the **verified** role in the context is `"admin"`. Store the role with your own context key. The input must never decide the role: test it with an input that claims `role: "admin"`.

**Show a solution**

admin.tsNode.js only

```ts
import { APIAuthorizationError, APIExecutor, apiFailure, createAPIContext, createContextKey, defineOperation } from "@zudojs/api";
import type { APIInterceptor } from "@zudojs/api";

const RoleKey = createContextKey<"user" | "admin">("role");
const adminOnly: APIInterceptor = {
  async intercept(call, next) {
    if (call.operation.metadata?.tags?.includes("Admin") && call.context.get(RoleKey) !== "admin") {
      return apiFailure(new APIAuthorizationError("Admins only."));
    }
    return next();
  },
};
const deleteAll = defineOperation({
  name: "tasks.deleteAll",
  metadata: { tags: ["Admin"] },
  handler: async () => "all tasks deleted",
});

const executor = new APIExecutor([adminOnly]);
const bo = createAPIContext("req-1", {});
bo.set(RoleKey, "user");
const denied = await executor.execute(deleteAll, { role: "admin" }, bo);
if (!denied.ok) console.log(denied.error.statusCode, denied.error.message);
const ada = createAPIContext("req-2", {});
ada.set(RoleKey, "admin");
console.log(await executor.execute(deleteAll, {}, ada));
```

Output of `npx tsx admin.ts`

```ts
403 Admins only.
{ ok: true, data: 'all tasks deleted' }
```

The role comes only from the context, which the transport fills after it verified the caller. The `role` in the input is ignored.

TRY IT YOURSELF

### Exit codes for a command-line transport

`runApiCli` turns results into exit codes for you. To see how, write your own `exitCode(result)`: 0 for success, 77 for status 401 or 403, 65 for 422, and 1 for anything else. Test it with results made by `apiSuccess` and `apiFailure`.

**Show a solution**

exit-code.tsNode.js only

```ts
import { APIAuthenticationError, APIConflictError, APIValidationError, apiFailure, apiSuccess } from "@zudojs/api";
import type { APIResult } from "@zudojs/api";

function exitCode(result: APIResult<unknown>): number {
  if (result.ok) return 0;
  const status = result.error.statusCode;
  if (status === 401 || status === 403) return 77;
  if (status === 422) return 65;
  return 1;
}

const results: APIResult<unknown>[] = [
  apiSuccess({ id: 1 }),
  apiFailure(new APIAuthenticationError("Sign in first.")),
  apiFailure(new APIValidationError("Invalid input.", ["title: invalid"])),
  apiFailure(new APIConflictError("Already exists.")),
];
console.log(results.map(exitCode));
```

Output of `npx tsx exit-code.ts`

```json
[ 0, 77, 65, 1 ]
```

A script that runs your tool can now tell "fix your input" (65) from "sign in" (77) without reading any text. These are the same numbers `runApiCli` uses; its `APICliExitCode` lists them all.

## Recap

- An **operation** is your logic with a name, an input schema, an output schema and a handler. Define it once with `defineOperation`.
- `APIExecutor.execute` never throws. It returns `{ ok: true, data }` or `{ ok: false, error }`, and hides the message of every error with `expose: false`.
- The context carries a safe request id, a cancel signal and typed slots. Pass header values through `normalizeRequestId`.
- Interceptors apply the same rules on every transport, and run before input validation, so a sign-in check always comes first.
- `createApiFetchHandler`, `registerApiRpcProcedures`, `bindApiQueue` and `runApiCli` serve the same operations over HTTP, RPC, a queue and the command line. Each one only needs `state`: the caller's identity, from what that transport verified.
- A timeout or a cancelled caller aborts the handler's `context.signal`. Pass it on so slow work stops.

In the next lesson you describe the Task API in an OpenAPI document, so other people and tools can see exactly what it accepts and returns.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
