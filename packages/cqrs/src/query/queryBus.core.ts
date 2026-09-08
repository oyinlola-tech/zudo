import type {
  Query,
  QueryBus as QueryBusContract,
  QueryHandlerLike,
  CqrsContext,
  CqrsMiddleware,
} from "../cqrsTypes/cqrsTypes.type.js";

import { executeQueryHandler } from "../query/queryHandler.core.js";

import {
  QueryHandlerNotFoundError,
  DuplicateHandlerError,
  InvalidQueryError,
} from "../cqrsErrors/cqrsError.base.js";

import { composeMiddleware } from "../cqrsMiddleware/cqrsMiddleware.core.js";

import {
  assertExecutableHandler,
  assertHandlerType,
  assertMiddleware,
} from "../cqrsValidation/cqrsValidation.core.js";

/**
 * Options for constructing a query bus.
 */
export interface QueryBusOptions {
  readonly middleware?: readonly CqrsMiddleware[];

  /**
   * Creates a default execution context when one is not supplied.
   */
  readonly contextFactory?: () => CqrsContext | Promise<CqrsContext>;
}

/**
 * Registered query handler.
 */
export interface QueryRegistration<
  TQuery extends Query = Query,
  TResult = unknown,
> {
  readonly queryType: TQuery["type"];

  readonly handler: QueryHandlerLike<TQuery, TResult>;
}

/**
 * Query bus implementation.
 *
 * The query bus runs every query through the registered middleware
 * pipeline. Request validation and handler resolution happen at the end
 * of the pipeline, so middleware observes `InvalidQueryError` and
 * `QueryHandlerNotFoundError` like any other failure and may substitute
 * the query (and therefore the handler) by forwarding a different
 * request to `next()`.
 *
 * All failures are `CqrsError` instances (`isCqrsError(error) === true`).
 */
export class QueryBus implements QueryBusContract {
  private readonly handlers = new Map<string, QueryHandlerLike>();

  private readonly middleware: CqrsMiddleware[];

  private readonly contextFactory?: () => CqrsContext | Promise<CqrsContext>;

  constructor(options: QueryBusOptions = {}) {
    const middleware = [...(options.middleware ?? [])];

    for (const entry of middleware) {
      assertMiddleware("query", entry);
    }

    this.middleware = middleware;

    this.contextFactory = options.contextFactory;
  }

  /**
   * Registers a query handler.
   *
   * @throws InvalidHandlerTypeError when the type is empty or padded with whitespace.
   * @throws HandlerConfigurationError when the handler is not callable.
   * @throws DuplicateHandlerError when a handler already exists for the type.
   */
  public register<TQuery extends Query, TResult = unknown>(
    queryType: TQuery["type"],
    handler: QueryHandlerLike<TQuery, TResult>,
  ): this {
    assertHandlerType("query", queryType);

    assertExecutableHandler("query", queryType, handler);

    if (this.handlers.has(queryType)) {
      throw new DuplicateHandlerError("query", queryType);
    }

    this.handlers.set(queryType, handler as QueryHandlerLike);

    return this;
  }

  /**
   * Registers multiple query handlers.
   */
  public registerMany(registrations: readonly QueryRegistration[]): this {
    for (const registration of registrations) {
      this.register(registration.queryType, registration.handler);
    }

    return this;
  }

  /**
   * Replaces an existing query handler (or registers a new one).
   */
  public replace<TQuery extends Query, TResult = unknown>(
    queryType: TQuery["type"],
    handler: QueryHandlerLike<TQuery, TResult>,
  ): this {
    assertHandlerType("query", queryType);

    assertExecutableHandler("query", queryType, handler);

    this.handlers.set(queryType, handler as QueryHandlerLike);

    return this;
  }

  /**
   * Removes a query handler.
   */
  public unregister(queryType: string): boolean {
    return this.handlers.delete(queryType);
  }

  /**
   * Determines whether a query handler is registered.
   */
  public has(queryType: string): boolean {
    return this.handlers.has(queryType);
  }

  /**
   * Returns the registered handler for a query type.
   */
  public getHandler<TQuery extends Query, TResult = unknown>(
    queryType: TQuery["type"],
  ): QueryHandlerLike<TQuery, TResult> | undefined {
    return this.handlers.get(queryType) as
      QueryHandlerLike<TQuery, TResult> | undefined;
  }

  /**
   * Executes a query through the middleware pipeline.
   *
   * @throws InvalidQueryError when the query delivered to the end of the pipeline is malformed.
   * @throws QueryHandlerNotFoundError when no handler is registered for its type.
   */
  public async execute<TQuery extends Query, TResult = unknown>(
    query: TQuery,
    context?: CqrsContext,
  ): Promise<TResult> {
    const executionContext = await this.resolveContext(context);

    const pipeline = composeMiddleware(this.middleware);

    const result = await pipeline(
      query,
      executionContext,
      (request, requestContext) => this.dispatch(request, requestContext),
    );

    return result as TResult;
  }

  /**
   * Adds middleware to the end of the pipeline.
   */
  public use(middleware: CqrsMiddleware): this {
    assertMiddleware("query", middleware);

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
   * Returns all registered query types.
   */
  public getQueryTypes(): readonly string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Terminal pipeline step: validates the delivered query, resolves
   * its handler and executes it.
   */
  private async dispatch(
    request: Query | { readonly type: string },
    context?: CqrsContext,
  ): Promise<unknown> {
    this.validateQuery(request);

    const handler = this.handlers.get(request.type);

    if (!handler) {
      throw new QueryHandlerNotFoundError(request.type);
    }

    return executeQueryHandler(handler, request, context);
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
   * Validates a query before execution.
   */
  private validateQuery(query: unknown): asserts query is Query {
    if (!query || typeof query !== "object") {
      throw new InvalidQueryError("A valid query is required.");
    }

    const type = (query as { type?: unknown }).type;

    if (typeof type !== "string" || type.trim().length === 0) {
      throw new InvalidQueryError("Query type is required.");
    }
  }
}

/**
 * Creates a query bus.
 */
export function createQueryBus(options: QueryBusOptions = {}): QueryBus {
  return new QueryBus(options);
}
