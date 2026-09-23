import { DatabaseOperation } from "@zudojs/errors";

import type {
  DatabaseTransactionContext,
  DatabaseClient,
} from "../databaseClient/databaseClient.core.js";
import {
  isNonDatabaseBaseError,
  normalizeDatabaseError,
} from "../databaseClient/databaseClient.errors.js";

import type {
  TransactionCallback,
  TransactionOptions,
} from "../databaseType/databaseType.type.js";

/**
 * Contract for a unit of work.
 *
 * A unit of work groups multiple repository operations into a single
 * database transaction so they either all succeed or all roll back.
 * Repositories must be rebound to the transaction client handed to the
 * callback (see `BaseRepository.withTransaction`); repositories built from
 * the root client run outside the transaction.
 *
 * `TTransaction` is the transaction client handed to the callback.
 */
export interface UnitOfWork<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
> {
  execute<TResult>(
    callback: TransactionCallback<TTransaction, TResult>,
    options?: TransactionOptions,
  ): Promise<TResult>;
}

/**
 * Configuration for a unit of work.
 */
export interface UnitOfWorkOptions<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
> {
  readonly client: DatabaseClient<TTransaction>;
}

/**
 * Prisma-backed unit of work.
 */
export class DatabaseUnitOfWork<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
> implements UnitOfWork<TTransaction>
{
  private readonly client: DatabaseClient<TTransaction>;

  constructor(options: UnitOfWorkOptions<TTransaction>) {
    if (!options?.client) {
      throw new TypeError("A database client is required.");
    }
    this.client = options.client;
  }

  /**
   * Executes a callback inside a transaction.
   */
  public async execute<TResult>(
    callback: TransactionCallback<TTransaction, TResult>,
    options?: TransactionOptions,
  ): Promise<TResult> {
    if (typeof callback !== "function") {
      throw new TypeError("A unit of work callback is required.");
    }

    return this.client.transaction(async (transaction) => {
      try {
        return await callback(transaction);
      } catch (error) {
        if (isNonDatabaseBaseError(error)) throw error;
        throw normalizeDatabaseError(error, {
          operation: DatabaseOperation.TRANSACTION,
          fallbackMessage: "Unit of work execution failed.",
          metadata: { unitOfWork: true },
        });
      }
    }, options);
  }

  /**
   * Returns the database client used by this unit of work.
   */
  public getClient(): DatabaseClient<TTransaction> {
    return this.client;
  }
}

/**
 * Creates a database unit of work.
 */
export function createUnitOfWork<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
>(client: DatabaseClient<TTransaction>): DatabaseUnitOfWork<TTransaction> {
  return new DatabaseUnitOfWork<TTransaction>({ client });
}

/**
 * Executes a callback as a single database transaction.
 */
export async function executeUnitOfWork<
  TResult,
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
>(
  client: DatabaseClient<TTransaction>,
  callback: TransactionCallback<TTransaction, TResult>,
  options?: TransactionOptions,
): Promise<TResult> {
  return createUnitOfWork(client).execute(callback, options);
}
