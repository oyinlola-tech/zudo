/**
 * @zudojs/database
 *
 * Shared database infrastructure for the Zudojs platform.
 *
 * This package provides:
 *   • Database client and connection management
 *   • Repository abstractions
 *   • Transactions and units of work
 *   • Query building and filtering
 *   • Pagination utilities
 *   • Relation definitions
 *   • Database locking
 *   • Caching
 *   • Migrations
 *   • Seed management
 *   • Health and readiness checks
 */

// Types
export type {
  DatabaseOperationOptions,
  DatabaseStatus,
  TransactionIsolationLevel,
  DatabaseOperation,
  DatabaseConnectionOptions,
  DatabaseClientHealth,
  DatabaseHealth as DatabaseHealthInfo,
  TransactionOptions,
  TransactionCallback,
  Repository,
  SoftDeletableRepository,
  PaginationInput,
  PaginationMeta,
  PaginatedResult,
  SortDirection,
  SortInput,
  QueryOptions,
  DatabaseEntity,
  SoftDeletableEntity,
  AuditableEntity,
  DatabaseErrorInfo,
  DatabaseLogger,
} from "./databaseType/index.js";

export { noopDatabaseLogger } from "./databaseType/index.js";

// Client
export {
  DatabaseClient,
  DatabaseAbortError,
  createDatabaseClient,
  buildPrismaTransactionOptions,
  createAbortError,
  raceAbort,
  throwIfAborted,
  SUPPORTED_ISOLATION_LEVELS,
  normalizeDatabaseError,
  withDatabaseErrorMetadata,
  isPrismaError,
  isRetryableTransactionError,
  isConflictError,
  isNotFoundError,
  getDatabaseErrorCode,
  getDatabaseErrorKind,
  isDatabaseErrorLike,
  toDatabaseErrorInfo,
  RETRYABLE_DATABASE_CODES,
  type DatabaseClientOptions,
  type DatabaseTransactionContext,
  type PrismaClientLike,
  type PrismaDriverAdapterLike,
  type PrismaQueryEvent,
  type PrismaTransactionOptions,
  type RawQueryOptions,
  type DatabaseErrorKind,
  type NormalizeDatabaseErrorOptions,
  type PrismaErrorLike,
} from "./databaseClient/index.js";

// Connection
export {
  DatabaseConnectionManager,
  createConnectionManager,
  type DatabaseConnectionEvent,
  type DatabaseConnectionListener,
  type DatabaseConnectionEventDetails,
  type DatabaseConnectionManagerOptions,
  type DatabaseReconnectOptions,
} from "./databaseConnection/index.js";

// Database facade
export {
  Database,
  createDatabase,
  getDatabase,
  connectDatabase,
  disconnectDatabase,
  resetDatabase,
} from "./database/index.js";

// Repository
export {
  BaseRepository,
  mapRepositoryError,
  isPrismaErrorLike,
  toDatabaseOperation,
  type RepositoryDelegate,
  type BaseRepositoryOptions,
  type SoftDeleteOptions,
  type CursorQueryOptions,
  type TransactionClientLike,
  type RepositoryOperation,
  type RepositoryErrorContext,
} from "./repository/index.js";

// Transactions
export {
  TransactionManager,
  createTransactionManager,
  withTransaction,
  withTransactionRetry,
  createTransactionContext,
  createTransactionId,
  getTransactionContextFromError,
  isTransactionActive,
  isTransactionCommitted,
  isTransactionFailed,
  type TransactionStatus,
  type TransactionContext,
  type TransactionOutcome,
  type TransactionRetryOptions,
  type ManagedTransactionOptions,
} from "./transaction/index.js";

// Unit of Work
export {
  DatabaseUnitOfWork,
  createUnitOfWork,
  executeUnitOfWork,
  type UnitOfWork,
  type UnitOfWorkOptions,
} from "./unitOfWork/index.js";

// Query Builder
export {
  QueryBuilder,
  createQueryBuilder,
  toPrismaWhere,
  toPrismaArgs,
  toPrismaOrderBy,
  toPrismaSelect,
  toPrismaSkipTake,
  type QueryCondition,
  type QueryFilter,
  type QueryOperator,
  type RelationOperator,
  type QueryBuilderState,
  type PrismaWhere,
  type PrismaQueryArgs,
  type ToPrismaArgsOptions,
} from "./queryBuilder/index.js";

export {
  equals,
  notEquals,
  inList,
  notInList,
  lessThan,
  lessThanOrEqual,
  greaterThan,
  greaterThanOrEqual,
  contains,
  startsWith,
  endsWith,
  isNull,
  isNotNull,
  and,
  or,
  not,
  condition,
  allOf,
  anyOf,
  fromObject,
  dateRange,
  oneOf,
  noneOf,
  optionalEquals,
  optionalContains,
  hasConditions,
  flattenAnd,
  cloneFilter,
  between,
  matchesPattern,
  isEmpty,
  isNotEmpty,
  dateOnly,
  isBefore,
  isAfter,
  isBetween,
  notCondition,
  relational,
} from "./queryBuilder/index.js";

// Pagination
export {
  normalizePagination,
  normalizePage,
  normalizeLimit,
  calculateOffset,
  calculateTotalPages,
  createPaginationMeta,
  createPaginatedResult,
  getNextPage,
  getPreviousPage,
  isValidPage,
  getItemRange,
  paginateCollection,
  encodeCursor,
  decodeCursor,
  validateCursorPayload,
  decodeKeysetCursor,
  buildKeysetWhere,
  createKeysetCursor,
  createKeysetPage,
  normalizeCursorPagination,
  createCursorPaginationMeta,
  createCursorPaginatedResult,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type NormalizedPagination,
  type CursorPaginationInput,
  type CursorPaginationMeta,
  type CursorPaginatedResult,
  type CursorPayload,
  type EncodeCursorOptions,
  type DecodeCursorOptions,
  type KeysetPageOptions,
  type KeysetWhere,
} from "./pagination/index.js";

// Relations
export {
  oneToOne,
  oneToMany,
  manyToOne,
  manyToMany,
  includeRelation,
  includeRelations,
  RelationRegistry,
  createRelationRegistry,
  validateRelation,
  validateInclude,
  toPrismaInclude,
  DEFAULT_INCLUDE_DEPTH,
  isRelationType,
  isCollectionRelation,
  isSingleRelation,
  type RelationDefinition,
  type RelationType,
  type RelationLoadOptions,
  type RelationInclude,
  type ToPrismaIncludeOptions,
} from "./relations/index.js";

// Locks
export {
  DatabaseLockManager,
  createLockManager,
  acquireAdvisoryLock,
  lockRow,
  buildLockClause,
  normalizeAdvisoryKey,
  normalizeAdvisoryKeyPair,
  resolveLockTransactionOptions,
  type DatabaseLockMode,
  type DatabaseLockOptions,
  type DatabaseLockResult,
} from "./locks/index.js";

// Cache
export {
  MemoryDatabaseCache,
  createDatabaseCache,
  createCacheKey,
  escapeCachePart,
  serializeCachePart,
  getOrSet,
  invalidateByPrefix,
  CACHE_KEY_SEPARATOR,
  type CacheEntry,
  type CacheOptions,
  type MemoryCacheOptions,
  type CacheStats,
  type DatabaseCache,
} from "./cache/index.js";

// Migrations
export {
  MigrationRunner,
  createMigrationRunner,
  normalizeMigrations,
  validateMigration,
  getLatestVersion,
  getCurrentVersion,
  DEFAULT_MIGRATION_TABLE,
  DEFAULT_MIGRATION_LOCK,
  SQL_IDENTIFIER_PATTERN,
  validateIdentifier,
  validateLockKey,
  quoteIdentifier,
  hashLockKey,
  fnv1a64,
  getSqlDialect,
  isSqlDialectName,
  UnsupportedDialectError,
  DEFAULT_SQL_DIALECT,
  type Migration,
  type MigrationRecord,
  type MigrationResult,
  type MigrationStatus,
  type MigrationRunnerOptions,
  type RunnerTransactionOptions,
  type SqlDialect,
  type SqlDialectName,
} from "./migration/index.js";

// Seeds
export {
  SeedRunner,
  createSeedRunner,
  normalizeSeeds,
  validateSeed,
  DEFAULT_SEED_TABLE,
  DEFAULT_SEED_LOCK,
  type Seed,
  type SeedRecord,
  type SeedResult,
  type SeedStatus,
  type SeedRunnerOptions,
} from "./seed/index.js";

// Health
export {
  checkDatabaseHealth,
  checkDatabaseReadiness,
  assertDatabaseHealth,
  isDatabaseHealthy,
  getHealthCheckCause,
  DatabaseUnhealthyError,
  DEFAULT_HEALTH_TIMEOUT_MS,
  type DatabaseHealthStatus,
  type DatabaseHealth,
  type DatabaseHealthOptions,
  type DatabaseReadiness,
} from "./health/index.js";
