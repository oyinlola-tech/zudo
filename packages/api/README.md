# @zudojs/api

Higher-level API layer — operation definitions, execution context, interceptors, a transport-agnostic executor, and bindings that expose one operation over HTTP, RPC, queues and the CLI. `@zudojs/http` mounts it; it never imports `@zudojs/http`.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-api](https://zudojs.oyinlola.site/docs/packages-api) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-api.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## When to use

Import this when you need:

- define an operation once and serve it over HTTP (`createApiFetchHandler`), RPC (`registerApiRpcProcedures`), a queue (`bindApiQueue`), and the CLI (`runApiCli`)
- apply the same interceptors (auth, logging, retry) regardless of transport
- typed `APIContext` flowing through every handler

## Installation

```bash
npm install @zudojs/api
```

## Public API

```typescript
import {
  // operations
  defineOperation,
  resolveOperationTimeout,
  APIOperationRegistry,
  // execution
  APIExecutor,
  createNoopInterceptor,
  normalizeAPIError,
  // context
  createAPIContext,
  createContextKey,
  normalizeRequestId,
  isValidRequestId,
  RequestIdContextKey,
  CorrelationIdContextKey,
  TenantIdContextKey,
  UserIdContextKey,
  StartTimeContextKey,
  // results
  apiSuccess,
  apiFailure,
  isApiSuccess,
  isApiFailure,
  // constants
  DEFAULT_OPERATION_TIMEOUT,
  MAX_OPERATION_TIMEOUT,
  MAX_INTERCEPTORS,
  MAX_VALIDATION_ISSUES,
  type APIContext,
  type APIContextKey,
  type APIExecutionContext,
  type APIExecutorOptions,
  type APIHandler,
  type APIInterceptor,
  type APIOperation,
  type APIOperationMetadata,
  type APIResult,
  type DefineOperationOptions,
  type APIErrorOptions,
} from "@zudojs/api";
```

The bindings add `createApiFetchHandler`, `describeApiRoutes`, `resolveApiRoute`, `registerApiRpcProcedures`, `createApiRpcProcedure`, `apiErrorToRPCError`, `bindApiQueue`, `createApiQueueProcessor`, `runApiCli`, `parseApiCliArgs`, `APICliExitCode`, `toApiWireResult`, `toApiWireError`, `TransportContextKey` and the types `APIOperationRoute`, `APIOperationHttpOptions`, `APIWireResult`, `APIWireError` and each binding's options — see [Bindings](#bindings-one-operation-many-transports).

Every API error class from `@zudojs/errors` (`APIError`, `APIValidationError`, `APIInternalError`, `APIOperationNotFoundError`, …) plus `createAPIError`, `isAPIError` and `ErrorCode` are re-exported for convenience.

## Usage

```typescript
import {
  APIExecutor,
  APIOperationRegistry,
  createAPIContext,
  defineOperation,
  normalizeRequestId,
} from "@zudojs/api";

// 1. Define the operation. The handler is positional: (input, context).
const getUser = defineOperation<{ id: string }, { id: string; name: string }>({
  name: "users.get",
  input: GetUserSchema, // @zudojs/schema, or any Standard Schema (Zod, Valibot, …)
  output: UserSchema, // validated too — see "Output validation"
  timeout: 5_000,
  metadata: { tags: ["Users"] },
  handler: async (input, context) => db.findUser(input.id, context.signal),
});

// 2. Register it.
const registry = new APIOperationRegistry();
registry.register(getUser);
registry.freeze();

// 3. Execute it. The registry looks operations up; the executor runs them.
const executor = new APIExecutor();
const context = createAPIContext(
  normalizeRequestId(request.headers["x-request-id"]),
  { locale: "en" },
);

const result = await executor.execute(
  registry.require("users.get"), // throws APIOperationNotFoundError (404)
  { id: "u_1" },
  context,
);

if (result.ok) {
  respond(200, result.data);
} else {
  respond(result.error.statusCode, {
    message: result.error.expose ? result.error.message : "Internal error",
  });
}
```

Results are frozen `{ ok: true, data }` / `{ ok: false, error }` objects — `execute` never throws for an operation failure.

## Bindings: one operation, many transports

Every binding runs calls through an `APIExecutor` you pass as `executor` (so its interceptors apply everywhere), validates input with the operation's schema (after the interceptors), sets `TransportContextKey` (`"http" | "rpc" | "queue" | "cli"`) on the context, and reports each non-exposed failure to `onInternalError(error, requestId)`. The `state` option builds `context.state` from what the transport hands over (the `Request`, the `RPCContext`, the `Job`, the CLI invocation); throw an `APIError` there, such as `APIAuthenticationError`, to refuse the call.

Failures take one client-safe shape everywhere, `APIWireError`: `{ code, message, statusCode, requestId, issues? }`. `message` is the error's own only when it is `expose: true`, otherwise `"An internal error occurred."`. Stack traces, causes and metadata never leave the process.

```typescript
import { schema } from "@zudojs/schema";
import { APIExecutor, APIOperationRegistry, defineOperation } from "@zudojs/api";

const getUser = defineOperation({
  name: "users.get",
  input: schema.object({ id: schema.string() }),
  metadata: { http: { method: "GET", path: "/users/:id" } }, // default: POST /users.get
  handler: async (input) => db.findUser(input.id),
});

const registry = new APIOperationRegistry();
registry.register(getUser);
registry.freeze();
const executor = new APIExecutor({ interceptors: [logging] });
```

### HTTP: a web-standard fetch handler

```typescript
import { createApiFetchHandler } from "@zudojs/api";

const handle = createApiFetchHandler(registry, {
  executor,
  basePath: "/api",
  state: (request) => ({ user: verify(request.headers.get("authorization")) }),
});

// Any Fetch API server: @zudojs/http, Bun.serve, Deno.serve, an edge runtime.
const response = await handle(new Request("https://app.test/api/users/u1"));
// 200 { "ok": true, "data": { ... } }
```

On `@zudojs/http`, mount it with no glue code. `mountFetchHandler` strips the mount prefix by default, so leave `basePath` unset:

```typescript
import { mountFetchHandler } from "@zudojs/http";

mountFetchHandler(router, "/api", createApiFetchHandler(registry, { executor }));
```

`GET` and `DELETE` routes read input from the query string (values are strings, so use coercing schemas); `POST`, `PUT` and `PATCH` read a JSON body (at most `maxBodyBytes`, 1 MiB by default). Path parameters are merged over either and win. A `__proto__`, `constructor` or `prototype` key anywhere in the query or body is refused with 400, and a body route answers 415 to any declared content type other than JSON, even with an empty body, so a cross-site HTML form cannot trigger it. Every binding (RPC, queue, CLI) refuses such keys in its input too, with a validation error. Errors use their status: 422 validation, 404 unknown route, 405 wrong method (with `Allow`), 413/415/400 for a bad body, 500 internal. The request id comes from a safe `x-request-id` header and is echoed back; the call runs under `request.signal`.

### Route contract for `@zudojs/http` and OpenAPI

`describeApiRoutes(operations, { basePath })` returns one frozen `APIOperationRoute` per operation and throws on invalid or conflicting routes:

```typescript
interface APIOperationRoute {
  readonly operationId: string; // operation name
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string; // "/api/users/:id"
  readonly pathParams: readonly string[]; // ["id"]
  readonly inputSource: "query" | "body";
  readonly input?: unknown; // the operation's input schema
  readonly output?: unknown; // the operation's output schema
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly version?: string;
  readonly successStatus: 200;
}
```

### OpenAPI

`toOpenAPIRouteDescriptors(operations, { basePath })` turns the same routes into `@zudojs/openapi` descriptors, so one call documents what the fetch handler serves:

```typescript
import { createOpenAPIDocumentFromRoutes } from "@zudojs/openapi";
import { toOpenAPIRouteDescriptors } from "@zudojs/api";

const document = createOpenAPIDocumentFromRoutes(
  toOpenAPIRouteDescriptors(registry, { basePath: "/api" }),
  { info: { title: "Users", version: "1.0.0" } },
);
```

Each descriptor carries `operationId`, method, path, description, tags and `deprecated`. The input schema becomes `query` (`GET` / `DELETE`) or `body`, with path-bound fields moved to `params`. `responses` documents 200 with the `{ ok: true, data }` envelope around the output schema, and 422, 404, 409, 500 and 504 with the `{ ok: false, error }` body. Only `@zudojs/schema` schemas are converted; with another schema library, input stays undocumented and `data` is `unknown`.

### RPC

```typescript
import { RPCClient, RPCServer, createRPCMemoryTransport } from "@zudojs/rpc";
import { registerApiRpcProcedures } from "@zudojs/api";

const server = new RPCServer();
registerApiRpcProcedures(server, registry, {
  executor,
  state: (rpc) => ({ user: rpc.auth?.userId }), // transport-verified, never frame metadata
});

const client = new RPCClient(createRPCMemoryTransport(server));
await client.call("users.get", { id: "u1" });
```

Procedure names default to the operation name, which must then be a valid RPC name (`"users.get"`); pass `procedureName` to map others. API errors become their RPC equivalents (`RPC_VALIDATION_ERROR` with issues, `RPC_UNAUTHENTICATED`, `RPC_FORBIDDEN`, `RPC_RATE_LIMITED`, `RPC_TIMEOUT`, …); any other keeps its code, such as `ERR_API_CONFLICT`. Serve the same server over HTTP with `createRPCFetchHandler(server)`, for example `mountFetchHandler(router, "/rpc", createRPCFetchHandler(server))` on `@zudojs/http`.

### Queues

```typescript
import { createInMemoryQueue, createQueueName } from "@zudojs/queue";
import { bindApiQueue } from "@zudojs/api";

const queue = createInMemoryQueue(createQueueName("operations"));
bindApiQueue(queue, registry, { executor });

await queue.add("users.get", { id: "u1" }, { attempts: 1 });
```

The job name is the operation name and `job.data` is the input. Success completes the job with the output. A failure throws an `APIError` carrying the client-safe message, so the queue retries and dead-letters it as usual. Validation failures are retried too, so enqueue unchecked input with `attempts: 1`.

### CLI

```typescript
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
app users.get --id u1                      # prints the output as JSON, exit 0
app users.create --json '{"name":"Ann"}' --address.city Paris --admin
app --help                                 # lists operations
```

The operation name comes first (or pass `operation` for a single-purpose binary). `--field value` and `--field=value` set fields; kebab-case becomes camelCase, dots nest, repeats collect arrays, `--flag` is `true` and `--no-flag` is `false`. JSON-looking values (numbers, `true`, `false`, `null`, `{…}`, `[…]`) are parsed; anything else stays a string. On failure the `{ ok: false, error }` body goes to stderr and the exit code follows `APICliExitCode`: 64 usage, 65 invalid input, 69 unavailable, 70 internal, 75 timeout, 77 permission, 130 cancelled, 1 otherwise.

## Input validation

The executor accepts two kinds of schema for `input` and `output`, recognised structurally so the package depends on no validation library:

- a `@zudojs/schema` schema, or any other schema with a `safeParse` method returning `{ success, data }` / `{ success: false, issues }` (Zod-style `error.issues` also works);
- a [Standard Schema](https://standardschema.dev) (`"~standard".validate`): Zod, Valibot, ArkType, ….

Anything else fails closed. `defineOperation` and `APIOperationRegistry.register` throw a `TypeError` when `input` or `output` is set to a value that is neither, and the executor answers a hand-rolled operation carrying one with an `APIInternalError` (500) without running the handler. A schema is never silently skipped. `isAPISchema(value)` reports whether a value would be accepted.

```typescript
import { schema } from "@zudojs/schema";

const charge = defineOperation({
  name: "payments.charge",
  input: schema.object({
    id: schema.string().uuid(),
    amount: schema.number().min(1),
  }),
  output: schema.object({ ok: schema.boolean() }), // strips unknown keys
  handler: async (input) => ({ ok: true }),
});
```

The executor validates the input immediately before the handler runs, after every interceptor, and passes the schema's _transformed_ value to the handler. Failures return an `APIValidationError` (422). Because the interceptors run first, an authentication interceptor refuses an anonymous call with its own error (401) before the input is inspected, so a 422 describing the schema never reaches an unauthenticated caller; logging, metrics and rate-limit interceptors see invalid calls (`context.result` is the 422); and an interceptor that replaces `context.input` cannot bypass the schema, since the replacement is what gets validated.

Without type arguments, `defineOperation` infers the handler's `input` from the `input` schema: a Standard Schema's declared output type, or the `data` of a `safeParse` schema's success result. That works inline too, as in `registry.register(defineOperation({ input: TodoInput, handler: async (input) => input.title }))` or an operation list passed to a binding. Explicit type arguments (`defineOperation<TInput, TOutput>(...)`) are still honoured as given. `InferAPISchemaOutput<typeof schema>` names the inferred type.

Schema issue messages routinely interpolate the value that failed, so by default the executor does **not** copy them into the client-facing error: each issue becomes `"<path>: invalid"` (e.g. `"user.email: invalid"`), naming where validation failed without echoing what was submitted. The list is capped at `MAX_VALIDATION_ISSUES` entries with a trailing `"… and N more issue(s) omitted."` marker.

```typescript
// Opt in to raw messages only when every schema in the process is known
// to produce value-free messages.
new APIExecutor({ exposeValidationMessages: true, maxValidationIssues: 10 });
```

## Output validation

When `operation.output` is set, the handler's return value is validated too, and the validated (possibly stripped or transformed) value becomes `result.data`. A mismatch is a server bug, so it fails with an `APIInternalError` (500, `expose: false`) naming only the failing paths.

## Timeouts

Every operation has a deadline. `timeout` must be a positive, finite integer of at most `MAX_OPERATION_TIMEOUT` milliseconds; `defineOperation` rejects `0`, negatives, `NaN` and non-integers rather than silently running unbounded. Precedence is `timeout` → `metadata.timeout` → `DEFAULT_OPERATION_TIMEOUT`, resolved by `resolveOperationTimeout`.

The handler always receives a `context.signal`, even when the caller supplied none. It aborts when the deadline elapses (its `reason` is the `APITimeoutError` the call fails with, 504) or when the caller's signal aborts (its `reason` is the `ErrorCode.OPERATION_CANCELLED` error the call fails with), so pass it into anything that supports it (`fetch`, a driver query, a loop check) and the work stops instead of running on and repeating side effects after the caller has given up. The signal is not aborted when the handler completes normally. Everything else on the handler's context (`requestId`, `state`, `get`/`set`, `metadata`) is the caller's context. Branch on `ErrorCode.OPERATION_CANCELLED` rather than on the (nginx-convention) 499 status.

```typescript
const exportReport = defineOperation({
  name: "reports.export",
  timeout: 10_000,
  handler: async (input, context) => {
    const rows = await fetch(reportUrl, { signal: context.signal }); // stops at the deadline
    return rows.json();
  },
});
```

## Interceptors

```typescript
const timing: APIInterceptor = {
  async intercept(context, next) {
    context.input = sanitize(context.input); // validated, then reaches the handler
    const started = Date.now();
    const result = await next();
    // context.result === result, including when a downstream interceptor
    // short-circuits without calling next().
    log(context.operation.name, Date.now() - started, result.ok);
    return result;
  },
};

new APIExecutor([timing]); // or new APIExecutor({ interceptors: [timing] })
```

At most `MAX_INTERCEPTORS` interceptors per executor, and each `next()` may be awaited once. Interceptors run outermost first and wrap input validation: `context.input` is the input as the caller sent it (not yet validated or transformed), and whatever an interceptor leaves there is validated before the handler sees it.

## Context

`APIContext` carries the request id, an optional `AbortSignal`, caller state, and typed key/value slots. Keys carry their own identity, so two keys created with the same name never collide:

```typescript
const FeatureFlagsKey = createContextKey<readonly string[]>("featureFlags");

context.set(FeatureFlagsKey, ["beta"]);
context.get(FeatureFlagsKey); // readonly string[] | undefined
context.metadata; // read-only snapshot keyed by key name
```

`createAPIContext` requires a safe request id (non-empty, ≤128 chars, `[A-Za-z0-9._:-]`) and throws otherwise. Run client-supplied header values through `normalizeRequestId` first — it replaces anything unsafe with a generated UUID, so a request id can never inject a log line or split a response header. `requestId` cannot be reassigned through `RequestIdContextKey`.

## Errors

`normalizeAPIError(error, operationName?)` converts anything thrown into an `APIError`. Non-API errors become an `APIInternalError` with a generic message and the original on `cause`, so `result.error.message` never carries a driver or library message.

`cause` is there for logging, and `BaseError.toJSON()` (the logging form, also used by `JSON.stringify`) serializes it — message and stack included — regardless of `expose`. Do not hand `result.error` to `res.json()` as-is: pick the fields a client may see (`code`, `statusCode`, and `message` only when `expose` is true), or run it through `ErrorSerializer` from `@zudojs/errors`.

Handlers are expected to return a promise, but a hand-rolled operation whose handler returns synchronously is executed the same way.

## License

MIT
