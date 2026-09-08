/**
 * Database connection lifecycle states.
 */
export type DatabaseStatus =
  "disconnected" | "connecting" | "connected" | "disconnecting" | "error";

/**
 * Supported transaction isolation levels.
 */
export type TransactionIsolationLevel =
  "ReadUncommitted" | "ReadCommitted" | "RepeatableRead" | "Serializable";

/**
 * Database operation types.
 */
export type DatabaseOperation =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "upsert"
  | "count"
  | "aggregate"
  | "transaction"
  | "raw";

/**
 * Options shared by database operations.
 */
export interface DatabaseOperationOptions {
  /**
   * Aborts the operation from the caller's side. The repository rejects
   * with an `ERR_OPERATION_CANCELLED` DatabaseError as soon as the signal
   * fires; the underlying database query is not cancelled server-side.
   */
  readonly signal?: AbortSignal;
  /**
   * Client-side timeout in milliseconds. When exceeded the caller receives
   * an `ERR_DATABASE_TIMEOUT` DatabaseError; the query itself keeps running
   * on the server until it completes (use a statement timeout for real
   * cancellation).
   */
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options used when establishing a database connection.
 *
 * Prisma 7 configures the connection URL, pool size and SSL on the driver
 * adapter, so only options this package can actually honour are declared
 * here.
 */
export interface DatabaseConnectionOptions {
  /**
   * Client-side deadline for `$connect()` (default 10 000 ms). Non-finite
   * or non-positive values disable the timeout.
   */
  readonly connectionTimeoutMs?: number;

  /**
   * Emits Prisma query events (duration and target only) to the logger.
   */
  readonly logging?: boolean;
}

/**
 * Lifecycle-oriented health snapshot returned by `DatabaseClient.healthCheck()`
 * and the `Database` facade. For the richer probe result (healthy /
 * degraded / unhealthy plus an error object) use `checkDatabaseHealth`
 * from the health module.
 */
export interface DatabaseClientHealth {
  readonly status: DatabaseStatus;
  readonly latencyMs?: number;
  readonly checkedAt: Date;
  readonly error?: string;
}

/**
 * @deprecated Use {@link DatabaseClientHealth}. Kept as an alias so the
 * name does not clash with the health module's `DatabaseHealth`.
 */
export type DatabaseHealth = DatabaseClientHealth;

/**
 * Transaction configuration.
 */
export interface TransactionOptions extends DatabaseOperationOptions {
  readonly isolationLevel?: TransactionIsolationLevel;
  readonly timeoutMs?: number;
  readonly maxWaitMs?: number;
}

/**
 * Generic transaction callback.
 */
export type TransactionCallback<TContext, TResult> = (
  context: TContext,
) => Promise<TResult>;

/**
 * Generic database client contract implemented by the concrete
 * `DatabaseClient` class. Kept out of the root barrel to avoid clashing
 * with the class name; prefer the {@link DatabaseClientContract} alias.
 */
export interface DatabaseClient<TTransactionContext = unknown> {
  connect(): Promise<void>;

  disconnect(): Promise<void>;

  ping(): Promise<void>;

  getStatus(): DatabaseStatus;

  healthCheck(): Promise<DatabaseClientHealth>;

  transaction<TResult>(
    callback: TransactionCallback<TTransactionContext, TResult>,
    options?: TransactionOptions,
  ): Promise<TResult>;
}

/**
 * Alias of the {@link DatabaseClient} contract interface.
 */
export type DatabaseClientContract<TTransactionContext = unknown> =
  DatabaseClient<TTransactionContext>;

/**
 * Generic repository contract.
 */
export interface Repository<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TFilter = unknown,
> {
  findById(
    id: TId,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity | null>;

  findOne(
    filter: TFilter,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity | null>;

  findMany(
    filter?: TFilter,
    options?: DatabaseOperationOptions,
  ): Promise<readonly TEntity[]>;

  findPaginated(
    filter?: TFilter,
    options?: QueryOptions,
  ): Promise<PaginatedResult<TEntity>>;

  create(
    input: TCreateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity>;

  createMany(
    inputs: readonly TCreateInput[],
    options?: DatabaseOperationOptions,
  ): Promise<number>;

  update(
    id: TId,
    input: TUpdateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity>;

  upsert(
    where: TFilter,
    create: TCreateInput,
    update: TUpdateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity>;

  delete(id: TId, options?: DatabaseOperationOptions): Promise<void>;

  deleteMany(
    filter: TFilter,
    options?: DatabaseOperationOptions,
  ): Promise<number>;

  exists(filter: TFilter, options?: DatabaseOperationOptions): Promise<boolean>;

  count(filter?: TFilter, options?: DatabaseOperationOptions): Promise<number>;
}

/**
 * Repository contract for entities that support soft deletion.
 */
export interface SoftDeletableRepository<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TFilter = unknown,
> extends Repository<TEntity, TId, TCreateInput, TUpdateInput, TFilter> {
  softDelete(id: TId, options?: DatabaseOperationOptions): Promise<TEntity>;

  restore(id: TId, options?: DatabaseOperationOptions): Promise<TEntity>;

  findDeleted(
    filter?: TFilter,
    options?: DatabaseOperationOptions,
  ): Promise<readonly TEntity[]>;
}

/**
 * Pagination request.
 */
export interface PaginationInput {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Pagination metadata.
 */
export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  /** Alias of `hasNextPage`. */
  readonly hasNext: boolean;
  /** Alias of `hasPreviousPage`. */
  readonly hasPrev: boolean;
}

/**
 * Paginated repository result.
 */
export interface PaginatedResult<TEntity> {
  readonly data: readonly TEntity[];
  readonly meta: PaginationMeta;
}

/**
 * Sorting direction.
 */
export type SortDirection = "asc" | "desc";

/**
 * Generic sort definition.
 */
export interface SortInput<TField extends string = string> {
  readonly field: TField;
  readonly direction: SortDirection;
}

/**
 * Generic query options.
 */
export interface QueryOptions<
  TField extends string = string,
> extends DatabaseOperationOptions {
  readonly pagination?: PaginationInput;
  readonly sort?: readonly SortInput<TField>[];
}

/**
 * Database entity base contract.
 */
export interface DatabaseEntity<TId = string> {
  readonly id: TId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Soft-deletable entity contract.
 */
export interface SoftDeletableEntity extends DatabaseEntity {
  readonly deletedAt: Date | null;
}

/**
 * Auditable entity contract.
 */
export interface AuditableEntity extends DatabaseEntity {
  readonly createdBy?: string;
  readonly updatedBy?: string;
}

/**
 * Plain, serialisable description of a database failure. Produced by
 * `toDatabaseErrorInfo` in the client module.
 */
export interface DatabaseErrorInfo {
  /**
   * Prisma / driver code (for example `P2002`) when known, otherwise the
   * `DatabaseError.code` (for example `ERR_DATABASE`).
   */
  readonly code?: string;
  readonly message: string;
  /**
   * Operation that failed (a `DatabaseOperation` value from
   * `@zudojs/errors`, or one of the local {@link DatabaseOperation} names).
   */
  readonly operation?: string;
  readonly model?: string;
  readonly field?: string;
  readonly constraint?: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Database logger contract.
 */
export interface DatabaseLogger {
  debug(message: string, metadata?: Readonly<Record<string, unknown>>): void;

  info(message: string, metadata?: Readonly<Record<string, unknown>>): void;

  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void;

  error(
    message: string,
    error?: unknown,
    metadata?: Readonly<Record<string, unknown>>,
  ): void;
}

/**
 * Default no-op database logger.
 */
export const noopDatabaseLogger: DatabaseLogger = Object.freeze({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});
