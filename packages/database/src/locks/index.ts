/**
 * @zudojs/database — Locks
 *
 * Advisory and row-level database locking (PostgreSQL).
 */

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
} from "./locks.core.js";
