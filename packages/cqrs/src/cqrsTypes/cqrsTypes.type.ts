/**
 * Core CQRS types.
 *
 * The CQRS package intentionally keeps commands and queries separate.
 * Commands represent state-changing operations, while queries represent
 * read-only operations.
 */

/**
 * Base contract for every command.
 */
export interface Command<TType extends string = string> {
  readonly type: TType;
}

/**
 * Base contract for every query.
 */
export interface Query<TType extends string = string> {
  readonly type: TType;
}

/**
 * Context available during command or query execution.
 */
export interface CqrsContext {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Generic command handler contract.
 *
 * Any object exposing an `execute` method satisfies this contract; the
 * abstract `CommandHandler` class in `command/` is one implementation.
 */
export interface CommandHandler<
  TCommand extends Command = Command,
  TResult = void,
> {
  execute(command: TCommand, context?: CqrsContext): Promise<TResult> | TResult;
}

/**
 * Generic query handler contract.
 *
 * Any object exposing an `execute` method satisfies this contract; the
 * abstract `QueryHandler` class in `query/` is one implementation.
 */
export interface QueryHandler<TQuery extends Query = Query, TResult = unknown> {
  execute(query: TQuery, context?: CqrsContext): Promise<TResult> | TResult;
}

/**
 * Function-based command handler.
 */
export type CommandHandlerFunction<
  TCommand extends Command = Command,
  TResult = void,
> = (command: TCommand, context?: CqrsContext) => TResult | Promise<TResult>;

/**
 * Function-based query handler.
 */
export type QueryHandlerFunction<
  TQuery extends Query = Query,
  TResult = unknown,
> = (query: TQuery, context?: CqrsContext) => TResult | Promise<TResult>;

/**
 * Union of supported command handler implementations.
 */
export type CommandHandlerLike<
  TCommand extends Command = Command,
  TResult = void,
> =
  CommandHandler<TCommand, TResult> | CommandHandlerFunction<TCommand, TResult>;

/**
 * Union of supported query handler implementations.
 */
export type QueryHandlerLike<TQuery extends Query = Query, TResult = unknown> =
  QueryHandler<TQuery, TResult> | QueryHandlerFunction<TQuery, TResult>;

/**
 * Middleware surrounding command execution.
 */
export type CommandMiddleware = <
  TCommand extends Command = Command,
  TResult = void,
>(
  command: TCommand,
  context: CqrsContext | undefined,
  next: (command: TCommand, context?: CqrsContext) => Promise<TResult>,
) => Promise<TResult>;

/**
 * Middleware surrounding query execution.
 */
export type QueryMiddleware = <TQuery extends Query = Query, TResult = unknown>(
  query: TQuery,
  context: CqrsContext | undefined,
  next: (query: TQuery, context?: CqrsContext) => Promise<TResult>,
) => Promise<TResult>;

/**
 * Generic middleware usable by both command and query pipelines.
 */
export type CqrsMiddleware = (
  request: Command | Query,
  context: CqrsContext | undefined,
  next: (request: Command | Query, context?: CqrsContext) => Promise<unknown>,
) => Promise<unknown>;

/**
 * Identifies whether a request is a command or query.
 */
export type CqrsRequest = Command | Query;

/**
 * Result of resolving a command handler.
 */
export interface CommandHandlerRegistration<
  TCommand extends Command = Command,
  TResult = void,
> {
  readonly commandType: TCommand["type"];
  readonly handler: CommandHandlerLike<TCommand, TResult>;
}

/**
 * Result of resolving a query handler.
 */
export interface QueryHandlerRegistration<
  TQuery extends Query = Query,
  TResult = unknown,
> {
  readonly queryType: TQuery["type"];
  readonly handler: QueryHandlerLike<TQuery, TResult>;
}

/**
 * Configuration shared by CQRS buses.
 */
export interface CqrsBusOptions {
  readonly middleware?: readonly CqrsMiddleware[];
  readonly contextFactory?: () => CqrsContext | Promise<CqrsContext>;
}

/**
 * Command bus contract.
 */
export interface CommandBus {
  execute<TCommand extends Command, TResult = void>(
    command: TCommand,
    context?: CqrsContext,
  ): Promise<TResult>;
}

/**
 * Query bus contract.
 */
export interface QueryBus {
  execute<TQuery extends Query, TResult = unknown>(
    query: TQuery,
    context?: CqrsContext,
  ): Promise<TResult>;
}

/**
 * Converts a command type into a strongly typed command definition.
 *
 * The payload defaults to an empty object (`Record<never, never>`), so
 * `CommandOf<"Ping">` is satisfied by `{ type: "Ping" }`. A `type` key in
 * the payload is dropped: the discriminator always wins, mirroring
 * `createCommand`.
 */
export type CommandOf<
  TType extends string,
  TPayload extends Record<string, unknown> = Record<never, never>,
> = Readonly<
  {
    readonly type: TType;
  } & Omit<TPayload, "type">
>;

/**
 * Converts a query type into a strongly typed query definition.
 *
 * See `CommandOf` for the payload defaulting and `type` precedence rules.
 */
export type QueryOf<
  TType extends string,
  TPayload extends Record<string, unknown> = Record<never, never>,
> = Readonly<
  {
    readonly type: TType;
  } & Omit<TPayload, "type">
>;

/**
 * Extracts the type discriminator from a CQRS request.
 */
export type CqrsRequestType<TRequest extends CqrsRequest> = TRequest["type"];

/**
 * Extracts the payload of a command or query without its discriminator.
 */
export type CqrsPayload<TRequest extends CqrsRequest> = Omit<TRequest, "type">;

/**
 * Determines whether an unknown value satisfies the basic CQRS request shape.
 */
export function isCqrsRequest(value: unknown): value is CqrsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (
      value as {
        type?: unknown;
      }
    ).type === "string" &&
    (
      value as {
        type: string;
      }
    ).type.length > 0
  );
}
