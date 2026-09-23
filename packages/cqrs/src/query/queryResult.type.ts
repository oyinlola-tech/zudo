import { QueryFailedError } from "@zudojs/errors";

import type { Query } from "../cqrsTypes/cqrsTypes.type.js";

/**
 * Status of a query execution.
 */
export type QueryResultStatus = "success" | "failure";

/**
 * Result returned after query execution.
 *
 * The wrapper provides consistent execution metadata while preserving
 * the actual value returned by the query handler.
 */
export interface QueryResult<TResult = unknown, TQuery extends Query = Query> {
  readonly status: QueryResultStatus;
  readonly result: TResult;
  readonly queryType: TQuery["type"];
  readonly executedAt: Date;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options for creating a query result.
 */
export interface CreateQueryResultOptions<TQuery extends Query = Query> {
  readonly query: TQuery;
  readonly executedAt?: Date;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates a successful query result.
 */
export function createQueryResult<TResult, TQuery extends Query>(
  result: TResult,
  options: CreateQueryResultOptions<TQuery>,
): QueryResult<TResult, TQuery> {
  const query = options.query;

  validateQuery(query);

  const queryResult: QueryResult<TResult, TQuery> = {
    status: "success",
    result,
    queryType: query.type,
    executedAt: options.executedAt ?? new Date(),
    durationMs: options.durationMs,
    metadata: options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined,
  };

  return Object.freeze(queryResult);
}

/**
 * Creates a failed query result.
 *
 * Query buses normally throw failures. This helper is useful for
 * infrastructure that needs to represent a failure as a value.
 */
export function createFailedQueryResult<
  TResult = unknown,
  TQuery extends Query = Query,
>(
  result: TResult,
  options: CreateQueryResultOptions<TQuery>,
): QueryResult<TResult, TQuery> {
  const query = options.query;

  validateQuery(query);

  const queryResult: QueryResult<TResult, TQuery> = {
    status: "failure",
    result,
    queryType: query.type,
    executedAt: options.executedAt ?? new Date(),
    durationMs: options.durationMs,
    metadata: options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined,
  };

  return Object.freeze(queryResult);
}

/**
 * Determines whether a query result represents success.
 */
export function isSuccessfulQueryResult<TResult, TQuery extends Query = Query>(
  result: QueryResult<TResult, TQuery>,
): boolean {
  return result.status === "success";
}

/**
 * Determines whether a query result represents failure.
 */
export function isFailedQueryResult<TResult, TQuery extends Query = Query>(
  result: QueryResult<TResult, TQuery>,
): boolean {
  return result.status === "failure";
}

/**
 * Returns the value of a successful query result.
 *
 * @throws {QueryFailedError} when the result's status is `"failure"`. The
 *   failure payload is on `error.failure` (and `error.cause`). Before 1.2
 *   the payload was returned as if it were the query's value.
 */
export function unwrapQueryResult<TResult, TQuery extends Query = Query>(
  result: QueryResult<TResult, TQuery>,
): TResult {
  if (result.status === "failure") {
    throw new QueryFailedError(String(result.queryType), result.result);
  }

  return result.result;
}

/**
 * Adds metadata to an existing query result.
 */
export function withQueryResultMetadata<TResult, TQuery extends Query = Query>(
  result: QueryResult<TResult, TQuery>,
  metadata: Readonly<Record<string, unknown>>,
): QueryResult<TResult, TQuery> {
  const merged: QueryResult<TResult, TQuery> = {
    ...result,
    metadata: Object.freeze({
      ...(result.metadata ?? {}),
      ...metadata,
    }),
  };

  return Object.freeze(merged);
}

/**
 * Validates the query portion of a query result.
 */
function validateQuery(query: Query): void {
  if (!query || typeof query !== "object") {
    throw new TypeError("A valid query is required to create a query result.");
  }

  if (typeof query.type !== "string" || query.type.trim().length === 0) {
    throw new TypeError("Query type is required to create a query result.");
  }
}
