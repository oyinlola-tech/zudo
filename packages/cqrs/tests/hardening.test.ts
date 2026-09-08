import { describe, it, expect } from "vitest";

import * as root from "../src/index.js";

import {
  // Buses
  createCommandBus,
  createQueryBus,
  CommandBus,
  QueryBus,
  // Handlers
  CommandHandler,
  QueryHandler,
  createQueryHandler,
  isCommandHandler,
  isQueryHandler,
  isCommandHandlerLike,
  isQueryHandlerLike,
  executeCommandHandler,
  executeQueryHandler,
  MetadataCommand,
  MetadataQuery,
  createCommand,
  createQuery,
  // Decorators
  CommandHandlerFor,
  QueryHandlerFor,
  CqrsHandler,
  createCommandHandlerDecorator,
  createQueryHandlerDecorator,
  getCommandHandlerMetadata,
  getQueryHandlerMetadata,
  getCqrsHandlerMetadata,
  getCqrsType,
  isCqrsHandler,
  isDecoratedCommandHandler,
  isDecoratedQueryHandler,
  // Middleware
  timingMiddleware,
  lockMiddleware,
  commandMiddleware,
  queryMiddleware,
  composeMiddleware,
  onErrorMiddleware,
  errorMiddleware,
  validationMiddleware,
  // Registry
  createHandlerRegistry,
  // Context
  createExecutionContext,
  createChildExecutionContext,
  sharesCorrelation,
  // Events
  createCqrsEvent,
  createEventId,
  isAggregateEvent,
  createEventResult,
  createPartialEventResult,
  createFailedEventResult,
  withEventResultMetadata,
  isEventPartiallyPublished,
  isEventFailed,
  // Errors
  CqrsError,
  CqrsValidationError,
  CommandHandlerNotFoundError,
  QueryHandlerNotFoundError,
  DuplicateHandlerError,
  InvalidCommandError,
  InvalidQueryError,
  InvalidHandlerTypeError,
  InvalidHandlerKindError,
  InvalidMiddlewareError,
  MiddlewareExecutionError,
  HandlerConfigurationError,
  isCqrsError,
  toCqrsError,
  type CommandOf,
  type QueryOf,
  type CqrsContext,
  type CommandMiddleware,
  type QueryMiddleware,
} from "../src/index.js";

import { BaseError, ErrorCode } from "@zudojs/errors";

type CreateUser = CommandOf<"CreateUser", { name: string }>;
type GetUser = QueryOf<"GetUser", { id: string }>;

// ============================================================
// Finding: decorators shadowed by class exports
// ============================================================
describe("Decorators reachable from the root barrel", () => {
  it("exports the decorators under non-colliding names", () => {
    expect(typeof root.CommandHandlerFor).toBe("function");
    expect(typeof root.QueryHandlerFor).toBe("function");
    expect(root.CommandHandler).not.toBe(root.CommandHandlerFor);
    expect(root.QueryHandler).not.toBe(root.QueryHandlerFor);
    expect(typeof root.isDecoratedCommandHandler).toBe("function");
    expect(typeof root.isDecoratedQueryHandler).toBe("function");
  });

  it("CommandHandlerFor attaches metadata readable through every reader", () => {
    @CommandHandlerFor("CreateUser")
    class Handler {}

    expect(getCommandHandlerMetadata(Handler)).toEqual({
      kind: "command",
      type: "CreateUser",
    });
    expect(getCqrsHandlerMetadata(Handler)?.type).toBe("CreateUser");
    expect(getCqrsType(Handler)).toBe("CreateUser");
    expect(isCqrsHandler(Handler)).toBe(true);
    expect(isDecoratedCommandHandler(Handler)).toBe(true);
    expect(isDecoratedQueryHandler(Handler)).toBe(false);
    expect(isCommandHandler(Handler)).toBe(false);
  });

  it("QueryHandlerFor attaches query metadata", () => {
    @QueryHandlerFor("GetUser")
    class Handler {}

    expect(getQueryHandlerMetadata(Handler)).toEqual({
      kind: "query",
      type: "GetUser",
    });
    expect(isDecoratedQueryHandler(Handler)).toBe(true);
    expect(isDecoratedCommandHandler(Handler)).toBe(false);
    expect(isQueryHandler(Handler)).toBe(false);
  });

  it("stacking decorators with identical metadata is a no-op", () => {
    @CqrsHandler("command", "A")
    @CommandHandlerFor("A")
    class Handler {}

    expect(getCqrsType(Handler)).toBe("A");
    expect(isDecoratedCommandHandler(Handler)).toBe(true);
  });

  it("re-applying a reusable decorator is a no-op", () => {
    const decorate = createCommandHandlerDecorator("A");

    @decorate
    @decorate
    class Handler {}

    expect(getCqrsType(Handler)).toBe("A");
  });

  it("conflicting decorators throw HandlerConfigurationError", () => {
    const first = createCommandHandlerDecorator("A");
    const second = createQueryHandlerDecorator("B");

    expect(() => {
      @first
      @second
      class Handler {}

      return Handler;
    }).toThrow(HandlerConfigurationError);
  });

  it("decorators reject invalid types", () => {
    expect(() => CommandHandlerFor("")).toThrow(InvalidHandlerTypeError);
    expect(() => QueryHandlerFor(" A ")).toThrow(InvalidHandlerTypeError);
  });
});

// ============================================================
// Finding: object handlers accepted at registration but fail at execution
// ============================================================
describe("Object-form handlers", () => {
  it("executes a plain object with execute()", async () => {
    const bus = createCommandBus();
    bus.register("A", { execute: async () => "ok" });

    await expect(bus.execute({ type: "A" })).resolves.toBe("ok");
  });

  it("query bus executes a plain object with execute()", async () => {
    const bus = createQueryBus();
    bus.register("Q", { execute: () => 42 });

    await expect(bus.execute({ type: "Q" })).resolves.toBe(42);
  });

  it("executeCommandHandler / executeQueryHandler accept object handlers", async () => {
    await expect(
      executeCommandHandler({ execute: () => "c" }, { type: "A" }),
    ).resolves.toBe("c");
    await expect(
      executeQueryHandler({ execute: () => "q" }, { type: "A" }),
    ).resolves.toBe("q");
  });

  it("is*HandlerLike accept object handlers and reject others", () => {
    expect(isCommandHandlerLike({ execute() {} })).toBe(true);
    expect(isQueryHandlerLike({ execute() {} })).toBe(true);
    expect(isCommandHandlerLike({})).toBe(false);
    expect(isQueryHandlerLike({ execute: 1 })).toBe(false);
  });

  it("rejects non-executable handlers at registration", () => {
    const bus = createCommandBus();
    expect(() => bus.register("A", {} as never)).toThrow(
      HandlerConfigurationError,
    );

    const registry = createHandlerRegistry();
    expect(() => registry.registerCommand("A", {} as never)).toThrow(
      HandlerConfigurationError,
    );
    expect(() => registry.registerQuery("A", null as never)).toThrow(
      HandlerConfigurationError,
    );
  });

  it("class handlers still work", async () => {
    class Handler extends CommandHandler<CreateUser, string> {
      readonly commandType = "CreateUser";

      execute(command: CreateUser): string {
        return command.name;
      }
    }

    class Finder extends QueryHandler<GetUser, string> {
      readonly queryType = "GetUser";

      execute(query: GetUser): string {
        return query.id;
      }
    }

    const commands = createCommandBus().register("CreateUser", new Handler());
    const queries = createQueryBus().register("GetUser", new Finder());

    await expect(
      commands.execute<CreateUser, string>({ type: "CreateUser", name: "A" }),
    ).resolves.toBe("A");
    await expect(
      queries.execute<GetUser, string>({ type: "GetUser", id: "1" }),
    ).resolves.toBe("1");
  });
});

// ============================================================
// Finding: timingMiddleware discards the measurement
// ============================================================
describe("timingMiddleware", () => {
  it("reports the measurement through onTiming", async () => {
    let tick = 0;
    const timings: root.CqrsTiming[] = [];

    const mw = timingMiddleware({
      name: "t",
      now: () => (tick += 7),
      onTiming: (timing) => {
        timings.push(timing);
      },
    });

    const bus = createCommandBus({ middleware: [mw] });
    bus.register("A", async () => "done");

    await expect(bus.execute({ type: "A" })).resolves.toBe("done");

    expect(timings).toHaveLength(1);
    expect(timings[0]?.name).toBe("t");
    expect(timings[0]?.durationMs).toBe(7);
    expect(timings[0]?.succeeded).toBe(true);
    expect(timings[0]?.request.type).toBe("A");
    expect(mw.lastTiming).toBe(timings[0]);
    expect(mw.count).toBe(1);
  });

  it("reports failures with the error", async () => {
    const mw = timingMiddleware();
    const bus = createCommandBus({ middleware: [mw] });

    await expect(bus.execute({ type: "Missing" })).rejects.toBeInstanceOf(
      CommandHandlerNotFoundError,
    );

    expect(mw.lastTiming?.succeeded).toBe(false);
    expect(mw.lastTiming?.error).toBeInstanceOf(CommandHandlerNotFoundError);
    expect(mw.lastTiming?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("is a pass-through when disabled", async () => {
    const mw = timingMiddleware({ enabled: false });
    await expect(mw({ type: "A" }, undefined, async () => 1)).resolves.toBe(1);
    expect(mw.count).toBe(0);
    expect(mw.lastTiming).toBeUndefined();
  });

  it("validates its options", () => {
    expect(() => timingMiddleware({ onTiming: 1 as never })).toThrow(
      InvalidMiddlewareError,
    );
    expect(() => timingMiddleware({ now: "x" as never })).toThrow(
      InvalidMiddlewareError,
    );
  });
});

// ============================================================
// Finding: dedicated CQRS error classes never thrown
// ============================================================
describe("Buses throw dedicated CQRS errors", () => {
  it("missing command handler", async () => {
    const bus = createCommandBus();
    const error = await bus.execute({ type: "Nope" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CommandHandlerNotFoundError);
    expect(isCqrsError(error)).toBe(true);
    expect((error as CommandHandlerNotFoundError).commandType).toBe("Nope");
    expect((error as CqrsError).code).toBe(ErrorCode.COMMAND_HANDLER_NOT_FOUND);
  });

  it("missing query handler", async () => {
    const bus = createQueryBus();
    const error = await bus.execute({ type: "Nope" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueryHandlerNotFoundError);
    expect((error as QueryHandlerNotFoundError).queryType).toBe("Nope");
    expect((error as CqrsError).code).toBe(ErrorCode.QUERY_HANDLER_NOT_FOUND);
  });

  it("duplicate registration", () => {
    const bus = createCommandBus().register("A", () => {});
    let error: unknown;

    try {
      bus.register("A", () => {});
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(DuplicateHandlerError);
    expect((error as CqrsError).statusCode).toBe(409);
    expect((error as CqrsError).code).toBe(ErrorCode.CONFLICT);

    expect(() => createQueryBus().register("Q", () => 1).register("Q", () => 2)).toThrow(
      DuplicateHandlerError,
    );

    const registry = createHandlerRegistry().registerCommand("A", () => {});
    expect(() => registry.registerCommand("A", () => {})).toThrow(
      DuplicateHandlerError,
    );
  });

  it("invalid requests", async () => {
    const commands = createCommandBus();
    const queries = createQueryBus();

    const commandError = await commands
      .execute({ type: "" })
      .catch((e: unknown) => e);
    const queryError = await queries
      .execute(null as never)
      .catch((e: unknown) => e);

    expect(commandError).toBeInstanceOf(InvalidCommandError);
    expect(commandError).toBeInstanceOf(CqrsValidationError);
    expect((commandError as CqrsError).code).toBe(ErrorCode.INVALID_COMMAND);
    expect(queryError).toBeInstanceOf(InvalidQueryError);
    expect((queryError as CqrsError).code).toBe(ErrorCode.INVALID_QUERY);
  });

  it("invalid middleware", () => {
    expect(() => createCommandBus({ middleware: [1 as never] })).toThrow(
      InvalidMiddlewareError,
    );
    expect(() => createQueryBus().use("x" as never)).toThrow(
      InvalidMiddlewareError,
    );
  });
});

// ============================================================
// Finding: no double-next guard in the bus pipeline
// ============================================================
describe("Double next() guard", () => {
  it("command bus rejects a middleware calling next twice", async () => {
    let runs = 0;
    const bus = createCommandBus({
      middleware: [
        async (request, context, next) => {
          await next(request, context);
          return next(request, context);
        },
      ],
    });
    bus.register("A", () => {
      runs += 1;
    });

    await expect(bus.execute({ type: "A" })).rejects.toBeInstanceOf(
      MiddlewareExecutionError,
    );
    expect(runs).toBe(1);
  });

  it("query bus rejects a middleware calling next twice", async () => {
    const bus = createQueryBus({
      middleware: [
        async (request, context, next) => {
          await next(request, context);
          return next(request, context);
        },
      ],
    });
    bus.register("Q", () => 1);

    await expect(bus.execute({ type: "Q" })).rejects.toBeInstanceOf(
      MiddlewareExecutionError,
    );
  });

  it("composeMiddleware shares the same rule", async () => {
    const composed = composeMiddleware([
      async (request, context, next) => {
        await next(request, context);
        return next(request, context);
      },
    ]);

    await expect(
      composed({ type: "A" }, undefined, async () => 1),
    ).rejects.toBeInstanceOf(MiddlewareExecutionError);
  });
});

// ============================================================
// Finding: validation / resolution happen before the pipeline
// ============================================================
describe("Handler resolution inside the pipeline", () => {
  it("onErrorMiddleware observes handler-not-found errors", async () => {
    const seen: unknown[] = [];
    const bus = createCommandBus({
      middleware: [
        onErrorMiddleware((_request, error) => {
          seen.push(error);
        }),
      ],
    });

    await expect(bus.execute({ type: "Missing" })).rejects.toBeInstanceOf(
      CommandHandlerNotFoundError,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(CommandHandlerNotFoundError);
  });

  it("validationMiddleware is reachable for invalid requests", async () => {
    const bus = createQueryBus({ middleware: [validationMiddleware()] });

    const error = await bus.execute({ type: "" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CqrsValidationError);
    expect(error).not.toBeInstanceOf(InvalidQueryError);
  });

  it("a middleware forwarding a different request reaches that request's handler", async () => {
    const calls: string[] = [];
    const bus = createCommandBus({
      middleware: [
        async (_request, context, next) => next({ type: "B" }, context),
      ],
    });
    bus.register("A", (command) => {
      calls.push(`A:${command.type}`);
    });
    bus.register("B", (command) => {
      calls.push(`B:${command.type}`);
    });

    await bus.execute({ type: "A" });
    expect(calls).toEqual(["B:B"]);
  });

  it("errorMiddleware passes CQRS errors through and wraps others", async () => {
    const bus = createCommandBus({ middleware: [errorMiddleware()] });
    bus.register("Boom", () => {
      throw new Error("boom");
    });

    const wrapped = await bus.execute({ type: "Boom" }).catch((e: unknown) => e);
    expect(wrapped).toBeInstanceOf(CqrsError);
    expect((wrapped as CqrsError).cause).toBeInstanceOf(Error);

    await expect(bus.execute({ type: "Missing" })).rejects.toBeInstanceOf(
      CommandHandlerNotFoundError,
    );
  });
});

// ============================================================
// Finding: branded ids in CreateCqrsEventInput
// ============================================================
describe("createCqrsEvent identifiers", () => {
  it("accepts createEventId() and context ids without casts", () => {
    const context = createExecutionContext();

    const event = createCqrsEvent({
      type: "user.created",
      payload: { id: "1" },
      id: createEventId(),
      correlationId: context.correlationId,
      causationId: context.requestId,
      aggregateId: "user-1",
      aggregateType: "User",
      version: 3,
    });

    expect(event.correlationId).toBe(context.correlationId);
    expect(event.causationId).toBe(context.requestId);
    expect(event.aggregateId).toBe("user-1");
    expect(event.aggregateType).toBe("User");
    expect(event.version).toBe(3);
    expect(isAggregateEvent(event)).toBe(true);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("isAggregateEvent is false without aggregate fields", () => {
    const event = createCqrsEvent({ type: "x", payload: {} });
    expect(isAggregateEvent(event)).toBe(false);
  });
});

// ============================================================
// Finding: README example must compile
// ============================================================
describe("README Quick Start", () => {
  it("compiles and runs with explicit generics", async () => {
    interface User {
      id: string;
      name: string;
    }

    const users = new Map<string, User>();
    const userRepository = {
      create: async (input: { name: string }): Promise<User> => {
        const user = { id: String(users.size + 1), name: input.name };
        users.set(user.id, user);
        return user;
      },
      findById: async (id: string): Promise<User | undefined> => users.get(id),
    };

    const commandBus = createCommandBus();
    const queryBus = createQueryBus();

    commandBus.register<CreateUser, User>("CreateUser", async (command) => {
      return userRepository.create({ name: command.name });
    });

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

    expect(user.name).toBe("Alice");
    expect(found).toEqual(user);
  });
});

// ============================================================
// Finding: child contexts without correlation
// ============================================================
describe("Execution context correlation", () => {
  it("root contexts start a correlation chain", () => {
    const root = createExecutionContext();
    expect(root.correlationId).toBe(root.requestId);
  });

  it("children share correlation with an uncorrelated parent", () => {
    const parent = createExecutionContext();
    const child = createChildExecutionContext(parent);

    expect(sharesCorrelation(parent, child)).toBe(true);
    expect(child.causationId).toBe(parent.requestId);
    expect(child.metadata).toBeUndefined();
  });

  it("hand-built parents without correlation use their requestId", () => {
    const child = createChildExecutionContext({ requestId: "r1" });
    expect(child.correlationId).toBe("r1");
  });

  it("metadata is only set when supplied", () => {
    const parent = createExecutionContext({ metadata: { a: 1 } });
    const child = createChildExecutionContext(parent, { metadata: { b: 2 } });

    expect(child.metadata).toEqual({ a: 1, b: 2 });
    expect(Object.isFrozen(child.metadata)).toBe(true);
  });
});

// ============================================================
// Low findings
// ============================================================
describe("createCommand / createQuery discriminator", () => {
  it("payload cannot override type", () => {
    const command = createCommand("A", { type: "B", x: 1 });
    const query = createQuery("A", { type: "B" });

    expect(command.type).toBe("A");
    expect(command.x).toBe(1);
    expect(query.type).toBe("A");
  });

  it("CommandOf / QueryOf without a payload are satisfiable", async () => {
    // Type-level: the default payload must not add an index signature that
    // makes `type` uninhabitable. These assignments fail to compile otherwise.
    const ping: CommandOf<"Ping"> = { type: "Ping" };
    const stats: QueryOf<"Stats"> = { type: "Stats" };
    const fromFactory: CommandOf<"Ping"> = createCommand("Ping");
    const rerouted: CommandOf<"Ping", { type: "Other"; n: number }> = {
      type: "Ping",
      n: 1,
    };

    const bus = createCommandBus().register<CommandOf<"Ping">, string>(
      "Ping",
      (command) => `pong:${command.type}`,
    );

    await expect(bus.execute<CommandOf<"Ping">, string>(ping)).resolves.toBe(
      "pong:Ping",
    );
    expect(fromFactory.type).toBe("Ping");
    expect(stats.type).toBe("Stats");
    expect(rerouted.n).toBe(1);
  });
});

describe("Registration keys", () => {
  it("rejects whitespace-padded types on buses and the registry", () => {
    expect(() => createCommandBus().register(" A ", () => {})).toThrow(
      InvalidHandlerTypeError,
    );
    expect(() => createQueryBus().register("A ", () => 1)).toThrow(
      InvalidHandlerTypeError,
    );
    expect(() => createHandlerRegistry().registerQuery(" A", () => 1)).toThrow(
      InvalidHandlerTypeError,
    );
    expect(() => createCommandBus().register("", () => {})).toThrow(
      InvalidHandlerTypeError,
    );
  });
});

describe("HandlerRegistry kinds", () => {
  it("rejects unknown kinds", () => {
    const registry = createHandlerRegistry();

    expect(() =>
      registry.register({ kind: "bogus", type: "X", handler: () => {} } as never),
    ).toThrow(InvalidHandlerKindError);
    expect(() => registry.unregister("bogus" as never, "X")).toThrow(
      InvalidHandlerKindError,
    );
    expect(() => registry.has("bogus" as never, "X")).toThrow(
      InvalidHandlerKindError,
    );
    expect(() => registry.register(null as never)).toThrow(
      InvalidHandlerKindError,
    );
  });

  it("registerMany registers every entry", () => {
    const registry = createHandlerRegistry().registerMany([
      { kind: "command", type: "A", handler: () => {} },
      { kind: "query", type: "B", handler: () => 1 },
    ]);

    expect(registry.hasCommand("A")).toBe(true);
    expect(registry.hasQuery("B")).toBe(true);
    expect(registry.size()).toBe(2);
  });

  it("bus registerMany registers every entry", async () => {
    const commands = createCommandBus().registerMany([
      { commandType: "A", handler: () => {} },
      { commandType: "B", handler: { execute: () => {} } },
    ] as const);
    const queries = createQueryBus().registerMany([
      { queryType: "Q", handler: () => "q" },
    ]);

    await expect(commands.execute({ type: "B" })).resolves.toBeUndefined();
    expect(commands.has("A")).toBe(true);
    await expect(queries.execute({ type: "Q" })).resolves.toBe("q");
  });
});

describe("Metadata commands and queries", () => {
  it("copy and freeze caller metadata", () => {
    class Cmd extends MetadataCommand<"A"> {
      constructor(metadata: Record<string, unknown>) {
        super("A", { metadata });
      }
    }

    class Qry extends MetadataQuery<"B"> {
      constructor(metadata: Record<string, unknown>) {
        super("B", { metadata });
      }
    }

    const source = { a: 1 };
    const command = new Cmd(source);
    const query = new Qry(source);
    source.a = 2;

    expect(command.metadata?.a).toBe(1);
    expect(query.metadata?.a).toBe(1);
    expect(Object.isFrozen(command.metadata)).toBe(true);
    expect(Object.isFrozen(query.metadata)).toBe(true);
  });
});

describe("CqrsError defaults and toCqrsError", () => {
  it("defaults survive explicit undefined options", () => {
    const error = new CqrsError("x", { code: undefined, statusCode: undefined });

    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.statusCode).toBe(500);
  });

  it("preserves BaseError code/status/expose", () => {
    const original = new BaseError("nf", {
      code: ErrorCode.NOT_FOUND,
      statusCode: 404,
      expose: true,
    });

    const converted = toCqrsError(original);

    expect(converted).toBeInstanceOf(CqrsError);
    expect(converted.code).toBe(ErrorCode.NOT_FOUND);
    expect(converted.statusCode).toBe(404);
    expect(converted.expose).toBe(true);
    expect(converted.cause).toBe(original);
  });

  it("uses the supplied message for non-Error values", () => {
    const converted = toCqrsError("nope", "fallback");
    expect(converted.message).toBe("fallback");
    expect(converted.isOperational).toBe(false);
  });
});

describe("lockMiddleware", () => {
  it("serialises requests sharing a key and releases the lock", async () => {
    const order: string[] = [];
    let held = false;

    const lock = {
      acquire: async (key: string) => {
        while (held) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        held = true;
        order.push(`acquire:${key}`);
        return () => {
          held = false;
          order.push(`release:${key}`);
        };
      },
    };

    const bus = createCommandBus({ middleware: [lockMiddleware(lock)] });
    bus.register("A", async () => {
      order.push("run");
      await new Promise((resolve) => setTimeout(resolve, 2));
    });

    await Promise.all([bus.execute({ type: "A" }), bus.execute({ type: "A" })]);

    expect(order).toEqual([
      "acquire:A",
      "run",
      "release:A",
      "acquire:A",
      "run",
      "release:A",
    ]);
  });

  it("uses a custom key selector", async () => {
    const keys: string[] = [];
    const lock = {
      acquire: (key: string) => {
        keys.push(key);
        return () => {};
      },
    };

    const mw = lockMiddleware(lock, {
      key: (request) => `${request.type}:1`,
    });

    await mw({ type: "A" }, undefined, async () => 1);
    expect(keys).toEqual(["A:1"]);
  });

  it("rejects an acquire() that does not resolve to a release function", async () => {
    const mw = lockMiddleware({ acquire: async () => undefined as never });

    await expect(mw({ type: "A" }, undefined, async () => 1)).rejects.toBeInstanceOf(
      InvalidMiddlewareError,
    );
  });

  it("validates the lock implementation", () => {
    expect(() => lockMiddleware({} as never)).toThrow(InvalidMiddlewareError);
    expect(() =>
      lockMiddleware({ acquire: () => () => {} }, { key: 1 as never }),
    ).toThrow(InvalidMiddlewareError);
  });
});

describe("Middleware adapters", () => {
  it("commandMiddleware adapts command-specific middleware", async () => {
    const seen: string[] = [];
    const specific: CommandMiddleware = async (command, context, next) => {
      seen.push(command.type);
      return next(command, context);
    };

    const bus = createCommandBus({ middleware: [commandMiddleware(specific)] });
    bus.register("A", () => "a");

    await expect(bus.execute({ type: "A" })).resolves.toBe("a");
    expect(seen).toEqual(["A"]);
  });

  it("queryMiddleware adapts query-specific middleware", async () => {
    const seen: string[] = [];
    const specific: QueryMiddleware = async (query, context, next) => {
      seen.push(query.type);
      return next(query, context);
    };

    const bus = createQueryBus({ middleware: [queryMiddleware(specific)] });
    bus.register("Q", () => "q");

    await expect(bus.execute({ type: "Q" })).resolves.toBe("q");
    expect(seen).toEqual(["Q"]);
  });
});

describe("contextFactory", () => {
  it("is awaited and used only when no context is supplied", async () => {
    let created = 0;
    const factory = async (): Promise<CqrsContext> => {
      created += 1;
      return { requestId: "generated" };
    };

    const received: (CqrsContext | undefined)[] = [];
    const bus = new CommandBus({ contextFactory: factory });
    bus.register("A", (_command, context) => {
      received.push(context);
    });

    await bus.execute({ type: "A" });
    await bus.execute({ type: "A" }, { requestId: "explicit" });

    expect(created).toBe(1);
    expect(received[0]?.requestId).toBe("generated");
    expect(received[1]?.requestId).toBe("explicit");

    const queries = new QueryBus({ contextFactory: factory });
    queries.register("Q", (_query, context) => context?.requestId);
    await expect(queries.execute({ type: "Q" })).resolves.toBe("generated");
  });
});

describe("Event result helpers", () => {
  const event = createCqrsEvent({ type: "x", payload: {} });

  it("createPartialEventResult and createFailedEventResult", () => {
    const partial = createPartialEventResult(event, 3, 2, 1, {
      errors: [new Error("a")],
    });
    const failed = createFailedEventResult(event, 2, [new Error("a")]);

    expect(partial.status).toBe("partial");
    expect(isEventPartiallyPublished(partial)).toBe(true);
    expect(partial.errors).toHaveLength(1);
    expect(failed.status).toBe("failed");
    expect(isEventFailed(failed)).toBe(true);
    expect(failed.successfulHandlers).toBe(0);
    expect(failed.failedHandlers).toBe(2);
  });

  it("withEventResultMetadata returns a new frozen result", () => {
    const result = createEventResult({
      event,
      handlerCount: 1,
      successfulHandlers: 1,
    });
    const enriched = withEventResultMetadata(result, { a: 1 });

    expect(enriched).not.toBe(result);
    expect(enriched.metadata?.a).toBe(1);
    expect(Object.isFrozen(enriched)).toBe(true);
    expect(result.metadata?.a).toBeUndefined();
  });
});

describe("Root barrel hygiene", () => {
  it("does not depend on @zudojs/messaging", async () => {
    const pkg = (await import("../package.json", { with: { type: "json" } })) as {
      default: { dependencies: Record<string, string>; files: string[] };
    };

    expect(pkg.default.dependencies["@zudojs/messaging"]).toBeUndefined();
    expect(pkg.default.files).toContain("!dist/**/*.map");
  });
});
