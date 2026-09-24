---
title: "@zudojs/rpc — Remote Procedure Call Documentation"
description: "@zudojs/rpc docs for ZudoJS: typed procedures, middleware, retries, typed errors, and built-in in-memory and HTTP (Fetch API) transports."
source: https://zudojs.oyinlola.site/docs/packages-rpc
---

v1.4.0

# @zudojs/rpc

Call a function that runs on another machine as if it were local — typed procedures, a transport you choose, middleware, validation, timeouts, retries and errors that survive the trip.

RPC REMOTE PROCEDURE CLIENT SERVER

## OVERVIEW

A **remote procedure call** (RPC) is a function call that runs somewhere else. Your code writes `await client.call("users.getUser", { id: "123" })` and gets an answer back. The work happens in another process, on another machine, or behind a network connection.

Two things make that work. A **procedure** is the function on the far side: a name, a handler, and some options. A **transport** is the pipe that carries a request over and a response back.

This package gives you both halves plus everything in between — validation, middleware, timeouts, retries, typed errors. Two transports ship with it: an **in-memory** one that hands the request to a server in the same process, and an **HTTP** one built on the web-standard Fetch API (a client transport plus a server handler). The server does not care which one carried a call, so the same procedures run in memory in your tests and over HTTP in production without touching a handler. Anything else — a message broker, a socket — is a transport you write yourself. There is no WebSocket transport.

When you need it

- One service calls another service's functions.
- The same call must work over HTTP in production and in memory in tests.
- Auth, tracing or rate limits belong on every call, in one place.
- Failures must arrive as typed errors, not strings.

When you don't

- Both sides are in one process — use [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md).
- You are building a public REST API — use [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md).
- The work should happen later — use [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md).
- You need a stream of results. Streaming cannot be dispatched yet.

## INSTALLATION

```bash
$ npm install @zudojs/rpc
```

It pulls in `@zudojs/errors`, `@zudojs/schema`, `@zudojs/constants`, `@zudojs/types` and `@zudojs/serialization` (the frame codec) on its own. Install `@zudojs/schema` yourself only if you write schemas in your own code.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Node 24+.** The client uses `node:crypto` for request ids, so it runs on a server, not in a browser.

## QUICK START

The smallest complete setup is a server holding one procedure, a transport, and a client. `createRPCMemoryTransport` hands the request straight to the server in the same process, which is how the package's own tests run.

```ts
import {
  RPCServer,
  RPCClient,
  createRPCProcedure,
  createRPCMemoryTransport,
} from "@zudojs/rpc";

// 1. The far side: a server holding one named procedure.
const server = new RPCServer();

server.register(
  createRPCProcedure<{ id: string }, { id: string; name: string }>(
    "users.getUser",
    async (input) => {
      return { id: input.id, name: "Alice" };
    },
  ),
);

// 2. The pipe. This one stays in the process; the HTTP one crosses a network.
const transport = createRPCMemoryTransport(server);

// 3. The near side: call it like a local function.
const client = new RPCClient(transport);

const user = await client.call<{ id: string }, { id: string; name: string }>(
  "users.getUser",
  { id: "123" },
);

console.log(user);
// { id: "123", name: "Alice" }
```

**What you should see:** `{ id: "123", name: "Alice" }`. The client built a request with a fresh id, the transport carried it, the server found the procedure, ran the handler, and the client unwrapped the result.

> **Tip:** swap step 2 for `createRPCHttpTransport({ url })` and the same call goes over HTTP. Nothing else changes. See [Over HTTP](#http-transport).

## PROCEDURES

A **procedure** is one callable function on the server, wrapped with a name and some settings. `createRPCProcedure(name, handler, options?)` builds one and freezes it.

Names are checked the moment you create the procedure, not when a call arrives. A name must be dot-separated segments that each start with a lowercase letter: `"users.getUser"` is fine, `"getUser"` and `"Users.get"` are not. A typo becomes a startup crash instead of a call that can never be routed.

A **registry** is the lookup table of procedures. `RPCServer` makes one for you, or you can build your own and pass it in.

```ts
import { createRPCProcedure, RPCProcedureRegistry } from "@zudojs/rpc";

const getUser = createRPCProcedure<{ id: string }, { id: string; name: string }>(
  "users.getUser",
  async (input) => {
    return { id: input.id, name: "Alice" };
  },
  { description: "Look up one user.", idempotent: true, timeout: 5000 },
);

const registry = new RPCProcedureRegistry();
registry.register(getUser);

console.log(registry.describe());
// [ { name: "users.getUser", description: "Look up one user.",
//     idempotent: true, timeout: 5000 } ]
```

The five options, in plain terms:

- `description` — a human-readable line, readable only through `describe()`.
- `idempotent` — says calling twice is safe. Advisory: nothing retries or de-duplicates for you, but your retry policy can read it from `describe()`.
- `timeout` — milliseconds the handler may run. Enforced: the context signal is aborted and the caller gets `RPC_TIMEOUT`. Must be positive.
- `input` — a schema the payload is parsed against before the handler runs.
- `output` — a schema the result is checked against before it is sent.

> **Watch out:** registering the same name twice throws `RPCDuplicateProcedureError`. Registration is not an upsert — call `registry.unregister(name)` first if you mean to replace one.

## TRANSPORTS

A **transport** is an object with one required method: `send(request, options?)`. It takes an `RPCRequest`, gets it to the server however it likes, and resolves with the `RPCResponse` that comes back. `options.signal` aborts the call and `options.timeout` is the deadline in milliseconds. An optional `close()` releases the connection.

You rarely write one. The package ships three pieces, and the client and server never know which one is in use:

| Function | Side | Use it for |
| --- | --- | --- |
| createRPCMemoryTransport(server, options?) | Client | Tests, and modular monoliths where caller and server share a process. |
| createRPCHttpTransport({ url, … }) | Client | Calling a server in another process over HTTP, with the global `fetch`. |
| createRPCFetchHandler(server, options?) | Server | Answering those HTTP calls. It is a web-standard `(request: Request) => Promise<Response>`. |

### In memory

The memory transport calls `server.handle()` directly. It still behaves like a network in one important way: by default every request and response is **round-tripped through JSON**. The server never shares objects with the caller, and a value that could not cross a real network (a `BigInt` result, a circular object) fails here too, so your tests catch it before production does.

```ts
import { RPCClient, createRPCMemoryTransport } from "@zudojs/rpc";

const client = new RPCClient(
  createRPCMemoryTransport(server, {
    // Handed to the server as the trusted context.auth.
    auth: { userId: "u1" },
  }),
  { timeout: 5_000 },
);

const user = await client.call("users.getUser", { id: "123" });
```

- `auth` — the identity the server sees as `context.auth`: a fixed value, or a function of the request. In memory, your own code is the one vouching for it.
- `serializer` — how frames are copied. Pass another serializer to match a remote transport, or `false` to hand frames over by reference.
- When the caller aborts (its signal fires, or the call times out), the transport passes that signal to the server, so the handler's `context.signal` aborts and the server stops the work too.
- After `client.close()` every send fails with `RPCUnavailableError`.

### Writing your own

For any other carrier, implement `send` yourself. This one hands each frame to a message broker (the `broker` object stands in for your client library). On the far side, pass the frame to `server.handle(frame)` and send its response back.

```ts
import type { RPCTransport, RPCResponse } from "@zudojs/rpc";

const transport: RPCTransport = {
  async send(request, options): Promise<RPCResponse> {
    // Honouring the signal is what frees the connection when
    // the caller cancels or the call times out.
    return broker.request("rpc", request, { signal: options?.signal });
  },
};
```

> **In plain words:** the client still protects itself if your transport ignores `options.signal` — it races the signal on its own. But the connection stays open until the transport lets it go. `mapRPCError(error)` is the mapping the server uses to turn a thrown error into a wire payload, if your transport needs to answer one itself.

## OVER HTTP

Serving procedures over HTTP takes two pieces. On the server, `createRPCFetchHandler(server)` turns your `RPCServer` into a **fetch handler**: a function that takes a web-standard `Request` and returns a `Response`. On the caller, `createRPCHttpTransport({ url })` POSTs each call to it as JSON.

Because the handler speaks the Fetch API, anything that serves `Request` → `Response` can host it: [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md), `Bun.serve`, `Deno.serve`, or an edge runtime. On `@zudojs/http`, mount it with `mountFetchHandler` and no glue code:

```ts
// server.ts
import { RPCServer, createRPCProcedure, createRPCFetchHandler } from "@zudojs/rpc";
import { createRouter, mountFetchHandler } from "@zudojs/http";

const server = new RPCServer();
server.register(
  createRPCProcedure("math.sum", async (input: { a: number; b: number }) => input.a + input.b),
);

const handle = createRPCFetchHandler(server, {
  // Verify the caller here; the result becomes context.auth.
  auth: async (request) => verifyBearer(request.headers.get("authorization")),
  onInternalError: (error, requestId) => console.error(requestId, error),
});

const router = createRouter();
mountFetchHandler(router, "/rpc", handle);
// Or elsewhere: Bun.serve({ port: 3000, fetch: handle });
```

```ts
// client.ts
import { RPCClient, createRPCHttpTransport } from "@zudojs/rpc";

const client = new RPCClient(
  createRPCHttpTransport({
    url: "http://127.0.0.1:3000/rpc",
    // A function runs per call, so a refreshed token is always used.
    headers: () => ({ authorization: `Bearer ${currentToken()}` }),
  }),
  { timeout: 5_000 },
);

const total = await client.call<{ a: number; b: number }, number>("math.sum", { a: 1, b: 2 });
console.log(total);
// 3
```

**What you should see:** `3`. `verifyBearer` and `currentToken` are yours to write. The handler answers every path it is mounted on, so the prefix `mountFetchHandler` strips does not matter.

### What the handler does for you

- It accepts only `POST` with a JSON content type, and reads at most `maxBodyBytes` (default `DEFAULT_RPC_HTTP_MAX_BODY_BYTES`, 1 MiB plus 64 KiB for the envelope) without buffering more.
- Every reply is an RPC frame, even for a bad HTTP request (wrong method, wrong content type, oversized or invalid body). A caller never gets an HTML error page.
- An `auth` hook that throws `RPCAuthenticationError` refuses the call. Anything else it throws is answered as an internal error.
- The call runs under the request's signal. If the client disconnects, the procedure is cancelled (`context.signal` aborts and the dispatch ends with `RPC_CANCELLED`) instead of running on to its timeout for nobody.
- A frame whose payload or metadata holds a `__proto__`, `constructor` or `prototype` key is refused with `RPC_INVALID_REQUEST`. See [Refusing unsafe keys](#unsafe-keys).
- The HTTP status follows the wire code, as below. The status is advisory, for proxies and dashboards; `error.code` in the body is what counts.

| Wire code | HTTP status |
| --- | --- |
| success | 200 |
| RPC_INVALID_REQUEST, RPC_DESERIALIZATION_ERROR | 400 |
| RPC_UNAUTHENTICATED | 401 |
| RPC_FORBIDDEN | 403 |
| RPC_PROCEDURE_NOT_FOUND, RPC_NOT_FOUND | 404 |
| RPC_CONFLICT | 409 |
| RPC_VALIDATION_ERROR | 422 |
| RPC_RATE_LIMITED | 429 |
| RPC_CANCELLED | 499 |
| RPC_UNAVAILABLE | 503 |
| RPC_TIMEOUT, RPC_DEADLINE_EXCEEDED | 504 |
| RPC_INTERNAL_ERROR, RPC_SERIALIZATION_ERROR, any custom code | 500 |

### What the client transport does for you

It aborts the underlying `fetch` when the call's signal or deadline fires, so a timed-out call frees its connection. Its failures are typed: a network failure, or a reply that is not an RPC frame for this request (a proxy's HTML page, a truncated or oversized body), is an `RPCTransportError`; an expired deadline is an `RPCTimeoutError`; a caller abort is an `RPCCancelledError`. The deadline is clamped to the range Node's timers accept (`MAX_TIMER_DELAY`, about 24.8 days): a larger timeout, or `Infinity`, used to overflow and fail every call at once, and now simply means "wait a very long time". Other options: `fetch` (your own fetch function), `serializer` and `maxResponseBytes`.

> **Watch out:** use the same serializer on both ends. The default is plain JSON. `createRPCJsonSerializer({ preserveTypes: true })` also carries `Date`, `BigInt`, `Map` and `Set`, but only if the server and the client both use it.

## CONTEXT

Every handler gets two arguments: the parsed input, and a **context**. The context is the per-call scratchpad. It holds the original request, the **metadata** (small labelled values like `requestId`, `userId` or `traceId` that travel alongside the payload), an `AbortSignal`, and a key/value store. Metadata is written by the caller and is untrusted. The context also carries `auth` (identity your transport verified, passed as `server.handle(request, { auth })`) and `input` (the payload as the input schema parsed it).

The store is how middleware talks to a handler: middleware writes with `context.set()`, the handler reads with `context.get()`.

The signal is how a call is cancelled. It aborts when the procedure's timeout or the caller's deadline passes, and also when the caller goes away: the second argument of `server.handle(request, { auth, signal })` is an `RPCContextOptions`, and its `signal` is the caller's. The built-in HTTP handler and memory transport pass it for you; a custom transport should pass the signal of its connection. Nothing forces a handler to stop, so check the signal wherever giving up makes sense.

```ts
import { createRPCProcedure, throwIfCancelled } from "@zudojs/rpc";

const report = createRPCProcedure<{ rows: number }, number>(
  "reports.build",
  async (input, context) => {
    console.log(context.metadata.requestId);
    console.log(context.get<string>("actor"));

    let total = 0;
    for (let row = 0; row < input.rows; row += 1) {
      // Throws RPCCancelledError once the call is cancelled.
      throwIfCancelled(context.signal, "reports.build");
      total += row;
    }

    return total;
  },
  { timeout: 2000 },
);
```

**What happens:** finish inside two seconds and the caller gets the number. Otherwise the dispatcher aborts the signal, the next `throwIfCancelled` throws, and the caller receives `RPC_TIMEOUT` rather than a half-built result.

## MIDDLEWARE

**Middleware** is a function that wraps every call. It receives the context and a `next()` function. Work before `next()` happens on the way in, work after it on the way out, and not calling it at all short-circuits the call.

Middleware lives in an `RPCMiddlewareStack`, which is immutable — `stack.with(...)` returns a new stack. A stack holds at most 32 entries.

```ts
import {
  RPCServer,
  RPCMiddlewareStack,
  createRPCProcedure,
  createRPCRequest,
  RPCAuthenticationError,
} from "@zudojs/rpc";
import type { RPCMiddleware } from "@zudojs/rpc";

const requireUser: RPCMiddleware = async (context, next) => {
  if (typeof context.auth?.userId !== "string") {
    throw new RPCAuthenticationError("Sign in first.");
  }
  context.set("actor", context.auth.userId);
  return next();
};

const server = new RPCServer(
  undefined,
  new RPCMiddlewareStack([requireUser]),
);

server.register(
  createRPCProcedure("users.list", async () => [{ id: "1" }]),
);

const response = await server.handle(
  createRPCRequest({ id: "req-1", procedure: "users.list", payload: {} }),
);

console.log(response.success, response.error?.code);
// false "RPC_UNAUTHENTICATED"
```

Pass verified identity as the second argument, `server.handle(request, { auth: { userId: "u1" } })`, and the same call prints `true undefined`. Never authorise on `metadata`: any caller can set `metadata.userId`. Order matters too: the first middleware in the array is the outermost, so it also sees calls the ones below it reject.

> **Danger:** call `next()` exactly once. A second call throws, because re-entering the chain would run the handler — and every middleware below it — twice.

An **interceptor** is the same idea with an object shape, `{ intercept(context, next) }`, registered through the server's `dispatch.interceptors` option. Interceptors wrap the middleware stack *and* input validation, so they observe the whole dispatch — the right place for tracing spans and metrics. `createNoopRPCInterceptor()` gives you one that only calls `next()`.

## VALIDATING INPUT

A request arrives from somewhere you do not control, so its payload is untrusted data — not the TypeScript type you wrote. Types disappear at runtime; a caller can send anything.

Give a procedure an `input` schema and the dispatcher parses the payload before your handler sees it. A bad payload never reaches your code.

```ts
import {
  RPCServer,
  createRPCProcedure,
  createRPCRequest,
} from "@zudojs/rpc";
import { objectSchema, stringSchema } from "@zudojs/schema";

const server = new RPCServer();

server.register(
  createRPCProcedure(
    "users.getUser",
    async (input: { id: string }) => ({ id: input.id, name: "Alice" }),
    { input: objectSchema({ id: stringSchema() }) },
  ),
);

const response = await server.handle(
  createRPCRequest({
    id: "req-1",
    procedure: "users.getUser",
    payload: { id: 42 },
  }),
);

console.log(response.success, response.error?.code);
// false "RPC_VALIDATION_ERROR"
```

`response.error.details` holds one entry per problem, each with `path`, `code` and `message`. The value the caller sent is left out on purpose, so a validation reply never echoes their data back. An `output` schema failure is treated as your bug: the caller gets `RPC_INTERNAL_ERROR` with the fixed internal-error message, and the failing paths go to `onInternalError`. The client also passes its effective deadline to the transport as `options.timeout`.

Before any of that, `server.handle()` checks the envelope — the request must be an object, `id` a non-empty string of at most 128 characters, `procedure` a valid name, `metadata` an object when present (it may be omitted), and `payload` and `metadata` together no larger than 1 MB encoded. Anything else is `RPC_INVALID_REQUEST`.

Two of those bounds are new in 1.3.0. The size cap used to measure `payload` alone, so an unbounded `metadata` object reached middleware and handlers as `context.metadata` however large it was; the two are now measured together against `limits.maxPayloadBytes`, and a frame whose payload and metadata together exceed it is rejected where it used to be accepted. Budget for both when you size a frame. The `id` was unbounded and echoed verbatim into both the success and the error response; it is now capped by `limits.maxRequestIdLength`, defaulting to `MAX_RPC_REQUEST_ID_LENGTH` (128, enough for a UUID, a ULID or a W3C trace id). The id is checked before a response exists to carry it, so an over-long one is never reflected back.

```ts
const server = new RPCServer(undefined, undefined, {
  limits: {
    // payload + metadata combined, encoded bytes. Default 1 MB.
    maxPayloadBytes: 256 * 1024,
    // request.id characters. Default 128.
    maxRequestIdLength: 128,
  },
});
```

Set either limit to `0` to skip that check when the transport already enforces a frame limit.

### Refusing unsafe keys

`JSON.parse` keeps a key named `__proto__`, `constructor` or `prototype` as an ordinary property. A handler that later merges its input into another object (`{ ...defaults, ...input }` is safe, `Object.assign` into a shared object or a hand-written deep merge often is not) can have that object's prototype replaced: an attack called *prototype pollution*. So the server refuses a frame whose `payload` or `metadata` holds one of those keys at any depth, before any middleware or handler runs.

```ts
const response = await server.handle(
  createRPCRequest({
    id: "req-2",
    procedure: "users.getUser",
    payload: JSON.parse('{"id":"1","__proto__":{"isAdmin":true}}'),
  }),
);

console.log(response.error?.code, "|", response.error?.message);
// RPC_INVALID_REQUEST | Request contains the forbidden key "__proto__".
```

If a procedure genuinely receives such keys (a JSON document store, say) and never merges them, turn the check off with `new RPCServer(undefined, undefined, { limits: { allowUnsafeKeys: true } })`. The check is `findUnsafeKey(value)` from [@zudojs/security](https://zudojs.oyinlola.site/docs/packages-security.md); call it yourself on anything else you decode.

## ERRORS ACROSS THE BOUNDARY

A thrown error cannot travel over a network. Only data can. So the boundary works in three steps: your handler throws a typed error; the server turns it into a small JSON payload with a `code`, a `message` and sometimes `details`; the client reads the code and throws a matching error on your side.

The code is the contract. It is why a caller can tell a rejected session from a timeout without matching on message text.

You do not have to throw RPC classes. Domain code usually throws the ready-made errors from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md), and those that are built with `expose: true` (the 4xx ones are, by default) reach the caller with their own message under the code that matches their status. A `ValidationError` sends its issues as `details` (without the values the caller sent), and a `RateLimitError` built with `retryAfterSeconds` sends `{ retryAfter }`. Before v1.4.0 they all arrived as `RPC_INTERNAL_ERROR`, and `RPC_NOT_FOUND` (404) and `RPC_CONFLICT` (409) did not exist.

| Thrown on the server | Wire code |
| --- | --- |
| RPCProcedureNotFoundError | RPC_PROCEDURE_NOT_FOUND |
| RPCValidationError | RPC_VALIDATION_ERROR |
| RPCInvalidRequestError | RPC_INVALID_REQUEST |
| RPCAuthenticationError | RPC_UNAUTHENTICATED |
| RPCForbiddenError | RPC_FORBIDDEN |
| RPCRateLimitedError | RPC_RATE_LIMITED |
| RPCDeadlineExceededError | RPC_DEADLINE_EXCEEDED |
| RPCTimeoutError | RPC_TIMEOUT |
| RPCCancelledError | RPC_CANCELLED |
| RPCUnavailableError | RPC_UNAVAILABLE |
| RPCSerializationError | RPC_SERIALIZATION_ERROR |
| RPCDeserializationError | RPC_DESERIALIZATION_ERROR |
| NotFoundError (404) | RPC_NOT_FOUND |
| ConflictError (409) | RPC_CONFLICT |
| ValidationError (400/422) | RPC_VALIDATION_ERROR |
| AuthenticationError (401) | RPC_UNAUTHENTICATED |
| AuthorizationError (403) | RPC_FORBIDDEN |
| RateLimitError (429) | RPC_RATE_LIMITED |
| any other `@zudojs/errors` error with `expose: true` | by status (408/504 → `RPC_TIMEOUT`, 503 → `RPC_UNAVAILABLE`), otherwise its own `code` |
| anything else, and any error with `expose: false` | RPC_INTERNAL_ERROR |

> **Danger:** an unrecognised or non-exposed error never sends its own message. Exception text can name hosts, paths, credentials or queries, and the caller is a stranger. They get one fixed sentence plus the request id. The same applies to any `RPCError` thrown with `expose: false` — `RPCInternalError`, `RPCSerializationError`, or a plain `new RPCError(...)` — its `code` is sent but its message is replaced. A `@zudojs/errors` error with `expose: false` (a `DatabaseError`, for example) goes out as `RPC_INTERNAL_ERROR` with the fixed message. Pass the server's `onInternalError` hook if you want the real error — that hook is the only place it is recorded.

On the caller's side, `RPCClient` rebuilds a typed error from the wire code (the same mapping is exported as `rpcErrorFromWire`), so you can branch with `instanceof` instead of comparing strings. The codes above come back as `RPCProcedureNotFoundError`, `RPCValidationError` (with its `issues`), `RPCInvalidRequestError`, `RPCAuthenticationError`, `RPCForbiddenError`, `RPCRateLimitedError`, `RPCTimeoutError`, `RPCCancelledError` or `RPCUnavailableError`. Any other code, including `RPC_NOT_FOUND` and `RPC_CONFLICT`, becomes a plain `RPCError`. Either way, `error.code` is the wire code and `error.details` holds the server's details, so `error.code === "RPC_TIMEOUT"` and `error instanceof RPCTimeoutError` both work. That includes errors the client raises itself (its own deadline, a cancelled signal, a closed client), and `"RPC_TRANSPORT_ERROR"` for a network failure. The class codes such as `"ERR_RPC_TIMEOUT"` are never what a client error carries; before v1.4.0 timeouts, cancellations and unavailability came back with them, so code comparing `error.code` with `"RPC_TIMEOUT"` silently never matched.

```ts
import {
  RPCServer,
  RPCClient,
  createRPCProcedure,
  createRPCMemoryTransport,
  RPCForbiddenError,
} from "@zudojs/rpc";

const server = new RPCServer(undefined, undefined, {
  onInternalError(error, requestId) {
    console.error("internal failure", requestId, error);
  },
});

server.register(
  createRPCProcedure("admin.purge", async () => {
    throw new RPCForbiddenError("Admins only.");
  }),
);

const client = new RPCClient(createRPCMemoryTransport(server));

try {
  await client.call("admin.purge", {});
} catch (error) {
  if (error instanceof RPCForbiddenError) {
    console.log(error.code, "|", error.message);
  }
}
```

**What you should see:** `RPC_FORBIDDEN | Admins only.` The error object itself did not cross the boundary — only its code and message did — but the client rebuilt an `RPCForbiddenError` from that code, so the `instanceof` check passes. The same works over HTTP.

This one throws plain `@zudojs/errors` errors from the handler and branches on the code on the caller's side:

```ts
import { RPCServer, RPCClient, createRPCProcedure, createRPCMemoryTransport, RPCError } from "@zudojs/rpc";
import { NotFoundError, databaseQueryError } from "@zudojs/errors";

const server = new RPCServer();
server.register(
  createRPCProcedure("users.get", async (input: { id: string }) => {
    throw new NotFoundError(`User ${input.id} was not found.`);
  }),
);
server.register(
  createRPCProcedure("reports.run", async () => {
    throw databaseQueryError('relation "users" does not exist');
  }),
);

const client = new RPCClient(createRPCMemoryTransport(server));

for (const [name, input] of [["users.get", { id: "42" }], ["reports.run", {}]] as const) {
  try {
    await client.call(name, input);
  } catch (error) {
    if (error instanceof RPCError) console.log(error.code, "|", error.message);
  }
}
// RPC_NOT_FOUND | User 42 was not found.
// RPC_INTERNAL_ERROR | The server encountered an internal error while handling this request.
```

The `NotFoundError` is exposed, so its message travels. The `DatabaseError` is not, so the caller sees only the fixed sentence, and the SQL detail stays on the server, where `onInternalError` can log it.

## TIMEOUTS, RETRIES & CANCELLATION

Networks fail in ways local calls do not: a call can hang forever, or fail once and work on the next try. A **timeout** is a duration in milliseconds, and both sides have one. On the server it is the procedure's `timeout` option, falling back to 30 seconds. On the client it is `RPCCallOptions.timeout`, falling back to the client's default and then to 30 seconds.

A **deadline** is different: a wall-clock instant in epoch milliseconds, placed in `metadata.deadline`. It can only shorten a timeout, never extend it, and a deadline already in the past is rejected before any work runs.

`retry()` runs an operation again after a failure. `attempts` counts total tries, so `attempts: 3` means one call and up to two retries. **Jitter** — deliberate randomness in each wait — is on by default, because otherwise every client that failed at the same instant retries at the same instant and knocks the dependency over again.

```ts
import { retry, RPCUnavailableError } from "@zudojs/rpc";

let tries = 0;

const value = await retry(
  async () => {
    tries += 1;
    if (tries < 3) {
      throw new RPCUnavailableError("Service warming up.");
    }
    return "ready";
  },
  {
    attempts: 3,
    delay: 100,
    backoff: "exponential",
    maxDelay: 10_000,
    // Only retry failures a retry could plausibly fix.
    retryIf: (error) => error instanceof RPCUnavailableError,
    onRetry: (error, attempt, wait) => {
      console.log("retry", attempt, "in", wait, "ms");
    },
  },
);

console.log(value, tries);
// ready 3
```

**What you should see:** two `retry` lines with randomised waits, then `ready 3`.

To cancel a call yourself, pass a signal in `RPCCallOptions.signal`. An `AbortSignal` alone cannot be aborted — only its controller can — so `createCancellableSignal()` hands you both as `{ signal, cancel }`. Whatever reason the abort carries, the client always throws an `RPCCancelledError`, keeping the original as `cause`. The cancel reaches the server as well: the handler's `context.signal` aborts, so a cancelled or timed-out call stops the work on both sides.

The client's deadline timer and the `retry()` backoff timer keep the Node process alive while they wait, and are cleared the moment the call settles. So a plain script that awaits a call really does wait for its timeout. Before v1.4.0 those timers did not hold the process open, and a script whose only pending work was an unanswered call exited early with code 13 ("unsettled top-level await") instead of reporting `RPC_TIMEOUT`.

```ts
// hang.mjs
import { RPCClient, RPCTimeoutError } from "@zudojs/rpc";

// A transport that never answers, standing in for a server that hangs.
const client = new RPCClient({ send: () => new Promise(() => {}) }, { timeout: 200 });

try {
  await client.call("users.get", {});
} catch (error) {
  console.log(error instanceof RPCTimeoutError, error.code, "|", error.message);
}
```

```bash
$ node hang.mjs; echo "exit code $?"
true RPC_TIMEOUT | RPC operation timed out after 200ms.
exit code 0
```

The client raised this timeout itself, and its `code` is still the wire code `RPC_TIMEOUT`, the same one a server-side timeout arrives with.

> **Watch out:** a client allows 1024 calls in flight at once (`maxPending`). Past that, `call()` fails immediately with `RPCUnavailableError` rather than queueing without bound. `client.pendingCount` and `client.inspectPending()` show what is running.

## RPC vs API vs HTTP

Three Zudo packages run "something the caller asked for". They differ in where the caller is and what the wire looks like.

| Package | Caller is | You work with |
| --- | --- | --- |
| [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) | In the same process | Operations run by `APIExecutor`. Its bindings can also serve the same operations over HTTP, RPC, a queue or the CLI. |
| @zudojs/rpc | Another process or machine | Procedures, a request/response envelope, and a transport: in memory, HTTP, or your own. |
| [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) | Any HTTP client | Methods, paths, status codes, headers, CORS — the protocol itself. |

They stack rather than compete. A typical service mounts `createRPCFetchHandler(server)` on an `@zudojs/http` router with `mountFetchHandler(router, "/rpc", handle)`, and fills the server with `@zudojs/api` operations through that package's `registerApiRpcProcedures(server, registry, { executor })`, so one operation definition becomes a procedure without a hand-written wrapper.

> **In plain words:** define the work with `api`, use `rpc` when your own services call each other, and use `http` when the caller is a browser or a third party expecting REST.

## API REFERENCE

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| RPCServer | Validates a request, dispatches it, maps errors to wire codes. | `(registry?, middleware?, options?)`; `register`, `handle`, `getRegistry`. |
| RPCClient | Builds requests, sends them through a transport, unwraps results. | `(transport, options?)`; `call`, `close`, `inspectPending`, `pendingCount`. |
| RPCDispatcher | Runs one request: schemas, middleware, interceptors, timeout, deadline. | `(registry, middleware, options?)`. `RPCServer` builds one for you. |
| RPCProcedureRegistry | Name-to-procedure table with uniqueness enforced. | `register`, `get`, `has`, `require`, `list`, `describe`, `unregister`, `clear`. |
| RPCProcedureRouter | Groups procedures before you hand them to a registry. | Same methods; `register` chains, and `list()` returns procedures, not names. |
| RPCMiddlewareStack | Immutable ordered list of middleware. | `with(...)` returns a new stack; `size`, `execute`. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| createRPCProcedure | Builds a frozen procedure. | `(name, handler, options?)`; validates the name immediately. |
| createRPCRequest | Builds a request envelope. | Defaults `metadata` to `{}`, `timestamp` to now. |
| createRPCResponse createRPCErrorResponse | Build success and failure responses. | `(id, result \| errorPayload, metadata?)`. |
| createRPCMetadata createRPCContext | Build a frozen metadata object, and a context from a request plus a signal. | Both are conveniences; the dispatcher makes contexts for you. |
| createNoopRPCInterceptor | An interceptor that only calls `next()`. | Placeholder or default. |
| retry calculateRetryDelay | Re-run an operation after failure; compute one wait. | Jitter defaults to `"full"` in `retry`, `"none"` in the calculation. |
| createTimeout withTimeout runWithTimeout | Time-box a promise or an operation. | `createTimeout` returns `{ promise, cancel }` — always `cancel()`. `runWithTimeout` also hands the operation a signal. |
| createCancellableSignal cancelSignal combineSignals throwIfCancelled | Make, trigger, merge and check abort signals. | The first returns `{ signal, cancel }`; `combineSignals` returns `{ signal, dispose }` and you must `dispose()`. |
| getRemainingTime isDeadlineExceeded throwIfDeadlineExceeded readDeadline | Work with a `metadata.deadline`. | `readDeadline` returns `undefined` for a malformed value rather than treating it as expired. |
| assertValidProcedureName assertValidRequest measurePayloadBytes parseInput parseOutput toValidationIssues | The validation the server and dispatcher already run for you. | Call them directly only in a custom pipeline. |
| createRPCMemoryTransport | Client transport to a server in the same process. | `(server, { auth?, serializer? })`. Round-trips frames through JSON by default. |
| createRPCHttpTransport | Client transport that POSTs frames with `fetch`. | `({ url, headers?, fetch?, serializer?, maxResponseBytes? })`. |
| createRPCFetchHandler | Serves an `RPCServer` as `(request: Request) => Promise<Response>`. | `(server, { auth?, serializer?, maxBodyBytes?, onInternalError? })`. |
| createRPCJsonSerializer | The default frame serializer, size- and depth-limited. | `{ preserveTypes: true }` carries `Date`, `BigInt`, `Map`, `Set`. Use the same one on both ends. |
| rpcHttpStatus readBoundedBody isRPCResponseFrame | Building blocks of the HTTP transport. | Status for a response frame; read a body with a byte cap; check a decoded value is a response frame. |
| mapRPCError rpcErrorFromWire | Error to wire payload, and wire payload back to a typed error. | What the server and `RPCClient` use. Call them only in a custom transport. |
| isRPCError createRPCError | Type guard and factory for RPC errors. | Re-exported from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md). |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| RPCProcedure RPCHandler RPCProcedureOptions | A procedure and its handler. | Generic over input and output. |
| RPCRequest RPCResponse RPCErrorPayload RPCMetadata | The messages on the wire. | Check `success` before reading `result`. Each has an Options variant for its factory. |
| RPCContext | Per-call request, metadata, signal and state. | Second argument to every handler and middleware. |
| RPCContextOptions | Second argument of `server.handle(request, options)`. | `auth` (verified identity) and `signal` (the caller's; aborting it cancels the call with `RPC_CANCELLED`). |
| RPCTransport RPCMiddleware RPCInterceptor | The pieces you plug in. | Middleware is a function; a transport and an interceptor are objects. Use a built-in transport or implement `RPCTransport` yourself. |
| RPCMemoryTransportOptions RPCHttpTransportOptions RPCFetchHandlerOptions RPCFrameSerializer | Options for the built-in transports. | Memory: `auth`, `serializer` (`false` = by reference). HTTP client: `url`, `headers`, `fetch`, `serializer`, `maxResponseBytes`. Fetch handler: `auth`, `serializer`, `maxBodyBytes`, `onInternalError`. |
| RPCServerOptions RPCDispatcherOptions RPCClientOptions RPCCallOptions RPCRequestLimits | Everything you can configure. | Server: `limits`, `dispatch`, `onInternalError`. Limits: `maxPayloadBytes` (1 MB), `maxRequestIdLength` (128), `enforceProcedureNamePattern` (true), `allowUnsafeKeys` (false). Dispatch: `defaultTimeout`, `honourDeadline`, `interceptors`. Client and call: `timeout`, `maxPending`, `signal`, `metadata`. |
| RPCSchema RPCRetryOptions RPCBackoff RPCJitter CancellableSignal | Validation and reliability settings. | `RPCSchema` needs only `safeParse`. Backoff: fixed, linear, exponential. Jitter: none, full, equal. |

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| DEFAULT_RPC_TIMEOUT | 30000 | When neither procedure nor call sets one. |
| MAX_RPC_PAYLOAD_SIZE | 1048576 | 1 MB encoded, covering `payload` and `metadata` together; see `limits.maxPayloadBytes`. |
| MAX_RPC_REQUEST_ID_LENGTH | 128 | Characters in `request.id`, which every response echoes; see `limits.maxRequestIdLength`. |
| MAX_PENDING_REQUESTS | 1024 | Default client concurrency cap. |
| MAX_MIDDLEWARE | 32 | Per stack. |
| MAX_PROCEDURES | 4096 | Per registry. |
| MAX_PROCEDURE_NAME_LENGTH | 256 | Checked before the pattern, so a huge name cannot stall the regex. |
| DEFAULT_RPC_HTTP_MAX_BODY_BYTES | 1114112 | Largest body `createRPCFetchHandler` reads: `MAX_RPC_PAYLOAD_SIZE` plus 64 KiB for the envelope. |
| MAX_RPC_FRAME_DEPTH | 128 | Nesting depth the default serializer decodes. |
| RPC_HTTP_STATUS | Code → status map | The table in [Over HTTP](#http-transport). Unlisted codes are sent as 500. |
| MAX_TIMER_DELAY | 2147483647 | Retry delays, the client deadline and the HTTP transport's request timeout clamp to it, so a huge value cannot overflow into an instant retry or an instant timeout. |
| PROCEDURE_NAME_PATTERN | /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/ | At least two dot-separated segments. |
| INTERNAL_ERROR_MESSAGE | Fixed sentence | What a caller sees instead of an unexpected exception. |

### Errors

Sixteen classes are defined in [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) and re-exported here, so either import works: RPCError, RPCProcedureNotFoundError, RPCInvalidRequestError, RPCValidationError, RPCAuthenticationError, RPCForbiddenError, RPCTimeoutError, RPCCancelledError, RPCInternalError, RPCTransportError, RPCSerializationError, RPCDeserializationError, RPCUnavailableError, RPCRateLimitedError, RPCDeadlineExceededError and RPCDuplicateProcedureError. The type `RPCErrorOptions` comes with them.

Every `RPCError` has a readonly `details`, which you can also pass as an option: `new RPCError(message, { code, details })`. On the client it holds what the server sent. The server only ever sends two kinds of details: validation issues (`RPC_VALIDATION_ERROR`) and `{ retryAfter }` (`RPC_RATE_LIMITED`). Details you attach to your own `RPCError` on the server stay there, so they can never leak internal data to a caller.

> **Not implemented yet:** streaming. `RPCStreamingHandler`, `RPCStreamingProcedure` and `createRPCStreamingProcedure` exist, but a registry accepts only `RPCProcedure` and `RPCTransport.send` resolves a single response. A streaming procedure cannot be registered or called today.

## COMMON MISTAKES

- **Naming a procedure `"getUser"`.** It throws `RPCInvalidRequestError` the moment you create it, because the pattern needs at least two dot-separated segments. Use `"users.getUser"`.
- **Trusting the handler's input type.** Writing `(input: { id: string })` proves nothing at runtime, and your handler will happily run on `{ id: 42 }`. Give the procedure an `input` schema.
- **Reading `response.result` without checking `response.success`.** On a failure it is absent, so you get `undefined` instead of an error. Branch on `success`, or use `RPCClient`, which throws for you.
- **Running a server with no `onInternalError`.** Unexpected failures answer with a fixed sentence and are recorded nowhere else, so the bug is invisible. Pass the hook and log the error with its request id.
- **Retrying everything.** Replaying a forbidden or invalid call burns attempts and can duplicate side effects. Use `retryIf`, and check `idempotent` from `registry.describe()`.
- **Comparing `error.code` with `ErrorCode.RPC_TIMEOUT`.** That is the class code, `"ERR_RPC_TIMEOUT"`. A client error carries the wire code, so compare with `"RPC_TIMEOUT"`, or use `instanceof RPCTimeoutError`.
- **Ignoring `options.signal` in a custom transport.** The client still rejects on time, but the socket stays open. Pass the signal to `fetch` or your socket library. The built-in transports already do this.
- **Using different serializers on the two ends.** A server built with `createRPCJsonSerializer({ preserveTypes: true })` sends tagged values a plain-JSON client does not decode, so a `Date` arrives as something else. Pass the same serializer to `createRPCFetchHandler` and `createRPCHttpTransport`.

## RELATED PACKAGES

- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — define operations once; `registerApiRpcProcedures` serves them as procedures.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — host `createRPCFetchHandler` on a router with `mountFetchHandler`.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — builds the `input` and `output` schemas.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — where every RPC error class is defined.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — for work the caller should not wait on.

## COMPLETE EXPORT INDEX

Every name `@zudojs/rpc` exports from its package root at v1.4.3 — **114** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 114 exports**

Classes (22)

`RPCAuthenticationError` `RPCCancelledError` `RPCClient` `RPCDeadlineExceededError` `RPCDeserializationError` `RPCDispatcher` `RPCDuplicateProcedureError` `RPCError` `RPCForbiddenError` `RPCInternalError` `RPCInvalidRequestError` `RPCMiddlewareStack` `RPCProcedureNotFoundError` `RPCProcedureRegistry` `RPCProcedureRouter` `RPCRateLimitedError` `RPCSerializationError` `RPCServer` `RPCTimeoutError` `RPCTransportError` `RPCUnavailableError` `RPCValidationError`

Functions (38)

`assertValidProcedureName` `assertValidRequest` `calculateRetryDelay` `cancelSignal` `combineSignals` `createCancellableSignal` `createNoopRPCInterceptor` `createRPCContext` `createRPCError` `createRPCErrorResponse` `createRPCFetchHandler` `createRPCHttpTransport` `createRPCJsonSerializer` `createRPCMemoryTransport` `createRPCMetadata` `createRPCProcedure` `createRPCRequest` `createRPCResponse` `createRPCStreamingProcedure` `createTimeout` `getRemainingTime` `isDeadlineExceeded` `isRPCError` `isRPCResponseFrame` `mapRPCError` `measurePayloadBytes` `parseInput` `parseOutput` `readBoundedBody` `readDeadline` `retry` `rpcErrorFromWire` `rpcHttpStatus` `runWithTimeout` `throwIfCancelled` `throwIfDeadlineExceeded` `toValidationIssues` `withTimeout`

Interfaces (29)

`CancellableSignal` `RPCBodySource` `RPCCallOptions` `RPCClientOptions` `RPCContext` `RPCContextOptions` `RPCDispatcherOptions` `RPCErrorOptions` `RPCErrorPayload` `RPCFetchHandlerOptions` `RPCFrameHandler` `RPCHttpTransportOptions` `RPCInterceptor` `RPCJsonSerializerOptions` `RPCMappedError` `RPCMemoryTransportOptions` `RPCMetadata` `RPCMetadataOptions` `RPCProcedure` `RPCProcedureOptions` `RPCRequest` `RPCRequestLimits` `RPCRequestOptions` `RPCResponse` `RPCRetryOptions` `RPCServerOptions` `RPCStreamingProcedure` `RPCTransport` `RPCTransportRequestOptions`

Type aliases (11)

`RPCAuthContext` `RPCBackoff` `RPCBodyReadResult` `RPCFrameSerializer` `RPCHandler` `RPCHttpHeaders` `RPCJitter` `RPCMiddleware` `RPCProcedureName` `RPCSchema` `RPCStreamingHandler`

Constants (14)

`DEFAULT_RETRY_OPTIONS` `DEFAULT_RPC_HTTP_MAX_BODY_BYTES` `DEFAULT_RPC_TIMEOUT` `INTERNAL_ERROR_MESSAGE` `MAX_MIDDLEWARE` `MAX_PENDING_REQUESTS` `MAX_PROCEDURE_NAME_LENGTH` `MAX_PROCEDURES` `MAX_RPC_FRAME_DEPTH` `MAX_RPC_PAYLOAD_SIZE` `MAX_RPC_REQUEST_ID_LENGTH` `MAX_TIMER_DELAY` `PROCEDURE_NAME_PATTERN` `RPC_HTTP_STATUS`
