---
title: "@zudojs/rpc — Remote Procedure Call Documentation"
description: "Complete documentation for @zudojs/rpc — transport-agnostic RPC infrastructure with typed procedures, middleware, streaming, and reliability utilities."
source: https://zudojs.oyinlola.site/docs/packages-rpc
---

v1.1.0

# @zudojs/rpc

Call a function that runs on another machine as if it were local — typed procedures, a transport you choose, middleware, validation, timeouts, retries and errors that survive the trip.

RPC REMOTE PROCEDURE CLIENT SERVER

## OVERVIEW

A **remote procedure call** (RPC) is a function call that runs somewhere else. Your code writes `await client.call("users.getUser", { id: "123" })` and gets an answer back. The work happens in another process, on another machine, or behind a network connection.

Two things make that work. A **procedure** is the function on the far side: a name, a handler, and some options. A **transport** is the pipe that carries a request over and a response back.

This package gives you both halves plus everything in between — validation, middleware, timeouts, retries, typed errors. It never opens a socket itself. You supply the transport, so the same procedures can be served over HTTP today and a WebSocket tomorrow without touching a handler.

When you need it

- One service calls another service's functions.
- The same call must work over HTTP, a socket, or in tests.
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

It pulls in `@zudojs/errors`, `@zudojs/schema`, `@zudojs/constants` and `@zudojs/types` on its own. Install `@zudojs/schema` yourself only if you write schemas in your own code.

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> **Node 24+.** The client uses `node:crypto` for request ids, so it runs on a server, not in a browser.

## QUICK START

The smallest complete setup is a server holding one procedure, a transport, and a client. This transport hands the request straight to the server in the same process, which is how the package's own tests run.

```ts
import { RPCServer, RPCClient, createRPCProcedure } from "@zudojs/rpc";
import type { RPCTransport } from "@zudojs/rpc";

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

// 2. The pipe. A real one would send bytes over a network.
const transport: RPCTransport = {
  async send(request) {
    return server.handle(request);
  },
};

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

> **Tip:** swap step 2 for a transport that does a `fetch()` and nothing else changes.

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

A **transport** is an object with one required method: `send(request, options?)`. It takes an `RPCRequest`, gets it to the server however it likes, and resolves with the `RPCResponse` that comes back. An optional `close()` releases the connection.

The package ships no transport implementations, deliberately: writing one is a dozen lines, and it keeps the RPC layer free of any network dependency. This one posts each request as JSON.

```ts
import type {
  RPCTransport,
  RPCRequest,
  RPCResponse,
} from "@zudojs/rpc";

function createHttpTransport(url: string): RPCTransport {
  return {
    async send(request: RPCRequest, options): Promise<RPCResponse> {
      const httpResponse = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        // Honouring the signal is what frees the socket when
        // the caller cancels or the call times out.
        signal: options?.signal,
      });

      return (await httpResponse.json()) as RPCResponse;
    },
  };
}
```

**What you should see:** nothing yet — this only builds the pipe. Pass it to `new RPCClient(createHttpTransport("https://example.com/rpc"))` and every call goes over HTTP.

> **In plain words:** the client still protects itself if your transport ignores `options.signal` — it races the signal on its own. But the connection stays open until the transport lets it go.

## CONTEXT

Every handler gets two arguments: the parsed input, and a **context**. The context is the per-call scratchpad. It holds the original request, the **metadata** (small labelled values like `requestId`, `userId` or `traceId` that travel alongside the payload), an `AbortSignal`, and a key/value store.

The store is how middleware talks to a handler: middleware writes with `context.set()`, the handler reads with `context.get()`.

The signal is how a call is cancelled. Nothing forces a handler to stop, so check the signal wherever giving up makes sense.

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
  if (context.metadata.userId === undefined) {
    throw new RPCAuthenticationError("Sign in first.");
  }
  context.set("actor", context.metadata.userId);
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

Add `metadata: { userId: "u1" }` to the request and the same call prints `true undefined`. Order matters too: the first middleware in the array is the outermost, so it also sees calls the ones below it reject.

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

Before any of that, `server.handle()` checks the envelope — the request must be an object, `id` a non-empty string, `procedure` a valid name, `metadata` an object when present (it may be omitted), and the encoded payload no larger than 1 MB. Anything else is `RPC_INVALID_REQUEST`. Change the size cap with the server's `limits.maxPayloadBytes` option.

## ERRORS ACROSS THE BOUNDARY

A thrown error cannot travel over a network. Only data can. So the boundary works in three steps: your handler throws a typed error; the server turns it into a small JSON payload with a `code`, a `message` and sometimes `details`; the client reads the code and throws a matching error on your side.

The code is the contract. It is why a caller can tell a rejected session from a timeout without matching on message text.

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
| anything else | RPC_INTERNAL_ERROR |

> **Danger:** an unrecognised error never sends its own message. Exception text can name hosts, paths, credentials or queries, and the caller is a stranger. They get one fixed sentence plus the request id. The same applies to any `RPCError` thrown with `expose: false` — `RPCInternalError`, `RPCSerializationError`, or a plain `new RPCError(...)` — its `code` is sent but its message is replaced. Pass the server's `onInternalError` hook if you want the real error — that hook is the only place it is recorded.

On the caller's side, catch and branch on the type. `RPC_TIMEOUT`, `RPC_CANCELLED` and `RPC_UNAVAILABLE` become their matching classes; every other code becomes an `RPCError` carrying the server's code.

```ts
import {
  RPCServer,
  RPCClient,
  createRPCProcedure,
  isRPCError,
  RPCForbiddenError,
} from "@zudojs/rpc";
import type { RPCTransport } from "@zudojs/rpc";

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

const transport: RPCTransport = {
  async send(request) {
    return server.handle(request);
  },
};

try {
  await new RPCClient(transport).call("admin.purge", {});
} catch (error) {
  if (isRPCError(error)) {
    console.log(error.code, "|", error.message);
  }
}
```

**What you should see:** `RPC_FORBIDDEN | Admins only.` The `RPCForbiddenError` class does not survive the trip — the code does.

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

To cancel a call yourself, pass a signal in `RPCCallOptions.signal`. An `AbortSignal` alone cannot be aborted — only its controller can — so `createCancellableSignal()` hands you both as `{ signal, cancel }`. Whatever reason the abort carries, the client always throws an `RPCCancelledError`, keeping the original as `cause`.

> **Watch out:** a client allows 1024 calls in flight at once (`maxPending`). Past that, `call()` fails immediately with `RPCUnavailableError` rather than queueing without bound. `client.pendingCount` and `client.inspectPending()` show what is running.

## RPC vs API vs HTTP

Three Zudo packages run "something the caller asked for". They differ in where the caller is and what the wire looks like.

| Package | Caller is | You work with |
| --- | --- | --- |
| [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) | In the same process | Operations run by `APIExecutor`. No wire, transport or serialization. |
| @zudojs/rpc | Another process or machine | Procedures, a request/response envelope, and a transport you choose. |
| [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) | Any HTTP client | Methods, paths, status codes, headers, CORS — the protocol itself. |

They stack rather than compete. A typical service exposes one HTTP route with `@zudojs/http`, feeds the parsed body into `server.handle()` from this package, and lets the handler call in-process operations from `@zudojs/api`.

> **In plain words:** pick `api` when nothing leaves the process, `rpc` when your own services talk to each other, and `http` when the caller is a browser or a third party expecting REST.

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
| isRPCError createRPCError | Type guard and factory for RPC errors. | Re-exported from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md). |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| RPCProcedure RPCHandler RPCProcedureOptions | A procedure and its handler. | Generic over input and output. |
| RPCRequest RPCResponse RPCErrorPayload RPCMetadata | The messages on the wire. | Check `success` before reading `result`. Each has an Options variant for its factory. |
| RPCContext | Per-call request, metadata, signal and state. | Second argument to every handler and middleware. |
| RPCTransport RPCMiddleware RPCInterceptor | The pieces you implement yourself. | Middleware is a function; a transport and an interceptor are objects. |
| RPCServerOptions RPCDispatcherOptions RPCClientOptions RPCCallOptions RPCRequestLimits | Everything you can configure. | Server: `limits`, `dispatch`, `onInternalError`. Dispatch: `defaultTimeout`, `honourDeadline`, `interceptors`. Client and call: `timeout`, `maxPending`, `signal`, `metadata`. |
| RPCSchema RPCRetryOptions RPCBackoff RPCJitter CancellableSignal | Validation and reliability settings. | `RPCSchema` needs only `safeParse`. Backoff: fixed, linear, exponential. Jitter: none, full, equal. |

### Constants

| Name | Value | Notes |
| --- | --- | --- |
| DEFAULT_RPC_TIMEOUT | 30000 | When neither procedure nor call sets one. |
| MAX_RPC_PAYLOAD_SIZE | 1048576 | 1 MB encoded; see `limits.maxPayloadBytes`. |
| MAX_PENDING_REQUESTS | 1024 | Default client concurrency cap. |
| MAX_MIDDLEWARE | 32 | Per stack. |
| MAX_PROCEDURES | 4096 | Per registry. |
| MAX_PROCEDURE_NAME_LENGTH | 256 | Checked before the pattern, so a huge name cannot stall the regex. |
| MAX_TIMER_DELAY | 2147483647 | Retry delays clamp to it, so a big backoff cannot overflow into an instant retry. |
| PROCEDURE_NAME_PATTERN | /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/ | At least two dot-separated segments. |
| INTERNAL_ERROR_MESSAGE | Fixed sentence | What a caller sees instead of an unexpected exception. |

### Errors

Sixteen classes are defined in [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) and re-exported here, so either import works: RPCError, RPCProcedureNotFoundError, RPCInvalidRequestError, RPCValidationError, RPCAuthenticationError, RPCForbiddenError, RPCTimeoutError, RPCCancelledError, RPCInternalError, RPCTransportError, RPCSerializationError, RPCDeserializationError, RPCUnavailableError, RPCRateLimitedError, RPCDeadlineExceededError and RPCDuplicateProcedureError. The type `RPCErrorOptions` comes with them.

> **Not implemented yet:** streaming. `RPCStreamingHandler`, `RPCStreamingProcedure` and `createRPCStreamingProcedure` exist, but a registry accepts only `RPCProcedure` and `RPCTransport.send` resolves a single response. A streaming procedure cannot be registered or called today.

## COMMON MISTAKES

- **Naming a procedure `"getUser"`.** It throws `RPCInvalidRequestError` the moment you create it, because the pattern needs at least two dot-separated segments. Use `"users.getUser"`.
- **Trusting the handler's input type.** Writing `(input: { id: string })` proves nothing at runtime, and your handler will happily run on `{ id: 42 }`. Give the procedure an `input` schema.
- **Reading `response.result` without checking `response.success`.** On a failure it is absent, so you get `undefined` instead of an error. Branch on `success`, or use `RPCClient`, which throws for you.
- **Running a server with no `onInternalError`.** Unexpected failures answer with a fixed sentence and are recorded nowhere else, so the bug is invisible. Pass the hook and log the error with its request id.
- **Retrying everything.** Replaying a forbidden or invalid call burns attempts and can duplicate side effects. Use `retryIf`, and check `idempotent` from `registry.describe()`.
- **Ignoring `options.signal` in a custom transport.** The client still rejects on time, but the socket stays open. Pass the signal to `fetch` or your socket library.

## RELATED PACKAGES

- [@zudojs/api](https://zudojs.oyinlola.site/docs/packages-api.md) — the same shape for calls that never leave the process.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — the HTTP layer you put in front of an RPC server.
- [@zudojs/schema](https://zudojs.oyinlola.site/docs/packages-schema.md) — builds the `input` and `output` schemas.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — where every RPC error class is defined.
- [@zudojs/queue](https://zudojs.oyinlola.site/docs/packages-queue.md) — for work the caller should not wait on.

## COMPLETE EXPORT INDEX

Every name `@zudojs/rpc` exports from its package root at v1.1.0 — **89** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 89 exports**

Classes (22)

`RPCAuthenticationError` `RPCCancelledError` `RPCClient` `RPCDeadlineExceededError` `RPCDeserializationError` `RPCDispatcher` `RPCDuplicateProcedureError` `RPCError` `RPCForbiddenError` `RPCInternalError` `RPCInvalidRequestError` `RPCMiddlewareStack` `RPCProcedureNotFoundError` `RPCProcedureRegistry` `RPCProcedureRouter` `RPCRateLimitedError` `RPCSerializationError` `RPCServer` `RPCTimeoutError` `RPCTransportError` `RPCUnavailableError` `RPCValidationError`

Functions (29)

`assertValidProcedureName` `assertValidRequest` `calculateRetryDelay` `cancelSignal` `combineSignals` `createCancellableSignal` `createNoopRPCInterceptor` `createRPCContext` `createRPCError` `createRPCErrorResponse` `createRPCMetadata` `createRPCProcedure` `createRPCRequest` `createRPCResponse` `createRPCStreamingProcedure` `createTimeout` `getRemainingTime` `isDeadlineExceeded` `isRPCError` `measurePayloadBytes` `parseInput` `parseOutput` `readDeadline` `retry` `runWithTimeout` `throwIfCancelled` `throwIfDeadlineExceeded` `toValidationIssues` `withTimeout`

Interfaces (21)

`CancellableSignal` `RPCCallOptions` `RPCClientOptions` `RPCContext` `RPCDispatcherOptions` `RPCErrorOptions` `RPCErrorPayload` `RPCInterceptor` `RPCMetadata` `RPCMetadataOptions` `RPCProcedure` `RPCProcedureOptions` `RPCRequest` `RPCRequestLimits` `RPCRequestOptions` `RPCResponse` `RPCRetryOptions` `RPCServerOptions` `RPCStreamingProcedure` `RPCTransport` `RPCTransportRequestOptions`

Type aliases (7)

`RPCBackoff` `RPCHandler` `RPCJitter` `RPCMiddleware` `RPCProcedureName` `RPCSchema` `RPCStreamingHandler`

Constants (10)

`DEFAULT_RETRY_OPTIONS` `DEFAULT_RPC_TIMEOUT` `INTERNAL_ERROR_MESSAGE` `MAX_MIDDLEWARE` `MAX_PENDING_REQUESTS` `MAX_PROCEDURE_NAME_LENGTH` `MAX_PROCEDURES` `MAX_RPC_PAYLOAD_SIZE` `MAX_TIMER_DELAY` `PROCEDURE_NAME_PATTERN`
