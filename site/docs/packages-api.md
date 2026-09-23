---
title: "@zudojs/api — Transport-agnostic API layer"
description: "@zudojs/api for ZudoJS: define an operation once and serve it over HTTP, RPC, queues and the CLI with shared validation and interceptors."
source: https://zudojs.oyinlola.site/docs/packages-api
---

v1.1.0

# @zudojs/api

Define your application's operations once, then run them over HTTP, RPC, a queue, the CLI, or a test with the same validation, timeouts, and interceptors.

OPERATIONS INTERCEPTORS TRANSPORT-AGNOSTIC

## OVERVIEW

Most apps end up with business logic buried inside HTTP route handlers. When you later want to call the same logic from a command-line tool, a background job, or a test, you have to copy it or fake an HTTP request.

`@zudojs/api` fixes this by giving you an *operation*: a named function with a declared input, a declared output, and a handler. An *executor* runs operations for you and always returns a result object instead of throwing. A *registry* stores operations by name so a transport can look them up.

The executor itself knows nothing about HTTP. It never sends a response or reads a header; whatever calls it gets back a plain `{ ok, data }` or `{ ok, error }` object. *Bindings* connect that core to real transports: one operation can be served over HTTP (`createApiFetchHandler`), RPC (`registerApiRpcProcedures`), a queue (`bindApiQueue`) and the command line (`runApiCli`), with the same errors everywhere. See [Bindings](#bindings).

When you need it

- The same logic must run from more than one entry point (HTTP and CLI, or HTTP and a queue).
- You want input and output checked by a schema without writing that check in every handler.
- You want one place to add logging, auth, or caching around every operation.

When you don't

- You have a handful of HTTP routes and nothing else will ever call them.
- You need HTTP routing itself. That lives in [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md).
- You need declarative authorization rules. Write them as an interceptor, or see [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md).

## INSTALLATION

Install the package. Its error classes come from `@zudojs/errors`, and the bindings use `@zudojs/rpc`, `@zudojs/queue`, `@zudojs/openapi` and `@zudojs/serialization`; all are pulled in automatically as regular dependencies. `@zudojs/http` is not one of them: it mounts this package, not the other way round.

```bash
$ npm install @zudojs/api
```

> **Note**
>
> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

Requires Node.js 24 or newer. The package is ESM only, so use `import`, not `require`.

## QUICK START

This example defines one operation, registers it, and runs it. The two type arguments on `defineOperation` tell TypeScript what the input and output look like.

```ts
import {
  defineOperation,
  APIOperationRegistry,
  APIExecutor,
  createAPIContext,
} from "@zudojs/api";

// 1. Define an operation: a name plus an async handler.
const getUser = defineOperation<{ id: string }, { id: string; name: string }>({
  name: "users.get",
  handler: async (input, context) => {
    return { id: input.id, name: "Alice" };
  },
});

// 2. Register it so it can be found by name.
const registry = new APIOperationRegistry();
registry.register(getUser);

// 3. Run it. The executor never throws; it returns a result object.
const executor = new APIExecutor();
const context = createAPIContext("req-1", {});
const result = await executor.execute(registry.require("users.get"), { id: "u_1" }, context);

if (result.ok) {
  console.log(result.data); // { id: "u_1", name: "Alice" }
} else {
  console.error(result.error.statusCode, result.error.message);
}
```

Run it and you see `{ id: 'u_1', name: 'Alice' }` printed. The rest of this page explains each of the three pieces and what happens when something goes wrong.

## OPERATIONS

An *operation* is one thing your app can do, such as "get a user" or "create an order". You describe it with `defineOperation()`, which checks the description and returns a frozen object. A *handler* is the async function that does the work; it receives the input and a context object.

`defineOperation` checks your definition at startup so a bad name or timeout fails immediately, not on the first request. The full set of options:

| Option | What it does | Notes |
| --- | --- | --- |
| name | Unique identifier, e.g. "users.get". | Required. 1–128 characters from A-Z a-z 0-9 . _ : / -. |
| handler | Async function (input, context) => Promise<output>. | Required. |
| input | Schema used to validate input before the handler runs. | Optional. Must be a @zudojs/schema schema (or any safeParse schema) or a Standard Schema; anything else throws in defineOperation. See [Validation](#validation). |
| output | Schema used to validate what the handler returns. | Optional. Same rule as input. |
| timeout | Deadline in milliseconds. | Optional. Default 30 000. Must be a positive integer up to 3 600 000. |
| metadata | Descriptive extras: description, tags, version, deprecated, idempotent, timeout, and http. | Optional. Frozen once registered. tags powers registry.findByTag(). http: { method, path } sets the HTTP route, e.g. { method: "GET", path: "/users/:id" }; the default is POST /<name>. It is checked by defineOperation. |

This operation uses a short timeout and tags. It is the shape used by the package's own README test.

```ts
import { defineOperation } from "@zudojs/api";

interface User {
  readonly id: string;
  readonly name: string;
}

const getUser = defineOperation<{ id: string }, User>({
  name: "users.get",
  timeout: 5_000,
  metadata: { description: "Fetch one user by id", tags: ["Users"] },
  handler: async (input, context) => {
    // context.signal fires if the caller cancels; pass it to anything that supports it.
    return { id: input.id, name: "Alice" };
  },
});

console.log(getUser.name, getUser.timeout); // "users.get" 5000
```

> **Watch out**
>
> There is no way to switch the deadline off. timeout: 0, a negative number, or NaN throws a RangeError at definition time. If you need longer than an hour, the work belongs in a queue, not an operation.

The timeout stops the executor from *waiting*; it cannot stop the handler's code from running. To make long work truly cancellable, pass `context.signal` to your database client or `fetch`.

## VALIDATION

A *schema* is an object that can check whether a value has the right shape. The executor accepts a `@zudojs/schema` schema (or any schema with a `safeParse` method), or any schema that follows the [Standard Schema](https://standardschema.dev) spec, which Zod, Valibot, and ArkType all implement. You never import a validation library from `@zudojs/api` itself.

When `input` is a schema, the executor validates before calling the handler and hands the handler the schema's cleaned-up value. When `output` is a schema, the handler's return value is validated too, and the cleaned value becomes `result.data`. Any other value in those fields is rejected: `defineOperation` and `register` throw a `TypeError`, and the executor fails closed with a 500 without running the handler.

The example below writes a tiny schema by hand so you can see the whole thing. In a real app you would pass a Zod schema in the same spot with no other changes.

```ts
import { defineOperation, APIExecutor, createAPIContext, APIValidationError } from "@zudojs/api";

// A minimal Standard Schema: an object with a "~standard" property.
const GetUserSchema = {
  "~standard": {
    version: 1,
    vendor: "example",
    validate: (value: unknown) => {
      const input = value as { id?: unknown };
      return typeof input?.id === "string"
        ? { value: { id: input.id } }
        : { issues: [{ message: "id must be a string", path: ["id"] }] };
    },
  },
};

const getUser = defineOperation<{ id: string }, { id: string; name: string }>({
  name: "users.get",
  input: GetUserSchema,
  handler: async (input) => ({ id: input.id, name: "Alice" }),
});

const executor = new APIExecutor();
const context = createAPIContext("req-1", {});

// Send a number where a string is required.
const result = await executor.execute(getUser, { id: 42 as unknown as string }, context);

if (!result.ok && result.error instanceof APIValidationError) {
  console.log(result.error.statusCode); // 422
  console.log(result.error.issues);     // [ "id: invalid" ]
}
```

Notice the issue says `"id: invalid"`, not `"id must be a string"`. By default the executor reports *where* validation failed but never repeats what was sent, because schema messages often quote the submitted value. The list is also capped at 20 issues.

> **Tip**
>
> If you know every schema in your app writes value-free messages, opt in with new APIExecutor({ exposeValidationMessages: true }). Lower the cap with maxValidationIssues (1–20).

Output failures work differently. A handler returning the wrong shape is a bug on your side, not the client's, so it becomes an `APIInternalError` (status 500, `expose: false`) whose message names only the failing paths.

## EXECUTION CONTEXT

The *context* is a small object that travels with one request through interceptors and into the handler. It carries a request id, optional cancellation signal, a `state` object you choose, and typed key/value slots.

A *context key* is a named, typed slot. You create one with `createContextKey<T>(name)`, then `context.set(key, value)` and `context.get(key)`. Each key has its own hidden identity, so two keys with the same name never clash.

This example stores a list of feature flags on the context and reads it back. It is copied from the package's README test.

```ts
import { createAPIContext, createContextKey, UserIdContextKey } from "@zudojs/api";

const FeatureFlagsKey = createContextKey<readonly string[]>("featureFlags");

const context = createAPIContext("req-3", { locale: "en" });
context.set(FeatureFlagsKey, ["beta"]);
context.set(UserIdContextKey, "u_1");

console.log(context.get(FeatureFlagsKey));          // [ "beta" ]
console.log(context.state.locale);                   // "en"
console.log(context.metadata.get("userId"));        // "u_1"
console.log(context.requestId);                      // "req-3"
```

Five keys are built in and exported, so you do not need to create them: `RequestIdContextKey`, `CorrelationIdContextKey`, `TenantIdContextKey`, `UserIdContextKey` (all strings) and `StartTimeContextKey` (a number). Use them so different packages agree on where "the current user" lives.

### Request ids from the outside world

`createAPIContext` throws a `TypeError` unless the request id is 1–128 characters from `A-Z a-z 0-9 . _ : -`. That keeps newlines and other junk out of your logs. Values that come from a header must go through `normalizeRequestId()` first.

```ts
import { createAPIContext, normalizeRequestId, isValidRequestId } from "@zudojs/api";

console.log(isValidRequestId("abc-123"));       // true
console.log(isValidRequestId("bad\nvalue"));    // false

// Valid ids pass through; anything else becomes a fresh UUID.
console.log(normalizeRequestId("abc-123"));      // "abc-123"
console.log(normalizeRequestId(undefined));      // e.g. "0f8a2c1e-9b4d-4b8a-9c2e-6d1f7a3b5c04" (random UUID)

const headerValue: string | undefined = undefined; // pretend this came from X-Request-Id
const context = createAPIContext(normalizeRequestId(headerValue), {});
```

> **Watch out**
>
> context.set(RequestIdContextKey, value) throws. The request id is fixed when the context is created so context.requestId and context.get(RequestIdContextKey) can never disagree.

## EXECUTOR AND RESULTS

`APIExecutor.execute(operation, input, context)` runs one operation and always resolves to an `APIResult`. It validates input, runs interceptors, enforces the timeout and abort signal, runs the handler, validates output, and converts anything thrown into a failure result.

A result is one of two frozen shapes. Check `result.ok` and TypeScript narrows the type for you:

- `{ ok: true, data }` — the handler's (validated) return value.
- `{ ok: false, error }` — an `APIError` with `statusCode`, `code`, `message`, and `expose`.

This example throws a plain `Error` from a handler and shows how the executor hides its message from the client while keeping it on `error.cause` for your logs. Note that `BaseError.toJSON()` (used by `JSON.stringify`) serialises `cause` with its message and stack, so never pass `result.error` to `res.json()` as-is: send `code`, `statusCode` and (when `expose` is true) `message`, or use `ErrorSerializer` from `@zudojs/errors`.

```ts
import { defineOperation, APIExecutor, createAPIContext, APIInternalError } from "@zudojs/api";

const saveUser = defineOperation({
  name: "users.save",
  handler: async () => {
    throw new Error('duplicate key value violates unique constraint "users_email_key"');
  },
});

const executor = new APIExecutor();
const result = await executor.execute(saveUser, {}, createAPIContext("req-1", {}));

if (!result.ok) {
  console.log(result.error instanceof APIInternalError); // true
  console.log(result.error.statusCode);                    // 500
  console.log(result.error.expose);                        // false
  console.log(result.error.message);                       // 'An unexpected internal error occurred in operation "users.save".'
  console.log((result.error.cause as Error).message);     // the original database message, for your logs only
}
```

To send a specific error to the client, throw an `APIError` instead. Those pass through untouched. `createAPIError(message, { statusCode, expose })` builds one quickly, and classes such as `APIAuthenticationError` (401) and `APIAuthorizationError` (403) take just a message.

The transport then maps the result onto its protocol. The [bindings](#bindings) do this for you; if you call the executor from your own code, this is the pattern:

```ts
if (result.ok) {
  respond(200, result.data);
} else {
  respond(result.error.statusCode, {
    message: result.error.expose ? result.error.message : "Internal error",
  });
}
```

Two other failures the executor produces on its own: a handler slower than its timeout fails with `APITimeoutError` (504), and a context whose `signal` is aborted fails with code `ErrorCode.OPERATION_CANCELLED` (status 499). Branch on the code, not the status, for cancellation.

> **In plain words**
>
> expose: true means "safe to show the user". expose: false means "log it, but send a generic message". The executor sets this for you; your transport only has to respect it.

## INTERCEPTORS

An *interceptor* is code that runs around every operation: something before the handler, then `await next()`, then something after. You give the executor a list of them, and the first one in the list is the outermost. At most 32 are allowed.

Each interceptor receives an `APIExecutionContext` with four fields: `operation`, `input` (writable), `context` (the request context), and `result` (set after `next()` resolves). It can replace the input, short-circuit by returning a result without calling `next()`, or observe the result afterwards.

This example has a timing interceptor and an auth interceptor. The auth one returns a failure early when no user id is on the context, so the handler never runs.

```ts
import {
  defineOperation,
  APIExecutor,
  createAPIContext,
  apiFailure,
  APIAuthenticationError,
  UserIdContextKey,
  type APIInterceptor,
} from "@zudojs/api";

const timing: APIInterceptor = {
  async intercept(ctx, next) {
    const started = Date.now();
    const result = await next();
    // ctx.result === result here, even if a later interceptor short-circuited.
    console.log(ctx.operation.name, Date.now() - started, "ms", result.ok);
    return result;
  },
};

const requireUser: APIInterceptor = {
  async intercept(ctx, next) {
    if (ctx.context.get(UserIdContextKey) === undefined) {
      return apiFailure(new APIAuthenticationError("Sign in first."));
    }
    return next();
  },
};

const whoAmI = defineOperation({
  name: "users.me",
  handler: async (_input, context) => ({ userId: context.get(UserIdContextKey) }),
});

const executor = new APIExecutor({ interceptors: [timing, requireUser] });

const anonymous = createAPIContext("req-1", {});
const denied = await executor.execute(whoAmI, {}, anonymous);
console.log(denied.ok, !denied.ok && denied.error.statusCode); // false 401

const signedIn = createAPIContext("req-2", {});
signedIn.set(UserIdContextKey, "u_1");
const allowed = await executor.execute(whoAmI, {}, signedIn);
console.log(allowed.ok && allowed.data); // { userId: "u_1" }
```

Each run also prints a line like `users.me 1 ms false` from the timing interceptor, because it wraps the auth interceptor and sees its result.

> **Watch out**
>
> Call next() at most once. A second call fails with an APIInternalError rather than silently running the handler twice. new APIExecutor([timing]) (a bare array) also works when you have no other options to set.

`createNoopInterceptor()` returns an interceptor that just calls `next()`. It is handy as a placeholder in tests.

## REGISTRY

The *registry* is a map from operation name to operation. A transport uses it to turn `"users.get"` from a URL or message into the operation to run. Every error it throws is an `APIError` with a status code, so the transport can forward it without special cases.

Register everything at startup, then `freeze()` so nothing can be added or removed while requests are flowing.

```ts
import { defineOperation, APIOperationRegistry, APIOperationNotFoundError } from "@zudojs/api";

const getUser = defineOperation({
  name: "users.get",
  metadata: { tags: ["Users"] },
  handler: async () => ({ id: "u_1", name: "Alice" }),
});
const ping = defineOperation({ name: "system.ping", handler: async () => ({ pong: true }) });

const registry = new APIOperationRegistry();
registry.register(getUser);
registry.register(ping);
registry.freeze();

console.log(registry.has("users.get"));                // true
console.log(registry.get("nope"));                     // undefined
console.log(registry.findByTag("Users").map((op) => op.name)); // [ "users.get" ]
console.log(registry.getAll().length);                 // 2

try {
  registry.require("users.missing");
} catch (error) {
  console.log(error instanceof APIOperationNotFoundError); // true (statusCode 404)
}
```

| Method | What it does | Notes |
| --- | --- | --- |
| register(op) | Adds an operation and freezes its metadata. | Throws APIDuplicateOperationError (409) on a repeated name; APIError (500) if frozen. |
| get(name) | Returns the operation or undefined. | Use when a miss is normal. |
| require(name) | Returns the operation or throws. | Throws APIOperationNotFoundError (404). |
| has(name) | Boolean existence check. |  |
| getAll() | Every registered operation. | Returns a new array each call. |
| findByTag(tag) | Operations whose metadata.tags includes tag. | Case-sensitive. |
| unregister(name) | Removes one; returns true if it existed. | Throws if frozen. |
| freeze() / isFrozen() | Locks the registry / reports the lock. | Cannot be undone. |

## BINDINGS: ONE OPERATION, MANY TRANSPORTS

A *binding* connects your operations to one way of calling them. The package ships four, and you can use any mix of them on the same registry:

| Transport | Function | What the caller does |
| --- | --- | --- |
| HTTP | createApiFetchHandler(registry, options) | Sends POST /users.create (or the route you chose) with a JSON body. |
| RPC | registerApiRpcProcedures(server, registry, options) | Calls client.call("users.create", input) through [@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md). |
| Queue | bindApiQueue(queue, registry, options) | Adds a job named after the operation to a [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) queue. |
| CLI | runApiCli(registry, argv, options) | Runs app users.create --name Ann in a terminal. |

Every binding behaves the same way. It runs the call through the `APIExecutor` you pass as `executor`, so your interceptors apply on every transport. It validates input with the operation's schema. It sets `TransportContextKey` on the context to `"http"`, `"rpc"`, `"queue"` or `"cli"`, so a handler can tell where a call came from. And it hands every failure the caller was not allowed to see to `onInternalError(error, requestId)`, which is where you log it.

The `state` option builds `context.state` from whatever the transport hands over: the `Request` for HTTP, the `RPCContext` for RPC, the `Job` for a queue, the parsed invocation for the CLI. Throw an `APIError` there, such as `APIAuthenticationError`, to refuse the call.

The examples below share this setup. `metadata.http` is optional: it picks the HTTP method and path. Without it, an operation is served at `POST /<operation name>`.

```ts
import { objectSchema, stringSchema } from "@zudojs/schema";
import { defineOperation, APIOperationRegistry, APIExecutor } from "@zudojs/api";

const getUser = defineOperation({
  name: "users.get",
  input: objectSchema({ id: stringSchema() }),
  metadata: { http: { method: "GET", path: "/users/:id" } }, // default: POST /users.get
  handler: async (input) => ({ id: input.id, name: "Alice" }),
});

const registry = new APIOperationRegistry();
registry.register(getUser);
registry.freeze();

const executor = new APIExecutor({ interceptors: [] }); // your interceptors go here
```

### HTTP

`createApiFetchHandler` returns a *fetch handler*: a function that takes a web-standard `Request` and returns a `Response`. Any server that speaks the Fetch API can run it, including [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md), `Bun.serve` and `Deno.serve`. This package never imports `@zudojs/http`; `@zudojs/http` mounts it.

```ts
import { createApiFetchHandler } from "@zudojs/api";
import { createRouter, mountFetchHandler } from "@zudojs/http";

const router = createRouter();

// Serves GET /api/users/:id. No basePath: mountFetchHandler strips "/api" first.
mountFetchHandler(router, "/api", createApiFetchHandler(registry, { executor }));
```

```bash
$ curl http://127.0.0.1:3000/api/users/u1
{"ok":true,"data":{"id":"u1","name":"Alice"}}
```

> **Watch out**
>
> Do not set basePath when you mount on @zudojs/http. mountFetchHandler already removes the mount path from the URL, so a basePath: "/api" as well would make the handler look for /api/api/users/u1 and answer 404. Use basePath only when the server hands the handler the full URL, as Bun.serve({ fetch: handle }) does.

Where input comes from: `GET` and `DELETE` routes read the query string, so every value arrives as a string (use a coercing schema such as `coerceNumberSchema()` for numbers). `POST`, `PUT` and `PATCH` read a JSON body of at most `maxBodyBytes` (1 MiB by default). Path parameters are merged over either one and win. The request id comes from a safe `x-request-id` header and is echoed back, and the call runs under `request.signal`, so a client that disconnects cancels it.

### What a failure looks like

Every binding reports a failure in the same client-safe shape, `APIWireError`: `{ code, message, statusCode, requestId, issues? }`. Over HTTP it is the body `{ "ok": false, "error": { … } }`, sent with the error's status. The message is the error's own only when the error is `expose: true`; otherwise it is the fixed `"An internal error occurred."`. Stack traces, causes and metadata never leave the process.

| What went wrong | HTTP status | error.code and message |
| --- | --- | --- |
| Input failed the schema | 422 | ERR_API_VALIDATION, with issues such as ["a: invalid"]. |
| The handler threw a domain error, e.g. APIConflictError("Seat already taken.") | Its own, e.g. 409 | Its own code and message: ERR_API_CONFLICT, "Seat already taken." |
| The handler threw anything else | 500 | ERR_API_INTERNAL, "An internal error occurred." The real error goes to onInternalError. |
| No operation at that method and path | 404 | ERR_API_NOT_FOUND. A known path with the wrong method gets 405 and an Allow header. |
| The handler ran past its timeout | 504 | ERR_API_TIMEOUT, "An internal error occurred." |

A body that is too large, not JSON, or unreadable gets 413, 415 or 400. The same failures reach the other transports as their own kind of error: an RPC caller gets a typed RPC error, a queue job fails, and the CLI exits with a non-zero code.

### RPC

`registerApiRpcProcedures` turns each operation into an [@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md) procedure on a server (or procedure registry). Build `state` from `rpc.auth`, the identity the transport verified, never from frame metadata, which the caller writes.

```ts
import { RPCServer, RPCClient, createRPCMemoryTransport } from "@zudojs/rpc";
import { registerApiRpcProcedures } from "@zudojs/api";

const server = new RPCServer();
registerApiRpcProcedures(server, registry, {
  executor,
  state: (rpc) => ({ user: rpc.auth?.userId }),
});

const client = new RPCClient(createRPCMemoryTransport(server));
console.log(await client.call("users.get", { id: "u1" })); // { id: "u1", name: "Alice" }
```

Procedure names default to the operation name, which must then be a valid RPC name such as `"users.get"`; pass `procedureName` to map other names. API errors become their RPC equivalents (`RPC_VALIDATION_ERROR` with issues, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`, `RPC_TIMEOUT`, …), and a domain error keeps its own code, such as `ERR_API_CONFLICT`. To serve the same server over HTTP, mount `createRPCFetchHandler(server)` with `mountFetchHandler(router, "/rpc", …)`.

### Queues

`bindApiQueue` makes a [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) queue run operations as background jobs. The job name is the operation name and `job.data` is the input.

```ts
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { bindApiQueue } from "@zudojs/api";

const queue = createInMemoryQueue(createQueueName("operations"));
bindApiQueue(queue, registry, { executor });

await queue.add("users.get", { id: "u1" }, { attempts: 1 });
```

Success completes the job with the operation's output. A failure throws an `APIError` carrying the client-safe message, so the queue retries and dead-letters the job as usual. Validation failures are retried too, which cannot help, so enqueue input you have not checked with `attempts: 1`.

### CLI

`runApiCli` turns a command line into an operation call, prints the output as JSON, and returns an exit code. Put it in a small executable file:

```ts
#!/usr/bin/env node
import { runApiCli } from "@zudojs/api";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

process.exitCode = await runApiCli(registry, process.argv.slice(2), {
  executor,
  programName: "app",
  signal: controller.signal,
});
```

```bash
$ app users.get --id u1
{
  "id": "u1",
  "name": "Alice"
}
$ app users.create --json '{"name":"Ann"}' --address.city Paris --admin
$ app --help   # lists the operations
```

The operation name comes first (or pass `operation` for a single-purpose program). `--field value` and `--field=value` set fields; kebab-case becomes camelCase, dots nest, repeated flags collect into an array, `--flag` is `true` and `--no-flag` is `false`. Values that look like JSON (numbers, `true`, `null`, `{…}`, `[…]`) are parsed; anything else stays a string. On failure the `{ ok: false, error }` body goes to stderr and the exit code tells a script what kind of failure it was:

| Exit code | APICliExitCode | When |
| --- | --- | --- |
| 0 | OK | The operation succeeded. |
| 65 | INVALID_INPUT | Input failed validation (a 400 or 422). |
| 64 | USAGE | Bad command line: unknown operation or malformed option. |
| 75 | TIMEOUT | The operation timed out. |
| 1 | FAILURE | Any other client error, such as a 409 conflict. |
| 77 | PERMISSION | Not signed in or not allowed (401, 403). |
| 69 | UNAVAILABLE | Rate limited or unavailable (429, 503); try again later. |
| 70 | INTERNAL | Internal error. |
| 130 | CANCELLED | Cancelled through the abort signal (Ctrl+C). |

## ROUTES AND OPENAPI

The HTTP binding works out a route for every operation. You can read that route table yourself, for logging, for tests, or to document the API.

`describeApiRoutes(operations, { basePath })` returns one frozen `APIOperationRoute` per operation: `operationId`, `method`, `path`, `pathParams`, `inputSource` (`"query"` or `"body"`), the input and output schemas, and the description, tags, deprecation and version from `metadata`. It throws on an invalid route or two operations that claim the same one, which is the check `createApiFetchHandler` runs at startup too.

```ts
import { describeApiRoutes } from "@zudojs/api";

for (const route of describeApiRoutes(registry, { basePath: "/api" })) {
  console.log(route.method, route.path, route.inputSource);
}
// GET /api/users/:id query
```

`toOpenAPIRouteDescriptors(operations, { basePath })` turns the same routes into [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) route descriptors, so one call documents exactly what the fetch handler serves:

```ts
import { createOpenAPIDocumentFromRoutes } from "@zudojs/openapi";
import { toOpenAPIRouteDescriptors } from "@zudojs/api";

const document = createOpenAPIDocumentFromRoutes(
  toOpenAPIRouteDescriptors(registry, { basePath: "/api" }),
  { info: { title: "Users", version: "1.0.0" } },
);
```

Here `basePath` is right even when you mount with `mountFetchHandler`: the document should show the full public path. The input schema becomes `query` (for `GET` and `DELETE`) or `body`, with path fields moved to `params`. The responses document 200 with the `{ ok: true, data }` envelope around the output schema, and 422, 404, 409, 500 and 504 with the `{ ok: false, error }` body. Only `@zudojs/schema` schemas are converted; with another schema library the input stays undocumented and `data` is `unknown`.

## API REFERENCE

Everything below is importable from `"@zudojs/api"`.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| defineOperation(options) | Validates and freezes an operation definition. | Throws TypeError / RangeError on a bad name, handler, or timeout. |
| resolveOperationTimeout(op) | Returns the effective timeout in ms. | Order: timeout, then metadata.timeout, then the default. |
| createAPIContext(requestId, state, signal?) | Builds a frozen request context. | Throws TypeError on an invalid request id. |
| createContextKey<T>(name) | Creates a typed context key. | Name must be a non-empty string. |
| isValidRequestId(value) | Type guard for a safe request id. | 1–128 chars, [A-Za-z0-9._:-]. |
| normalizeRequestId(value) | Returns the value if valid, else a new UUID. | Use on header values. |
| apiSuccess(data) / apiFailure(error) | Build frozen result objects. | Useful inside interceptors. |
| isApiSuccess(r) / isApiFailure(r) | Type guards on a result. | Same as checking r.ok. |
| createNoopInterceptor() | Interceptor that only calls next(). |  |
| normalizeAPIError(error, operationName?) | Turns any thrown value into an APIError. | Non-API errors become APIInternalError with the original on cause. toJSON() includes cause (message and stack), so serialise selected fields for clients. |
| createAPIError(message, options?) / isAPIError(value) | Build or detect a generic APIError. | Re-exported from @zudojs/errors. |
| createApiFetchHandler(operations, options?) | Serves operations as (request: Request) => Promise<Response>. | Options: executor, state, onInternalError, basePath, maxBodyBytes, serializer. Throws at creation on invalid or conflicting routes. |
| registerApiRpcProcedures(target, operations, options?) / createApiRpcProcedure(op, options?) | Expose operations as @zudojs/rpc procedures. | Returns the registered names. Extra option: procedureName. apiErrorToRPCError(error, procedure) is the error mapping. |
| bindApiQueue(queue, operations, options?) / createApiQueueProcessor(op, options?) | Run operations as @zudojs/queue jobs. | Job name = operation name; job.data = input. |
| runApiCli(operations, argv, options?) / parseApiCliArgs(argv, expectOperation) | Run an operation from a command line; resolves to an exit code. | Options add io, signal, operation, programName. |
| describeApiRoutes(operations, { basePath? }) / resolveApiRoute(op, basePath?) | The HTTP route of every operation / of one. | Throws on invalid or conflicting routes. |
| toOpenAPIRouteDescriptors(operations, { basePath? }) / toOpenAPIRouteDescriptor(route) | Routes as @zudojs/openapi descriptors. | Feed to createOpenAPIDocumentFromRoutes. apiSuccessBodySchema / apiWireErrorBodySchema build the envelope schemas. |
| toApiWireResult(result, requestId) / toApiWireError(error, requestId) | Client-safe form of a result or error. | What every binding sends. Use them when you call the executor yourself. |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| APIExecutor | Runs operations; execute(operation, input, context). | Constructor takes an interceptor array or { interceptors, exposeValidationMessages, maxValidationIssues }. |
| APIOperationRegistry | Stores operations by name. | See [Registry](#registry). |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| APIOperation<TInput, TOutput> | The frozen object defineOperation returns. | AnyAPIOperation is what the registry accepts. |
| DefineOperationOptions / APIOperationMetadata | Input to defineOperation and its metadata field. |  |
| APIHandler<TInput, TOutput> | (input, context) => Promise<TOutput> |  |
| APIContext<TState> / APIContextKey<T> | Request context and its typed keys. | Keys carry an id: symbol; always use createContextKey. |
| APIInterceptor / APIExecutionContext | Interceptor contract and the object it receives. | input is writable; result is set after next(). |
| APIExecutorOptions | Options object for new APIExecutor(). |  |
| APIResult<T> / APISuccess<T> / APIFailure | Result union and its two halves. |  |
| APIWireResult<T> / APIWireError | The client-safe result every binding sends. | { code, message, statusCode, requestId, issues? }. |
| APIOperationRoute / APIOperationHttpOptions | One operation's HTTP route / the metadata.http field. | Also APIHttpMethod, APIRouteInputSource, DescribeApiRoutesOptions. |
| APIBindingOptions and each binding's options | APIFetchHandlerOptions, APIRpcBindingOptions, APIQueueBindingOptions, APICliOptions. | All share executor, state, onInternalError. |
| APIErrorOptions | Options for createAPIError. | statusCode, code, expose, cause, endpoint, method. |

### Errors

All are re-exported from `@zudojs/errors` and extend `APIError`. Status codes are what the executor or registry attaches.

| Name | What it does | Notes |
| --- | --- | --- |
| APIValidationError | Input failed its schema. | 422, exposed; .issues lists paths. |
| APIAuthenticationError / APIAuthorizationError | Not signed in / not allowed. | 401 / 403, exposed. new X("message"). |
| APINotFoundError(endpoint, method?) | An endpoint does not exist. | 404. For a missing record use createAPIError with statusCode: 404. |
| APIConflictError / APIIdempotencyError | State conflict / idempotency key reuse. | 409. |
| APIRateLimitError(message?, retryAfter?) | Too many requests. | 429. |
| APITimeoutError(timeoutMs) | Handler exceeded its deadline. | 504. Produced by the executor. |
| APIUnavailableError / APIInternalError | Dependency down / unexpected bug. | 503 / 500. Internal errors are never exposed. |
| APIVersionError | Unsupported API version. | 400. |
| APIOperationNotFoundError / APIDuplicateOperationError | Registry miss / duplicate name. | 404 / 409. Thrown by the registry. |
| ErrorCode | Enum of machine-readable codes. | e.g. ErrorCode.OPERATION_CANCELLED for an aborted run. |

### Constants

| Name | What it does | Notes |
| --- | --- | --- |
| DEFAULT_OPERATION_TIMEOUT | 30 000 ms. | Used when no timeout is given. |
| MAX_OPERATION_TIMEOUT | 3 600 000 ms (1 hour). | Upper bound for timeout. |
| MAX_INTERCEPTORS | 32. | Enforced by the executor constructor. |
| MAX_VALIDATION_ISSUES / MAX_VALIDATION_ISSUE_LENGTH | 20 issues / 200 characters each. | Caps on client-facing validation errors. |
| MAX_OPERATION_NAME_LENGTH / MAX_REQUEST_ID_LENGTH | 128 characters each. |  |
| RequestIdContextKey, CorrelationIdContextKey, TenantIdContextKey, UserIdContextKey, StartTimeContextKey | Built-in context keys. | All strings except StartTimeContextKey (number). |
| TransportContextKey | Which binding ran the call. | "http" \| "rpc" \| "queue" \| "cli"; unset when you call the executor yourself. |
| APICliExitCode | Exit codes from runApiCli. | See the table in [CLI](#bindings-cli). |
| API_INTERNAL_ERROR_MESSAGE | "An internal error occurred." | Sent in place of any non-exposed message. |
| DEFAULT_API_MAX_BODY_BYTES | 1 048 576 (1 MiB). | Default maxBodyBytes for the fetch handler. |
| API_RPC_TIMEOUT_MARGIN_MS | 1 000 ms. | Extra time the RPC procedure allows, so the operation's own timeout is what a slow call reports. |

## COMMON MISTAKES

- **Passing a header straight to `createAPIContext`.** A missing or odd header throws a `TypeError` before your handler runs. Wrap it: `createAPIContext(normalizeRequestId(header), state)`.
- **Expecting `execute()` to throw.** It never throws for a failed operation; the error is in `result.error`. Wrapping it in `try/catch` catches nothing. Check `result.ok`.
- **Sending `result.error.message` to every client.** Internal errors carry a generic message, but only if you honour `expose`. Send the message when `expose` is true, otherwise a fixed string.
- **Using `timeout: 0` to "disable" the deadline.** `defineOperation` throws a `RangeError`. Pick a real number up to one hour.
- **Building a context key as a plain object.** `{ name: "x", type: undefined }` does not satisfy `APIContextKey`; it lacks the `id` symbol. Use `createContextKey<T>("x")`.
- **Setting `basePath` and also mounting under a prefix.** `mountFetchHandler(router, "/api", …)` already strips `/api`, so a `basePath: "/api"` on `createApiFetchHandler` makes every route 404. Set one or the other.
- **Enqueueing unchecked input with retries.** A job whose input fails validation is retried like any failure and can never succeed. Add it with `attempts: 1`, or validate before enqueueing.
- **Registering the same name twice.** Usually a module imported from two paths. The registry throws `APIDuplicateOperationError`; register once at startup, then `freeze()`.

## RELATED PACKAGES

- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the source of every `APIError` class, `ErrorCode`, and `BaseError.toJSON()`.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the HTTP server. Mount `createApiFetchHandler` on a router with `mountFetchHandler`.
- [@zudojs/rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md) — serves operations to other services through `registerApiRpcProcedures`.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — runs operations as background jobs through `bindApiQueue`.
- [@zudojs/openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md) — turns `toOpenAPIRouteDescriptors` into an OpenAPI document.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — Zudo's own schema library; its schemas are validated natively as `input` / `output`.
- [@zudojs/cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md) — when you want commands and queries split into separate buses on top of operations.
- [@zudojs/permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md) — authorization rules you can call from an interceptor. This package has no policy system of its own.

## NEXT STEPS

[Previous

@zudojs/adapters](https://zudojs.oyinlola.site/docs/packages-adapters.md) [Next

@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md)

## COMPLETE EXPORT INDEX

Every name `@zudojs/api` exports from its package root at v1.1.1 — **102** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 102 exports**

Classes (16)

`APIAuthenticationError` `APIAuthorizationError` `APIConflictError` `APIDuplicateOperationError` `APIError` `APIExecutor` `APIIdempotencyError` `APIInternalError` `APINotFoundError` `APIOperationNotFoundError` `APIOperationRegistry` `APIRateLimitError` `APITimeoutError` `APIUnavailableError` `APIValidationError` `APIVersionError`

Functions (30)

`apiErrorToRPCError` `apiFailure` `apiSuccess` `apiSuccessBodySchema` `bindApiQueue` `createAPIContext` `createAPIError` `createApiFetchHandler` `createApiQueueProcessor` `createApiRpcProcedure` `createContextKey` `createNoopInterceptor` `defineOperation` `describeApiRoutes` `isAPIError` `isApiFailure` `isAPISchema` `isApiSuccess` `isValidRequestId` `normalizeAPIError` `normalizeRequestId` `parseApiCliArgs` `registerApiRpcProcedures` `resolveApiRoute` `resolveOperationTimeout` `runApiCli` `toApiWireError` `toApiWireResult` `toOpenAPIRouteDescriptor` `toOpenAPIRouteDescriptors`

Interfaces (24)

`APIBindingOptions` `APICliInvocation` `APICliIO` `APICliOptions` `APIContext` `APIContextKey` `APIErrorOptions` `APIExecutionContext` `APIExecutorOptions` `APIFailure` `APIFetchHandlerOptions` `APIInterceptor` `APIOperation` `APIOperationHttpOptions` `APIOperationMetadata` `APIOperationRoute` `APIQueueTarget` `APIRpcBindingOptions` `APIRpcProcedureTarget` `APISchemaIssue` `APISuccess` `APIWireError` `DefineOperationOptions` `DescribeApiRoutesOptions`

Type aliases (13)

`AnyAPIOperation` `APICliExitCodeValue` `APICliParseResult` `APIHandler` `APIHttpMethod` `APIOperationSource` `APIQueueBindingOptions` `APIResult` `APIRouteInputSource` `APISchemaResult` `APITransportKind` `APIWireResult` `ToOpenAPIRouteDescriptorsOptions`

Constants (19)

`API_INTERNAL_ERROR_MESSAGE` `API_RPC_TIMEOUT_MARGIN_MS` `APICliExitCode` `apiWireErrorBodySchema` `CorrelationIdContextKey` `DEFAULT_API_MAX_BODY_BYTES` `DEFAULT_OPERATION_TIMEOUT` `ErrorCode` `MAX_INTERCEPTORS` `MAX_OPERATION_NAME_LENGTH` `MAX_OPERATION_TIMEOUT` `MAX_REQUEST_ID_LENGTH` `MAX_VALIDATION_ISSUE_LENGTH` `MAX_VALIDATION_ISSUES` `RequestIdContextKey` `StartTimeContextKey` `TenantIdContextKey` `TransportContextKey` `UserIdContextKey`
