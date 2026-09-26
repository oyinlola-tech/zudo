---
title: "@zudojs/cqrs — Command Query Responsibility Segregation"
description: "@zudojs/cqrs docs: CQRS for TypeScript. Command and query buses, typed handlers, middleware and event extensions for separating reads from writes in ZudoJS."
source: https://zudojs.oyinlola.site/docs/packages-cqrs
---

v1.2.0

# @zudojs/cqrs

Command Query Responsibility Segregation — separate read and write models with typed handlers.

CQRS COMMANDS QUERIES

## OVERVIEW

*CQRS* (Command Query Responsibility Segregation) is one simple rule: code that **changes** something and code that only **reads** something are kept apart.

The package has four building blocks. A *command* is a plain object asking for a change ("create this user"). A *query* is a plain object asking for data ("give me this user"). A *handler* is the function that does the work for one of them. A *bus* is the router: it finds the handler by the object's `type` string and runs it.

> **In plain words:** the bus is a lookup table from `type` to a function. `bus.execute(message)` finds the function and calls it.

WHEN YOU NEED IT

- Many distinct operations, each in its own small function.
- One place to log, time, or guard every operation.
- Writes and reads that should evolve separately.

WHEN YOU DON'T

- A small script: call your functions directly.
- Reacting to things that already happened: use [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md).
- Messages between processes: see [@zudojs/messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md).

## INSTALLATION

Install the package. It depends on `@zudojs/errors`, `@zudojs/events` and `@zudojs/middleware`, which npm installs for you. Needs Node.js 24+ and an ES module project.

```bash
$ npm install @zudojs/cqrs
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

## QUICK START

This example stores users in a `Map`. One command creates a user; one query reads it back. The generics on `register` and `execute` tell TypeScript the message shape and the return type.

```ts
import {
  createCommandBus,
  createQueryBus,
  type CommandOf,
  type QueryOf,
} from "@zudojs/cqrs";

interface User {
  id: string;
  name: string;
}

// A command and a query are object shapes with a `type` field.
type CreateUser = CommandOf<"CreateUser", { name: string }>;
type GetUser = QueryOf<"GetUser", { id: string }>;

const users = new Map<string, User>();
const commandBus = createCommandBus();
const queryBus = createQueryBus();

// The command handler changes state and returns the new user.
commandBus.register<CreateUser, User>("CreateUser", async (command) => {
  const user = { id: String(users.size + 1), name: command.name };
  users.set(user.id, user);
  return user;
});

// The query handler only reads.
queryBus.register<GetUser, User | undefined>("GetUser", async (query) => {
  return users.get(query.id);
});

const created = await commandBus.execute<CreateUser, User>({
  type: "CreateUser",
  name: "Alice",
});
console.log(created);
// { id: '1', name: 'Alice' }

const found = await queryBus.execute<GetUser, User | undefined>({
  type: "GetUser",
  id: created.id,
});
console.log(found?.name);
// Alice
```

The code calling `execute` never touches the `Map`. Only the handlers do.

## COMMANDS AND QUERIES

A command or query is any object with a non-empty `type` string. The bus uses that string to find the handler; everything else on the object is data for the handler.

Both have the same shape. The difference is the promise you make: a command handler may change state, a query handler must not. A type alias (as in the Quick Start) is usually enough. `createCommand` / `createQuery` build a frozen object and guarantee the `type` you pass wins over any `type` in the payload.

```ts
import { createCommand, isCommand } from "@zudojs/cqrs";

const command = createCommand("CreateUser", { name: "Alice" });
console.log(command, Object.isFrozen(command), isCommand(command));
// { name: 'Alice', type: 'CreateUser' } true true

const safe = createCommand("CreateUser", { type: "DeleteEverything" });
console.log(safe.type);
// CreateUser
```

You can also extend the `Command` / `Query` classes and call `super("CreateUser")`; `MetadataCommand` / `MetadataQuery` add a frozen `metadata` field.

> **Common mistake:** an empty or whitespace-only `type`. `execute` throws `InvalidCommandError` / `InvalidQueryError`; `register` throws `InvalidHandlerTypeError`.

## HANDLERS

A *handler* is the code that runs for one `type`. It receives the request plus an optional [context](#execution-context), and what it returns is what `execute` resolves to. Sync or async both work.

The bus accepts three forms and treats them the same: a plain function, any object with an `execute()` method, or a class extending `CommandHandler` / `QueryHandler`. This example registers a function and a class; both return the user's name.

```ts
import { CommandHandler, createCommandBus, type CommandOf } from "@zudojs/cqrs";

type CreateUser = CommandOf<"CreateUser", { name: string }>;

// 1. A plain function
const fnBus = createCommandBus().register<CreateUser, string>(
  "CreateUser",
  (command) => command.name,
);

// 2. A class
class CreateUserHandler extends CommandHandler<CreateUser, string> {
  readonly commandType = "CreateUser";

  execute(command: CreateUser): string {
    return command.name;
  }
}
const classBus = createCommandBus().register("CreateUser", new CreateUserHandler());

for (const bus of [fnBus, classBus]) {
  console.log(await bus.execute<CreateUser, string>({ type: "CreateUser", name: "Alice" }));
}
// Alice
// Alice
```

`createCommandHandler("CreateUser", fn)` wraps a function in a handler object when you want one without writing a class. Query handlers mirror all of this with `QueryHandler` and `createQueryHandler`.

> **Common mistake:** the bus keys on the string you pass to `register`, not on a class's `commandType` field. If they disagree, `execute` throws `CommandHandlerNotFoundError`.

## BUSES

A *bus* maps `type` to handler and runs each request through a [middleware](#middleware) pipeline. `CommandBus` and `QueryBus` share the same methods. Below: the bookkeeping methods and the two errors you meet first.

```ts
import {
  createCommandBus,
  CommandHandlerNotFoundError,
  DuplicateHandlerError,
} from "@zudojs/cqrs";

const bus = createCommandBus();

bus.register("CreateUser", async () => "created");
bus.registerMany([
  // registerMany entries type their handler result as void
  { commandType: "DeleteUser", handler: async () => {} },
]);
console.log(bus.size(), bus.has("CreateUser"), bus.getCommandTypes());
// 2 true [ 'CreateUser', 'DeleteUser' ]

try {
  bus.register("CreateUser", async () => "again");
} catch (error) {
  console.log(error instanceof DuplicateHandlerError);  // true
}

bus.replace("CreateUser", async () => "created v2");
console.log(await bus.execute({ type: "CreateUser" }));
// created v2

bus.unregister("DeleteUser");
try {
  await bus.execute({ type: "DeleteUser" });
} catch (error) {
  console.log(error instanceof CommandHandlerNotFoundError);  // true
}
```

The factories take `{ middleware, contextFactory }`. `contextFactory` builds a context for any `execute` call that did not pass one.

> **Tip:** `register`, `registerMany`, `replace` and `use` return the bus, so calls chain.

## MIDDLEWARE

*Middleware* is a function that wraps every request on a bus. It gets the request, the context, and a `next` function. Calling `next(request, context)` continues to the next middleware and finally the handler. Code before `next` runs before the handler; code after it runs after.

It exists so you can add behaviour to **all** operations in one place. Handler lookup happens at the end of the pipeline, so middleware also sees "handler not found" errors. This example writes a logging middleware, adds the built-in `timingMiddleware`, and appends one more with `bus.use`.

```ts
import {
  createCommandBus,
  timingMiddleware,
  onErrorMiddleware,
  type CqrsMiddleware,
} from "@zudojs/cqrs";

const logging: CqrsMiddleware = async (request, context, next) => {
  console.log("start", request.type);
  const result = await next(request, context);
  console.log("done", request.type);
  return result;
};

const timing = timingMiddleware({
  onTiming: ({ request, durationMs, succeeded }) =>
    console.log("timed", request.type, succeeded, Math.round(durationMs), "ms"),
});

const bus = createCommandBus({ middleware: [logging, timing] });
bus.use(onErrorMiddleware((request, error) => {
  console.log("failed", request.type, (error as Error).message);
}));
bus.register("Ping", async () => "pong");

console.log(await bus.execute({ type: "Ping" }));
// start Ping
// timed Ping true 0 ms
// done Ping
// pong

await bus.execute({ type: "Missing" }).catch(() => {});
// start Missing
// failed Missing No command handler is registered for "Missing".
// timed Missing false 0 ms
```

Measurements are also kept on the middleware as `timing.lastTiming` and `timing.count`.

### Built-in middleware

Each factory returns a `CqrsMiddleware`. Those taking `options` accept `{ name?, enabled? }`; `enabled: false` makes it a pass-through.

| Name | What it does | Notes |
| --- | --- | --- |
| `timingMiddleware(options?)` | Measures downstream duration. | `onTiming` observer (isolated: its errors never change the outcome; see `onTimingError`), `lastTiming`, `count`. |
| `errorMiddleware(options?)` | Wraps unknown thrown values in `CqrsError`. | `BaseError` instances pass through. |
| `validationMiddleware(options?)` | Throws `CqrsValidationError` for a request with no `type`. | Fails earlier than the bus's own check. |
| `contextMiddleware(options?)` | Adds `metadata.cqrsRequestType` to the context. |  |
| `lockMiddleware(lock, options?)` | Serialises requests sharing a key. | `lock.acquire(key)` returns a release function (sync or async — it is awaited; a rejected release surfaces as a `CqrsError`); default key is `request.type`. |
| `beforeMiddleware(fn)`, `afterMiddleware(fn)`, `onErrorMiddleware(fn)` | Run a callback before, after success, or on failure. | `onError` rethrows after the callback. |
| `commandMiddleware(fn)` / `queryMiddleware(fn)` | Adapt a `CommandMiddleware` / `QueryMiddleware` to the generic shape. |  |
| `composeMiddleware(list)` | Joins several middleware into one. | Used by the buses internally. |

> **Danger:** call `next` at most once. A second call throws `MiddlewareExecutionError`. Not calling it at all silently skips the handler.

## EXECUTION CONTEXT

A *context* is a small frozen object that rides along with a request: who is asking (`userId`, `tenantId`), where it came from (`source`), and ids linking related requests. Pass it as the second argument to `execute`; middleware and the handler receive it.

Helpers like `withUser` return a new context rather than mutating. This example hands one to a handler, then derives a child sharing the parent's correlation id.

```ts
import {
  createCommandBus,
  createExecutionContext,
  createChildExecutionContext,
  withUser,
  sharesCorrelation,
} from "@zudojs/cqrs";

const bus = createCommandBus().register("WhoAmI", (command, context) => {
  return context?.userId ?? "anonymous";
});

const anonymous = createExecutionContext({ source: "http" });
const alice = withUser(anonymous, "user-1");

console.log(await bus.execute({ type: "WhoAmI" }, anonymous));
// anonymous
console.log(await bus.execute({ type: "WhoAmI" }, alice));
// user-1

const child = createChildExecutionContext(alice, { source: "event" });
console.log(child.userId, child.causationId === alice.requestId, sharesCorrelation(alice, child));
// user-1 true true
```

> **In plain words:** `requestId` names this request. `correlationId` names the whole chain that started together. `causationId` names the one request that directly caused this one.

## EVENTS

An *event* records that something already happened ("UserCreated"). A command handler often publishes one so other code can react. This package re-exports the `EventBus` from [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) and adds `createCqrsEvent`, which accepts optional `aggregateId`, `aggregateType` and `version` fields. Below: subscribe to an event type, then publish one event.

```ts
import { createEventBus, createCqrsEvent, isAggregateEvent } from "@zudojs/cqrs";

const events = createEventBus();
events.on("UserCreated", (event) => {
  console.log("heard", event.type, event.payload);
});

const event = createCqrsEvent({
  type: "UserCreated",
  payload: { name: "Alice" },
  aggregateId: "user-1",
  aggregateType: "User",
  version: 1,
});
console.log(isAggregateEvent(event));
// true

await events.publish(event);
// heard UserCreated { name: 'Alice' }
```

`createEvent` and `createEventHandler` are deprecated aliases of `createCqrsEvent` and `createCqrsEventHandler`.

## REGISTRY AND DECORATORS

`HandlerRegistry` is a standalone store with the same duplicate and type checks as the buses. Use it to collect handlers first and wire them into buses later with `getEntries()`.

The decorators `@CommandHandlerFor("Type")`, `@QueryHandlerFor("Type")` and `@CqrsHandler(kind, "Type")` attach a `{ kind, type }` label to a class. They are standard TypeScript 5 decorators; no compiler flag is needed.

```ts
import {
  CommandHandlerFor,
  getCqrsType,
  createHandlerRegistry,
  createCommandBus,
} from "@zudojs/cqrs";

@CommandHandlerFor("CreateUser")
class CreateUserHandler {
  execute(): string {
    return "created";
  }
}

const registry = createHandlerRegistry()
  .registerCommand(getCqrsType(CreateUserHandler)!, new CreateUserHandler());

const bus = createCommandBus();
for (const entry of registry.getEntries()) {
  if (entry.kind === "command") bus.register(entry.type, entry.handler);
}
console.log(bus.getCommandTypes(), await bus.execute({ type: "CreateUser" }));
// [ 'CreateUser' ] created
```

> **Watch out:** neither the registry nor a decorator registers anything on a bus by itself. A decorated class is only a label until you call `bus.register`.

## RESULT VALUES

The buses return the handler's value and throw on failure. Some infrastructure (a job runner, an outbox) prefers to keep a failure as a *value* instead. `createCommandResult` and `createFailedCommandResult` wrap a value with its `status`, `commandType` and `executedAt`. `unwrapCommandResult` turns a result back into a plain value, and throws when the status is `"failure"`.

```ts
import {
  createCommandResult,
  createFailedCommandResult,
  unwrapCommandResult,
  CommandFailedError,
} from "@zudojs/cqrs";

const command = { type: "PlaceOrder" };

const ok = createCommandResult({ orderId: "o-1" }, { command });
console.log(unwrapCommandResult(ok));
// { orderId: 'o-1' }

const failed = createFailedCommandResult({ reason: "out of stock" }, { command });
try {
  unwrapCommandResult(failed);
} catch (error) {
  if (error instanceof CommandFailedError) {
    console.log(error.code, error.commandType, error.failure);
  }
}
// ERR_COMMAND_FAILED PlaceOrder { reason: 'out of stock' }
```

The failure payload is on `error.failure` and on `error.cause`. Queries work the same way: `unwrapQueryResult` throws `QueryFailedError` (code `ERR_QUERY_FAILED`, with `queryType`). Both errors are defined in [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) and re-exported here.

> **Changed in 1.2.0:** before 1.2.0, `unwrapCommandResult` and `unwrapQueryResult` returned the failure payload as if it were the value. Code that checks `isFailedCommandResult` first is unaffected; code that unwrapped a failure now gets an exception.

## ERRORS

Every error extends `CqrsError` (defined in @zudojs/errors and re-exported), which extends `BaseError` from [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md), so each has a `code`, `statusCode` and `metadata`. `isCqrsError(e)` checks for any of them; `toCqrsError(e)` converts an arbitrary thrown value.

| Name | What it does | Notes |
| --- | --- | --- |
| `CqrsError` | Base class. | Status 500. |
| `CqrsValidationError` | Malformed request or configuration. | Status 400. |
| `InvalidCommandError` / `InvalidQueryError` | Request with no usable `type`. | Thrown by `execute`. |
| `CommandHandlerNotFoundError` / `QueryHandlerNotFoundError` | No handler for that `type`. | Carry `commandType` / `queryType`. |
| `DuplicateHandlerError` | `register` called twice for one type. | Status 409. Use `replace`. |
| `InvalidHandlerTypeError`, `InvalidHandlerKindError` | Bad type string; registry kind not `"command"`/`"query"`. |  |
| `HandlerConfigurationError` | Handler is not a function or object with `execute()`. | Also conflicting decorators. |
| `CommandFailedError` / `QueryFailedError` | Thrown by `unwrapCommandResult` / `unwrapQueryResult` for a failed result. | Codes `ERR_COMMAND_FAILED` / `ERR_QUERY_FAILED`, status 500. Payload on `failure` and `cause`. |
| `InvalidMiddlewareError`, `MiddlewareExecutionError` | Middleware is not a function; `next()` called twice. |  |
| `EventHandlerExecutionError`, `EventPublishError` | Error classes for your own event code. | The buses on this page do not throw them. |

## API REFERENCE

All from `"@zudojs/cqrs"`. Query equivalents mirror the command ones with `Query` in the name.

### Functions

| Name | What it does | Notes |
| --- | --- | --- |
| `createCommandBus(options?)` | Creates a bus. | Options: `middleware`, `contextFactory`. |
| `createCommand(type, payload?)` | Frozen request object. | `type` overrides the payload's. |
| `createCommandHandler(type, fn)` | Wraps a function in a handler object. | Returns `FunctionCommandHandler`. |
| `executeCommandHandler(handler, command, context?)` | Runs a handler without a bus. |  |
| `isCommand`, `isQuery`, `isCqrsRequest` | True for an object with a non-empty `type`. | Same check. |
| `isCommandHandler`, `isCommandHandlerLike` | Class instance / anything the bus accepts. | `getCommandType(c)` and `commandType(type)` read or fix a type string. |
| `createExecutionContext(input?)` | Frozen context with a generated `requestId`. | `correlationId` defaults to it. `createChildExecutionContext(parent, overrides?)` makes a child sharing that correlation. |
| `withUser`, `withTenant`, `withSource`, `withContextMetadata` | Copy of a context with one field changed. | Readers: `getUserId`, `getTenantId`, `getRequestId`, `getCorrelationId`, `getCausationId`, `hasUser`, `hasTenant`, `sharesCorrelation`, `serializeExecutionContext`. |
| `createCommandResult(value, { command })` | Wraps a value with `status`, `commandType`, `executedAt`. | Optional; buses do not produce these. Also `createFailedCommandResult`, `isSuccessfulCommandResult`, `isFailedCommandResult`, `unwrapCommandResult` (throws `CommandFailedError` for a failure; see [Result values](#result-values)), `withCommandResultMetadata`. |
| `createCqrsEvent(input)` | Frozen event with aggregate fields. | With `createEventId`, `isCqrsEvent`, `isAggregateEvent`, `getEventType`, `getAggregateId`, `createCqrsEventHandler`. |
| `createEventBus(options?)` | Re-export from `@zudojs/events`. | Also `createStartedEventBus`, `EventBus`, `EventBusState`. |
| `createEventResult(options)` | Summary value for a publish. | `isEventPublished`, `isEventFailed`, `hasEventHandlerFailures`, `getEventErrors`. |
| `createHandlerRegistry()` | Standalone handler store. |  |
| `getCqrsHandlerMetadata`, `getCqrsType`, `isCqrsHandler` | Read a decorator label from a class. | Plus `getCommandHandlerMetadata`, `isDecoratedCommandHandler` and query versions. |
| `isCqrsError(e)`, `toCqrsError(e, message?)` | Detect or convert to `CqrsError`. |  |

### Classes

| Name | What it does | Notes |
| --- | --- | --- |
| `CommandBus` / `QueryBus` | `register`, `registerMany`, `replace`, `unregister`, `has`, `getHandler`, `execute`, `use`, `size`, `clear`, `getCommandTypes` / `getQueryTypes`. | Prefer the factories. |
| `Command` / `Query`, `MetadataCommand` / `MetadataQuery` | Abstract request bases. | Protected constructor; call `super(type)` or `super(type, { metadata })`. |
| `CommandHandler` / `QueryHandler` | Abstract handler base. | Implement `commandType` / `queryType` and `execute`. |
| `FunctionCommandHandler` / `FunctionQueryHandler` | Handler object around a function. | What the factories return. |
| `HandlerRegistry` | `registerCommand`, `registerQuery`, `replace*`, `unregister*`, `has*`, `get*Handler`, `getEntries`, `size`, `clear`. |  |

### Types

| Name | What it does | Notes |
| --- | --- | --- |
| `CommandOf<Type, Payload?>` / `QueryOf` | Request type `{ type } & Payload`. | Payload defaults to empty. |
| `CqrsContext`, `CqrsExecutionContext` | Context shape. | The second adds `source`. |
| `CqrsMiddleware` | `(request, context, next) => Promise<unknown>`. | Also `CommandMiddleware`, `QueryMiddleware`. |
| `CommandHandlerLike` / `QueryHandlerLike` | Function or object with `execute` — what `register` accepts. | Interfaces: `CommandHandlerContract`, `QueryHandlerContract`. |
| `CommandRegistration` / `QueryRegistration` | Entry for `registerMany`. | `{ commandType, handler }`; the handler result is typed `void`, so use `register` for handlers that return a value. |
| `CommandResult`, `QueryResult`, `EventResult`, `CqrsEvent`, `CqrsTiming`, `CqrsLock` | Shapes used by the helpers above. |  |

## COMMON MISTAKES

- **Registering the same type twice** → `DuplicateHandlerError` at startup → use `bus.replace` when you mean to swap.
- **Executing a type nobody registered** (often a typo) → `CommandHandlerNotFoundError` → define type strings once with `CommandOf`; check with `bus.has`.
- **Not returning `next()` in middleware** → the handler never runs, `execute` resolves to `undefined` → always return the value of `next`.
- **Calling `next` twice** (a retry loop inside middleware) → `MiddlewareExecutionError` → retry by calling `bus.execute` again from outside.
- **Expecting a decorator or the registry to register handlers** → the bus is empty → call `bus.register` yourself.
- **Writing data inside a query handler** → nothing breaks, but the read/write split is gone → move the write into a command.

## RELATED

- [@zudojs/events](https://zudojs.oyinlola.site/docs/packages-events.md) — the full event bus this package re-exports; use it when handlers need to announce what happened.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — `BaseError`, codes and status values every `CqrsError` inherits.
- [@zudojs/messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md) — when commands must cross a process boundary.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — a common place to call `bus.execute`: one route, one command or query.

## COMPLETE EXPORT INDEX

Every name `@zudojs/cqrs` exports from its package root at v1.3.0 — **200** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 200 exports**

Classes (26)

`Command` `CommandBus` `CommandFailedError` `CommandHandler` `CommandHandlerContract` `CommandHandlerNotFoundError` `CqrsError` `CqrsValidationError` `DuplicateHandlerError` `EventBus` `EventHandlerExecutionError` `EventPublishError` `FunctionCommandHandler` `FunctionQueryHandler` `HandlerConfigurationError` `HandlerRegistry` `InvalidCommandError` `InvalidHandlerKindError` `InvalidHandlerTypeError` `InvalidMiddlewareError` `InvalidQueryError` `MetadataCommand` `MetadataQuery` `MiddlewareExecutionError` `QueryFailedError` `QueryHandlerNotFoundError`

Functions (98)

`afterMiddleware` `allEventHandlersSucceeded` `beforeMiddleware` `collectDecoratedHandlers` `CommandHandlerFor` `commandMiddleware` `commandType` `composeMiddleware` `contextMiddleware` `CqrsHandler` `createBaseEventId` `createChildExecutionContext` `createCommand` `createCommandBus` `createCommandHandler` `createCommandHandlerDecorator` `createCommandResult` `createCqrsEvent` `createCqrsEventHandler` `createEventBus` `createEventId` `createEventResult` `createExecutionContext` `createFailedCommandResult` `createFailedEventResult` `createFailedQueryResult` `createHandlerRegistry` `createPartialEventResult` `createQuery` `createQueryBus` `createQueryHandler` `createQueryHandlerDecorator` `createQueryResult` `createRequestId` `createStartedEventBus` `createSuccessfulEventResult` `errorMiddleware` `executeCommandHandler` `executeQueryHandler` `getAggregateId` `getCausationId` `getCommandHandlerMetadata` `getCommandType` `getContextMetadata` `getCorrelationId` `getCqrsHandlerMetadata` `getCqrsType` `getEventErrors` `getEventType` `getQueryHandlerMetadata` `getQueryType` `getRequestId` `getTenantId` `getUserId` `hasEventHandlerFailures` `hasTenant` `hasUser` `isAggregateEvent` `isCommand` `isCommandHandler` `isCommandHandlerLike` `isCqrsError` `isCqrsEvent` `isCqrsHandler` `isCqrsRequest` `isDecoratedCommandHandler` `isDecoratedQueryHandler` `isEvent` `isEventFailed` `isEventPartiallyPublished` `isEventPublished` `isFailedCommandResult` `isFailedQueryResult` `isQuery` `isQueryHandler` `isQueryHandlerLike` `isSuccessfulCommandResult` `isSuccessfulQueryResult` `lockMiddleware` `onErrorMiddleware` `QueryHandlerFor` `queryMiddleware` `queryType` `registerDecoratedHandlers` `serializeExecutionContext` `sharesCorrelation` `timingMiddleware` `toCqrsError` `unwrapCommandResult` `unwrapQueryResult` `validationMiddleware` `withCommandResultMetadata` `withContextMetadata` `withEventResultMetadata` `withQueryResultMetadata` `withSource` `withTenant` `withUser`

Interfaces (43)

`CommandBusOptions` `CommandHandlerEntry` `CommandHandlerMetadata` `CommandHandlerRegistration` `CommandOptions` `CommandRegistration` `CommandResult` `CqrsBusOptions` `CqrsContext` `CqrsEventExtensions` `CqrsEventHandlerRegistration` `CqrsExecutionContext` `CqrsHandlerMetadata` `CqrsLock` `CqrsTiming` `CreateCommandResultOptions` `CreateCqrsEventInput` `CreateEventResultOptions` `CreateExecutionContextInput` `CreateQueryResultOptions` `Event` `EventBusEvent` `EventBusOptions` `EventDefinition` `EventInput` `EventPublishResult` `EventResult` `LockMiddlewareOptions` `MiddlewareOptions` `PublishOptions` `Query` `QueryBus` `QueryBusOptions` `QueryHandler` `QueryHandlerContract` `QueryHandlerEntry` `QueryHandlerMetadata` `QueryHandlerRegistration` `QueryOptions` `QueryRegistration` `QueryResult` `TimingMiddleware` `TimingMiddlewareOptions`

Type aliases (29)

`CommandHandlerFunction` `CommandHandlerLike` `CommandMiddleware` `CommandOf` `CommandResultStatus` `CqrsClass` `CqrsEvent` `CqrsEventHandler` `CqrsHandlerKind` `CqrsMiddleware` `CqrsNext` `CqrsPayload` `CqrsRequest` `CqrsRequestType` `DecoratedCqrsClass` `DecoratedHandlerTarget` `EventBusListener` `EventHandler` `EventHandlerRegistration` `EventPayload` `EventResultStatus` `EventType` `HandlerEntry` `HandlerKind` `QueryHandlerFunction` `QueryHandlerLike` `QueryMiddleware` `QueryOf` `QueryResultStatus`

Constants (3)

`createBaseEvent` `createEvent` `createEventHandler`

Enums (1)

`EventBusState`
