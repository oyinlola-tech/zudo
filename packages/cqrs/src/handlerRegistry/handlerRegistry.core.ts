import type {
  Command,
  Query,
  CommandHandlerLike,
  QueryHandlerLike,
} from "../cqrsTypes/cqrsTypes.type.js";

import {
  DuplicateHandlerError,
  InvalidHandlerKindError,
} from "../cqrsErrors/cqrsError.base.js";

import {
  assertExecutableHandler,
  assertHandlerType,
} from "../cqrsValidation/cqrsValidation.core.js";

/**
 * Supported handler kinds.
 */
export type HandlerKind = "command" | "query";

/**
 * Registry entry for a command handler.
 */
export interface CommandHandlerEntry<
  TCommand extends Command = Command,
  TResult = void,
> {
  readonly kind: "command";
  readonly type: TCommand["type"];
  readonly handler: CommandHandlerLike<TCommand, TResult>;
}

/**
 * Registry entry for a query handler.
 */
export interface QueryHandlerEntry<
  TQuery extends Query = Query,
  TResult = unknown,
> {
  readonly kind: "query";
  readonly type: TQuery["type"];
  readonly handler: QueryHandlerLike<TQuery, TResult>;
}

/**
 * Union of all CQRS handler registrations.
 */
export type HandlerEntry = CommandHandlerEntry | QueryHandlerEntry;

/**
 * Central registry for CQRS command and query handlers.
 *
 * The registry is intentionally independent from the buses so handlers
 * can be registered during application bootstrap and later consumed by
 * one or more buses.
 *
 * All failures are `CqrsError` instances: `InvalidHandlerTypeError` for
 * malformed types, `HandlerConfigurationError` for non-callable handlers,
 * `DuplicateHandlerError` for repeated registrations and
 * `InvalidHandlerKindError` for kinds other than `"command"`/`"query"`.
 */
export class HandlerRegistry {
  private readonly commandHandlers = new Map<string, CommandHandlerLike>();

  private readonly queryHandlers = new Map<string, QueryHandlerLike>();

  /**
   * Registers a command handler.
   */
  public registerCommand<TCommand extends Command, TResult = void>(
    type: TCommand["type"],
    handler: CommandHandlerLike<TCommand, TResult>,
  ): this {
    this.validateType(type, "command");

    this.validateHandler(handler, "command", type);

    if (this.commandHandlers.has(type)) {
      throw new DuplicateHandlerError("command", type);
    }

    this.commandHandlers.set(type, handler as CommandHandlerLike);

    return this;
  }

  /**
   * Registers a query handler.
   */
  public registerQuery<TQuery extends Query, TResult = unknown>(
    type: TQuery["type"],
    handler: QueryHandlerLike<TQuery, TResult>,
  ): this {
    this.validateType(type, "query");

    this.validateHandler(handler, "query", type);

    if (this.queryHandlers.has(type)) {
      throw new DuplicateHandlerError("query", type);
    }

    this.queryHandlers.set(type, handler as QueryHandlerLike);

    return this;
  }

  /**
   * Registers a generic handler entry.
   */
  public register(entry: HandlerEntry): this {
    if (!entry || typeof entry !== "object") {
      throw new InvalidHandlerKindError(entry);
    }

    if (entry.kind === "command") {
      return this.registerCommand(entry.type, entry.handler);
    }

    if (entry.kind === "query") {
      return this.registerQuery(entry.type, entry.handler);
    }

    throw new InvalidHandlerKindError((entry as { kind?: unknown }).kind);
  }

  /**
   * Registers multiple handlers.
   */
  public registerMany(entries: readonly HandlerEntry[]): this {
    for (const entry of entries) {
      this.register(entry);
    }

    return this;
  }

  /**
   * Replaces a command handler.
   */
  public replaceCommand<TCommand extends Command, TResult = void>(
    type: TCommand["type"],
    handler: CommandHandlerLike<TCommand, TResult>,
  ): this {
    this.validateType(type, "command");

    this.validateHandler(handler, "command", type);

    this.commandHandlers.set(type, handler as CommandHandlerLike);

    return this;
  }

  /**
   * Replaces a query handler.
   */
  public replaceQuery<TQuery extends Query, TResult = unknown>(
    type: TQuery["type"],
    handler: QueryHandlerLike<TQuery, TResult>,
  ): this {
    this.validateType(type, "query");

    this.validateHandler(handler, "query", type);

    this.queryHandlers.set(type, handler as QueryHandlerLike);

    return this;
  }

  /**
   * Removes a command handler.
   */
  public unregisterCommand(type: string): boolean {
    return this.commandHandlers.delete(type);
  }

  /**
   * Removes a query handler.
   */
  public unregisterQuery(type: string): boolean {
    return this.queryHandlers.delete(type);
  }

  /**
   * Removes either a command or query handler.
   */
  public unregister(kind: HandlerKind, type: string): boolean {
    assertHandlerKind(kind);

    return kind === "command"
      ? this.unregisterCommand(type)
      : this.unregisterQuery(type);
  }

  /**
   * Returns a command handler.
   */
  public getCommandHandler<TCommand extends Command, TResult = void>(
    type: TCommand["type"],
  ): CommandHandlerLike<TCommand, TResult> | undefined {
    return this.commandHandlers.get(type) as
      CommandHandlerLike<TCommand, TResult> | undefined;
  }

  /**
   * Returns a query handler.
   */
  public getQueryHandler<TQuery extends Query, TResult = unknown>(
    type: TQuery["type"],
  ): QueryHandlerLike<TQuery, TResult> | undefined {
    return this.queryHandlers.get(type) as
      QueryHandlerLike<TQuery, TResult> | undefined;
  }

  /**
   * Returns whether a command handler exists.
   */
  public hasCommand(type: string): boolean {
    return this.commandHandlers.has(type);
  }

  /**
   * Returns whether a query handler exists.
   */
  public hasQuery(type: string): boolean {
    return this.queryHandlers.has(type);
  }

  /**
   * Returns whether either kind of handler exists.
   */
  public has(kind: HandlerKind, type: string): boolean {
    assertHandlerKind(kind);

    return kind === "command" ? this.hasCommand(type) : this.hasQuery(type);
  }

  /**
   * Returns all registered command types.
   */
  public getCommandTypes(): readonly string[] {
    return [...this.commandHandlers.keys()];
  }

  /**
   * Returns all registered query types.
   */
  public getQueryTypes(): readonly string[] {
    return [...this.queryHandlers.keys()];
  }

  /**
   * Returns all registered handlers.
   */
  public getEntries(): readonly HandlerEntry[] {
    const entries: HandlerEntry[] = [];

    for (const [type, handler] of this.commandHandlers) {
      entries.push({
        kind: "command",
        type,
        handler,
      });
    }

    for (const [type, handler] of this.queryHandlers) {
      entries.push({
        kind: "query",
        type,
        handler,
      });
    }

    return entries;
  }

  /**
   * Returns the number of registered command handlers.
   */
  public commandCount(): number {
    return this.commandHandlers.size;
  }

  /**
   * Returns the number of registered query handlers.
   */
  public queryCount(): number {
    return this.queryHandlers.size;
  }

  /**
   * Returns the total number of handlers.
   */
  public size(): number {
    return this.commandHandlers.size + this.queryHandlers.size;
  }

  /**
   * Clears all handlers.
   */
  public clear(): void {
    this.commandHandlers.clear();
    this.queryHandlers.clear();
  }

  /**
   * Clears only command handlers.
   */
  public clearCommands(): void {
    this.commandHandlers.clear();
  }

  /**
   * Clears only query handlers.
   */
  public clearQueries(): void {
    this.queryHandlers.clear();
  }

  private validateType(type: string, kind: HandlerKind): void {
    assertHandlerType(kind, type);
  }

  private validateHandler(
    handler: unknown,
    kind: HandlerKind,
    type: string,
  ): void {
    assertExecutableHandler(kind, type, handler);
  }
}

/**
 * Asserts that a handler kind is one of the supported values.
 */
function assertHandlerKind(kind: unknown): asserts kind is HandlerKind {
  if (kind !== "command" && kind !== "query") {
    throw new InvalidHandlerKindError(kind);
  }
}

/**
 * Creates a new handler registry.
 */
export function createHandlerRegistry(): HandlerRegistry {
  return new HandlerRegistry();
}
