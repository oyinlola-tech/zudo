/**
 * @zudojs/database — Repository
 *
 * Generic repository pattern with Prisma delegate support.
 */

export {
  BaseRepository,
  type BaseRepositoryOptions,
  type SoftDeleteOptions,
  type CreateCursorOptions,
  type CursorQueryOptions,
  type TransactionClientLike,
} from "./repository.base.js";

export {
  type RepositoryDelegate,
  type RepositoryDelegateOperations,
} from "./repository.delegate.js";

export {
  mapRepositoryError,
  isPrismaErrorLike,
  toDatabaseOperation,
  toErrorMetadata,
  createAbortError,
  createTimeoutError,
  type RepositoryOperation,
  type RepositoryErrorContext,
  type PrismaErrorLike,
} from "./repository.errors.js";
