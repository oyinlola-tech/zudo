import type {
  QueryHandler as QueryHandlerContract,
  QueryHandlerLike,
  Query,
  CqrsContext,
} from "../cqrsTypes/cqrsTypes.type.js";

import { HandlerConfigurationError } from "../cqrsErrors/cqrsError.base.js";

import { isExecutableHandler } from "../cqrsValidation/cqrsValidation.core.js";

/**
 * Abstract base class for query handlers.
 *
 * A query handler contains the application logic required to execute
 * one specific query.
 */
export abstract class QueryHandler<
  TQuery extends Query = Query,
  TResult = unknown,
> implements QueryHandlerContract<TQuery, TResult> {
  /**
   * Query type handled by this handler.
   */
  public abstract readonly queryType: TQuery["type"];

  /**
   * Executes the query.
   */
  public abstract execute(
    query: TQuery,
    context?: CqrsContext,
  ): Promise<TResult> | TResult;
}

/**
 * Function-based query handler implementation.
 */
export class FunctionQueryHandler<
  TQuery extends Query = Query,
  TResult = unknown,
> extends QueryHandler<TQuery, TResult> {
  public readonly queryType: TQuery["type"];

  private readonly handler: (
    query: TQuery,
    context?: CqrsContext,
  ) => TResult | Promise<TResult>;

  constructor(
    queryType: TQuery["type"],
    handler: (
      query: TQuery,
      context?: CqrsContext,
    ) => TResult | Promise<TResult>,
  ) {
    super();

    if (typeof handler !== "function") {
      throw new HandlerConfigurationError(
        "Query handler must be a function.",
        {
          handlerKind: "query",
          handlerType: queryType,
        },
      );
    }

    this.queryType = queryType;

    this.handler = handler;
  }

  public execute(
    query: TQuery,
    context?: CqrsContext,
  ): TResult | Promise<TResult> {
    return this.handler(query, context);
  }
}

/**
 * Creates a function-based query handler.
 */
export function createQueryHandler<TQuery extends Query, TResult = unknown>(
  queryType: TQuery["type"],
  handler: (query: TQuery, context?: CqrsContext) => TResult | Promise<TResult>,
): FunctionQueryHandler<TQuery, TResult> {
  return new FunctionQueryHandler(queryType, handler);
}

/**
 * Determines whether a value is a query handler instance.
 */
export function isQueryHandler(value: unknown): value is QueryHandler {
  return value instanceof QueryHandler;
}

/**
 * Determines whether a value can be used as a query handler.
 *
 * Accepts handler functions, `QueryHandler` instances and any plain
 * object exposing an `execute` method (the `QueryHandler` interface).
 */
export function isQueryHandlerLike(value: unknown): value is QueryHandlerLike {
  return isExecutableHandler(value);
}

/**
 * Executes either an object-based or function-based query handler.
 *
 * Object handlers only need an `execute` method; they do not have to
 * extend the abstract `QueryHandler` class.
 */
export async function executeQueryHandler<
  TQuery extends Query,
  TResult = unknown,
>(
  handler: QueryHandlerLike<TQuery, TResult>,
  query: TQuery,
  context?: CqrsContext,
): Promise<TResult> {
  if (typeof handler === "function") {
    return await handler(query, context);
  }

  if (
    typeof handler === "object" &&
    handler !== null &&
    typeof (handler as Partial<QueryHandlerContract<TQuery, TResult>>)
      .execute === "function"
  ) {
    return await handler.execute(query, context);
  }

  throw new HandlerConfigurationError(
    `Invalid query handler for "${query.type}": expected a function or an object with an execute() method.`,
    {
      handlerKind: "query",
      handlerType: query.type,
    },
  );
}
