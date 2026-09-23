import {
  DatabaseClient,
  type DatabaseClientOptions,
  type DatabaseTransactionContext,
  type PrismaClientLike,
  type TransactionClientOf,
} from "../databaseClient/databaseClient.core.js";

import type {
  DatabaseHealth,
  DatabaseStatus,
  TransactionCallback,
  TransactionOptions,
} from "../databaseType/databaseType.type.js";

/**
 * Database facade used by the application layer.
 *
 * This module provides a single database lifecycle entry point while
 * keeping the underlying Prisma client implementation inside the
 * database package.
 *
 * `TTransaction` is the transaction client handed to `transaction()`
 * callbacks. {@link createDatabase} infers it from the wrapped client or
 * from `options.prisma`.
 */
export class Database<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
> {
  private readonly client: DatabaseClient<TTransaction>;

  /**
   * @param options Client options, or an existing {@link DatabaseClient}
   * to wrap so a single client is shared by the facade and other managers.
   */
  constructor(
    options: DatabaseClientOptions | DatabaseClient<TTransaction> = {},
  ) {
    this.client =
      options instanceof DatabaseClient
        ? options
        : new DatabaseClient<TTransaction>(options);
  }

  /**
   * Initializes the database connection.
   */
  public async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Closes the database connection.
   */
  public async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  /**
   * Ensures the database is connected.
   */
  public async ensureConnected(): Promise<void> {
    await this.client.ensureConnected();
  }

  /**
   * Checks database connectivity.
   */
  public async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Returns the current database status.
   */
  public getStatus(): DatabaseStatus {
    return this.client.getStatus();
  }

  /**
   * Returns database health information.
   */
  public async healthCheck(): Promise<DatabaseHealth> {
    return this.client.healthCheck();
  }

  /**
   * Executes work inside a database transaction.
   */
  public async transaction<TResult>(
    callback: TransactionCallback<TTransaction, TResult>,
    options?: TransactionOptions,
  ): Promise<TResult> {
    return this.client.transaction(callback, options);
  }

  /**
   * Returns the underlying database client.
   *
   * This should primarily be used by repository and infrastructure
   * implementations that require direct Prisma access.
   */
  public getClient(): DatabaseClient<TTransaction> {
    return this.client;
  }

  /**
   * Returns the underlying Prisma client.
   */
  public getPrisma(): PrismaClientLike {
    return this.client.getPrisma();
  }

  /**
   * Releases all database resources.
   */
  public async destroy(): Promise<void> {
    await this.client.destroy();
  }
}

/**
 * Creates a database facade over an existing client, keeping its
 * transaction client type.
 */
export function createDatabase<
  TTransaction extends DatabaseTransactionContext = DatabaseTransactionContext,
>(client: DatabaseClient<TTransaction>): Database<TTransaction>;
/**
 * Creates a database facade from client options. The transaction client
 * type is inferred from `options.prisma`.
 */
export function createDatabase<
  TClient extends PrismaClientLike = PrismaClientLike,
>(options?: DatabaseClientOptions<TClient>): Database<TransactionClientOf<TClient>>;
/**
 * Creates a database facade from client options or an existing client.
 */
export function createDatabase(
  options?: DatabaseClientOptions | DatabaseClient,
): Database;
export function createDatabase(
  options: DatabaseClientOptions | DatabaseClient = {},
): Database {
  return new Database(options);
}

/**
 * Default database instance.
 *
 * The instance is created lazily by consumers through the exported
 * factory rather than connecting during module import.
 */
let defaultDatabase: Database | undefined;

/**
 * Returns the shared application database instance.
 *
 * The connection is not established automatically. Call
 * `connect()` during application bootstrap.
 *
 * @throws {TypeError} when options are supplied after the shared instance
 * has already been created; they would otherwise be silently ignored.
 * Call {@link resetDatabase} first to reconfigure.
 */
export function getDatabase(
  options: DatabaseClientOptions | DatabaseClient = {},
): Database {
  if (!defaultDatabase) {
    defaultDatabase = createDatabase(options);
    return defaultDatabase;
  }

  const hasOptions =
    options instanceof DatabaseClient || Object.keys(options).length > 0;
  if (hasOptions && !(options instanceof DatabaseClient && defaultDatabase.getClient() === options)) {
    throw new TypeError(
      "The shared database instance already exists; options passed to getDatabase() would be ignored. Call resetDatabase() before reconfiguring.",
    );
  }

  return defaultDatabase;
}

/**
 * Connects the shared application database.
 */
export async function connectDatabase(
  options: DatabaseClientOptions | DatabaseClient = {},
): Promise<Database> {
  const database = getDatabase(options);

  await database.connect();

  return database;
}

/**
 * Disconnects the shared application database.
 */
export async function disconnectDatabase(): Promise<void> {
  if (!defaultDatabase) {
    return;
  }

  await defaultDatabase.disconnect();
}

/**
 * Resets the shared database instance.
 *
 * Primarily useful for application shutdown, tests, and isolated
 * runtime environments.
 */
export async function resetDatabase(): Promise<void> {
  const database = defaultDatabase;
  if (!database) {
    return;
  }

  // Clear the singleton first so a failing destroy() never leaves a stale
  // instance behind.
  defaultDatabase = undefined;

  await database.destroy();
}
