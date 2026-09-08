import type {
  Command,
  CommandBus as CommandBusContract,
  CommandHandlerLike,
  CqrsContext,
  CqrsMiddleware,
} from "../cqrsTypes/cqrsTypes.type.js";

import { executeCommandHandler } from "../command/commandHandler.core.js";

import {
  CommandHandlerNotFoundError,
  DuplicateHandlerError,
  InvalidCommandError,
} from "../cqrsErrors/cqrsError.base.js";

import { composeMiddleware } from "../cqrsMiddleware/cqrsMiddleware.core.js";

import {
  assertExecutableHandler,
  assertHandlerType,
  assertMiddleware,
} from "../cqrsValidation/cqrsValidation.core.js";

/**
 * Options for constructing a command bus.
 */
export interface CommandBusOptions {
  readonly middleware?: readonly CqrsMiddleware[];

  /**
   * Creates a default execution context when one is not supplied.
   */
  readonly contextFactory?: () => CqrsContext | Promise<CqrsContext>;
}

/**
 * Registered command handler.
 */
export interface CommandRegistration<
  TCommand extends Command = Command,
  TResult = void,
> {
  readonly commandType: TCommand["type"];

  readonly handler: CommandHandlerLike<TCommand, TResult>;
}

/**
 * Command bus implementation.
 *
 * The command bus runs every command through the registered middleware
 * pipeline. Request validation and handler resolution happen at the end
 * of the pipeline, so middleware observes `InvalidCommandError` and
 * `CommandHandlerNotFoundError` like any other failure and may substitute
 * the command (and therefore the handler) by forwarding a different
 * request to `next()`.
 *
 * All failures are `CqrsError` instances (`isCqrsError(error) === true`).
 */
export class CommandBus implements CommandBusContract {
  private readonly handlers = new Map<string, CommandHandlerLike>();

  private readonly middleware: CqrsMiddleware[];

  private readonly contextFactory?: () => CqrsContext | Promise<CqrsContext>;

  constructor(options: CommandBusOptions = {}) {
    const middleware = [...(options.middleware ?? [])];

    for (const entry of middleware) {
      assertMiddleware("command", entry);
    }

    this.middleware = middleware;

    this.contextFactory = options.contextFactory;
  }

  /**
   * Registers a command handler.
   *
   * @throws InvalidHandlerTypeError when the type is empty or padded with whitespace.
   * @throws HandlerConfigurationError when the handler is not callable.
   * @throws DuplicateHandlerError when a handler already exists for the type.
   */
  public register<TCommand extends Command, TResult = void>(
    commandType: TCommand["type"],
    handler: CommandHandlerLike<TCommand, TResult>,
  ): this {
    assertHandlerType("command", commandType);

    assertExecutableHandler("command", commandType, handler);

    if (this.handlers.has(commandType)) {
      throw new DuplicateHandlerError("command", commandType);
    }

    this.handlers.set(commandType, handler as CommandHandlerLike);

    return this;
  }

  /**
   * Registers multiple command handlers.
   */
  public registerMany(registrations: readonly CommandRegistration[]): this {
    for (const registration of registrations) {
      this.register(registration.commandType, registration.handler);
    }

    return this;
  }

  /**
   * Replaces an existing command handler (or registers a new one).
   */
  public replace<TCommand extends Command, TResult = void>(
    commandType: TCommand["type"],
    handler: CommandHandlerLike<TCommand, TResult>,
  ): this {
    assertHandlerType("command", commandType);

    assertExecutableHandler("command", commandType, handler);

    this.handlers.set(commandType, handler as CommandHandlerLike);

    return this;
  }

  /**
   * Removes a command handler.
   */
  public unregister(commandType: string): boolean {
    return this.handlers.delete(commandType);
  }

  /**
   * Determines whether a command handler is registered.
   */
  public has(commandType: string): boolean {
    return this.handlers.has(commandType);
  }

  /**
   * Returns the registered handler for a command type.
   */
  public getHandler<TCommand extends Command, TResult = void>(
    commandType: TCommand["type"],
  ): CommandHandlerLike<TCommand, TResult> | undefined {
    return this.handlers.get(commandType) as
      CommandHandlerLike<TCommand, TResult> | undefined;
  }

  /**
   * Executes a command through the middleware pipeline.
   *
   * @throws InvalidCommandError when the command delivered to the end of the pipeline is malformed.
   * @throws CommandHandlerNotFoundError when no handler is registered for its type.
   */
  public async execute<TCommand extends Command, TResult = void>(
    command: TCommand,
    context?: CqrsContext,
  ): Promise<TResult> {
    const executionContext = await this.resolveContext(context);

    const pipeline = composeMiddleware(this.middleware);

    const result = await pipeline(
      command,
      executionContext,
      (request, requestContext) => this.dispatch(request, requestContext),
    );

    return result as TResult;
  }

  /**
   * Adds middleware to the end of the pipeline.
   */
  public use(middleware: CqrsMiddleware): this {
    assertMiddleware("command", middleware);

    this.middleware.push(middleware);

    return this;
  }

  /**
   * Returns the number of registered handlers.
   */
  public size(): number {
    return this.handlers.size;
  }

  /**
   * Removes all registered handlers.
   */
  public clear(): void {
    this.handlers.clear();
  }

  /**
   * Returns all registered command types.
   */
  public getCommandTypes(): readonly string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Terminal pipeline step: validates the delivered command, resolves
   * its handler and executes it.
   */
  private async dispatch(
    request: Command | { readonly type: string },
    context?: CqrsContext,
  ): Promise<unknown> {
    this.validateCommand(request);

    const handler = this.handlers.get(request.type);

    if (!handler) {
      throw new CommandHandlerNotFoundError(request.type);
    }

    return executeCommandHandler(handler, request, context);
  }

  /**
   * Resolves the execution context.
   */
  private async resolveContext(context?: CqrsContext): Promise<CqrsContext> {
    if (context) {
      return context;
    }

    if (this.contextFactory) {
      return await this.contextFactory();
    }

    return {};
  }

  /**
   * Validates a command before execution.
   */
  private validateCommand(command: unknown): asserts command is Command {
    if (!command || typeof command !== "object") {
      throw new InvalidCommandError("A valid command is required.");
    }

    const type = (command as { type?: unknown }).type;

    if (typeof type !== "string" || type.trim().length === 0) {
      throw new InvalidCommandError("Command type is required.");
    }
  }
}

/**
 * Creates a command bus.
 */
export function createCommandBus(options: CommandBusOptions = {}): CommandBus {
  return new CommandBus(options);
}
