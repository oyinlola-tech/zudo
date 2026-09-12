# @zudojs/api

Higher-level API layer — operation definitions, execution context, interceptors, and a transport-agnostic executor. Sits above `@zudojs/http` and `@zudojs/cqrs`.

## When to use

Import this when you need:

- define an operation once and call it from HTTP, RPC, queue, or CLI
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
  input: GetUserSchema, // any Standard Schema (Zod, Valibot, ArkType, …)
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

## Input validation

When `operation.input` is a Standard Schema, the executor validates the input before the handler runs and passes the schema's *transformed* value to the handler. Failures return an `APIValidationError` (422).

Schema issue messages routinely interpolate the value that failed, so by default the executor does **not** copy them into the client-facing error: each issue becomes `"<path>: invalid"` (e.g. `"user.email: invalid"`), naming where validation failed without echoing what was submitted. The list is capped at `MAX_VALIDATION_ISSUES` entries with a trailing `"… and N more issue(s) omitted."` marker.

```typescript
// Opt in to raw messages only when every schema in the process is known
// to produce value-free messages.
new APIExecutor({ exposeValidationMessages: true, maxValidationIssues: 10 });
```

## Output validation

When `operation.output` is a Standard Schema, the handler's return value is validated too, and the validated (possibly stripped or transformed) value becomes `result.data`. A mismatch is a server bug, so it fails with an `APIInternalError` (500, `expose: false`) naming only the failing paths.

## Timeouts

Every operation has a deadline. `timeout` must be a positive, finite integer of at most `MAX_OPERATION_TIMEOUT` milliseconds; `defineOperation` rejects `0`, negatives, `NaN` and non-integers rather than silently running unbounded. Precedence is `timeout` → `metadata.timeout` → `DEFAULT_OPERATION_TIMEOUT`, resolved by `resolveOperationTimeout`.

The handler itself is not cancellable — pass `context.signal` into anything that supports it. An execution cancelled through the signal fails with `ErrorCode.OPERATION_CANCELLED`; branch on that code rather than on the (nginx-convention) 499 status.

## Interceptors

```typescript
const timing: APIInterceptor = {
  async intercept(context, next) {
    context.input = sanitize(context.input); // reaches the handler
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

At most `MAX_INTERCEPTORS` interceptors per executor, and each `next()` may be awaited once.

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
