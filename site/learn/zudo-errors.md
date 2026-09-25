---
title: "The ZudoJS error system — ZudoJS Academy"
description: "Handle failures the ZudoJS way: expected errors versus bugs, your own error classes, safe bodies for clients, full logs, and one handler for the Task API."
source: https://zudojs.oyinlola.site/learn/zudo-errors
---

LEVEL 12 · LESSON 19 OF 19

Configuration, validation and errors Core

# The ZudoJS error system

Handle failures the ZudoJS way: expected errors versus bugs, your own error classes, safe bodies for clients, full logs, and one handler for the Task API.

- **45 min** to read and try
- **You need:** "Validation rules with @zudojs/validation", and "Schemas and validation in depth"
- **You build:** One error handler for the Task API that answers every failure with the right status, a stable code, validation details and a request id, and never leaks internals

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Tell expected, operational failures from bugs, and answer each with the right status
- Read and use the fields every ZudoJS error shares: statusCode, code, category, expose and isOperational
- Write your own error class with a stable code, and decide what may go in its metadata
- Serialize an error safely for a client and completely for your logs
- Give every error in the Task API one consistent, safe response body with a request id

## Two kinds of failure

Things go wrong in a backend all the time, and most of it is normal. It helps to sort failures into two kinds:

- **Expected failures**, also called **operational** errors: the client sent bad data, asked for a task that does not exist, or tried to create a duplicate. Your code knows these can happen. The client did something wrong, deserves a clear message, and gets a 4xx status.
- **Bugs**, also called **programmer** errors: a `TypeError`, a query with a typo, an `undefined` where there should be an object. Nobody planned them. The client gets a 500 with a generic message, and *you* get the details in your logs, so you can fix the bug.

There is a second way to sort them: who throws them. **Framework errors** come from ZudoJS packages: `SchemaError` from a schema, `RuntimeStartError` from the runtime, `CircularDependencyError` from the container, `HttpError` from the HTTP layer. **Application errors** are the ones your own code throws for its own rules: `NotFoundError`, `ConflictError`, or classes you write yourself. All of them extend one class, `BaseError` from `@zudojs/errors`, so one piece of code can handle them all:

kinds.ts

```ts
import { ConflictError, DomainError, NotFoundError, normalizeToBaseError, ValidationError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";

function schemaFailure(): unknown {
  try {
    schema.object({ title: schema.string().min(3) }).parse({ title: "no" });
  } catch (error) {
    return error;
  }
}

const errors = [
  new NotFoundError("Task 9 not found"),
  new ConflictError("A task called \"Buy milk\" already exists"),
  new ValidationError("The due date is in the past"),
  new DomainError("A finished task cannot be reopened"),
  normalizeToBaseError(schemaFailure()),
  normalizeToBaseError(new TypeError("Cannot read properties of undefined (reading 'title')")),
];

for (const e of errors) {
  console.log(e.name.padEnd(16), e.code.padEnd(24), e.statusCode, e.category.padEnd(10), "expose:", e.expose, "operational:", e.isOperational);
}
```

Output of `npx tsx kinds.ts` and of the browser terminal

```ts
NotFoundError    ERR_RESOURCE_NOT_FOUND   404 resource   expose: true operational: true
ConflictError    ERR_CONFLICT             409 conflict   expose: true operational: true
ValidationError  ERR_VALIDATION_FAILED    400 validation expose: true operational: true
DomainError      ERR_OPERATION_FAILED     422 business   expose: true operational: true
SchemaError      ERR_SCHEMA_VALIDATION    400 validation expose: true operational: true
BaseError        ERR_INTERNAL_ERROR       500 system     expose: false operational: false
```

Every error carries the same fields:

- `statusCode`: the HTTP status to answer with.
- `code`: a stable, machine-readable name. Clients and tests check `code`, never `message`, so you can reword messages freely.
- `category`: which area failed. It helps to group errors on a dashboard.
- `expose`: `true` if the message is safe to show a client. By default it is `true` for 4xx errors and `false` for 5xx errors, because a server error's message often describes your internals.
- `isOperational`: `true` for expected failures, `false` for bugs.

The last line is the interesting one. `normalizeToBaseError` takes *anything* that was thrown (in JavaScript you can throw any value, so a `catch` gets `unknown`) and turns it into a `BaseError`. A `BaseError` passes through unchanged. Anything else, such as that `TypeError`, becomes a hidden, non-operational 500 with code `ERR_INTERNAL_ERROR`: a bug.

## Your own error classes

When no ready-made class fits a rule of your application, write one. Extend `BaseError` and set everything in the constructor, so every place that throws it gets the same code and status. The Task API gets a rule: a task that is already done cannot be completed again.

custom.ts

```ts
import { BaseError, ErrorCategory, ErrorSeverity, serializePublicError } from "@zudojs/errors";

export class TaskAlreadyDoneError extends BaseError {
  constructor(taskId: number) {
    super(`Task ${taskId} is already done`, {
      code: "ERR_TASK_ALREADY_DONE",
      category: ErrorCategory.BUSINESS,
      severity: ErrorSeverity.INFO,
      statusCode: 409,
      metadata: { taskId },
    });
  }
}

function complete(task: { id: number; done: boolean }): void {
  if (task.done) {
    throw new TaskAlreadyDoneError(task.id);
  }
  task.done = true;
}

try {
  complete({ id: 3, done: true });
} catch (error) {
  if (error instanceof TaskAlreadyDoneError) {
    console.log(String(error));
    console.log(error.statusCode, error.expose, error.getMetadata("taskId"));
    console.log(serializePublicError(error));
  }
}
```

Output of `npx tsx custom.ts` and of the browser terminal

```ts
TaskAlreadyDoneError [ERR_TASK_ALREADY_DONE]: Task 3 is already done
409 true 3
{
  code: 'ERR_TASK_ALREADY_DONE',
  message: 'Task 3 is already done',
  category: 'business',
  statusCode: 409,
  metadata: { taskId: 3 }
}
```

- The `code` is your own string. Prefix it (`ERR_`) and keep it stable: clients will write `if (body.error.code === "ERR_TASK_ALREADY_DONE")`.
- `metadata` holds facts about the failure. It is copied and frozen, so nobody can change it later. Look at the last output: for an exposed error such as this 409, `serializePublicError` sends the metadata to the client. So only put there what a client may see. Facts for your logs only belong in the log line, or in the metadata of a 5xx error, which is never exposed. Never a password or a token.
- `name` was set to the class name for you.
- 409 Conflict fits: the request clashes with the current state of the task.

Put the rules and their errors in the service, not in the routes. The service does not know about HTTP; it only says "this task is already done", and the status code travels with the error.

## Validation errors

You have met two classes for bad input, both with status 400:

- `SchemaError`, thrown by `parse`. Its `issues` list says which fields failed and why.
- `ValidationError`, for checks you write yourself. You give it the list of problems, built with helpers such as `requiredFieldIssue` and `invalidFieldIssue`.

validation-errors.ts

```ts
import { invalidFieldIssue, requiredFieldIssue, ValidationError } from "@zudojs/errors";
import { isSchemaValidationError, schema } from "@zudojs/schema";

try {
  schema.object({ title: schema.string().min(3), done: schema.boolean() }).parse({ title: "no" });
} catch (error) {
  if (isSchemaValidationError(error)) {
    console.log(error.code, error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
}

const error = new ValidationError("The import file has problems", {
  issues: [requiredFieldIssue("title"), invalidFieldIssue("priority", "Priority must be low, normal or high")],
});
console.log(error.code, error.issueCount, error.issues.map((i) => `${i.field}: ${i.message}`));
```

Output of `npx tsx validation-errors.ts` and of the browser terminal

```ts
ERR_SCHEMA_VALIDATION [
  'title: String must be at least 3 characters',
  'done: Required field missing: done'
]
ERR_VALIDATION_FAILED 2 [
  'title: title is required.',
  'priority: Priority must be low, normal or high'
]
```

`isSchemaValidationError`, from `@zudojs/schema`, checks that the error is a `SchemaError` and types its `issues`, as in [the validation lesson](https://zudojs.oyinlola.site/learn/zudo-validation#route). `ValidationError.issues` is typed already.

## HTTP errors

`@zudojs/http` has its own `HttpError` class and shortcuts such as `badRequest()`, `notFound()` and `tooManyRequests()`. `HttpError` also extends `BaseError`, so it has the same fields:

http-errors.tsNode.js only

```ts
import { badRequest, HttpError, notFound } from "@zudojs/http";
import { isBaseError, NotFoundError } from "@zudojs/errors";

const errors = [
  badRequest("The request body is not valid JSON"),
  notFound("No such route"),
  new HttpError(415, "Send JSON"),
  new NotFoundError("Task 9 not found"),
];
for (const e of errors) {
  console.log(e.name.padEnd(14), e.statusCode, e.code.padEnd(24), isBaseError(e));
}
```

Output of `npx tsx http-errors.ts`

```ts
HttpError      400 BAD_REQUEST              true
HttpError      404 NOT_FOUND                true
HttpError      415 UNSUPPORTED_MEDIA_TYPE   true
NotFoundError  404 ERR_RESOURCE_NOT_FOUND   true
```

`new HttpError(415, ...)` got its code from the status. Both families work, so which should you use where? A simple rule:

- **Services** throw `@zudojs/errors` classes: `NotFoundError`, `ConflictError`, your own `TaskAlreadyDoneError`. They describe what went wrong in your application's terms, and the same service could be used from a queue worker or a command-line tool, where HTTP means nothing.
- **The HTTP layer** (routes, `readJson`, middleware) may throw `HttpError` for problems that only exist in HTTP: a wrong `Content-Type` (415), unreadable JSON (400).

## What the client sees, and what your logs see

**Serializing** an error means turning it into plain data, for a response body or a log entry. The two audiences need very different things:

- The **client** needs a code, a safe message, and nothing else. A stack trace, an SQL query or a file path tells an attacker how your system is built.
- **Your logs** need everything: the stack, the cause, the metadata, so you can find the bug.

REASON IT OUT

### What may the client see?

A request fails because the database refused a query. The error knows the failing SQL, the table name, the database host, a stack trace, and, because someone logged too much, the connection password. Before reading on, decide what the client's response body should contain, what your log should contain, and what should appear in neither. Would your answer change for a 404 whose metadata holds the missing task's id?

**Show the reasoning**

- **The client** of a 500 gets a stable code and a generic message, nothing else. SQL, table names, hosts and stack traces are a map of your system for an attacker, and the client cannot act on them anyway.
- **Your log** gets everything that helps you fix the bug: the real message, the SQL, the stack and the cause.
- **Neither** gets the password: logs are copied and read widely, so secrets are redacted even there.
- A **404** is different: the client made the mistake and needs to know which task was missing, so its message and a `taskId` in its metadata may be sent. That is why exposure depends on the status: 4xx errors are exposed, 5xx errors are not.

`serializePublicError(error)` is for clients. `error.toJSON()` is for logs. Here both look at a database failure whose metadata holds the failing SQL and, by mistake, a password:

serialize.ts

```ts
import { databaseQueryError, serializePublicError } from "@zudojs/errors";

const error = databaseQueryError('relation "tasks" does not exist', {
  metadata: { sql: "SELECT * FROM tasks WHERE id = $1", password: "pa55word" },
});

console.log("client:", serializePublicError(error));

const forLogs = error.toJSON();
console.log("logs:", forLogs.message, forLogs.metadata);
console.log("logs also get a stack trace:", typeof forLogs.stack, forLogs.stack?.split("\n")[0]);
```

Output of `npx tsx serialize.ts` and of the browser terminal

```ts
client: {
  code: 'ERR_DATABASE_QUERY',
  message: 'An unexpected error occurred.',
  category: 'database',
  statusCode: 500
}
logs: relation "tasks" does not exist {
  sql: 'SELECT * FROM tasks WHERE id = $1',
  password: '[REDACTED]',
  operation: 'query'
}
logs also get a stack trace: string DatabaseError: relation "tasks" does not exist
```

Because a database error is a 500, `expose` is `false`: the client got a generic message and no metadata at all. The log copy kept the real message, the SQL and the stack trace, and still replaced the password: both serializers redact keys whose names look secret.

> NEVER SEND toJSON() TO A CLIENT
>
> A response such as `.json(error)` or `.json(error.toJSON())` sends the stack trace and the raw metadata to whoever made the request. Always build client bodies from `serializePublicError`, or from your own fields as below.

`ErrorHandler` packs the usual steps into one call: normalize whatever was thrown, **report** it (to your logger or an error-tracking service), and build the public body:

error-handler.ts

```ts
import { ErrorHandler, NotFoundError } from "@zudojs/errors";

const handler = new ErrorHandler({
  reporter: (error, context) => console.log(`[report] ${error.code} operational=${error.isOperational} request=${context?.requestId}`),
});

console.log(await handler.handlePublic(new NotFoundError("Task 9 not found", { metadata: { taskId: 9 } }), { requestId: "req-1" }));
console.log(await handler.handlePublic(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { requestId: "req-2" }));
```

Output of `npx tsx error-handler.ts` and of the browser terminal

```json
[report] ERR_RESOURCE_NOT_FOUND operational=true request=req-1
{
  code: 'ERR_RESOURCE_NOT_FOUND',
  message: 'Task 9 not found',
  statusCode: 404,
  requestId: 'req-1',
  details: { taskId: 9 }
}
[report] ERR_INTERNAL_ERROR operational=false request=req-2
{
  code: 'ERR_INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
  statusCode: 500,
  requestId: 'req-2'
}
```

The second error was a plain `Error` mentioning an internal address. The client body says nothing about it; the reporter saw it as a non-operational error, which is exactly the kind you want an alert for.

## Errors in @zudojs/http

You have been relying on simple error handling since [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http#status), built into `@zudojs/http` and copied by the Task API's generated code: an error with a status becomes a response with that status and `{"error": message, "code": code}`; anything else becomes a plain 500. That is safe, but the Task API wants more:

- validation errors should list their issues, not just say "Validation failed",
- every error body should have the same shape, with the request id, so a user can report it and you can find the log line,
- bugs should be logged with their full details.

So you write an **error handler**: one function that turns any thrown value into a response. The natural place for it is a middleware around the router. When a route throws, `await next()` throws that very same error, so an ordinary `try`/`catch` and `instanceof` work there:

error-middleware.tsNode.js only

```ts
import { createRequestContext, createResponseContext, createRouter, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { normalizeToBaseError, NotFoundError, serializePublicError } from "@zudojs/errors";

const router = createRouter();
router.get("/tasks/:id", (ctx) => {
  throw new NotFoundError(`Task ${ctx.params.id} not found`);
});
router.get("/crash", () => {
  throw new TypeError("Cannot read properties of undefined (reading 'title')");
});

const handleErrors: HttpMiddleware = async (context, next) => {
  try {
    return await next();
  } catch (thrown) {
    console.log("caught:", (thrown as Error).name, "| NotFoundError?", thrown instanceof NotFoundError);
    const error = normalizeToBaseError(thrown);
    const { code, message } = serializePublicError(error);
    return createResponseContext({ status: error.statusCode }).json({ error: { code, message } });
  }
};

const pipeline = new HttpMiddlewarePipeline();
pipeline.use(handleErrors);
pipeline.use(async (context) => (await router.dispatch(context.request)).response);

for (const url of ["/tasks/9", "/crash"]) {
  const response = await pipeline.execute(createRequestContext({ method: "GET", url }), createResponseContext());
  console.log(response.status, response.body);
}
```

Output of `npx tsx error-middleware.ts`

```ts
caught: NotFoundError | NotFoundError? true
404 {"error":{"code":"ERR_RESOURCE_NOT_FOUND","message":"Task 9 not found"}}
caught: TypeError | NotFoundError? false
500 {"error":{"code":"ERR_INTERNAL_ERROR","message":"An unexpected error occurred."}}
```

The middleware received the real `NotFoundError`, and the `TypeError` bug became a 500 whose message says nothing about your code. (Before `@zudojs/http` 1.4.0, an error was wrapped in an `HttpMiddlewareError` on its way back through the pipeline, so older code caught errors inside the router step instead.)

## Put it in the Task API

The Task API already has an error handler: the CLI wrote one. In `src/server.ts`, the `dispatch` step that runs the router catches whatever a route throws:

src/server.ts (part)Node.js only

```ts
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};
```

`errorResponse`, in `src/utils/http.ts`, answers an error with an exposed 4xx status with `{"error": message, "code": code}`. For anything else it returns `undefined`, the error is thrown on, and `@zudojs/http` answers a plain 500. That is safe, and it is the behaviour you have seen since [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http#task-api). The step also sits in the right place: last in the pipeline, after CORS, so an error answer is an ordinary response to the middleware around it and gets the CORS headers too. Without them, the browser would hide the error body from your web app.

Replace `errorResponse` with a handler that does the rest of this lesson. Create `src/utils/errors.ts`:

src/utils/errors.tsNode.js only

```ts
import { normalizeToBaseError, serializePublicError } from "@zudojs/errors";
import type { BaseError } from "@zudojs/errors";
import { createResponseContext } from "@zudojs/http";
import type { HttpResponseContext } from "@zudojs/http";
import type { Logger } from "@zudojs/logger";
import { isSchemaValidationError } from "@zudojs/schema";

export type ErrorReporter = (error: BaseError, requestId: string) => void;

export function logBugs(logger: Logger): ErrorReporter {
  return (error, requestId) => {
    logger.error("request failed", { requestId, error: error.toJSON() });
  };
}

export function toErrorResponse(thrown: unknown, requestId: string, report: ErrorReporter): HttpResponseContext {
  const error = normalizeToBaseError(thrown);
  if (!error.isOperational || error.statusCode >= 500) {
    report(error, requestId);
  }
  const { code, message } = serializePublicError(error);
  const issues = isSchemaValidationError(thrown)
    ? thrown.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }))
    : undefined;
  return createResponseContext({ status: error.statusCode })
    .setHeader("x-request-id", requestId)
    .json({ error: message, code, requestId, ...(issues ? { issues } : {}) });
}
```

- It always answers, so no error is thrown on to a plain 500 any more. A bug still gets a 500, with the generic message from `serializePublicError`.
- Only bugs are reported. A 404 is not something to fix, and logging every one would bury the real problems. The `report` function is a parameter, so a test can see what would be logged; `logBugs` builds the real one from a logger.
- The body keeps the field names the generated code already uses, `error` and `code`, and adds the `requestId` (also sent as the `x-request-id` header). For a `SchemaError` it adds the `issues`, shaped like the generated `validationFailed` helper: a `path` and a `message` per problem. It takes only `code` and `message` from `serializePublicError`, so an exposed error's metadata does not reach the client either.
- The title rules from [the last lesson](https://zudojs.oyinlola.site/learn/zudo-validation-rules#task-api) throw `@zudojs/validation`'s `ValidationError`, which `isSchemaValidationError` does not recognise, so their answers carry no `issues` list. Their `message` already names each failing field, as that lesson designed. The broken-task check from the same lesson throws an `InternalServerError`: not operational, so `logBugs` writes it to the log with its `taskId` and failing fields.

In `src/server.ts`, import the two functions instead of `errorResponse`, build the reporter from the runtime's logger, and let `dispatch` return the answer:

src/server.ts (part)Node.js only

```ts
import { logBugs, toErrorResponse } from "./utils/errors.js";
import { securityHeaders } from "./utils/http.js";

// ...

const reportBug = logBugs(runtime.context.logger);
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    return toErrorResponse(error, context.request.id, reportBug);
  }
};
```

Nothing else uses `errorResponse` now, so delete it from `src/utils/http.ts`. This check script builds the same `dispatch` step around a stand-in router that fails in every possible way, and prints what the reporter receives:

src/check-errors.tsNode.js only

```ts
import { ConflictError, NotFoundError } from "@zudojs/errors";
import { badRequest, createRequestContext, createResponseContext, createRouter, HttpMiddlewarePipeline } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { schema } from "@zudojs/schema";
import { toErrorResponse } from "./utils/errors.js";

const router = createRouter();
router.get("/missing", () => { throw new NotFoundError("Task 9 not found"); });
router.get("/conflict", () => { throw new ConflictError('A task called "Buy milk" already exists'); });
router.get("/invalid", () => {
  return schema.object({ title: schema.string().min(3), done: schema.boolean() }).parse({ title: "no" });
});
router.get("/json", () => { throw badRequest("The request body is not valid JSON."); });
router.get("/bug", () => { throw new TypeError("Cannot read properties of undefined (reading 'title')"); });

const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request)).response;
  } catch (error) {
    return toErrorResponse(error, context.request.id, (e, id) => {
      console.log(`  [report] ${e.code} (${(e.cause as Error).message}) request=${id.length} chars`);
    });
  }
};
const pipeline = new HttpMiddlewarePipeline({ middlewares: [dispatch] });

for (const url of ["/missing", "/conflict", "/invalid", "/json", "/bug"]) {
  const response = await pipeline.execute(createRequestContext({ method: "GET", url }), createResponseContext());
  const { requestId, ...rest } = JSON.parse(String(response.body)) as Record<string, unknown>;
  console.log(url, response.status, JSON.stringify(rest), requestId === response.headers["x-request-id"]);
}
```

Output of `npx tsx src/check-errors.ts`

```ts
/missing 404 {"error":"Task 9 not found","code":"ERR_RESOURCE_NOT_FOUND"} true
/conflict 409 {"error":"A task called \"Buy milk\" already exists","code":"ERR_CONFLICT"} true
/invalid 400 {"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION","issues":[{"path":"title","message":"String must be at least 3 characters"},{"path":"done","message":"Required field missing: done"}]} true
/json 400 {"error":"The request body is not valid JSON.","code":"BAD_REQUEST"} true
  [report] ERR_INTERNAL_ERROR (Cannot read properties of undefined (reading 'title')) request=36 chars
/bug 500 {"error":"An unexpected error occurred.","code":"ERR_INTERNAL_ERROR"} true
```

Every failure now has the same shape: a safe `error` message, a stable `code`, the `requestId` (the same value as the `x-request-id` header) and, for validation errors, the list of issues. The `TypeError` was the only one reported, and its text never reached the client. In the real server, `logBugs` writes that report as an `error` log line with the full error, stack trace included.

Check the types, restart `npm run dev` and send the Task API a bad task:

Terminal on your computer

```bash
$ npx tsc --noEmit
$ curl -i -X POST http://localhost:3000/tasks -H "content-type: application/json" -d '{"title":"no","priority":"urgent"}'
HTTP/1.1 400 Bad Request
x-request-id: 0c91c71f-5e2a-4cd2-aa68-1f112e36b595
content-type: application/json
x-content-type-options: nosniff
x-frame-options: DENY
…
content-length: 266
Date: Wed, 23 Sep 2026 20:01:50 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":"Validation failed","code":"ERR_SCHEMA_VALIDATION","requestId":"0c91c71f-5e2a-4cd2-aa68-1f112e36b595","issues":[{"path":"title","message":"String must be at least 3 characters"},{"path":"priority","message":"Expected one of \"low\", \"normal\", \"high\""}]}
```

A client, or the web app's form, can now show "String must be at least 3 characters" right next to the title field. The generated example resource still answers bad input itself, with `validationFailed` in `examples.controller.ts`: its bodies have `error` and `issues`, but no `code` and no `requestId`. Keep that in mind if you copy its shape for a new resource.

## Practice

TRY IT YOURSELF

### Complete a task

Add a `complete(id)` method to the `TaskService`: it throws `TaskAlreadyDoneError` when the task is already done, and `NotFoundError` when it does not exist. Try both through `toErrorResponse`-style handling: print the status and code of each outcome.

**Show a solution**

complete.ts

```ts
import { BaseError, ErrorCategory, normalizeToBaseError, NotFoundError } from "@zudojs/errors";

class TaskAlreadyDoneError extends BaseError {
  constructor(taskId: number) {
    super(`Task ${taskId} is already done`, {
      code: "ERR_TASK_ALREADY_DONE",
      category: ErrorCategory.BUSINESS,
      statusCode: 409,
      metadata: { taskId },
    });
  }
}

const tasks = new Map([[1, { id: 1, title: "Buy milk", done: false }]]);

function complete(id: number): { id: number; title: string; done: boolean } {
  const task = tasks.get(id);
  if (!task) throw new NotFoundError(`Task ${id} not found`);
  if (task.done) throw new TaskAlreadyDoneError(id);
  const updated = { ...task, done: true };
  tasks.set(id, updated);
  return updated;
}

for (const id of [1, 1, 5]) {
  try {
    console.log(200, complete(id));
  } catch (thrown) {
    const error = normalizeToBaseError(thrown);
    console.log(error.statusCode, error.code, error.message);
  }
}
```

Output of `npx tsx complete.ts` and of the browser terminal

```ts
200 { id: 1, title: 'Buy milk', done: true }
409 ERR_TASK_ALREADY_DONE Task 1 is already done
404 ERR_RESOURCE_NOT_FOUND Task 5 not found
```

TRY IT YOURSELF

### What leaks?

A teammate writes this handler. List everything that can leak to a client, and say what to use instead.

leaky.ts

```ts
function leakyHandler(error: unknown) {
  return createResponseContext({ status: 500 }).json({
    message: (error as Error).message,
    stack: (error as Error).stack,
    error,
  });
}
```

**Show a solution**

- `message` of a bug or database error can contain SQL, table names, internal host names or file paths.
- `stack` shows your file layout, the libraries and versions you use, and the exact lines that failed: a map for an attacker.
- `error` itself is serialized with its `toJSON()`, which for a `BaseError` includes the stack, the cause chain and the metadata.
- The status is always 500, even for a client mistake such as a missing task, so clients cannot tell their mistakes from yours.

Use `normalizeToBaseError` for the status, `serializePublicError` for the message, and send the full details only to your logs, as `toErrorResponse` does.

## Recap

- Expected failures (operational, 4xx) get a clear message; bugs (500) get a generic message for the client and full details in the logs.
- Every ZudoJS error, framework or application, extends `BaseError` with `statusCode`, `code`, `category`, `expose` and `isOperational`. Clients check `code`, not `message`.
- Write your own errors by extending `BaseError` with a fixed code and status, and throw them from services.
- `SchemaError` and `ValidationError` carry issues; `HttpError` is for HTTP-only problems.
- `serializePublicError` for clients, `toJSON()` for logs, `normalizeToBaseError` for anything thrown. Never send a stack trace.
- In `@zudojs/http`, one error-handling middleware just before the router catches every error a route throws, and gives it the same body with a request id.

That completes ZudoJS fundamentals: the CLI, the core, runtime and lifecycle, dependency injection, routes, middleware, configuration, validation and errors. The next course, ZudoJS application development, replaces the in-memory store with a real database. Next, [Databases with @zudojs/database](https://zudojs.oyinlola.site/learn/zudo-database).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
