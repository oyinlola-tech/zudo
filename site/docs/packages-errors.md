---
title: "@zudojs/errors — Shared Error Hierarchy Documentation"
description: "Complete documentation for @zudojs/errors — shared error base class, error codes, error categories, and error handling utilities for the ZudoLib framework."
source: https://zudojs.oyinlola.site/docs/packages-errors
---

v1.0.1

# @zudojs/errors

One error class, `BaseError`, that every Zudo error extends, plus ready-made errors for the usual cases and helpers that turn any thrown value into a safe API response.

ERROR HIERARCHY LEAF PACKAGE ZERO DEPENDENCIES

## OVERVIEW

When something goes wrong in JavaScript you `throw` a value, usually an `Error`. A plain `Error` only carries a message and a stack trace. It cannot tell you whether the problem was the caller's fault or the server's, which HTTP status to send back, or whether the message is safe to show to a stranger.

`@zudojs/errors` fixes that with `BaseError`. Every error built on it carries a stable `code`, a `category`, a `severity`, an HTTP `statusCode`, an `expose` flag, and a bag of `metadata`. Every other Zudo package throws these, so one `catch` block can handle all of them the same way.

The package also ships helpers that convert *anything* that was thrown (a string, a `TypeError`, `undefined`) into a `BaseError`, and serializers that produce a client-safe JSON body from it.

When you need it

- You build an HTTP or RPC API and need consistent error responses.
- You want one place to decide which error messages reach users.
- You write a Zudo package or plugin and must throw the same errors the framework throws.

When you don't

- A throw-away script where `throw new Error("...")` is enough.
- You already use another framework's error hierarchy end to end.

## INSTALLATION

The package has no dependencies, so this is the only install step.

```bash
$ npm install @zudojs/errors
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest `@zudojs` release.

## QUICK START

This example throws a ready-made error, catches it, and turns it into a JSON body you could send back from an API.

```ts
import { NotFoundError, serializePublicError } from "@zudojs/errors";

function findUser(id: number) {
  // Pretend the database returned nothing.
  throw new NotFoundError(`User ${id} was not found.`, {
    metadata: { userId: id },
  });
}

try {
  findUser(42);
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log(error.statusCode);               // 404
    console.log(String(error));
    // NotFoundError [ERR_RESOURCE_NOT_FOUND]: User 42 was not found.

    console.log(serializePublicError(error));
    // {
    //   code: "ERR_RESOURCE_NOT_FOUND",
    //   message: "User 42 was not found.",
    //   category: "resource",
    //   statusCode: 404,
    //   metadata: { userId: 42 }
    // }
  }
}
```

You never told the error which status code to use. `NotFoundError` already knows it is a 404, that it is safe to show to clients, and that it belongs to the `resource` category. That is the whole idea: the error carries its own handling rules.

## BASEERROR

An *error class* is a blueprint for error objects. `new BaseError("...")` makes an object that behaves like a normal `Error` (it has `message`, `stack`, and works with `throw` and `instanceof`) but with extra fields attached.

The constructor takes a message and an optional options object. Every option has a default, so the shortest call is just the message.

```ts
import { BaseError, ErrorCode, ErrorCategory, ErrorSeverity } from "@zudojs/errors";

const error = new BaseError("Could not export the report.", {
  code: ErrorCode.OPERATION_FAILED,   // default: ErrorCode.UNKNOWN
  category: ErrorCategory.OPERATION,  // default: ErrorCategory.UNKNOWN
  severity: ErrorSeverity.WARNING,    // default: ErrorSeverity.ERROR
  statusCode: 422,                    // default: 500
  metadata: { reportId: "rpt_9" },   // default: {}
});

console.log(error.expose);        // true  (derived: statusCode < 500)
console.log(error.isOperational); // true  (default)
console.log(error.name);          // "BaseError"
```

### The fields, and what they mean for an API

| Field | What it is | Why it matters |
| --- | --- | --- |
| `message` | Human-readable text. | Shown to clients only when `expose` is true. |
| `code` | A stable string such as `"ERR_NOT_FOUND"`. | Clients and logs match on this, not on the message, so you can reword messages freely. |
| `statusCode` | The HTTP status to answer with (100–599). | 4xx means "the caller did something wrong"; 5xx means "we broke". Anything outside 100–599 throws a `RangeError`. |
| `expose` | `true` if the message is safe to send to an untrusted client. | Defaults to `statusCode < 500`. A 500's message often leaks internals ("connection to db.internal refused"), so it is hidden by default. |
| `category` | Which area failed: `validation`, `database`, `network`, and so on. | Useful for dashboards and for routing errors to the right team. |
| `severity` | How loud to be: `info`, `warning`, `error`, `critical`, `fatal`. | Drives log levels and alerting. |
| `isOperational` | `true` for expected failures (bad input, missing row); `false` for bugs. | A non-operational error usually means a programmer mistake, not a user mistake. |
| `metadata` | A frozen, JSON-safe object of extra facts. | See [Metadata](#metadata). |
| `cause` | The original error that led to this one, if any. | Keeps the full chain for logs. |

> **In plain words:** `statusCode` tells the HTTP layer what number to send. `expose` tells it whether to send your message or a generic "An unexpected error occurred." Together they let you write honest internal messages without leaking them.

### Useful methods

Every `BaseError` has these methods. `withMetadata` returns a *copy*; it never changes the original.

```ts
import { BaseError } from "@zudojs/errors";

const error = new BaseError("Export failed.", { statusCode: 422, metadata: { reportId: "rpt_9" } });

const withRequest = error.withMetadata({ requestId: "req_1" });
console.log(withRequest.getMetadata("requestId")); // "req_1"
console.log(error.getMetadata("requestId"));       // undefined (original untouched)

console.log(error.isPublic());          // true  (same as error.expose)
console.log(error.isOperationalError()); // true
console.log(error.toString());          // "BaseError [ERR_UNKNOWN]: Export failed."
```

> **Common mistake:** passing `statusCode: 0` or `200.5`. The constructor throws a `RangeError` for anything that is not an integer between 100 and 599, so the mistake surfaces where the error is *created*, not where it is handled.

## CODES, CATEGORIES AND SEVERITY

These three enums are the vocabulary the whole framework shares. An *enum* is a fixed list of named string values; using `ErrorCode.NOT_FOUND` instead of typing `"ERR_NOT_FOUND"` means a typo becomes a compile error.

- **ErrorCode** — the machine-readable identity of the error. Values look like `"ERR_VALIDATION_FAILED"`. You may also pass any custom string as a `code`.
- **ErrorCategory** — the area that failed. Values look like `"validation"`, `"database"`, `"rate_limit"`.
- **ErrorSeverity** — `INFO`, `WARNING`, `ERROR`, `CRITICAL`, `FATAL`, in increasing order.

Helper functions let you compare and validate these values. This example checks a severity and decides whether to page someone.

```ts
import {
  ErrorSeverity,
  compareErrorSeverity,
  isAlertableSeverity,
  isErrorCategory,
  normalizeErrorSeverity,
} from "@zudojs/errors";

console.log(compareErrorSeverity(ErrorSeverity.FATAL, ErrorSeverity.WARNING)); // 30 (positive = more severe)
console.log(isAlertableSeverity(ErrorSeverity.CRITICAL));  // true  (only CRITICAL and FATAL)
console.log(isErrorCategory("database"));                  // true
console.log(normalizeErrorSeverity("loud"));                // "error" (unknown values fall back)
```

> **Tip:** match on `error.code` in tests and clients, never on `error.message`. Messages are for humans and will change.

## READY-MADE ERRORS

You rarely construct `BaseError` directly. The package ships subclasses whose code, category, severity, status and `expose` flag are already set. Each one comes with a class, a `create…` factory, an `is…` type guard, and a few named shortcuts.

This example uses the five you will reach for most in an API.

```ts
import {
  ValidationError, requiredFieldIssue, invalidFieldIssue,
  NotFoundError, resourceNotFoundError,
  ConflictError, alreadyExistsError,
  AuthenticationError, invalidCredentialsError,
  AuthorizationError, permissionDeniedError,
  RateLimitError, retryAfterError,
} from "@zudojs/errors";

// 400 — the caller sent bad data. `issues` lists each problem.
const invalid = new ValidationError("Validation failed.", {
  issues: [requiredFieldIssue("email"), invalidFieldIssue("age", "age must be positive", -1)],
});
console.log(invalid.statusCode, invalid.issueCount);        // 400 2
console.log(invalid.issuesForField("email")[0].code);       // "ERR_MISSING_FIELD"

// 404 — the thing does not exist.
const missing = resourceNotFoundError("User", 42);
console.log(missing.message);                             // 'User with identifier "42" was not found.'

// 409 — the thing already exists.
const taken = alreadyExistsError("User", "ann@example.com");
console.log(taken.code);                                  // "ERR_ALREADY_EXISTS"

// 401 — we do not know who you are. 403 — we know, and the answer is no.
const whoAreYou = invalidCredentialsError();
const notAllowed = permissionDeniedError("orders:delete");
console.log(whoAreYou.statusCode, notAllowed.statusCode); // 401 403

// 429 — slow down. retryAfterSeconds is copied into metadata and toJSON().
const slowDown = retryAfterError(30);
console.log(slowDown.getRetryAfterSeconds());            // 30
```

> **In plain words:** 401 (`AuthenticationError`) means "log in first". 403 (`AuthorizationError`) means "you are logged in but not allowed". People mix these up constantly.

### The full set

Every family below is exported from the package root. The status and exposure listed are the defaults; you can override either through options.

| Class | Default status | Exposed? | Shortcuts |
| --- | --- | --- | --- |
| `ValidationError` | 400 | yes | `createValidationIssue`, `requiredFieldIssue`, `invalidFieldIssue` |
| `AuthenticationError` | 401 | yes | `invalidCredentialsError`, `sessionExpiredError`, `invalidTokenError`, `expiredTokenError` |
| `AuthorizationError` | 403 | yes | `accessDeniedError`, `permissionDeniedError`, `resourceAccessDeniedError` |
| `NotFoundError` | 404 | yes | `resourceNotFoundError`, `entityNotFoundError`, `routeNotFoundError` |
| `ConflictError` | 409 | yes | `alreadyExistsError`, `duplicateError`, `resourceLockedError` (423) |
| `RateLimitError` | 429 | yes | `retryAfterError`, `createRateLimitError(seconds)` |
| `DomainError` | 422 | yes | `invalidDomainState` (412), `unsupportedDomainOperation` |
| `ApplicationError` | 500 | no | `createApplicationError` |
| `ConfigurationError` | 500 | no | `missingConfigurationError`, `invalidConfigurationError` |
| `HttpError` | you pass it | 4xx yes, 5xx no | `createHttpError(message, statusCode)`, plus one class per status (`BadRequestError`, `UnauthorizedError`, `PayloadTooLargeError`, …) |
| `DatabaseError` | 500 | no | `databaseConnectionError`, `databaseQueryError`, `databaseTransactionError` |
| `TimeoutError` | varies | request timeouts only | `requestTimeoutError`, `databaseTimeoutError`, `serviceTimeoutError`, `lockTimeoutError` |
| `ExternalServiceError` | 502 (429 passes through) | no | `service`, `responseStatus` options |
| Subsystem families | mostly 500/503 | no | `CacheError`, `StorageError`, `NetworkError`, `ContainerError`, `AdapterError`, `MiddlewareError`, `EventError`, `MessageError`, `QueueError`, `SchedulerError`, `PluginError`, `RPCError`, `APIError`, `SchemaError`, `SerializationError`, `LifecycleError`, `ModuleError`, `RuntimeError`, `SystemError`, `CryptoError`, `LoggingError` |

The subsystem families are thrown by the matching Zudo package (`@zudojs/cache` throws `CacheError`, and so on). You catch them; you rarely construct them yourself.

## WRITING YOUR OWN ERROR

When none of the ready-made classes fits, extend `BaseError`. *Extending* means your class inherits everything `BaseError` has and adds its own defaults. Set the classification once in the constructor so every caller gets it for free.

This example defines a 402 error for a declined payment and shows what a client would receive.

```ts
import { BaseError, ErrorCategory, ErrorSeverity, serializePublicError } from "@zudojs/errors";

class PaymentDeclinedError extends BaseError {
  constructor(reason: string) {
    super(`Payment declined: ${reason}`, {
      code: "ERR_PAYMENT_DECLINED",        // custom codes are allowed
      category: ErrorCategory.BUSINESS,
      severity: ErrorSeverity.WARNING,
      statusCode: 402,
      metadata: { reason },
    });
  }
}

const error = new PaymentDeclinedError("insufficient funds");
console.log(error.name);   // "PaymentDeclinedError" (set automatically)
console.log(error.expose); // true (402 < 500)
console.log(serializePublicError(error));
// { code: "ERR_PAYMENT_DECLINED", message: "Payment declined: insufficient funds",
//   category: "business", statusCode: 402, metadata: { reason: "insufficient funds" } }
```

> **Watch out:** do not forget to call `super(...)` first, and do not assign to `this.code` or `this.statusCode` afterwards. They are read-only; pass them through the options object instead.

## METADATA

`metadata` is where you attach facts about the failure: which user, which record, which query. It must be JSON-safe (strings, numbers, booleans, null, arrays, plain objects). The constructor deep-copies and freezes it, so later changes to your original object do not leak in, and nobody can mutate it afterwards.

Some values are converted rather than rejected: `Date` becomes an ISO string, `Map` becomes an object, `bigint` becomes a string, and cyclic references become `"[Circular]"`. Keys named `__proto__`, `constructor` or `prototype` are always dropped.

Secrets are the bigger concern. The serializers redact any key whose name looks sensitive (`password`, `token`, `authorization`, `cookie`, `apiKey`, `ssn`, and similar) at every depth. You can run the same redaction yourself.

```ts
import { redactErrorMetadata, isSensitiveMetadataKey } from "@zudojs/errors";

const safe = redactErrorMetadata({
  userId: 42,
  headers: { cookie: "sid=abc", accept: "application/json" },
  refreshToken: "r-123",
});
console.log(safe);
// { userId: 42, headers: { cookie: "[REDACTED]", accept: "application/json" }, refreshToken: "[REDACTED]" }

console.log(isSensitiveMetadataKey("x-api-key")); // true
```

> **Danger:** redaction matches on *key names*. A secret stored under an innocent key like `note` is not redacted. Never put raw credentials in metadata in the first place.

## SERIALIZING: toJSON VS PUBLIC OUTPUT

*Serializing* means turning the error object into plain data that can be logged or sent over the network. There are two audiences, and the package gives you a different function for each.

### toJSON() — for your logs

`error.toJSON()` returns *everything*: name, message, all classification fields, metadata, the stack trace, and the full `cause` chain (cycle-safe, cut off after 8 levels). Because it is named `toJSON`, `JSON.stringify(error)` calls it automatically. It does **not** redact metadata and it does **not** honour `expose`. It is for trusted, internal output only.

```ts
import { NotFoundError } from "@zudojs/errors";

const error = new NotFoundError("User 42 was not found.", { metadata: { userId: 42 } });
console.log(error.toJSON());
// {
//   name: "NotFoundError",
//   message: "User 42 was not found.",
//   code: "ERR_RESOURCE_NOT_FOUND",
//   category: "resource",
//   severity: "info",
//   statusCode: 404,
//   expose: true,
//   isOperational: true,
//   metadata: { userId: 42 },
//   stack: "NotFoundError: User 42 was not found.\n    at findUser (app.ts:4:9)"
// }
```

Subclasses add their own fields on top: `ValidationError` adds `issues` (with submitted values replaced by a type description when the error is exposed), and `RateLimitError` adds `retryAfterSeconds`.

### serializePublicError() — for clients

`serializePublicError(error)` returns only `code`, `message`, `category`, `statusCode`, and sometimes `metadata`. It never includes a stack or cause. If `expose` is false the message is replaced with `"An unexpected error occurred."` and metadata is left out entirely. If `expose` is true, metadata is included after redaction.

```ts
import { databaseQueryError, serializePublicError, serializeError } from "@zudojs/errors";

const error = databaseQueryError("relation \"users\" does not exist", {
  metadata: { sql: "SELECT * FROM users", password: "hunter2" },
});

console.log(serializePublicError(error));
// { code: "ERR_DATABASE_QUERY", message: "An unexpected error occurred.",
//   category: "database", statusCode: 500 }          ← no sql, no password, no stack

console.log(serializeError(error).metadata);
// { sql: "SELECT * FROM users", password: "[REDACTED]", operation: "query" }

// Allow-list specific keys for clients even on a hidden error:
console.log(serializePublicError(error, { publicMetadataKeys: ["operation"] }).metadata);
// { operation: "query" }
```

`serializeError(error, options)` is the internal counterpart: it redacts metadata by default and leaves out the stack and cause unless you pass `includeStack: true` or `includeCause: true`. Use `new ErrorSerializer(options)` when you want to configure once and call `serialize` / `serializePublic` many times.

> **Danger:** never do `res.json(error)` or `res.json(error.toJSON())`. That ships your stack trace and raw metadata to the client. Use `serializePublicError` or the `ErrorHandler` below.

## HANDLING UNKNOWN ERRORS

In a `catch` block the value is typed `unknown` because JavaScript lets you throw anything: a string, `null`, a plain object, a `TypeError` from a library. `normalizeToBaseError` turns any of those into a `BaseError` so the rest of your code has one shape to deal with.

Values that are already a `BaseError` pass through unchanged. Everything else becomes a 500 that is **not exposed** and **not operational**, with the original value kept as `cause`.

```ts
import { normalizeToBaseError, isBaseError, tryCatch } from "@zudojs/errors";

const fromString = normalizeToBaseError("disk full");
console.log(fromString.code, fromString.statusCode, fromString.expose);
// "ERR_INTERNAL_ERROR" 500 false

// tryCatch runs a function and hands back either the value or a BaseError.
const result = tryCatch(() => JSON.parse("{not json"));
if (!result.success) {
  console.log(isBaseError(result.error));      // true
  console.log(result.error.cause instanceof SyntaxError); // true (original kept)
}
```

`tryCatchAsync` does the same for functions that return a promise. `toBaseError`, `normalizeUnknownError` and `normalizeError` are older names for the same normalization and behave identically.

### ErrorHandler: normalize, report, respond in one call

`ErrorHandler` bundles the steps an API needs at its outermost `catch`: normalize the thrown value, send it to a *reporter* (your logger or monitoring tool), and build the response body. If the reporter itself throws, the failure is swallowed (or passed to `onReporterError`) and you still get a result.

```ts
import { ErrorHandler, NotFoundError } from "@zudojs/errors";

const handler = new ErrorHandler({
  reporter: (error, context) => {
    console.error("[report]", error.code, context?.requestId);
  },
});

async function respond(thrown: unknown) {
  const body = await handler.handlePublic(thrown, { requestId: "req_1" });
  console.log(body.statusCode, body);
}

await respond(new NotFoundError("User 42 was not found.", { metadata: { userId: 42 } }));
// [report] ERR_RESOURCE_NOT_FOUND req_1
// 404 { code: "ERR_RESOURCE_NOT_FOUND", message: "User 42 was not found.",
//       statusCode: 404, requestId: "req_1", details: { userId: 42 } }

await respond(new TypeError("Cannot read properties of undefined"));
// [report] ERR_INTERNAL_ERROR req_1
// 500 { code: "ERR_INTERNAL_ERROR", message: "An unexpected error occurred.",
//       statusCode: 500, requestId: "req_1" }
```

Use `handle()` instead of `handlePublic()` when you want the internal shape (it adds `category`, `severity`, `isOperational`, `expose` and redacted metadata). Use `toLogObject(error)` for the fullest log entry, including the cause chain.

### Mapping third-party errors

If a library throws its own error class, register a rule so it becomes the right Zudo error instead of a generic 500. `mapErrorType` matches by `instanceof`.

```ts
import { createErrorMapperRegistry, mapErrorType, mapError, ValidationError } from "@zudojs/errors";

const registry = createErrorMapperRegistry();
registry.register(
  mapErrorType("syntax-as-validation", SyntaxError, (error) =>
    new ValidationError("Body is not valid JSON.", { cause: error }),
  ),
);

const mapped = mapError(new SyntaxError("Unexpected token"), registry);
console.log(mapped.statusCode, mapped.code); // 400 "ERR_VALIDATION_FAILED"
```

## API REFERENCE

Everything below is exported from `@zudojs/errors`. The error classes themselves are listed in [Ready-made errors](#ready-made-errors).

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `BaseError` | Root error class. | `new BaseError(message, options?)`. Methods: `isPublic`, `isOperationalError`, `getMetadata`, `withMetadata`, `toJSON`, `toLogObject`, `toString`. |
| `ErrorHandler` | Normalize + report + build a response. | Methods: `normalize`, `handle`, `handlePublic`, `toResult`, `toPublicResult`, `report`, `toLogObject`, `shouldExpose`. Also `createErrorHandler(options)`. |
| `ErrorSerializer` | Configurable serializer. | Methods: `serialize`, `serializePublic`, `serializeUnknown`, `serializeUnknownPublic`. Also `createErrorSerializer(options)`. |
| `ErrorMapperRegistry` | Holds rules that convert foreign errors. | Methods: `register`, `unregister`, `has`, `find`, `map`, `getRules`, `clear`. Also `createErrorMapperRegistry()`. |

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `serializePublicError(error, options?)` | Client-safe object. | Honours `expose`; redacts; never includes stack or cause. |
| `serializeError(error, options?)` | Internal object. | Options: `includeStack`, `includeCause`, `includeMetadata`, `redactSensitiveData`, `safeMessage`, `publicMetadataKeys`, `sensitiveKeyPattern`. |
| `normalizeToBaseError(value)` | Any thrown value → `BaseError`. | Aliases: `toBaseError`, `normalizeUnknownError`, `normalizeError`, `normalizeUnknownToBaseError(value, options?)`. |
| `tryCatch(fn)` / `tryCatchAsync(fn)` | Run a function, return `{ success, value }` or `{ success: false, error }`. | `error` is always a `BaseError`. |
| `isBaseError(value)` | Type guard. | Also recognises errors from a second installed copy of the package. Alias: `isHandledError`. |
| `isClientError`, `isServerError`, `isExposableError`, `isOperationalError`, `hasErrorCategory`, `hasErrorSeverity` | Boolean checks on a `BaseError`. | All return `false` for non-`BaseError` values, except `isServerError` which returns `true`. |
| `getErrorMessage`, `getErrorName`, `getErrorStack`, `getErrorCode`, `getErrorStatusCode` | Read a field from an unknown value with a safe fallback. | Never throw. |
| `getRootCause(error)` / `getRootBaseError(error)` | Walk the `cause` chain. | Cycle-safe. |
| `withErrorContext(error, prefix)` | Wrap in a new `Error` with a prefixed message and the original as `cause`. | Returns a plain `Error`, not a `BaseError`. |
| `mapError(error, registry?, context?)` | Apply registry rules, then native mapping. | Rule builders: `mapErrorType`, `createErrorMappingRule`, `applyErrorMapping`. |
| `redactErrorMetadata`, `sanitizeErrorMetadata`, `mergeErrorMetadata`, `pickErrorMetadata`, `omitErrorMetadata` | Metadata utilities. | All return frozen copies. |
| `compareErrorSeverity`, `isAlertableSeverity`, `isFailureSeverity`, `normalizeErrorSeverity`, `isErrorCategory`, `normalizeErrorCategory` | Enum helpers. | See [above](#codes-categories-severity). |

### Types and constants

| Name | What it does | Notes |
| --- | --- | --- |
| `ErrorCode`, `ErrorCategory`, `ErrorSeverity` | Enums. | String-valued; usable at runtime and as types. |
| `BaseErrorOptions` | Constructor options. | `code`, `category`, `severity`, `statusCode`, `expose`, `isOperational`, `metadata`, `cause`. |
| `SerializedBaseError` | Return type of `toJSON()`. |  |
| `PublicErrorResponse` | Return type of `serializePublicError`. | `code`, `message`, `category`, `statusCode`, `metadata?`. |
| `PublicErrorHandlerResult` | Return type of `handlePublic` / `toPublicResult`. | `code`, `message`, `statusCode`, `requestId?`, `correlationId?`, `details?`. |
| `ErrorMetadata`, `ErrorMetadataValue` | Shape of the metadata bag. | JSON-safe values only. |
| `ValidationIssue` | One entry in `ValidationError.issues`. | `message` plus optional `field`, `path`, `code`, `value`. |
| `SENSITIVE_METADATA_KEY_PATTERN` | Default regex for secret-looking keys. | Override per call with `sensitiveKeyPattern`. |
| `REDACTED_METADATA_VALUE` | The string `"[REDACTED]"`. |  |
| `UNKNOWN_ERROR_MESSAGE` | The string `"An unexpected error occurred."` | Used when a thrown value has no message. |

## COMMON MISTAKES

- **Sending `error.toJSON()` to the client.** The stack trace and raw metadata go out with it. Use `serializePublicError` or `ErrorHandler.handlePublic`.
- **Throwing a plain `Error` for a user mistake.** It normalizes to a hidden 500, so the user sees "An unexpected error occurred." Throw `ValidationError`, `NotFoundError`, or another 4xx class instead.
- **Using 401 when you mean 403.** 401 (`AuthenticationError`) is "not logged in"; 403 (`AuthorizationError`) is "logged in, not allowed". Clients often redirect to a login page on 401.
- **Expecting `withMetadata` to mutate.** It returns a copy. Write `error = error.withMetadata({...})` or throw the returned value.
- **Putting a secret under a harmless key.** Redaction is name-based. `metadata: { note: "pw is hunter2" }` is not redacted.
- **Matching on messages in tests.** Assert on `error.code` or use the `is…Error` guards; messages are free to change.

## RELATED PACKAGES

- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — turns these errors into real HTTP responses; the `statusCode` and `expose` rules above are what it follows.
- [@zudojs/validation](https://zudojs.oyinlola.site/docs/packages-validation.md) — produces `ValidationError` with a filled `issues` list from a schema.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — where `toJSON()` / `toLogObject()` output usually ends up.
- [@zudojs/auth](https://zudojs.oyinlola.site/docs/packages-auth.md) — throws `AuthenticationError` and `AuthorizationError` for you.
- [@zudojs/database](https://zudojs.oyinlola.site/docs/packages-database.md) — throws `DatabaseError` and the database timeout errors.

## COMPLETE EXPORT INDEX

Every name `@zudojs/errors` exports from its package root at v1.0.1 — **585** in total, generated from the package&rsquo;s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 585 exports**

Classes (269)

`AdapterAlreadyRegisteredError` `AdapterCapabilityMissingError` `AdapterConfigurationError` `AdapterConnectionError` `AdapterDisposeError` `AdapterError` `AdapterInitializationError` `AdapterNotFoundError` `AdapterNotSupportedError` `AdapterOperationError` `AdapterTimeoutError` `APIAuthenticationError` `APIAuthorizationError` `APIConflictError` `APIDuplicateOperationError` `APIError` `APIIdempotencyError` `APIInternalError` `APINotFoundError` `APIOperationNotFoundError` `APIRateLimitError` `APITimeoutError` `APIUnavailableError` `APIValidationError` `APIVersionError` `ApplicationError` `AuthenticationError` `AuthorizationError` `BadGatewayError` `BadRequestError` `BaseError` `BodyParserError` `BrokenDocumentationLinkError` `CacheError` `CircularDependencyError` `CircularReferenceError` `ConfigurationError` `ConflictError` `ContainerError` `ContainerLifecycleError` `CronParseError` `CryptoError` `DatabaseError` `DeserializeError` `DocumentationError` `DocumentationVersionError` `DocumentNotFoundError` `DocumentParseError` `DocumentValidationError` `DomainError` `DuplicateDocumentError` `DuplicateEventDefinitionError` `DuplicateEventHandlerError` `DuplicateMessageHandlerError` `DuplicateRegistrationError` `DuplicateRouteParameterError` `ErrorHandler` `ErrorMapperRegistry` `ErrorSerializer` `EventBusDisposedError` `EventDefinitionNotFoundError` `EventDeserializationError` `EventDispatchAbortedError` `EventEmitterDisposedError` `EventError` `EventHandlerError` `EventHandlerNotFoundError` `EventMiddlewareError` `EventPublishError` `EventRegistryDisposedError` `EventSerializationError` `EventSubscriptionClosedError` `EventTimeoutError` `EventTypeNotFoundError` `ExampleValidationError` `ExpectationFailedError` `ExternalServiceError` `FailedDependencyError` `ForbiddenError` `GatewayTimeoutError` `GenerationError` `GoneError` `HttpAdapterError` `HttpBodyAbortedError` `HttpBodyError` `HttpBodyLimitError` `HttpBodyParseError` `HttpClientAbortError` `HttpClientError` `HttpClientNetworkError` `HttpClientTimeoutError` `HttpConflictError` `HttpError` `HttpFormDataError` `HttpFormDataLimitError` `HttpFormDataParseError` `HttpNotFoundError` `HttpResponseWriterError` `HttpRouterError` `HttpServerLifecycleError` `HttpServerStartError` `HttpServerStopError` `HttpStreamError` `InternalServerError` `InvalidContentLengthError` `InvalidContentTypeError` `InvalidDurationError` `InvalidEventError` `InvalidFrontmatterError` `InvalidHeaderError` `InvalidHttpServerStateError` `InvalidJobError` `InvalidMessageError` `InvalidNavigationError` `InvalidRoutePatternError` `InvalidScheduleError` `InvalidSerializedDataError` `JobCancelledError` `JobDeserializationError` `JobDuplicateError` `JobError` `JobMaxAttemptsError` `JobNotFoundError` `JobProcessingError` `JobSerializationError` `JobStalledError` `JobTimeoutError` `LengthRequiredError` `LifecycleComponentError` `LifecycleDependencyError` `LifecycleDisposedError` `LifecycleError` `LifecycleRollbackError` `LifecycleStartError` `LifecycleStateError` `LifecycleStopError` `LifecycleTimeoutError` `LockedError` `LoggingError` `MessageBusDisposedError` `MessageDeserializationError` `MessageDispatchAbortedError` `MessageDispatchError` `MessageError` `MessageHandlerError` `MessageHandlerNotFoundError` `MessageMiddlewareError` `MessageSerializationError` `MessageTimeoutError` `MessageTypeNotFoundError` `MessageValidationError` `MethodNotAllowedError` `MiddlewareError` `MiddlewareNextCalledMultipleTimesError` `MiddlewareTimeoutError` `ModuleDependencyError` `ModuleError` `ModuleLifecycleError` `ModuleLoadError` `ModuleNotFoundError` `MultipartError` `MultipartLimitError` `MultipartParseError` `NetworkError` `NotAcceptableError` `NotFoundError` `NotImplementedError` `PayloadTooLargeError` `PluginAlreadyRegisteredError` `PluginDependencyCycleError` `PluginDependencyError` `PluginDisposeError` `PluginError` `PluginInitializationError` `PluginNotFoundError` `PluginRegistrationError` `PluginStartError` `PluginStateError` `PluginStopError` `PluginTimeoutError` `PreconditionRequiredError` `ProviderResolutionError` `QueueClosedError` `QueueConnectionError` `QueueDisposedError` `QueueError` `QueueNotFoundError` `RangeNotSatisfiableError` `RateLimitError` `RegistrationNotFoundError` `RequestAbortedError` `RequestBodyTimeoutError` `RequestBodyTooLargeError` `RequestHeaderFieldsTooLargeError` `RequestTimeoutError` `ResponseAlreadySentError` `RouteConflictError` `RoutePatternError` `RPCAuthenticationError` `RPCCancelledError` `RPCDeadlineExceededError` `RPCDeserializationError` `RPCDuplicateProcedureError` `RPCError` `RPCForbiddenError` `RPCInternalError` `RPCInvalidRequestError` `RPCProcedureNotFoundError` `RPCRateLimitedError` `RPCSerializationError` `RPCTimeoutError` `RPCTransportError` `RPCUnavailableError` `RPCValidationError` `RuntimeBootstrapError` `RuntimeEnvironmentError` `RuntimeError` `RuntimeManagerError` `RuntimeShutdownError` `RuntimeStateError` `ScheduleAlreadyExistsError` `ScheduleNotFoundError` `SchedulerAlreadyStartedError` `SchedulerError` `SchedulerJobAlreadyExistsError` `SchedulerJobCancelledError` `SchedulerJobExecutionError` `SchedulerJobNotFoundError` `SchedulerJobTimeoutError` `SchedulerLockError` `SchedulerNotStartedError` `SchedulerStoppedError` `SchedulerStoreError` `SchemaEnumError` `SchemaError` `SchemaLiteralError` `SchemaNumberError` `SchemaRequiredError` `SchemaStringError` `SchemaTypeError` `SchemaUnionError` `SchemaUnknownKeyError` `SerializationDepthError` `SerializationError` `SerializationPayloadTooLargeError` `SerializeError` `SerializerNotFoundError` `ServiceError` `ServiceUnavailableError` `StorageError` `SystemError` `TimeoutError` `TooEarlyError` `TooManyRequestsError` `TransformerError` `TransformerNotFoundError` `UnauthorizedError` `UnprocessableEntityError` `UnsupportedBodyTypeError` `UnsupportedMediaTypeError` `UnsupportedProtocolError` `UnsupportedResponseBodyError` `UnsupportedSerializationFormatError` `UpgradeRequiredError` `URITooLongError` `ValidationError` `WorkerError` `WorkerLifecycleError` `WorkerNotFoundError`

Functions (228)

`accessDeniedError` `alreadyExistsError` `applyErrorMapping` `cacheAdapterNotConfiguredError` `cacheConnectionError` `cacheDeserializationError` `cacheInvalidKeyError` `cacheSerializationError` `cacheTimeoutError` `compareErrorSeverity` `connectionFailedError` `createAdapterError` `createAPIError` `createApplicationError` `createAuthenticationError` `createAuthorizationError` `createBodyParserError` `createConfigurationError` `createConflictError` `createContainerError` `createCryptoError` `createDatabaseError` `createDocumentationError` `createDomainError` `createErrorHandler` `createErrorMapperRegistry` `createErrorMappingRule` `createErrorMetadata` `createErrorSerializer` `createEventError` `createEventHandlerError` `createExternalServiceError` `createHttpAdapterError` `createHttpBodyError` `createHttpError` `createHttpFormDataError` `createHttpResponseWriterError` `createHttpRouterError` `createHttpServerLifecycleError` `createHttpStreamError` `createLifecycleError` `createLoggingError` `createMessageError` `createMessageHandlerError` `createMiddlewareError` `createModuleError` `createMultipartError` `createNetworkError` `createNotFoundError` `createPluginError` `createQueueError` `createRateLimitError` `createRoutePatternError` `createRPCError` `createRuntimeError` `createSchedulerError` `createSchemaError` `createSerializationError` `createServiceError` `createStorageError` `createSystemError` `createTimeoutError` `createValidationError` `createValidationIssue` `cryptoCipherError` `cryptoHashError` `cryptoKeyDerivationError` `cryptoKeyError` `cryptoSignatureError` `databaseConnectionError` `databaseMigrationError` `databaseQueryError` `databaseTimeoutError` `databaseTransactionError` `duplicateError` `entityNotFoundError` `expiredTokenError` `externalServiceTimeoutError` `externalServiceUnavailableError` `getErrorCategory` `getErrorCode` `getErrorDiagnostics` `getErrorMessage` `getErrorMetadataValue` `getErrorName` `getErrorSeverity` `getErrorSeverityPriority` `getErrorStack` `getErrorStatusCode` `getRootBaseError` `getRootCause` `hasErrorCategory` `hasErrorMetadata` `hasErrorSeverity` `internalSystemError` `invalidConfigurationError` `invalidCredentialsError` `invalidDomainState` `invalidFieldIssue` `invalidTokenError` `isAdapterError` `isAlertableSeverity` `isAPIError` `isApplicationError` `isAuthenticationError` `isAuthorizationError` `isBaseError` `isBodyParserError` `isCacheError` `isClientError` `isClientErrorCategory` `isConfigurationError` `isConflictError` `isContainerError` `isCryptoError` `isDatabaseError` `isDocumentationError` `isDomainError` `isError` `isErrorCategory` `isErrorCode` `isErrorExposable` `isErrorLike` `isErrorMetadataValue` `isErrorSeverity` `isEventError` `isExposableError` `isExternalServiceError` `isFailureSeverity` `isForbiddenMetadataKey` `isHandledError` `isHttpAdapterError` `isHttpBodyError` `isHttpClientErrorStatus` `isHttpError` `isHttpFormDataError` `isHttpRedirectStatus` `isHttpResponseWriterError` `isHttpRouterError` `isHttpServerErrorStatus` `isHttpServerLifecycleError` `isHttpStreamError` `isHttpSuccessStatus` `isInfrastructureErrorCategory` `isLifecycleError` `isLoggingError` `isMessageError` `isMiddlewareError` `isModuleError` `isMultipartError` `isNetworkError` `isNotFoundError` `isOperationalError` `isPluginError` `isPublicErrorCategory` `isQueueError` `isRateLimitError` `isRoutePatternError` `isRPCError` `isRuntimeError` `isSchedulerError` `isSchemaError` `isSecurityErrorCategory` `isSensitiveMetadataKey` `isSerializationError` `isServerError` `isServiceError` `isStorageError` `isSystemError` `isTimeoutError` `isValidationError` `lockTimeoutError` `mapError` `mapErrorType` `mapNativeError` `mapUpstreamStatus` `mergeErrorMetadata` `missingConfigurationError` `networkServiceUnavailableError` `networkTimeoutError` `normalizeError` `normalizeErrorCategory` `normalizeErrorCode` `normalizeErrorSeverity` `normalizeToBaseError` `normalizeUnknownError` `normalizeUnknownToBaseError` `omitErrorMetadata` `permissionDeniedError` `pickErrorMetadata` `redactErrorMetadata` `requestTimeoutError` `requiredFieldIssue` `resourceAccessDeniedError` `resourceLockedError` `resourceNotFoundError` `retryAfterError` `routeNotFoundError` `sanitizeErrorMetadata` `serializeError` `serializeErrorCause` `serializeErrorMetadata` `serializePublicError` `serviceInitializationError` `serviceOperationError` `serviceTimeoutError` `serviceUnavailableError` `sessionExpiredError` `storageDeleteError` `storageDownloadError` `storageNotFoundError` `storageReadError` `storageUploadError` `storageWriteError` `stripUrlCredentials` `systemInitializationError` `systemShutdownError` `systemStartupError` `toBaseError` `toError` `toEventError` `toMessageError` `toQueueError` `toSerializationError` `tryCatch` `tryCatchAsync` `unsupportedDomainOperation` `withErrorContext`

Interfaces (66)

`AdapterErrorOptions` `APIErrorOptions` `ApplicationErrorOptions` `AuthenticationErrorOptions` `AuthorizationErrorOptions` `BaseErrorOptions` `BodyParserErrorOptions` `CacheErrorOptions` `ConfigurationErrorOptions` `ConflictErrorOptions` `ContainerErrorOptions` `CryptoErrorOptions` `DatabaseErrorOptions` `DocumentationErrorOptions` `DomainErrorOptions` `ErrorHandlerContext` `ErrorHandlerOptions` `ErrorHandlerResult` `ErrorMapperContext` `ErrorMapping` `ErrorMappingRule` `ErrorMetadata` `ErrorSerializerOptions` `EventErrorOptions` `ExternalServiceErrorOptions` `HttpAdapterErrorOptions` `HttpBodyErrorOptions` `HttpClientClientErrorOptions` `HttpClientErrorOptions` `HttpErrorOptions` `HttpFormDataErrorOptions` `HttpResponseWriterErrorOptions` `HttpRouterErrorOptions` `HttpServerErrorOptions` `HttpServerLifecycleErrorOptions` `HttpStreamErrorOptions` `InternalErrorResponse` `LifecycleErrorOptions` `LoggingErrorOptions` `MessageErrorOptions` `MiddlewareErrorOptions` `ModuleErrorOptions` `MultipartErrorOptions` `NetworkErrorOptions` `NormalizedError` `NotFoundErrorOptions` `PluginErrorOptions` `PublicErrorHandlerResult` `PublicErrorResponse` `QueueErrorOptions` `RateLimitErrorOptions` `RedactErrorMetadataOptions` `RoutePatternErrorOptions` `RPCErrorOptions` `RuntimeErrorOptions` `SanitizeErrorMetadataOptions` `SchedulerErrorOptions` `SchemaErrorOptions` `SerializationErrorOptions` `SerializedBaseError` `ServiceErrorOptions` `StorageErrorOptions` `SystemErrorOptions` `TimeoutErrorOptions` `ValidationErrorOptions` `ValidationIssue`

Type aliases (7)

`ErrorConstructor` `ErrorMapper` `ErrorMapperPredicate` `ErrorMetadataPrimitive` `ErrorMetadataValue` `ErrorReporter` `ErrorReporterFailureHandler`

Constants (6)

`BASE_ERROR_BRAND` `externalServiceUnavailable` `MAX_METADATA_DEPTH` `REDACTED_METADATA_VALUE` `SENSITIVE_METADATA_KEY_PATTERN` `UNKNOWN_ERROR_MESSAGE`

Enums (9)

`CacheOperation` `CryptoOperation` `DatabaseOperation` `ErrorCategory` `ErrorCode` `ErrorSeverity` `StorageOperation` `SystemOperation` `TimeoutOperation`
