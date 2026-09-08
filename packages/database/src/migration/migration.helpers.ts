import type { Migration, MigrationRecord } from "./migration.types.js";

/**
 * Default migration table.
 */
export const DEFAULT_MIGRATION_TABLE = "_migrations";

/**
 * Default migration advisory lock.
 */
export const DEFAULT_MIGRATION_LOCK = "database:migrations";

/**
 * Strict SQL identifier pattern shared by the runners.
 */
export const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Normalizes and validates migrations.
 */
export function normalizeMigrations(
  migrations: readonly Migration[],
): readonly Migration[] {
  if (!Array.isArray(migrations)) {
    throw new TypeError("Migrations must be an array.");
  }

  const normalized = migrations
    .map((migration) => {
      validateMigration(migration);
      return Object.freeze({ ...migration });
    })
    .sort((first, second) => first.version - second.version);

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous && current && previous.version === current.version) {
      throw new TypeError(`Duplicate migration version: ${current.version}.`);
    }
  }

  return Object.freeze(normalized);
}

/**
 * Validates one migration.
 */
export function validateMigration(migration: Migration): void {
  if (!migration || typeof migration !== "object") {
    throw new TypeError("A migration definition is required.");
  }
  if (!Number.isInteger(migration.version) || migration.version <= 0) {
    throw new TypeError("Migration version must be a positive integer.");
  }
  if (migration.version > Number.MAX_SAFE_INTEGER) {
    throw new TypeError(
      `Migration version ${migration.version} exceeds Number.MAX_SAFE_INTEGER.`,
    );
  }
  if (
    typeof migration.name !== "string" ||
    migration.name.trim().length === 0
  ) {
    throw new TypeError("Migration name is required.");
  }
  if (migration.name.length > 255) {
    throw new TypeError("Migration name cannot exceed 255 characters.");
  }
  if (typeof migration.up !== "function") {
    throw new TypeError(
      `Migration "${migration.name}" requires an up function.`,
    );
  }
  if (migration.down !== undefined && typeof migration.down !== "function") {
    throw new TypeError(
      `Migration "${migration.name}" has an invalid down function.`,
    );
  }
}

/**
 * Returns the highest registered migration version.
 */
export function getLatestVersion(migrations: readonly Migration[]): number {
  let latest = 0;
  for (const migration of migrations) {
    if (migration.version > latest) latest = migration.version;
  }
  return latest;
}

/**
 * Returns the highest applied migration version.
 */
export function getCurrentVersion(
  migrations: readonly MigrationRecord[],
): number {
  let current = 0;
  for (const record of migrations) {
    if (record.version > current) current = record.version;
  }
  return current;
}

/**
 * Quotes a validated SQL identifier using double quotes.
 *
 * Prefer `SqlDialect.quoteIdentifier` when a dialect is available.
 */
export function quoteIdentifier(identifier: string): string {
  validateIdentifier(identifier, "identifier");
  return `"${identifier}"`;
}

/**
 * Validates an SQL identifier against {@link SQL_IDENTIFIER_PATTERN}.
 */
export function validateIdentifier(identifier: string, name: string): void {
  if (typeof identifier !== "string" || !SQL_IDENTIFIER_PATTERN.test(identifier)) {
    throw new TypeError(`Invalid ${name}: "${String(identifier)}".`);
  }
}

/**
 * Validates an advisory lock key.
 */
export function validateLockKey(lockKey: string, name = "lock key"): void {
  if (typeof lockKey !== "string" || lockKey.trim().length === 0) {
    throw new TypeError(`A database ${name} is required.`);
  }
}

/**
 * FNV-1a 64-bit offset basis (0xcbf29ce484222325).
 */
export const FNV1A_64_OFFSET_BASIS = 14695981039346656037n;

/**
 * FNV-1a 64-bit prime (0x100000001b3).
 */
export const FNV1A_64_PRIME = 1099511628211n;

const UINT64_MASK = (1n << 64n) - 1n;

/**
 * Computes the unsigned FNV-1a 64-bit hash of a string (UTF-8 bytes).
 *
 * Matches FNV-1a implementations in other languages, so lock keys can be
 * shared with services outside this package.
 */
export function fnv1a64(value: string): bigint {
  let hash = FNV1A_64_OFFSET_BASIS;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV1A_64_PRIME) & UINT64_MASK;
  }
  return hash;
}

/**
 * Creates a deterministic signed 64-bit advisory lock key (FNV-1a).
 *
 * Suitable as the single `bigint` argument of `pg_advisory_xact_lock`.
 */
export function hashLockKey(value: string): bigint {
  return BigInt.asIntN(64, fnv1a64(value));
}
