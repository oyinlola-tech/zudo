/**
 * @zudojs/database — Repository
 *
 * Generic repository pattern with Prisma delegate support.
 */

export {
  BaseRepository,
  type RepositoryDelegate,
  type BaseRepositoryOptions,
  type SoftDeleteOptions,
  type CursorQueryOptions,
  type TransactionClientLike,
} from "./repository.base.js";

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
