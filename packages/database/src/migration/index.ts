/**
 * @zudojs/database — Migrations
 *
 * Database migration runner with version tracking.
 */

export {
  MigrationRunner,
  createMigrationRunner,
  normalizeMigrations,
  validateMigration,
  getLatestVersion,
  getCurrentVersion,
  DEFAULT_MIGRATION_TABLE,
  DEFAULT_MIGRATION_LOCK,
  type Migration,
  type MigrationRecord,
  type MigrationResult,
  type MigrationStatus,
  type MigrationRunnerOptions,
  type RunnerTransactionOptions,
} from "./migration.runner.js";

export {
  SQL_IDENTIFIER_PATTERN,
  validateIdentifier,
  validateLockKey,
  quoteIdentifier,
  hashLockKey,
  fnv1a64,
  FNV1A_64_OFFSET_BASIS,
  FNV1A_64_PRIME,
} from "./migration.helpers.js";

export {
  getSqlDialect,
  isSqlDialectName,
  UnsupportedDialectError,
  DEFAULT_SQL_DIALECT,
  type SqlDialect,
  type SqlDialectName,
} from "./migration.dialect.js";
