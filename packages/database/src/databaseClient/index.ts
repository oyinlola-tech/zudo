/**
 * @zudojs/database — Database Client
 *
 * Prisma-backed database client and connection infrastructure.
 */

export {
  DatabaseClient,
  DatabaseAbortError,
  createDatabaseClient,
  buildPrismaTransactionOptions,
  createAbortError,
  raceAbort,
  throwIfAborted,
  SUPPORTED_ISOLATION_LEVELS,
  type DatabaseClientOptions,
  type DatabaseTransactionContext,
  type PrismaClientLike,
  type PrismaDriverAdapterLike,
  type PrismaQueryEvent,
  type PrismaTransactionOptions,
  type PrismaSqlLike,
  type RawQueryOptions,
  type TransactionClientOf,
} from "./databaseClient.core.js";

export {
  normalizeDatabaseError,
  withDatabaseErrorMetadata,
  isPrismaError,
  isRetryableTransactionError,
  isConflictError,
  isNotFoundError,
  getDatabaseErrorCode,
  getDatabaseErrorKind,
  getPrismaCodeMapping,
  isDatabaseErrorLike,
  isNonDatabaseBaseError,
  toDatabaseErrorInfo,
  RETRYABLE_DATABASE_CODES,
  type DatabaseErrorKind,
  type NormalizeDatabaseErrorOptions,
  type PrismaCodeMapping,
  type PrismaErrorLike,
} from "./databaseClient.errors.js";
