/**
 * @zudojs/storage
 *
 * Storage infrastructure for the Zudojs framework.
 *
 * Provides database, object storage, repository, serialization, locking,
 * and lifecycle abstractions with driver-independent interfaces.
 *
 * @example
 * ```ts
 * import { Database, ConnectionPool, BaseRepository } from '@zudojs/storage';
 *
 * // Use database abstraction
 * const result = await database.query({ text: 'SELECT * FROM users' });
 *
 * // Use repository pattern
 * class UserRepository extends BaseRepository<User, string> {
 *   async findByEmail(email: string) {
 *     return this.database.query({
 *       text: 'SELECT * FROM users WHERE email = $1',
 *       parameters: [email],
 *     });
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

/* ─── Types ──────────────────────────────────────────────────────────────── */
export type {
  ConnectionState,
  TransactionState,
  IsolationLevel,
  QueryParameter,
  Query,
  QueryResult,
  ExecuteResult,
  FieldInfo,
  Connection,
  ConnectionPoolOptions,
  PoolStats,
  TransactionOptions,
  Transaction,
  StorageHealth,
  Database,
  ObjectPutOptions,
  ObjectMetadata,
  ObjectData,
  ObjectStorage,
  ListObjectsResult,
  Repository,
  SerializationFormat,
  Serializer,
  Lock,
  LockOptions,
  LockManager,
  StorageLifecyclePhase,
  StorageLifecycle,
  StorageContext,
} from "./types/index.js";

export { ConnectionPool } from "./database/index.js";

export { BaseRepository } from "./repository/index.js";
export type {
  BaseRepositoryOptions,
  FindAllOptions,
  SortDirection,
} from "./repository/index.js";
export {
  assertIdentifier,
  assertIdentifiers,
  assertRowBound,
  assertSortDirection,
} from "./repository/index.js";

export { LocalObjectStorage } from "./objectStorage/index.js";
export type {
  ListOptions,
  LocalObjectStorageOptions,
} from "./objectStorage/index.js";
export {
  DEFAULT_MAX_KEYS,
  DEFAULT_MAX_OBJECT_BYTES,
  SIDECAR_DIR,
} from "./objectStorage/index.js";
export type { ObjectAttributes } from "./objectStorage/index.js";

export { JsonSerializer } from "./serialization/index.js";

export { InMemoryLockManager } from "./locking/index.js";

export { StorageLifecycleManager } from "./lifecycle/index.js";

export { HealthChecker } from "./health/index.js";
export type { StorageHealthReport, ComponentHealth } from "./health/index.js";
