import { DatabaseError } from "@zudojs/errors";

import { validateIdentifier } from "./migration.helpers.js";

/**
 * SQL dialects known to the migration and seed runners.
 *
 * Only `postgresql` is implemented today. Requesting any other dialect
 * throws an {@link UnsupportedDialectError} so callers fail loudly instead
 * of running PostgreSQL syntax against another engine.
 */
export type SqlDialectName = "postgresql" | "mysql" | "sqlite";

/**
 * Dialect strategy used to build the small amount of raw SQL the runners
 * need (tracking tables, history queries, and advisory locks).
 */
export interface SqlDialect {
  readonly name: SqlDialectName;

  /**
   * Quotes a validated identifier (table or column name).
   */
  quoteIdentifier(identifier: string): string;

  /**
   * Returns the positional placeholder for the 1-based parameter index.
   */
  placeholder(index: number): string;

  /**
   * Column type names used by the tracking tables.
   */
  readonly types: {
    readonly bigint: string;
    readonly varchar255: string;
    readonly timestamp: string;
  };

  /**
   * Returns the SQL used to acquire a transaction-scoped advisory lock.
   *
   * The statement must accept exactly one 64-bit integer parameter.
   */
  advisoryTransactionLock(): string;

  /**
   * Default expression for the current timestamp.
   */
  readonly currentTimestamp: string;
}

/**
 * Raised when a dialect is requested that the runners do not implement.
 */
export class UnsupportedDialectError extends DatabaseError {
  constructor(dialect: string) {
    super(
      `SQL dialect "${dialect}" is not supported by the migration and seed runners. Only "postgresql" is implemented.`,
      {
        metadata: { dialect },
        statusCode: 500,
      },
    );
    this.name = "UnsupportedDialectError";
  }
}

const POSTGRESQL_DIALECT: SqlDialect = Object.freeze({
  name: "postgresql",
  quoteIdentifier(identifier: string): string {
    validateIdentifier(identifier, "identifier");
    return `"${identifier}"`;
  },
  placeholder(index: number): string {
    if (!Number.isInteger(index) || index < 1) {
      throw new TypeError("Placeholder index must be a positive integer.");
    }
    return `$${index}`;
  },
  types: Object.freeze({
    bigint: "BIGINT",
    varchar255: "VARCHAR(255)",
    timestamp: "TIMESTAMP",
  }),
  advisoryTransactionLock(): string {
    return "SELECT pg_advisory_xact_lock($1)";
  },
  currentTimestamp: "CURRENT_TIMESTAMP",
});

/**
 * Default dialect used by the runners.
 */
export const DEFAULT_SQL_DIALECT: SqlDialectName = "postgresql";

/**
 * Checks whether a value names a known dialect.
 */
export function isSqlDialectName(value: unknown): value is SqlDialectName {
  return value === "postgresql" || value === "mysql" || value === "sqlite";
}

/**
 * Resolves a dialect strategy by name.
 *
 * @throws {UnsupportedDialectError} for `mysql` and `sqlite`, which are
 * recognised but not implemented.
 * @throws {TypeError} for unknown dialect names.
 */
export function getSqlDialect(
  name: SqlDialectName = DEFAULT_SQL_DIALECT,
): SqlDialect {
  if (name === "postgresql") {
    return POSTGRESQL_DIALECT;
  }

  if (isSqlDialectName(name)) {
    throw new UnsupportedDialectError(name);
  }

  throw new TypeError(`Unknown SQL dialect: "${String(name)}".`);
}
