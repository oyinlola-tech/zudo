/**
 * @zudojs/storage — Repository error mapping.
 *
 * A `Database` adapter raises whatever its driver raises. For PostgreSQL
 * that is an `Error` carrying a five-character SQLSTATE `code`, no HTTP
 * status, and a message naming tables, constraints and sometimes values.
 * `BaseRepository` used to let those through unchanged, so a foreign key
 * violation reached the HTTP layer as an unclassified 500 whose message
 * leaked the schema. This module turns them into `StorageError`s the way
 * `@zudojs/database` maps the same failures from Prisma.
 */

import { ErrorCode, StorageError, isBaseError } from "@zudojs/errors";

/** Context attached to a mapped repository error. */
export interface RepositoryErrorContext {
  readonly table: string;
  readonly operation: string;
}

interface SqlStateMapping {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly message: string;
  readonly expose: boolean;
  readonly retryable?: boolean;
}

const SQLSTATE_MAP: Readonly<Record<string, SqlStateMapping>> = Object.freeze({
  "23505": { statusCode: 409, code: ErrorCode.CONFLICT, expose: true,
    message: "a record with the same unique value already exists." },
  "23503": { statusCode: 409, code: ErrorCode.CONFLICT, expose: true,
    message: "violates a foreign key constraint." },
  "23514": { statusCode: 409, code: ErrorCode.CONFLICT, expose: true,
    message: "violates a check constraint." },
  "23P01": { statusCode: 409, code: ErrorCode.CONFLICT, expose: true,
    message: "violates an exclusion constraint." },
  "23502": { statusCode: 400, code: ErrorCode.INVALID_INPUT, expose: true,
    message: "a required value was null." },
  "22001": { statusCode: 400, code: ErrorCode.INVALID_INPUT, expose: true,
    message: "a value is too long for its column." },
  "22003": { statusCode: 400, code: ErrorCode.INVALID_INPUT, expose: true,
    message: "a numeric value is out of range." },
  "22007": { statusCode: 400, code: ErrorCode.INVALID_INPUT, expose: true,
    message: "a date or time value is malformed." },
  "22P02": { statusCode: 400, code: ErrorCode.INVALID_INPUT, expose: true,
    message: "a value has the wrong format for its column." },
  "40001": { statusCode: 409, code: ErrorCode.CONFLICT, expose: false,
    message: "could not be serialized against a concurrent transaction.", retryable: true },
  "40P01": { statusCode: 409, code: ErrorCode.CONFLICT, expose: false,
    message: "was aborted by a deadlock.", retryable: true },
  "57014": { statusCode: 503, code: ErrorCode.TIMEOUT, expose: false,
    message: "was cancelled by the database (statement timeout)." },
  "55P03": { statusCode: 503, code: ErrorCode.LOCK_TIMEOUT, expose: false,
    message: "could not acquire a lock.", retryable: true },
  "53300": { statusCode: 503, code: ErrorCode.STORAGE, expose: false,
    message: "the database has too many connections." },
});

const CONNECTION_CLASS = "08";

/** Whether a value carries a SQLSTATE-shaped driver code. */
function sqlState(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

function driverDetail(error: object, key: string): string | undefined {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Normalises any failure raised by a repository operation into a
 * `StorageError`. Framework errors (any `BaseError`) pass through
 * unchanged. Driver errors are classified by SQLSTATE: constraint
 * violations become exposable 409s, bad values 400s, serialization
 * failures and deadlocks retryable 409s, connection loss 503s; anything
 * else is a non-exposed 500. Messages never repeat the driver's text; the
 * constraint and column names go into `metadata` and the driver error is
 * kept as `cause`.
 */
export function mapRepositoryError(
  error: unknown,
  context: RepositoryErrorContext,
): StorageError {
  if (isBaseError(error)) return error as StorageError;

  const metadata: Record<string, string | number | boolean> = {
    table: context.table,
    operation: context.operation,
  };
  const code = sqlState(error);
  const subject = `${context.table} ${context.operation}`;

  if (code === undefined) {
    return new StorageError(`${subject} failed.`, { cause: error, metadata });
  }

  metadata["databaseCode"] = code;
  for (const key of ["constraint", "column", "schema"] as const) {
    const detail = driverDetail(error as object, key);
    if (detail !== undefined) metadata[key] = detail;
  }

  const mapping = SQLSTATE_MAP[code];
  if (mapping !== undefined) {
    if (mapping.retryable) metadata["retryable"] = true;
    return new StorageError(`${subject} ${mapping.message}`, {
      code: mapping.code,
      statusCode: mapping.statusCode,
      expose: mapping.expose,
      cause: error,
      metadata,
    });
  }

  if (code.startsWith(CONNECTION_CLASS)) {
    return new StorageError(`${subject} failed: database unavailable.`, {
      code: ErrorCode.STORAGE,
      statusCode: 503,
      expose: false,
      cause: error,
      metadata,
    });
  }

  return new StorageError(`${subject} failed.`, { cause: error, metadata });
}
