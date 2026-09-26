# @zudojs/cqrs

Command Query Responsibility Segregation (CQRS) primitives for separating read and write operations.

<!-- zudo-docs:start -->

**Documentation:** [zudojs.oyinlola.site/docs/packages-cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs) · **For AI agents:** [Markdown version](https://zudojs.oyinlola.site/docs/packages-cqrs.md), [llms.txt](https://zudojs.oyinlola.site/llms.txt)

<!-- zudo-docs:end -->

## Installation

```bash
npm install @zudojs/cqrs
```

## Quick Start

Commands and queries are plain objects with a `type` discriminator. Give the
bus explicit generics (or a typed handler) so the payload and result types
flow through `register` and `execute`.

```typescript
import {
  createCommandBus,
  createQueryBus,
  createQueryHandler,
  type CommandOf,
  type QueryOf,
} from "@zudojs/cqrs";

interface User {
  id: string;
  name: string;
}

type CreateUser = CommandOf<"CreateUser", { name: string }>;
type GetUser = QueryOf<"GetUser", { id: string }>;

const commandBus = createCommandBus();
const queryBus = createQueryBus();

// Function handler with explicit generics
commandBus.register<CreateUser, User>("CreateUser", async (command) => {
  return userRepository.create({ name: command.name });
});

// Typed handler object created with a factory
queryBus.register(
  "GetUser",
  createQueryHandler<GetUser, User | undefined>("GetUser", async (query) =>
    userRepository.findById(query.id),
  ),
);

const user = await commandBus.execute<CreateUser, User>({
  type: "CreateUser",
  name: "Alice",
});

const found = await queryBus.execute<GetUser, User | undefined>({
  type: "GetUser",
  id: user.id,
});
```

Class-based handlers extend `CommandHandler` / `QueryHandler`; any object with an
`execute()` method is accepted as well.

The result type argument on `execute` (`User` above) is a claim the bus cannot
check: handlers are resolved by the command's `type` string at run time, so
`execute<CreateUser, string>` compiles whatever the handler returns, and with no
type arguments the result is `void`. Keep the claim beside the handler's declared
result type, or wrap the bus in a typed facade for your command set.

```typescript
import { CommandHandler, createCommandBus } from "@zudojs/cqrs";

class CreateUserHandler extends CommandHandler<CreateUser, User> {
  readonly commandType = "CreateUser";

  async execute(command: CreateUser): Promise<User> {
    return userRepository.create({ name: command.name });
  }
}

createCommandBus().register("CreateUser", new CreateUserHandler());
```

## Middleware

```typescript
import {
  createCommandBus,
  timingMiddleware,
  errorMiddleware,
  isCqrsError,
} from "@zudojs/cqrs";

const timing = timingMiddleware({
  onTiming: ({ request, durationMs }) =>
    console.log(`${request.type} took ${durationMs.toFixed(1)}ms`),
});

const bus = createCommandBus({ middleware: [timing, errorMiddleware()] });

try {
  await bus.execute({ type: "Unknown" });
} catch (error) {
  isCqrsError(error); // true — CommandHandlerNotFoundError
}
```

Validation and handler resolution run at the end of the middleware pipeline,
so middleware observes `InvalidCommandError` / `CommandHandlerNotFoundError`
like any other failure. Each middleware may call `next()` at most once.

`onTiming` is an observer: if it throws, the command or query still
succeeds (or fails with its own error). Pass `onTimingError` to see those
observer failures.

## Result values

`createCommandResult` / `createFailedCommandResult` (and the `Query`
equivalents) wrap a value with its status and execution metadata, for
infrastructure that represents failures as values. `unwrapCommandResult`
returns the value of a successful result and **throws** for a failed one:
`CommandFailedError` (or `QueryFailedError` from `unwrapQueryResult`), with the
failure payload on `error.failure` and `error.cause`. Both errors are defined in
`@zudojs/errors` and re-exported here. Before 1.2 the failure payload was
returned as if it were the value.

```typescript
import { unwrapCommandResult, CommandFailedError } from "@zudojs/cqrs";

try {
  const order = unwrapCommandResult(result);
} catch (error) {
  if (error instanceof CommandFailedError) console.error(error.failure);
}
```

## Features

- Command bus for write operations
- Query bus for read operations
- Middleware pipeline for both (timing, error normalisation, validation, locking, context enrichment)
- Function, object and class-based handlers
- Class decorators (`CommandHandlerFor`, `QueryHandlerFor`, `CqrsHandler`) that mark handler classes; the buses never read the mark, so register decorated instances with `registerDecoratedHandlers(bus, [new Handler()])` or read them with `collectDecoratedHandlers`
- Dedicated error classes (`isCqrsError`)
- Result types for explicit returns
- Execution contexts with correlation chains

## Use Cases

- Complex domain logic
- Event-sourced systems
- Read/write model separation
- Audit trails and logging
