---
title: "Calling services with RPC"
description: "Call a function that runs in another service as if it were local. Define procedures with @zudojs/rpc, call them through a client and a transport, and handle validation, errors, identity, timeouts and retries."
source: https://zudojs.oyinlola.site/learn/zudo-rpc
---

LESSON 70 OF 84

APIs and services Advanced

# Calling services with RPC

Call a function that runs in another service as if it were local. Define procedures with @zudojs/rpc, call them through a client and a transport, and handle validation, errors, identity, timeouts and retries.

- **45 min** to read and try
- **You need:** The Task API project, and the lessons on validation, errors and HTTP routing
- **You build:** A task service that other services call over HTTP with RPC, protected by a token, with timeouts and retries

  [Test yourself](#test)

## What RPC is

Your Task API talks to browsers over HTTP with routes like `POST /tasks`. Sometimes the caller is not a browser but **another service** of yours. A billing service may want to ask the task service "how many tasks does this user have?".

Between your own services, it is often simpler to think in functions than in URLs and methods. That is **RPC**, a **remote procedure call**: you call a function by name, it runs in another process, and the result comes back.

In the billing service, a line like `await tasks.call("tasks.count", { userId: "u_1" })` then runs code in the task service. Three pieces make that work:

- A **procedure**: the function on the far side, with a name like `"tasks.count"`.
- A **server**: it holds the procedures and runs the right one for each request.
- A **client** plus a **transport**: the client builds the request, and the transport carries it to the server and the answer back. HTTP is one possible transport.

In your Task API folder, install the package. The HTTP part of this lesson also uses `@zudojs/http` and `@zudojs/crypto`:

Terminal on your computer

```bash
$ npm install @zudojs/rpc @zudojs/schema @zudojs/http @zudojs/crypto

added 14 packages, and audited 15 packages in 9s
…
found 0 vulnerabilities
```

The numbers depend on what your project already has. Every example in this lesson is a `.ts` file that you run with `npx tsx file.ts`.

## Procedures and the server

`createRPCProcedure(name, handler, options)` makes a procedure. A name is dot-separated lowercase words, like `"tasks.create"`. The handler gets the input, and returns the result. The options can hold an `input` schema from `@zudojs/schema`, which you met in the validation lesson. The server checks every payload against it *before* your handler runs.

This file is the task service. Every other example in this lesson imports it:

procedures.tsNode.js only

```ts
import { NotFoundError } from "@zudojs/errors";
import { createRPCProcedure, RPCServer } from "@zudojs/rpc";
import type { RPCServerOptions } from "@zudojs/rpc";
import { schema } from "@zudojs/schema";

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
}

const NewTask = schema.object({ title: schema.string().trim().min(3).max(100) });
const TaskId = schema.object({ id: schema.number().int().min(1) });

export function createTaskServer(options: RPCServerOptions = {}): RPCServer {
  const tasks = new Map<number, Task>();
  const server = new RPCServer(undefined, undefined, options);

  server.register(createRPCProcedure("tasks.create", async (input: { title: string }) => {
    const task: Task = { id: tasks.size + 1, title: input.title, done: false };
    tasks.set(task.id, task);
    return task;
  }, { input: NewTask }));

  server.register(createRPCProcedure("tasks.get", async (input: { id: number }) => {
    const task = tasks.get(input.id);
    if (!task) throw new NotFoundError(`Task ${input.id} not found`);
    return task;
  }, { input: TaskId, idempotent: true }));

  server.register(createRPCProcedure("tasks.list", async () => [...tasks.values()], { idempotent: true }));
  return server;
}
```

A request to the server is a plain object called a **frame**: an `id`, the `procedure` name and a `payload`. `server.handle(frame)` answers with another frame. You can call it directly, without any network:

server.tsNode.js only

```ts
import { createRPCRequest } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";

const server = createTaskServer();

const created = await server.handle(createRPCRequest({
  id: "req-1",
  procedure: "tasks.create",
  payload: { title: "  Buy milk  " },
}));
console.log(created);

const missing = await server.handle(createRPCRequest({
  id: "req-2",
  procedure: "tasks.delete",
  payload: { id: 1 },
}));
console.log(missing);
```

Output of `npx tsx server.ts`

```json
{
  id: 'req-1',
  success: true,
  result: { id: 1, title: 'Buy milk', done: false }
}
{
  id: 'req-2',
  success: false,
  error: {
    code: 'RPC_PROCEDURE_NOT_FOUND',
    message: 'RPC procedure "tasks.delete" is not registered.'
  }
}
```

Look at the two answers:

- The response carries the same `id` as the request. When many calls travel at once, the id tells the caller which answer belongs to which question.
- The title was trimmed. The handler received the value the schema produced, not the raw payload.
- `handle` did not throw for the unknown procedure. It never throws for a bad request. Every failure comes back as `success: false` with an error `code`.

## A client and a transport

Nobody builds frames by hand. An `RPCClient` does it: it creates a unique id, sends the frame, waits, and turns the response into a normal return value or a thrown error.

The client needs a **transport**: any object with a `send(request)` method that returns the response. The package ships three ready-made ones:

- `createRPCMemoryTransport(server)` calls a server in the same process. Use it in tests, and between modules of one app.
- `createRPCHttpTransport({ url })` sends each frame over HTTP with `fetch`.
- `createRPCFetchHandler(server)` is the other end of the HTTP transport: it turns an HTTP request into a frame for the server. You use it in the HTTP section below.

Start with the memory transport. It copies every frame through JSON on the way in and out, the way a real network would, so the server never shares objects with the caller:

client.tsNode.js only

```ts
import { createRPCMemoryTransport, RPCClient } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";
import type { Task } from "./procedures.js";

const server = createTaskServer();
const client = new RPCClient(createRPCMemoryTransport(server), { timeout: 5_000 });

const task = await client.call<{ title: string }, Task>("tasks.create", { title: "Buy milk" });
console.log(task.id, task.title);

await client.call("tasks.create", { title: "Walk the dog" });
const all = await client.call<{}, Task[]>("tasks.list", {});
console.log(all.map((t) => t.title));
```

Output of `npx tsx client.ts`

```ts
1 Buy milk
[ 'Buy milk', 'Walk the dog' ]
```

`client.call<Input, Output>(name, input)` reads like a local function call. The two type parameters say what you send and what you expect back. Later, when the task service moves to its own server, only the transport changes. The code that calls `client.call` stays the same.

> THE TYPES ARE A PROMISE, NOT A CHECK
>
> The `Task` in `call<…, Task>` is only what you *tell* TypeScript. Nothing checks at runtime that the other service really sent a `Task`. If the answer matters, validate it with a schema, exactly like any other data that comes from outside.

## Validation and errors across the wire

A payload comes from another program, so it is **untrusted**, even when that program is yours. The input schema rejects bad payloads before your handler sees them. On the client, a failed call throws an error rebuilt from what the server sent: its `code` is the server's code, and well-known codes come back as their own classes, such as `RPCValidationError`:

errors.tsNode.js only

```ts
import { createRPCMemoryTransport, createRPCProcedure, RPCClient, isRPCError } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";

const server = createTaskServer({
  onInternalError: (error, requestId) => console.log(`[server log] ${requestId}: ${error}`),
});
server.register(createRPCProcedure("tasks.export", async () => {
  throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
}));
const client = new RPCClient(createRPCMemoryTransport(server));

async function show(procedure: string, input: unknown): Promise<void> {
  try {
    console.log("ok:", await client.call(procedure, input));
  } catch (error) {
    if (!isRPCError(error)) throw error;
    console.log(error.name, error.code, "-", error.message);
    if (error.details) console.log("  details:", error.details);
  }
}

await show("tasks.create", { title: "no" });
await show("tasks.get", { id: 7 });
await show("tasks.export", {});
await show("tasks.delete", { id: 1 });
```

Output of `npx tsx errors.ts`

```ts
RPCValidationError RPC_VALIDATION_ERROR - Invalid input for procedure "tasks.create".
  details: [
  {
    path: 'title',
    code: 'too_small',
    message: 'String must be at least 3 characters'
  }
]
RPCError RPC_NOT_FOUND - Task 7 not found
[server log] 4635acb5-a85b-4440-b625-97d20f2c9825: Error: connect ECONNREFUSED 10.0.0.5:5432
RPCError RPC_INTERNAL_ERROR - The server encountered an internal error while handling this request.
RPCProcedureNotFoundError RPC_PROCEDURE_NOT_FOUND - RPC procedure "tasks.delete" is not registered.
```

- The first call failed validation. `details` lists every problem with its `path`, so the caller can fix the request. A payload that fails the schema, such as `{ id: "1; DROP TABLE tasks" }`, never reaches the handler.
- The second call passed validation. The handler threw a `NotFoundError` from `@zudojs/errors`. That error is meant for the caller (its `expose` flag is `true`), so its message arrived with the matching code, `RPC_NOT_FOUND`.
- The third handler crashed with an ordinary error. Its message contains a host and a port, which an outsider must never see. The caller got a fixed message, and the real error went to `onInternalError` with the request id, so you can log it.
- The last call named a procedure that does not exist, and came back as an `RPCProcedureNotFoundError`.

The rule: an error built with `expose: true` shows its message to the caller, under a code that matches its kind (`RPC_NOT_FOUND`, `RPC_CONFLICT`, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN` and so on). Every other error becomes `RPC_INTERNAL_ERROR` with the fixed message. On the client, check `instanceof` or `error.code`, never the message text.

## What survives the trip

Inside one program, a function can return anything. Across a network, the result must become text, and most transports use JSON. JSON knows strings, numbers, booleans, `null`, arrays and plain objects. Everything else is changed or lost on the way:

wire.tsNode.js only

```ts
import { createRPCJsonSerializer, createRPCMemoryTransport, createRPCProcedure, RPCClient, RPCServer } from "@zudojs/rpc";

const server = new RPCServer();
server.register(createRPCProcedure("tasks.summary", async () => ({
  dueAt: new Date(Date.UTC(2026, 9, 1, 9, 0)),
  tags: new Set(["home", "shopping"]),
  note: undefined,
  count: 2,
})));

const plain = new RPCClient(createRPCMemoryTransport(server));
console.log(await plain.call("tasks.summary", {}));

const typed = new RPCClient(createRPCMemoryTransport(server, {
  serializer: createRPCJsonSerializer({ preserveTypes: true }),
}));
console.log(await typed.call("tasks.summary", {}));
```

Output of `npx tsx wire.ts`

```json
{ dueAt: '2026-10-01T09:00:00.000Z', tags: {}, count: 2 }
{
  dueAt: 2026-10-01T09:00:00.000Z,
  tags: Set(2) { 'home', 'shopping' },
  count: 2
}
```

With plain JSON, the default, the `Date` arrived as a string. The `Set` became an empty object, so its data is gone. The `undefined` field disappeared. None of this raised an error.

The simplest fix is to design results that are plain JSON: dates as ISO strings, sets as arrays, and `null` instead of `undefined`. Other programs, even ones not written in JavaScript, can then read them. If both sides are your own TypeScript code, `createRPCJsonSerializer({ preserveTypes: true })` tags the richer types, as you saw in [the serialization lesson](https://zudojs.oyinlola.site/learn/zudo-serialization), and the second call got a real `Date` and `Set`. Both ends must then use the same serializer: pass it to the transport and, over HTTP, to the fetch handler too.

## Who is calling? Trusted identity

A frame can carry **metadata**: small labelled values such as a request id or a trace id. Metadata is written by the caller, so a caller can put anything in it, including `userId: "admin"`. **Never decide who the caller is from metadata.**

Identity that *your* code has verified, for example after checking a token, goes in the second argument of `handle`. Middleware and handlers see it as `context.auth`. RPC **middleware** works like the HTTP middleware you know: it gets the call's context and a `next()` function.

auth.tsNode.js only

```ts
import { createRPCProcedure, createRPCRequest, RPCAuthenticationError, RPCMiddlewareStack, RPCServer } from "@zudojs/rpc";
import type { RPCMiddleware } from "@zudojs/rpc";

const requireUser: RPCMiddleware = async (context, next) => {
  const userId = context.auth?.userId;
  if (typeof userId !== "string") {
    throw new RPCAuthenticationError("Sign in first.");
  }
  context.set("userId", userId);
  return next();
};

const server = new RPCServer(undefined, new RPCMiddlewareStack([requireUser]));
server.register(createRPCProcedure("tasks.mine", async (_input: {}, context) => {
  return { owner: context.get<string>("userId"), metadataSays: context.metadata.userId };
}));

const frame = createRPCRequest({
  id: "req-1",
  procedure: "tasks.mine",
  payload: {},
  metadata: { userId: "admin" },
});

const anonymous = await server.handle(frame);
console.log(anonymous.success, anonymous.error);
const verified = await server.handle(frame, { auth: { userId: "ada" } });
console.log(verified.success, verified.result);
```

Output of `npx tsx auth.ts`

```ts
false { code: 'RPC_UNAUTHENTICATED', message: 'Sign in first.' }
true { owner: 'ada', metadataSays: 'admin' }
```

The first call claimed to be `admin` in its metadata and was still refused, because nothing verified that claim. The second call had a verified identity, `ada`. The handler used it, and the metadata's claim stayed just a string that nobody trusts.

The built-in transports fill in that second argument for you through their `auth` option: `createRPCMemoryTransport(server, { auth: { userId: "ada" } })` in the same process, and a function that checks the HTTP request in the fetch handler, which you use next.

## Over HTTP

Now make the task service reachable from other processes. The server side is `createRPCFetchHandler(server, options)`: a function that takes a web-standard `Request` and returns a `Response`. `mountFetchHandler` from `@zudojs/http` serves it on a path of your router. Its `auth` option checks a shared secret token on every request, and decides what reaches your handlers as `context.auth`:

rpc-http.tsNode.js only

```ts
import { timingSafeEqualString } from "@zudojs/crypto";
import { createHttpServer, createNodeHttpAdapter, createRouter, mountFetchHandler } from "@zudojs/http";
import type { HttpServer } from "@zudojs/http";
import { createRPCFetchHandler, RPCAuthenticationError } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";

export async function startRpcServer(token: string): Promise<HttpServer> {
  const rpc = createTaskServer();
  const handler = createRPCFetchHandler(rpc, {
    auth: (request) => {
      const header = request.headers.get("authorization") ?? "";
      if (!timingSafeEqualString(header, `Bearer ${token}`)) {
        throw new RPCAuthenticationError("A valid service token is required.");
      }
      return { caller: "web-app" };
    },
  });

  const router = createRouter();
  mountFetchHandler(router, "/rpc", handler);

  const server = createHttpServer({
    adapter: createNodeHttpAdapter({ host: "127.0.0.1", port: 0 }),
    handler: async (request) => (await router.dispatch(request)).response,
  });
  return server.start();
}
```

A few details matter for security:

- `timingSafeEqualString` compares the token in constant time. A plain `===` stops at the first different character, and an attacker can measure that to guess a token one character at a time.
- Throwing `RPCAuthenticationError` in `auth` refuses the call before any procedure runs. Any other error thrown there is answered as an internal error.
- The fetch handler limits the size of request bodies (1 MiB by default), refuses anything that is not a JSON `POST`, and answers every failure with an RPC error frame. Stack traces and internal messages never leave the process.
- `port: 0` asks the operating system for any free port, so the example never clashes with a server you already run.

The client side is `createRPCHttpTransport`. Start the server and call it, once with the right token and once with a wrong one. The last lines send a plain-text body with `fetch`, to show what an HTML form or a curious visitor would get:

http-demo.tsNode.js only

```ts
import { randomBytes } from "node:crypto";
import { createRPCHttpTransport, RPCClient, isRPCError } from "@zudojs/rpc";
import { startRpcServer } from "./rpc-http.js";
import type { Task } from "./procedures.js";

const token = randomBytes(32).toString("hex");
const server = await startRpcServer(token);
const url = `http://127.0.0.1:${server.address?.port}/rpc`;

const client = new RPCClient(createRPCHttpTransport({
  url,
  headers: { authorization: `Bearer ${token}` },
}), { timeout: 5_000 });
const task = await client.call<{ title: string }, Task>("tasks.create", { title: "Buy milk" });
console.log("created:", task);

const intruder = new RPCClient(createRPCHttpTransport({
  url,
  headers: { authorization: "Bearer guessed-token" },
}));
try {
  await intruder.call("tasks.list", {});
} catch (error) {
  if (isRPCError(error)) console.log("intruder:", error.name, error.code, "-", error.message);
}

const raw = await fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" });
console.log(raw.status, await raw.text());
await server.stop();
```

Output of `npx tsx http-demo.ts`

```ts
created: { id: 1, title: 'Buy milk', done: false }
intruder: RPCAuthenticationError RPC_UNAUTHENTICATED - A valid service token is required.
400 {"id":"","success":false,"error":{"code":"RPC_INVALID_REQUEST","message":"RPC requests must be sent as application/json."}}
```

The call went through a real HTTP server on your machine. The client code is the same as with the memory transport: only the transport changed. The intruder's call was refused with a typed `RPCAuthenticationError`, and the plain-text request got an RPC error frame, not an HTML page.

The HTTP transport also passes cancellation along. When a call times out or its signal is aborted, the transport aborts the `fetch`, and the fetch handler aborts the procedure's `context.signal`, so the server stops working for a caller that has left.

In this demo, both sides share a random token created at startup. Two real services cannot do that. They both read the token from an environment variable, and the service refuses to start without a strong one:

rpc-token.tsNode.js only

```ts
const token = process.env.TASKS_RPC_TOKEN;
if (!token || token.length < 32) {
  console.error("TASKS_RPC_TOKEN is missing or shorter than 32 characters. Refusing to start.");
  process.exit(1);
}
console.log("Token loaded.");
```

Output of `npx tsx rpc-token.ts`

```ts
TASKS_RPC_TOKEN is missing or shorter than 32 characters. Refusing to start.
```

That is what you see without the variable. Create one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and give the same value to both services.

## Timeouts and deadlines

A call over a network can hang. Every call therefore has a **timeout**. The client has one (`timeout` in its options or per call, 30 seconds by default), and each procedure can have its own. When time runs out, the caller gets an `RPCTimeoutError`.

A timeout does not stop the handler by force. The server *aborts* `context.signal`, and your handler must check it and stop. When the *caller* gives up first, the built-in transports carry that to the server too, and the same signal aborts:

timeout.tsNode.js only

```ts
import { createRPCMemoryTransport, createRPCProcedure, RPCClient, RPCTimeoutError } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const server = createTaskServer();
server.register(createRPCProcedure("tasks.report", async (_input: {}, context) => {
  for (let step = 1; step <= 5; step += 1) {
    await sleep(100);
    if (context.signal.aborted) {
      console.log(`[server] stopped at step ${step}`);
      return null;
    }
  }
  return { steps: 5 };
}, { timeout: 250 }));

const client = new RPCClient(createRPCMemoryTransport(server));

try {
  await client.call("tasks.report", {});
} catch (error) {
  if (error instanceof RPCTimeoutError) console.log("[client]", error.code, error.message);
}

try {
  await client.call("tasks.report", {}, { timeout: 150 });
} catch (error) {
  if (error instanceof RPCTimeoutError) console.log("[client]", error.code, error.message);
}
await sleep(400);
```

Output of `npx tsx timeout.ts`

```json
[client] RPC_TIMEOUT RPC operation timed out after 250ms.
[server] stopped at step 3
[client] RPC_TIMEOUT RPC operation timed out after 150ms.
[server] stopped at step 2
```

- First call: the procedure allows 250 ms. The caller got the timeout error at 250 ms, and the handler noticed the aborted signal after its third step and stopped.
- Second call: the caller only waited 150 ms. When its own timeout fired, the transport cancelled the call on the server, and the handler stopped after step 2, instead of working for a caller that had already left.
- In both cases the error's `code` is `RPC_TIMEOUT`, whether the server or the client decided that time was up.

A transport you write yourself may not be able to cancel the far side. The caller can then send a **deadline**, a point in time in `metadata.deadline`, and the server stops by then, never later.

## Retries

Networks fail for a moment and then work again. `retry(operation, options)` runs an operation again after a failure, waiting longer each time. Two rules keep retries safe:

- Only retry errors that can go away, such as `RPCUnavailableError`. A validation error fails the same way every time.
- Only retry calls that are safe to repeat. Reading a list is. Creating a task may not be: if the first call worked but its answer was lost, a retry creates a second task. That is what the `idempotent: true` option on a procedure documents. It is advice for you; the package does not retry anything by itself.

A transport is only an object with `send`, so you can wrap one. Here, a small transport wraps the memory transport and fails the first two sends, like a service that is restarting:

retry.tsNode.js only

```ts
import { createRPCMemoryTransport, RPCClient, RPCUnavailableError, retry } from "@zudojs/rpc";
import type { RPCTransport } from "@zudojs/rpc";
import { createTaskServer } from "./procedures.js";

const real = createRPCMemoryTransport(createTaskServer());

let sends = 0;
const unreliable: RPCTransport = {
  async send(request, options) {
    sends += 1;
    if (sends <= 2) throw new RPCUnavailableError("Task service is unavailable.");
    return real.send(request, options);
  },
};
const client = new RPCClient(unreliable, { timeout: 2_000 });

const tasks = await retry(() => client.call("tasks.list", {}), {
  attempts: 4,
  delay: 100,
  backoff: "exponential",
  jitter: "none",
  retryIf: (error) => error instanceof RPCUnavailableError,
  onRetry: (error, attempt, wait) => {
    console.log(`attempt ${attempt} failed (${(error as Error).message}), waiting ${wait} ms`);
  },
});
console.log("tasks:", tasks, "after", sends, "sends");
```

Output of `npx tsx retry.ts`

```ts
attempt 1 failed (Task service is unavailable.), waiting 100 ms
attempt 2 failed (Task service is unavailable.), waiting 200 ms
tasks: [] after 3 sends
```

With `backoff: "exponential"` the wait doubles: 100 ms, then 200 ms, then it would be 400 ms. The third attempt worked. `jitter: "none"` keeps this example's output the same on every run. In production, leave the default random **jitter**. It spreads the retries of many clients over time, so they do not all hit a recovering service at the same moment.

## Practice

TRY IT YOURSELF

### Only admins may delete

Write a middleware that lets a call through only when the **verified** identity has `role: "admin"`, and answers `RPC_FORBIDDEN` otherwise. Test it with a frame whose metadata claims `role: "admin"` but whose verified identity is a normal user.

**Show a solution**

admin.tsNode.js only

```ts
import { createRPCProcedure, createRPCRequest, RPCForbiddenError, RPCMiddlewareStack, RPCServer } from "@zudojs/rpc";
import type { RPCMiddleware } from "@zudojs/rpc";

const adminOnly: RPCMiddleware = async (context, next) => {
  if (context.auth?.role !== "admin") throw new RPCForbiddenError("Admins only.");
  return next();
};

const server = new RPCServer(undefined, new RPCMiddlewareStack([adminOnly]));
server.register(createRPCProcedure("tasks.deleteAll", async () => "deleted"));

const frame = createRPCRequest({ id: "r1", procedure: "tasks.deleteAll", payload: {}, metadata: { role: "admin" } });
console.log((await server.handle(frame, { auth: { userId: "bo", role: "user" } })).error?.code);
console.log((await server.handle(frame, { auth: { userId: "ada", role: "admin" } })).result);
```

Output of `npx tsx admin.ts`

```ts
RPC_FORBIDDEN
deleted
```

The middleware only reads `context.auth`. The metadata's claim changes nothing.

TRY IT YOURSELF

### Which errors to retry

Write a `shouldRetry(error)` function for `retryIf`. It returns `true` for `RPCUnavailableError` and `RPCTimeoutError`, and `false` for everything else. Test it with three errors.

**Show a solution**

should-retry.tsNode.js only

```ts
import { RPCError, RPCTimeoutError, RPCUnavailableError } from "@zudojs/rpc";

function shouldRetry(error: unknown): boolean {
  return error instanceof RPCUnavailableError || error instanceof RPCTimeoutError;
}

console.log(shouldRetry(new RPCUnavailableError("down")));
console.log(shouldRetry(new RPCTimeoutError(100)));
console.log(shouldRetry(new RPCError("bad input", { code: "RPC_VALIDATION_ERROR" })));
```

Output of `npx tsx should-retry.ts`

```ts
true
true
false
```

Retrying after a timeout is only safe for idempotent procedures: the first call may have finished on the server after the caller gave up.

## Recap

- RPC calls a named procedure in another process. A **server** holds procedures, a **client** calls them, and a **transport** carries frames between them.
- An `input` schema checks every payload before the handler runs. Failures come back as codes such as `RPC_VALIDATION_ERROR`, with `details`.
- The client rebuilds typed errors such as `RPCValidationError`, with the server's `code` and `details`. Only errors with `expose: true` show their message to the caller. Everything else becomes `RPC_INTERNAL_ERROR` and goes to `onInternalError`.
- Results travel as JSON, so return plain JSON values.
- Metadata is untrusted. Verified identity goes in `handle(frame, { auth })` and reaches middleware as `context.auth`.
- `createRPCMemoryTransport`, `createRPCHttpTransport` and `createRPCFetchHandler` carry frames in one process or over HTTP. The fetch handler's `auth` option checks the caller's token.
- Timeouts abort `context.signal`, and a caller that gives up cancels the server side too. Retry only temporary errors, and only idempotent calls.

In the next lesson you define an operation once and serve it over HTTP, RPC and a queue with `@zudojs/api`.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
